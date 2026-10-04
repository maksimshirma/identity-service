import { Hono } from "hono";
import { type Kysely, sql } from "kysely";
import type { Database } from "./db/schema.js";

export function createServer(db: Kysely<Database>) {
  const app = new Hono();

  app.get("/health", async (c) => {
    await sql`select 1`.execute(db);
    return c.json({ status: "ok" });
  });

  return app;
}
