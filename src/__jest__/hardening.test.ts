import { createHash } from "node:crypto";
import { sql } from "kysely";
import { createKyselyInstance } from "../db/kysely.js";
import { createServer } from "../server.js";
import { jsonRequest } from "../test/http.js";
import { testDatabaseConfig, truncateAllTables } from "../test/db.js";
import { createAuth } from "../auth/index.js";

const db = createKyselyInstance(testDatabaseConfig());
const rateLimitedAuth = createAuth(db, { rateLimitEnabled: true });
const rateLimitedApp = createServer(db, rateLimitedAuth);

beforeEach(() => truncateAllTables(db));
afterAll(() => db.destroy());

test("burst sign-in attempts get rate-limited with 429", async () => {
  const attempt = () =>
    rateLimitedApp.request(
      "/api/auth/sign-in/email",
      jsonRequest("POST", { email: "nobody@example.com", password: "wrong-password" }),
    );

  const statuses: number[] = [];
  for (let i = 0; i < 4; i++) {
    statuses.push((await attempt()).status);
  }
  expect(statuses.slice(0, 3)).toEqual([401, 401, 401]);
  expect(statuses[3]).toBe(429);
});

test("audit_log distinguishes session-grant from service-grant token issuance", async () => {
  const auth = createAuth(db, { rateLimitEnabled: false });
  const app = createServer(db, auth);

  const signUp = await app.request(
    "/api/auth/sign-up/email",
    jsonRequest("POST", { email: "owner@example.com", password: "correct-horse-battery-staple", name: "Owner" }),
  );
  const cookie = (signUp.headers.get("set-cookie") ?? "").match(/better-auth\.session_token=[^;]+/)![0];

  const org = await (
    await app.request(
      "/api/auth/organization/create",
      jsonRequest("POST", { name: "Household", slug: "household" }, { Cookie: cookie }),
    )
  ).json();
  await sql`insert into installed_apps (hid, "appId") values (${org.id}, 'recipes')`.execute(db);

  await app.request(
    "/token?grant_type=session",
    jsonRequest("POST", { hid: org.id, appId: "recipes" }, { Cookie: cookie }),
  );

  const hash = createHash("sha256").update("svc-secret").digest("hex");
  await sql`insert into clients ("clientId", type, "credentialHash") values ('svc1', 'service', ${hash})`.execute(db);
  await sql`insert into service_grants ("clientId", "appId", scope) values ('svc1', 'recipes', '{storage.sync}')`.execute(
    db,
  );
  await app.request(
    "/token?grant_type=service",
    jsonRequest("POST", { clientId: "svc1", secret: "svc-secret", appId: "recipes" }),
  );

  const rows = await db
    .selectFrom("audit_log")
    .select(["actorType", "actorId"])
    .where("eventType", "=", "token.issued")
    .execute();

  expect(rows.find((r) => r.actorType === "user")).toBeDefined();
  expect(rows.find((r) => r.actorType === "service" && r.actorId === "svc1")).toBeDefined();
});
