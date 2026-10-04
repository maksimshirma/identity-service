import type { Kysely } from "kysely";
import { sql } from "kysely";
import type { PoolConfig } from "pg";
import { env } from "../config/env.js";
import type { Database } from "../db/schema.js";

export function testDatabaseName(): string {
  return `${env.postgres.database}_test`;
}

export function adminDatabaseConfig(): PoolConfig {
  return { ...env.postgres };
}

export function testDatabaseConfig(): PoolConfig {
  return { ...env.postgres, database: testDatabaseName() };
}

const TRUNCATE_TABLES = [
  "user",
  "session",
  "account",
  "verification",
  "organization",
  "member",
  "invitation",
  "twoFactor",
  "grants",
  "installed_apps",
  "app_manifests",
  "clients",
  "service_grants",
  "pat",
  "step_up",
  "grant_requests",
  "audit_log",
];

export async function truncateAllTables(db: Kysely<Database>): Promise<void> {
  const tables = TRUNCATE_TABLES.map((t) => `"${t}"`).join(", ");
  await sql.raw(`TRUNCATE TABLE ${tables} RESTART IDENTITY CASCADE`).execute(db);
}
