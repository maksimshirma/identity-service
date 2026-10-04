import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("app_manifests")
    .addColumn("appId", "text", (col) => col.primaryKey())
    .addColumn("permissions", sql`text[]`, (col) => col.notNull().defaultTo(sql`'{}'::text[]`))
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("app_manifests").execute();
}
