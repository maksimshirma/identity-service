import type { Kysely } from "kysely";
import type { Database } from "../db/schema.js";

export async function registerAppManifest(db: Kysely<Database>, appId: string, permissions: string[]): Promise<void> {
  await db
    .insertInto("app_manifests")
    .values({ appId, permissions })
    .onConflict((oc) => oc.column("appId").doUpdateSet({ permissions }))
    .execute();
}

export async function getPermissionsForApps(
  db: Kysely<Database>,
  hid: string,
  appIds: string[],
): Promise<Record<string, string[]>> {
  if (appIds.length === 0) {
    return {};
  }

  const installs = await db
    .selectFrom("installed_apps")
    .select(["appId", "confirmed"])
    .where("hid", "=", hid)
    .where("appId", "in", appIds)
    .execute();

  const confirmedAppIds = installs.filter((i) => i.confirmed).map((i) => i.appId);
  if (confirmedAppIds.length === 0) {
    return Object.fromEntries(appIds.map((appId) => [appId, []]));
  }

  const manifests = await db
    .selectFrom("app_manifests")
    .select(["appId", "permissions"])
    .where("appId", "in", confirmedAppIds)
    .execute();

  const manifestByApp = new Map(manifests.map((m) => [m.appId, m.permissions]));

  return Object.fromEntries(appIds.map((appId) => [appId, manifestByApp.get(appId) ?? []]));
}
