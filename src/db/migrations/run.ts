import { env } from "../../config/env.js";
import { createKyselyInstance } from "../kysely.js";
import { createMigrator } from "./migrator.js";

async function main() {
  const db = createKyselyInstance(env.postgres);

  const migrator = createMigrator(db);
  const { error, results } = await migrator.migrateToLatest();

  for (const result of results ?? []) {
    console.log(`${result.status}: ${result.migrationName}`);
  }

  if (error) {
    console.error(error);
    process.exitCode = 1;
  }

  await db.destroy();
}

main();
