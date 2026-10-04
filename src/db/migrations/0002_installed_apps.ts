import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("installed_apps")
    .addColumn("hid", "text", (col) => col.notNull())
    .addColumn("appId", "text", (col) => col.notNull())
    .addColumn("installedAt", "timestamptz", (col) => col.notNull().defaultTo(sql`current_timestamp`))
    .addPrimaryKeyConstraint("installed_apps_pk", ["hid", "appId"])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("installed_apps").execute();
}
