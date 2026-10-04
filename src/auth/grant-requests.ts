import { randomUUID } from "node:crypto";
import type { Kysely } from "kysely";
import type { Database } from "../db/schema.js";
import { getMemberRole, hasRole } from "./member-role.js";

type GrantLevel = "view" | "edit";

export interface GrantRequest {
  id: string;
  hid: string;
  userId: string;
  appId: string;
  requestedLevel: GrantLevel;
  status: "pending" | "approved" | "denied";
  decidedBy: string | null;
  decidedAt: Date | null;
  createdAt: Date;
}

export async function createGrantRequest(
  db: Kysely<Database>,
  params: { hid: string; userId: string; appId: string; requestedLevel: GrantLevel },
): Promise<GrantRequest | { error: "not_member" | "app_not_installed" }> {
  const role = await getMemberRole(db, params.hid, params.userId);
  if (!role) {
    return { error: "not_member" };
  }

  const installed = await db
    .selectFrom("installed_apps")
    .select(["appId"])
    .where("hid", "=", params.hid)
    .where("appId", "=", params.appId)
    .executeTakeFirst();
  if (!installed) {
    return { error: "app_not_installed" };
  }

  const id = randomUUID();
  const createdAt = new Date();
  await db
    .insertInto("grant_requests")
    .values({
      id,
      hid: params.hid,
      userId: params.userId,
      appId: params.appId,
      requestedLevel: params.requestedLevel,
      status: "pending",
      decidedBy: null,
      decidedAt: null,
      createdAt,
    })
    .execute();

  return {
    id,
    hid: params.hid,
    userId: params.userId,
    appId: params.appId,
    requestedLevel: params.requestedLevel,
    status: "pending",
    decidedBy: null,
    decidedAt: null,
    createdAt,
  };
}

export async function listGrantRequests(db: Kysely<Database>, hid: string): Promise<GrantRequest[]> {
  const rows = await db.selectFrom("grant_requests").selectAll().where("hid", "=", hid).execute();
  return rows;
}

async function decideGrantRequest(
  db: Kysely<Database>,
  params: { id: string; deciderUserId: string; approve: boolean },
): Promise<{ ok: true; request: GrantRequest } | { ok: false; error: "not_found" | "forbidden" | "already_decided" }> {
  return db.transaction().execute(async (trx) => {
    const request = await trx.selectFrom("grant_requests").selectAll().where("id", "=", params.id).executeTakeFirst();
    if (!request) {
      return { ok: false as const, error: "not_found" as const };
    }

    const deciderRole = await getMemberRole(trx, request.hid, params.deciderUserId);
    if (!deciderRole || !(hasRole(deciderRole, "owner") || hasRole(deciderRole, "admin"))) {
      return { ok: false as const, error: "forbidden" as const };
    }
    if (request.status !== "pending") {
      return { ok: false as const, error: "already_decided" as const };
    }

    const status = params.approve ? "approved" : "denied";
    const decidedAt = new Date();

    await trx
      .updateTable("grant_requests")
      .set({ status, decidedBy: params.deciderUserId, decidedAt })
      .where("id", "=", request.id)
      .execute();

    if (params.approve) {
      await trx
        .insertInto("grants")
        .values({ hid: request.hid, userId: request.userId, appId: request.appId, level: request.requestedLevel })
        .onConflict((oc) => oc.columns(["hid", "userId", "appId"]).doUpdateSet({ level: request.requestedLevel }))
        .execute();
    }

    return { ok: true as const, request: { ...request, status, decidedBy: params.deciderUserId, decidedAt } };
  });
}

export async function approveGrantRequest(db: Kysely<Database>, id: string, deciderUserId: string) {
  return decideGrantRequest(db, { id, deciderUserId, approve: true });
}

export async function denyGrantRequest(db: Kysely<Database>, id: string, deciderUserId: string) {
  return decideGrantRequest(db, { id, deciderUserId, approve: false });
}
