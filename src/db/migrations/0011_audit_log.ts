import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("audit_log")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("eventType", "text", (col) => col.notNull())
    .addColumn("actorType", "text", (col) => col.notNull())
    .addColumn("actorId", "text")
    .addColumn("hid", "text")
    .addColumn("appId", "text")
    .addColumn("createdAt", "timestamptz", (col) => col.notNull())
    .addCheckConstraint("audit_log_actor_type_check", sql`"actorType" in ('user', 'service', 'public')`)
    .execute();

  await db.schema.createIndex("audit_log_actor_type_idx").on("audit_log").column("actorType").execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("audit_log").execute();
}
