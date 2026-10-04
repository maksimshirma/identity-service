import { createHash, timingSafeEqual } from "node:crypto";
import type { Kysely } from "kysely";
import type { Database } from "../db/schema.js";

function hashSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

function constantTimeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

export async function verifyServiceClient(
  db: Kysely<Database>,
  clientId: string,
  secret: string,
): Promise<{ clientId: string } | null> {
  const row = await db
    .selectFrom("clients")
    .select(["clientId", "type", "credentialHash"])
    .where("clientId", "=", clientId)
    .executeTakeFirst();

  if (!row || row.type !== "service" || !row.credentialHash) {
    return null;
  }
  if (!constantTimeEqual(row.credentialHash, hashSecret(secret))) {
    return null;
  }
  return { clientId: row.clientId };
}

export async function verifyBffClient(db: Kysely<Database>, clientId: string): Promise<{ clientId: string } | null> {
  const row = await db
    .selectFrom("clients")
    .select(["clientId", "type"])
    .where("clientId", "=", clientId)
    .executeTakeFirst();

  if (!row || row.type !== "bff") {
    return null;
  }
  return { clientId: row.clientId };
}

export async function getServiceGrantScope(
  db: Kysely<Database>,
  clientId: string,
  appId: string,
): Promise<string[] | null> {
  const row = await db
    .selectFrom("service_grants")
    .select(["scope"])
    .where("clientId", "=", clientId)
    .where("appId", "=", appId)
    .executeTakeFirst();

  return row ? row.scope : null;
}

export function hashClientSecret(secret: string): string {
  return hashSecret(secret);
}
