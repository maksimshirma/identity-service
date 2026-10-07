import { type Kysely, sql } from "kysely";

// hostyara-shell's BFF — needed for the `public` grant on /token. BFF_CLIENT_ID
// on the BFF side must match this id.
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`insert into clients ("clientId", type) values ('hostyara-bff', 'bff') on conflict ("clientId") do nothing`.execute(
    db,
  );
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`delete from clients where "clientId" = 'hostyara-bff'`.execute(db);
}
