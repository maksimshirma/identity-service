import type { Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("pat")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("userId", "text", (col) => col.notNull().references("user.id").onDelete("cascade"))
    .addColumn("tokenHash", "text", (col) => col.notNull().unique())
    .addColumn("name", "text")
    .addColumn("createdAt", "timestamptz", (col) => col.notNull())
    .addColumn("revokedAt", "timestamptz")
    .execute();

  await db.schema.createIndex("pat_userId_idx").on("pat").column("userId").execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("pat").execute();
}
