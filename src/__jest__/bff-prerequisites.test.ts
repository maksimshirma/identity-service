import { up as seedHostyaraBffClient } from "../db/migrations/0012_seed_hostyara_bff_client.js";
import { createKyselyInstance } from "../db/kysely.js";
import { createServer } from "../server.js";
import { cookieFrom, jsonRequest } from "../test/http.js";
import { testDatabaseConfig, truncateAllTables } from "../test/db.js";
import { createAuth } from "../auth/index.js";

const BFF_ORIGIN = "http://bff.hostyara.test";

const db = createKyselyInstance(testDatabaseConfig());
const app = createServer(db, createAuth(db, { rateLimitEnabled: false, trustedOrigins: [BFF_ORIGIN] }));

beforeEach(() => truncateAllTables(db));
afterAll(() => db.destroy());

// Better-Auth validates Origin only on POSTs that carry a session cookie.
async function createHouseholdFrom(origin: string) {
  const email = "owner@example.com";
  await app.request(
    "/api/auth/sign-up/email",
    jsonRequest("POST", { email, password: "correct-horse-battery-staple", name: email }),
  );
  const cookie = cookieFrom(
    await app.request("/api/auth/sign-in/email", jsonRequest("POST", { email, password: "correct-horse-battery-staple" })),
  );
  return app.request(
    "/api/auth/organization/create",
    jsonRequest("POST", { name: "Household", slug: "household" }, { Origin: origin, Cookie: cookie }),
  );
}

test("cookie-authenticated POSTs are accepted from a trusted BFF origin", async () => {
  const res = await createHouseholdFrom(BFF_ORIGIN);

  expect(res.status).toBe(200);
});

test("cookie-authenticated POSTs from an untrusted origin are rejected", async () => {
  const res = await createHouseholdFrom("http://evil.example");

  expect(res.status).toBe(403);
});

test("the hostyara-bff client seed is registered as a bff client and is idempotent", async () => {
  await seedHostyaraBffClient(db);
  await seedHostyaraBffClient(db);

  const rows = await db.selectFrom("clients").select(["clientId", "type"]).execute();
  expect(rows).toEqual([{ clientId: "hostyara-bff", type: "bff" }]);
});

test("the seeded client can obtain a public grant", async () => {
  await seedHostyaraBffClient(db);

  const res = await app.request(
    "/token?grant_type=public",
    jsonRequest("POST", { clientId: "hostyara-bff", appId: "recipes" }),
  );

  expect(res.status).toBe(200);
  expect(typeof (await res.json()).token).toBe("string");
});
