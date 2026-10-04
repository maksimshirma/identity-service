import { Kysely, PostgresDialect } from "kysely";
import { Pool, type PoolConfig } from "pg";
import type { Database } from "./schema.js";

export function createKyselyInstance(config: PoolConfig): Kysely<Database> {
  return new Kysely<Database>({
    dialect: new PostgresDialect({ pool: new Pool(config) }),
  });
}
