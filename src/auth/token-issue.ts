import { SignJWT, importJWK } from "jose";
import type { Kysely } from "kysely";
import type { Database } from "../db/schema.js";
import { getActiveSigningKey } from "./signing.js";

export const TOKEN_TTL_SECONDS = 60;

export type GrantType = "session" | "pat" | "service" | "public";

export interface TokenClaims {
  sub?: string;
  hid?: string;
  aud: string;
  scope: string[];
  grant_type: GrantType;
}

export async function issueToken(db: Kysely<Database>, claims: TokenClaims): Promise<string> {
  const { kid, privateKey } = await getActiveSigningKey(db);
  const key = await importJWK(privateKey, "EdDSA");
  const now = Math.floor(Date.now() / 1000);

  return new SignJWT({ ...claims })
    .setProtectedHeader({ alg: "EdDSA", kid })
    .setIssuedAt(now)
    .setExpirationTime(now + TOKEN_TTL_SECONDS)
    .sign(key);
}
