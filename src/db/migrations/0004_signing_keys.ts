import type { Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("signing_keys")
    .addColumn("kid", "text", (col) => col.primaryKey())
    .addColumn("publicKey", "text", (col) => col.notNull())
    .addColumn("privateKey", "text", (col) => col.notNull())
    .addColumn("createdAt", "timestamptz", (col) => col.notNull())
    .addColumn("retiredAt", "timestamptz")
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("signing_keys").execute();
}
