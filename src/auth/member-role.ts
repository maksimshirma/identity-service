import type { Kysely } from "kysely";
import type { Database } from "../db/schema.js";

export function hasRole(role: string, target: string): boolean {
  return role
    .split(",")
    .map((r) => r.trim())
    .includes(target);
}

export async function getMemberRole(db: Kysely<Database>, hid: string, userId: string): Promise<string | null> {
  const row = await db
    .selectFrom("member")
    .select(["role"])
    .where("organizationId", "=", hid)
    .where("userId", "=", userId)
    .executeTakeFirst();

  return row?.role ?? null;
}
