import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Kysely } from "kysely";
import { FileMigrationProvider, Migrator } from "kysely/migration";
import type { Database } from "../schema.js";

const migrationFolder = path.dirname(fileURLToPath(import.meta.url));

export function createMigrator(db: Kysely<Database>): Migrator {
  return new Migrator({
    db,
    provider: new FileMigrationProvider({ fs, path, migrationFolder }),
  });
}
