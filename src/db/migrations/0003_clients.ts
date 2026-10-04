import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("clients")
    .addColumn("clientId", "text", (col) => col.primaryKey())
    .addColumn("type", "text", (col) => col.notNull())
    .addColumn("credentialHash", "text")
    .addColumn("allowedApps", sql`text[]`, (col) => col.notNull().defaultTo(sql`'{}'::text[]`))
    .addColumn("createdAt", "timestamptz", (col) => col.notNull().defaultTo(sql`current_timestamp`))
    .addCheckConstraint("clients_type_check", sql`type in ('bff', 'alt-frontend', 'service')`)
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("clients").execute();
}
