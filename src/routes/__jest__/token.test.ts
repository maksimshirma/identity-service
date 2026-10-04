import { createHash } from "node:crypto";
import { createLocalJWKSet, jwtVerify } from "jose";
import { sql } from "kysely";
import { createKyselyInstance } from "../../db/kysely.js";
import { createServer } from "../../server.js";
import { jsonRequest, cookieFrom } from "../../test/http.js";
import { testDatabaseConfig, truncateAllTables } from "../../test/db.js";
import { createAuth } from "../../auth/index.js";

const db = createKyselyInstance(testDatabaseConfig());
const auth = createAuth(db, { rateLimitEnabled: false });
const app = createServer(db, auth);

beforeEach(() => truncateAllTables(db));
afterAll(() => db.destroy());

async function signUpAndIn(email: string) {
  await app.request(
    "/api/auth/sign-up/email",
    jsonRequest("POST", { email, password: "correct-horse-battery-staple", name: email }),
  );
  return cookieFrom(
    await app.request(
      "/api/auth/sign-in/email",
      jsonRequest("POST", { email, password: "correct-horse-battery-staple" }),
    ),
  );
}

async function getJwks() {
  const res = await app.request("/jwks.json");
  return res.json();
}

test("session grant_type: owner gets a verifiable JWT, aud mismatch is rejected", async () => {
  const ownerCookie = await signUpAndIn("owner@example.com");
  const org = await (
    await app.request(
      "/api/auth/organization/create",
      jsonRequest("POST", { name: "Household", slug: "household" }, { Cookie: ownerCookie }),
    )
  ).json();
  await sql`insert into installed_apps (hid, "appId") values (${org.id}, 'recipes')`.execute(db);

  const res = await app.request(
    "/token?grant_type=session",
    jsonRequest("POST", { hid: org.id, appId: "recipes" }, { Cookie: ownerCookie }),
  );
  expect(res.status).toBe(200);
  const { token } = await res.json();

  const jwks = createLocalJWKSet(await getJwks());
  const { payload } = await jwtVerify(token, jwks);
  expect(payload.sub).toBeDefined();
  expect(payload.hid).toBe(org.id);
  expect(payload.aud).toBe("recipes");
  expect(payload.scope).toEqual(["app:edit"]);
  expect((payload.exp as number) - (payload.iat as number)).toBe(60);

  await expect(jwtVerify(token, jwks, { audience: "budget" })).rejects.toThrow();
});

test("pat grant_type: works, then revoking the PAT instantly breaks it", async () => {
  const ownerCookie = await signUpAndIn("owner2@example.com");
  const org = await (
    await app.request(
      "/api/auth/organization/create",
      jsonRequest("POST", { name: "Household2", slug: "household2" }, { Cookie: ownerCookie }),
    )
  ).json();
  await sql`insert into installed_apps (hid, "appId") values (${org.id}, 'recipes')`.execute(db);

  const pat = await (
    await app.request("/account/security/pat", jsonRequest("POST", { name: "agent" }, { Cookie: ownerCookie }))
  ).json();

  const before = await app.request(
    "/token?grant_type=pat",
    jsonRequest("POST", { hid: org.id, appId: "recipes" }, { Authorization: `Bearer ${pat.token}` }),
  );
  expect(before.status).toBe(200);

  await app.request(`/account/security/pat/${pat.id}`, { method: "DELETE", headers: { Cookie: ownerCookie } });

  const after = await app.request(
    "/token?grant_type=pat",
    jsonRequest("POST", { hid: org.id, appId: "recipes" }, { Authorization: `Bearer ${pat.token}` }),
  );
  expect(after.status).toBe(401);
});

test("service grant_type: valid secret works, wrong secret and missing grant both 403", async () => {
  const hash = createHash("sha256").update("svc-secret").digest("hex");
  await sql`insert into clients ("clientId", type, "credentialHash") values ('svc1', 'service', ${hash})`.execute(db);
  await sql`insert into service_grants ("clientId", "appId", scope) values ('svc1', 'recipes', '{storage.sync}')`.execute(
    db,
  );

  const ok = await app.request(
    "/token?grant_type=service",
    jsonRequest("POST", { clientId: "svc1", secret: "svc-secret", appId: "recipes" }),
  );
  expect(ok.status).toBe(200);
  const { token } = await ok.json();
  const jwks = createLocalJWKSet(await getJwks());
  const { payload } = await jwtVerify(token, jwks);
  expect(payload.sub).toBeUndefined();
  expect(payload.hid).toBeUndefined();
  expect(payload.scope).toEqual(["storage.sync"]);

  const wrongSecret = await app.request(
    "/token?grant_type=service",
    jsonRequest("POST", { clientId: "svc1", secret: "wrong", appId: "recipes" }),
  );
  expect(wrongSecret.status).toBe(403);

  const noGrant = await app.request(
    "/token?grant_type=service",
    jsonRequest("POST", { clientId: "svc1", secret: "svc-secret", appId: "budget" }),
  );
  expect(noGrant.status).toBe(403);
});

test("public grant_type: scope always [view] with no sub/hid, regardless of client type", async () => {
  await sql`insert into clients ("clientId", type) values ('bff1', 'bff')`.execute(db);
  await sql`insert into clients ("clientId", type, "credentialHash") values ('svc2', 'service', 'x')`.execute(db);

  const ok = await app.request("/token?grant_type=public", jsonRequest("POST", { clientId: "bff1", appId: "recipes" }));
  expect(ok.status).toBe(200);
  const { token } = await ok.json();
  const jwks = createLocalJWKSet(await getJwks());
  const { payload } = await jwtVerify(token, jwks);
  expect(payload.sub).toBeUndefined();
  expect(payload.hid).toBeUndefined();
  expect(payload.scope).toEqual(["view"]);

  const wrongType = await app.request(
    "/token?grant_type=public",
    jsonRequest("POST", { clientId: "svc2", appId: "recipes" }),
  );
  expect(wrongType.status).toBe(403);
});
