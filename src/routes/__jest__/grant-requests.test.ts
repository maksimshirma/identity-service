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

test("member creates a grant-request, admin approves it, introspect reflects it immediately", async () => {
  const ownerCookie = await signUpAndIn("owner@example.com");
  const memberCookie = await signUpAndIn("member@example.com");

  const org = await (
    await app.request(
      "/api/auth/organization/create",
      jsonRequest("POST", { name: "Household", slug: "household" }, { Cookie: ownerCookie }),
    )
  ).json();
  const invite = await (
    await app.request(
      "/api/auth/organization/invite-member",
      jsonRequest(
        "POST",
        { organizationId: org.id, email: "member@example.com", role: "member" },
        { Cookie: ownerCookie },
      ),
    )
  ).json();
  await app.request(
    "/api/auth/organization/accept-invitation",
    jsonRequest("POST", { invitationId: invite.id }, { Cookie: memberCookie }),
  );
  await sql`insert into installed_apps (hid, "appId") values (${org.id}, 'budget')`.execute(db);

  const create = await app.request(
    "/grant-requests",
    jsonRequest("POST", { hid: org.id, appId: "budget", requestedLevel: "view" }, { Cookie: memberCookie }),
  );
  expect(create.status).toBe(200);
  const request = await create.json();

  const listByMember = await app.request(`/grant-requests?hid=${org.id}`, { headers: { Cookie: memberCookie } });
  expect(listByMember.status).toBe(403);

  const listByOwner = await app.request(`/grant-requests?hid=${org.id}`, { headers: { Cookie: ownerCookie } });
  expect(listByOwner.status).toBe(200);
  expect((await listByOwner.json()).requests).toHaveLength(1);

  const approve = await app.request(`/grant-requests/${request.id}/approve`, {
    method: "POST",
    headers: { Cookie: ownerCookie },
  });
  expect(approve.status).toBe(200);
  expect((await approve.json()).status).toBe("approved");

  const introspect = await (
    await app.request(`/introspect/household?hid=${org.id}`, { headers: { Cookie: memberCookie } })
  ).json();
  expect(introspect.grants).toEqual({ budget: "view" });
});

test("approving an already-decided or nonexistent request is rejected distinctly", async () => {
  const ownerCookie = await signUpAndIn("owner2@example.com");
  const memberCookie = await signUpAndIn("member2@example.com");

  const org = await (
    await app.request(
      "/api/auth/organization/create",
      jsonRequest("POST", { name: "Household2", slug: "household2" }, { Cookie: ownerCookie }),
    )
  ).json();
  const invite = await (
    await app.request(
      "/api/auth/organization/invite-member",
      jsonRequest(
        "POST",
        { organizationId: org.id, email: "member2@example.com", role: "member" },
        { Cookie: ownerCookie },
      ),
    )
  ).json();
  await app.request(
    "/api/auth/organization/accept-invitation",
    jsonRequest("POST", { invitationId: invite.id }, { Cookie: memberCookie }),
  );
  await sql`insert into installed_apps (hid, "appId") values (${org.id}, 'budget')`.execute(db);

  const request = await (
    await app.request(
      "/grant-requests",
      jsonRequest("POST", { hid: org.id, appId: "budget", requestedLevel: "view" }, { Cookie: memberCookie }),
    )
  ).json();

  await app.request(`/grant-requests/${request.id}/deny`, { method: "POST", headers: { Cookie: ownerCookie } });

  const alreadyDecided = await app.request(`/grant-requests/${request.id}/approve`, {
    method: "POST",
    headers: { Cookie: ownerCookie },
  });
  expect(alreadyDecided.status).toBe(403);
  expect((await alreadyDecided.json()).error).toBe("already_decided");

  const notFound = await app.request("/grant-requests/does-not-exist/approve", {
    method: "POST",
    headers: { Cookie: ownerCookie },
  });
  expect(notFound.status).toBe(404);
});
