import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("grant_requests")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("hid", "text", (col) => col.notNull())
    .addColumn("userId", "text", (col) => col.notNull())
    .addColumn("appId", "text", (col) => col.notNull())
    .addColumn("requestedLevel", "text", (col) => col.notNull())
    .addColumn("status", "text", (col) => col.notNull().defaultTo("pending"))
    .addColumn("decidedBy", "text")
    .addColumn("decidedAt", "timestamptz")
    .addColumn("createdAt", "timestamptz", (col) => col.notNull())
    .addCheckConstraint("grant_requests_level_check", sql`"requestedLevel" in ('view', 'edit')`)
    .addCheckConstraint("grant_requests_status_check", sql`status in ('pending', 'approved', 'denied')`)
    .execute();

  await db.schema.createIndex("grant_requests_hid_idx").on("grant_requests").column("hid").execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("grant_requests").execute();
}
