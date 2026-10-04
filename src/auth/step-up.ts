import type { Kysely } from "kysely";
import type { Database } from "../db/schema.js";

export const STEP_UP_MAX_AGE_MS = 5 * 60 * 1000;

export async function recordStepUp(db: Kysely<Database>, sessionToken: string): Promise<void> {
  await db
    .insertInto("step_up")
    .values({ sessionToken, reauthAt: new Date() })
    .onConflict((oc) => oc.column("sessionToken").doUpdateSet({ reauthAt: new Date() }))
    .execute();
}

export async function isStepUpFresh(db: Kysely<Database>, sessionToken: string): Promise<boolean> {
  const row = await db
    .selectFrom("step_up")
    .select(["reauthAt"])
    .where("sessionToken", "=", sessionToken)
    .executeTakeFirst();

  if (!row) {
    return false;
  }
  return Date.now() - new Date(row.reauthAt).getTime() <= STEP_UP_MAX_AGE_MS;
}
