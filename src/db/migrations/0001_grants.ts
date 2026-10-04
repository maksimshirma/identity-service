import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("grants")
    .addColumn("hid", "text", (col) => col.notNull())
    .addColumn("userId", "text", (col) => col.notNull())
    .addColumn("appId", "text", (col) => col.notNull())
    .addColumn("level", "text", (col) => col.notNull())
    .addPrimaryKeyConstraint("grants_pk", ["hid", "userId", "appId"])
    .addCheckConstraint("grants_level_check", sql`level in ('view', 'edit')`)
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("grants").execute();
}
