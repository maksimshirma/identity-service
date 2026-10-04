import type { Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("step_up")
    .addColumn("sessionToken", "text", (col) => col.primaryKey())
    .addColumn("reauthAt", "timestamptz", (col) => col.notNull())
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("step_up").execute();
}
