import type { Hono } from "hono";
import type { Kysely } from "kysely";
import type { auth as Auth } from "../auth/index.js";
import type { Database } from "../db/schema.js";

interface MemberRow {
  id: string;
  organizationId: string;
  userId: string;
  role: string;
}

function hasRole(row: Pick<MemberRow, "role">, role: string): boolean {
  return row.role
    .split(",")
    .map((r) => r.trim())
    .includes(role);
}

export function registerOrganizationRoutes(app: Hono, db: Kysely<Database>, auth: typeof Auth) {
  app.post("/org/transfer-ownership", async (c) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) {
      return c.json({ error: "unauthenticated" }, 401);
    }

    const body = await c.req.json<{ organizationId?: string; newOwnerMemberId?: string }>();
    const { organizationId, newOwnerMemberId } = body;
    if (!organizationId || !newOwnerMemberId) {
      return c.json({ error: "bad_request" }, 400);
    }

    const result = await db.transaction().execute(async (trx) => {
      const members = await trx
        .selectFrom("member")
        .select(["id", "organizationId", "userId", "role"])
        .where("organizationId", "=", organizationId)
        .execute();

      const caller = members.find((m) => m.userId === session.user.id);
      const target = members.find((m) => m.id === newOwnerMemberId);

      if (!caller || !hasRole(caller, "owner")) {
        return { ok: false as const, error: "forbidden" as const };
      }
      if (!target || !hasRole(target, "admin")) {
        return { ok: false as const, error: "forbidden" as const };
      }

      await trx.updateTable("member").set({ role: "owner" }).where("id", "=", target.id).execute();
      await trx.updateTable("member").set({ role: "admin" }).where("id", "=", caller.id).execute();

      return { ok: true as const };
    });

    if (!result.ok) {
      return c.json({ error: result.error }, 403);
    }
    return c.json({ status: "ok" });
  });
}
