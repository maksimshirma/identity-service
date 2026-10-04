import type { Kysely } from "kysely";
import type { Database } from "../db/schema.js";

type GrantLevel = "view" | "edit";

export interface HouseholdIntrospection {
  userId: string;
  hid: string;
  role: string;
  installedApps: string[];
  grants: Record<string, GrantLevel>;
  permissions: Record<string, string[]>;
}

function hasRole(role: string, target: string): boolean {
  return role
    .split(",")
    .map((r) => r.trim())
    .includes(target);
}

export async function getHouseholdIntrospection(
  db: Kysely<Database>,
  params: { userId: string; hid: string },
): Promise<HouseholdIntrospection | null> {
  const { userId, hid } = params;

  const member = await db
    .selectFrom("member")
    .select(["role"])
    .where("organizationId", "=", hid)
    .where("userId", "=", userId)
    .executeTakeFirst();

  if (!member) {
    return null;
  }

  const installedApps = await db.selectFrom("installed_apps").select(["appId"]).where("hid", "=", hid).execute();

  const grantRows = await db
    .selectFrom("grants")
    .select(["appId", "level"])
    .where("hid", "=", hid)
    .where("userId", "=", userId)
    .execute();

  const isOwnerOrAdmin = hasRole(member.role, "owner") || hasRole(member.role, "admin");
  const grantByApp = new Map(grantRows.map((g) => [g.appId, g.level]));

  const grants: Record<string, GrantLevel> = {};
  for (const { appId } of installedApps) {
    if (isOwnerOrAdmin) {
      grants[appId] = "edit";
      continue;
    }
    const level = grantByApp.get(appId);
    if (level) {
      grants[appId] = level;
    }
  }

  return {
    userId,
    hid,
    role: member.role,
    installedApps: installedApps.map((a) => a.appId),
    grants,
    permissions: {},
  };
}
