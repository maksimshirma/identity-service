import { createKyselyInstance } from "../db/kysely.js";
import { createServer } from "../server.js";
import { createAuth } from "../auth/index.js";
import { testDatabaseConfig } from "../test/db.js";

const db = createKyselyInstance(testDatabaseConfig());
const auth = createAuth(db, { rateLimitEnabled: false });
const app = createServer(db, auth);

afterAll(() => db.destroy());

test("GET /health returns ok with a live DB round-trip", async () => {
  const res = await app.request("/health");
  expect(res.status).toBe(200);
  await expect(res.json()).resolves.toEqual({ status: "ok" });
});
