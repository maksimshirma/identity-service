import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("service_grants")
    .addColumn("clientId", "text", (col) => col.notNull().references("clients.clientId").onDelete("cascade"))
    .addColumn("appId", "text", (col) => col.notNull())
    .addColumn("scope", sql`text[]`, (col) => col.notNull().defaultTo(sql`'{}'::text[]`))
    .addPrimaryKeyConstraint("service_grants_pk", ["clientId", "appId"])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("service_grants").execute();
}
