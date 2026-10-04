import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { Kysely } from "kysely";
import type { Database } from "../db/schema.js";

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export interface CreatedPat {
  id: string;
  token: string;
  name: string | null;
  createdAt: Date;
}

export async function createPat(db: Kysely<Database>, userId: string, name?: string): Promise<CreatedPat> {
  const id = randomUUID();
  const token = `pat_${randomBytes(32).toString("base64url")}`;
  const createdAt = new Date();

  await db
    .insertInto("pat")
    .values({
      id,
      userId,
      tokenHash: hashToken(token),
      name: name ?? null,
      createdAt,
      revokedAt: null,
    })
    .execute();

  return { id, token, name: name ?? null, createdAt };
}

export async function listPats(db: Kysely<Database>, userId: string) {
  return db
    .selectFrom("pat")
    .select(["id", "name", "createdAt", "revokedAt"])
    .where("userId", "=", userId)
    .orderBy("createdAt", "desc")
    .execute();
}

export async function revokePat(db: Kysely<Database>, userId: string, id: string): Promise<boolean> {
  const result = await db
    .updateTable("pat")
    .set({ revokedAt: new Date() })
    .where("id", "=", id)
    .where("userId", "=", userId)
    .where("revokedAt", "is", null)
    .executeTakeFirst();

  return result.numUpdatedRows > 0n;
}

export async function verifyPat(db: Kysely<Database>, token: string): Promise<{ userId: string } | null> {
  const row = await db
    .selectFrom("pat")
    .select(["userId", "revokedAt"])
    .where("tokenHash", "=", hashToken(token))
    .executeTakeFirst();

  if (!row || row.revokedAt) {
    return null;
  }
  return { userId: row.userId };
}
