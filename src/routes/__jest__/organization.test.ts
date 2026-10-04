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

async function reauth(cookie: string) {
  const res = await app.request(
    "/account/security/reauth",
    jsonRequest("POST", { password: "correct-horse-battery-staple" }, { Cookie: cookie }),
  );
  expect(res.status).toBe(200);
}

test("create org, invite a member, member accepts and sees role", async () => {
  const ownerCookie = await signUpAndIn("owner@example.com");
  const memberCookie = await signUpAndIn("member@example.com");

  const org = await (
    await app.request(
      "/api/auth/organization/create",
      jsonRequest("POST", { name: "Household", slug: "household" }, { Cookie: ownerCookie }),
    )
  ).json();
  expect(org.members[0].role).toBe("owner");

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

  const accept = await (
    await app.request(
      "/api/auth/organization/accept-invitation",
      jsonRequest("POST", { invitationId: invite.id }, { Cookie: memberCookie }),
    )
  ).json();
  expect(accept.member.role).toBe("member");
});

test("sole owner cannot leave the organization", async () => {
  const ownerCookie = await signUpAndIn("solo@example.com");
  const org = await (
    await app.request(
      "/api/auth/organization/create",
      jsonRequest("POST", { name: "Solo", slug: "solo" }, { Cookie: ownerCookie }),
    )
  ).json();

  const leave = await app.request(
    "/api/auth/organization/leave",
    jsonRequest("POST", { organizationId: org.id }, { Cookie: ownerCookie }),
  );
  expect(leave.status).toBe(400);
});

test("transfer-ownership: owner to admin works atomically, and only that direction", async () => {
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
        { organizationId: org.id, email: "member2@example.com", role: "admin" },
        { Cookie: ownerCookie },
      ),
    )
  ).json();
  const accept = await (
    await app.request(
      "/api/auth/organization/accept-invitation",
      jsonRequest("POST", { invitationId: invite.id }, { Cookie: memberCookie }),
    )
  ).json();

  await reauth(ownerCookie);
  const transfer = await app.request(
    "/org/transfer-ownership",
    jsonRequest(
      "POST",
      { organizationId: org.id, newOwnerMemberId: accept.member.id },
      { Cookie: ownerCookie },
    ),
  );
  expect(transfer.status).toBe(200);

  const members = await (
    await app.request(`/api/auth/organization/list-members?organizationId=${org.id}`, {
      headers: { Cookie: ownerCookie },
    })
  ).json();
  const roles = Object.fromEntries(members.members.map((m: { userId: string; role: string }) => [m.role, m.userId]));
  expect(roles.owner).toBe(accept.member.userId);
  expect(roles.admin).toBe(org.members[0].userId);
});

test("remove-member is blocked without fresh step-up, allowed right after reauth", async () => {
  const ownerCookie = await signUpAndIn("owner3@example.com");
  const memberCookie = await signUpAndIn("member3@example.com");

  const org = await (
    await app.request(
      "/api/auth/organization/create",
      jsonRequest("POST", { name: "Household3", slug: "household3" }, { Cookie: ownerCookie }),
    )
  ).json();
  const invite = await (
    await app.request(
      "/api/auth/organization/invite-member",
      jsonRequest(
        "POST",
        { organizationId: org.id, email: "member3@example.com", role: "member" },
        { Cookie: ownerCookie },
      ),
    )
  ).json();
  const accept = await (
    await app.request(
      "/api/auth/organization/accept-invitation",
      jsonRequest("POST", { invitationId: invite.id }, { Cookie: memberCookie }),
    )
  ).json();

  const blocked = await app.request(
    "/api/auth/organization/remove-member",
    jsonRequest(
      "POST",
      { organizationId: org.id, memberIdOrEmail: accept.member.id },
      { Cookie: ownerCookie },
    ),
  );
  expect(blocked.status).toBe(403);
  expect((await blocked.json()).error).toBe("step_up_required");

  await reauth(ownerCookie);
  const allowed = await app.request(
    "/api/auth/organization/remove-member",
    jsonRequest(
      "POST",
      { organizationId: org.id, memberIdOrEmail: accept.member.id },
      { Cookie: ownerCookie },
    ),
  );
  expect(allowed.status).toBe(200);
});

test("promoting to admin requires step-up, demoting does not", async () => {
  const ownerCookie = await signUpAndIn("owner4@example.com");
  const memberCookie = await signUpAndIn("member4@example.com");

  const org = await (
    await app.request(
      "/api/auth/organization/create",
      jsonRequest("POST", { name: "Household4", slug: "household4" }, { Cookie: ownerCookie }),
    )
  ).json();
  const invite = await (
    await app.request(
      "/api/auth/organization/invite-member",
      jsonRequest(
        "POST",
        { organizationId: org.id, email: "member4@example.com", role: "member" },
        { Cookie: ownerCookie },
      ),
    )
  ).json();
  const accept = await (
    await app.request(
      "/api/auth/organization/accept-invitation",
      jsonRequest("POST", { invitationId: invite.id }, { Cookie: memberCookie }),
    )
  ).json();

  const promoteBlocked = await app.request(
    "/api/auth/organization/update-member-role",
    jsonRequest(
      "POST",
      { organizationId: org.id, memberId: accept.member.id, role: "admin" },
      { Cookie: ownerCookie },
    ),
  );
  expect(promoteBlocked.status).toBe(403);

  await reauth(ownerCookie);
  const promoteAllowed = await app.request(
    "/api/auth/organization/update-member-role",
    jsonRequest(
      "POST",
      { organizationId: org.id, memberId: accept.member.id, role: "admin" },
      { Cookie: ownerCookie },
    ),
  );
  expect(promoteAllowed.status).toBe(200);

  const demote = await app.request(
    "/api/auth/organization/update-member-role",
    jsonRequest(
      "POST",
      { organizationId: org.id, memberId: accept.member.id, role: "member" },
      { Cookie: ownerCookie },
    ),
  );
  expect(demote.status).toBe(200);
});
