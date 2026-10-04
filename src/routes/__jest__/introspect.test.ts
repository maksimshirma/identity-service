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

test("/introspect: 401 unauthenticated, 200 with userId when authenticated", async () => {
  const unauth = await app.request("/introspect");
  expect(unauth.status).toBe(401);

  const cookie = await signUpAndIn("solo@example.com");
  const authed = await app.request("/introspect", { headers: { Cookie: cookie } });
  expect(authed.status).toBe(200);
  expect(await authed.json()).toHaveProperty("userId");
});

test("/introspect/household: 403 identical for non-existent vs real hid (non-disclosure)", async () => {
  const ownerCookie = await signUpAndIn("owner@example.com");
  const org = await (
    await app.request(
      "/api/auth/organization/create",
      jsonRequest("POST", { name: "Household", slug: "household" }, { Cookie: ownerCookie }),
    )
  ).json();

  const outsiderCookie = await signUpAndIn("outsider@example.com");

  const forNonExistent = await app.request("/introspect/household?hid=does-not-exist", {
    headers: { Cookie: outsiderCookie },
  });
  const forReal = await app.request(`/introspect/household?hid=${org.id}`, {
    headers: { Cookie: outsiderCookie },
  });

  expect(forNonExistent.status).toBe(403);
  expect(forReal.status).toBe(403);
  expect(await forNonExistent.json()).toEqual(await forReal.json());
});

test("owner sees edit on installed apps without a grants row (synthesized)", async () => {
  const ownerCookie = await signUpAndIn("owner2@example.com");
  const org = await (
    await app.request(
      "/api/auth/organization/create",
      jsonRequest("POST", { name: "Household2", slug: "household2" }, { Cookie: ownerCookie }),
    )
  ).json();

  await sql`insert into installed_apps (hid, "appId") values (${org.id}, 'recipes')`.execute(db);

  const res = await app.request(`/introspect/household?hid=${org.id}`, { headers: { Cookie: ownerCookie } });
  const body = await res.json();
  expect(body.installedApps).toEqual(["recipes"]);
  expect(body.grants).toEqual({ recipes: "edit" });
});

test("confirmed=false caps permissions to [] regardless of grants/installedApps", async () => {
  const ownerCookie = await signUpAndIn("owner3@example.com");
  const org = await (
    await app.request(
      "/api/auth/organization/create",
      jsonRequest("POST", { name: "Household3", slug: "household3" }, { Cookie: ownerCookie }),
    )
  ).json();

  await sql`insert into app_manifests ("appId", permissions) values ('recipes', '{storage.own,notifications.send}')`.execute(
    db,
  );
  await sql`insert into installed_apps (hid, "appId", confirmed) values (${org.id}, 'recipes', false)`.execute(db);

  const res = await app.request(`/introspect/household?hid=${org.id}`, { headers: { Cookie: ownerCookie } });
  const body = await res.json();
  expect(body.installedApps).toEqual(["recipes"]);
  expect(body.grants).toEqual({ recipes: "edit" });
  expect(body.permissions).toEqual({ recipes: [] });
});
