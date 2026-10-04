import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Kysely, PostgresDialect } from "kysely";
import { FileMigrationProvider, Migrator } from "kysely/migration";
import { Client, Pool } from "pg";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const envFile = path.join(repoRoot, ".env");
try {
  process.loadEnvFile(envFile);
} catch {
  // no .env file — rely on already-set process.env
}

function baseConfig() {
  return {
    host: process.env.POSTGRES_HOST ?? "localhost",
    port: Number(process.env.POSTGRES_PORT ?? 5432),
    user: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASSWORD,
  };
}

function testDatabaseName(): string {
  return `${process.env.POSTGRES_DB}_test`;
}

async function setupTestDb(): Promise<void> {
  const admin = new Client({ ...baseConfig(), database: process.env.POSTGRES_DB });
  await admin.connect();
  const dbName = testDatabaseName();
  await admin.query(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
  await admin.query(`CREATE DATABASE "${dbName}"`);
  await admin.end();

  const testClient = new Client({ ...baseConfig(), database: dbName });
  await testClient.connect();
  const migrationsDir = path.join(repoRoot, "better-auth_migrations");
  const files = (await fs.readdir(migrationsDir)).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    const sql = await fs.readFile(path.join(migrationsDir, file), "utf8");
    await testClient.query(sql);
  }
  await testClient.end();

  const db = new Kysely({
    dialect: new PostgresDialect({ pool: new Pool({ ...baseConfig(), database: dbName }) }),
  });
  const migrator = new Migrator({
    db,
    provider: new FileMigrationProvider({
      fs,
      path,
      migrationFolder: path.join(repoRoot, "src/db/migrations"),
    }),
  });
  const { error, results } = await migrator.migrateToLatest();
  for (const result of results ?? []) {
    console.log(`[setup-test-db] ${result.status}: ${result.migrationName}`);
  }
  if (error) {
    throw error;
  }
  await db.destroy();
}

setupTestDb().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
