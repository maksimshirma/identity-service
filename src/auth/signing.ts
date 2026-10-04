import { randomUUID } from "node:crypto";
import { exportJWK, generateKeyPair, type JWK } from "jose";
import type { Kysely } from "kysely";
import type { Database } from "../db/schema.js";

const ALG = "EdDSA";
const RETIRE_BUFFER_MS = 24 * 60 * 60 * 1000;

export interface SigningKey {
  kid: string;
  privateKey: JWK;
}

async function generateSigningKey(db: Kysely<Database>): Promise<SigningKey> {
  const { publicKey, privateKey } = await generateKeyPair(ALG, { crv: "Ed25519", extractable: true });
  const kid = randomUUID();
  const publicJwk = { ...(await exportJWK(publicKey)), kid, alg: ALG, use: "sig" };
  const privateJwk = { ...(await exportJWK(privateKey)), kid, alg: ALG };

  await db
    .insertInto("signing_keys")
    .values({
      kid,
      publicKey: JSON.stringify(publicJwk),
      privateKey: JSON.stringify(privateJwk),
      createdAt: new Date(),
      retiredAt: null,
    })
    .execute();

  return { kid, privateKey: privateJwk };
}

export async function getActiveSigningKey(db: Kysely<Database>): Promise<SigningKey> {
  const row = await db
    .selectFrom("signing_keys")
    .select(["kid", "privateKey"])
    .where("retiredAt", "is", null)
    .orderBy("createdAt", "desc")
    .limit(1)
    .executeTakeFirst();

  if (row) {
    return { kid: row.kid, privateKey: JSON.parse(row.privateKey) };
  }
  return generateSigningKey(db);
}

export async function rotateSigningKey(db: Kysely<Database>): Promise<SigningKey> {
  await db.updateTable("signing_keys").set({ retiredAt: new Date() }).where("retiredAt", "is", null).execute();

  const next = await generateSigningKey(db);

  const cutoff = new Date(Date.now() - RETIRE_BUFFER_MS);
  await db.deleteFrom("signing_keys").where("retiredAt", "is not", null).where("retiredAt", "<", cutoff).execute();

  return next;
}

export async function getJwks(db: Kysely<Database>): Promise<{ keys: JWK[] }> {
  const rows = await db.selectFrom("signing_keys").select(["publicKey"]).execute();
  return { keys: rows.map((row) => JSON.parse(row.publicKey)) };
}
