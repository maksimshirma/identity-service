import type { Kysely } from "kysely";
import { getPermissionsForApps } from "./dac.js";
import { getMemberRole, hasRole } from "./member-role.js";
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

export async function getHouseholdIntrospection(
  db: Kysely<Database>,
  params: { userId: string; hid: string },
): Promise<HouseholdIntrospection | null> {
  const { userId, hid } = params;

  const role = await getMemberRole(db, hid, userId);

  if (!role) {
    return null;
  }

  const installedApps = await db.selectFrom("installed_apps").select(["appId"]).where("hid", "=", hid).execute();

  const grantRows = await db
    .selectFrom("grants")
    .select(["appId", "level"])
    .where("hid", "=", hid)
    .where("userId", "=", userId)
    .execute();

  const isOwnerOrAdmin = hasRole(role, "owner") || hasRole(role, "admin");
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

  const appIds = installedApps.map((a) => a.appId);
  const permissions = await getPermissionsForApps(db, hid, appIds);

  return {
    userId,
    hid,
    role,
    installedApps: appIds,
    grants,
    permissions,
  };
}
