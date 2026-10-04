import { Hono } from "hono";
import { type Kysely, sql } from "kysely";
import type { auth as Auth } from "./auth/index.js";
import type { Database } from "./db/schema.js";
import { registerAccountSecurityRoutes } from "./routes/account-security.js";
import { registerIntrospectRoutes } from "./routes/introspect.js";
import { registerOrganizationRoutes } from "./routes/organization.js";
import { registerTokenRoutes } from "./routes/token.js";

export function createServer(db: Kysely<Database>, auth: typeof Auth) {
  const app = new Hono();

  app.get("/health", async (c) => {
    await sql`select 1`.execute(db);
    return c.json({ status: "ok" });
  });

  app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));

  registerOrganizationRoutes(app, db, auth);
  registerIntrospectRoutes(app, db, auth);
  registerTokenRoutes(app, db, auth);
  registerAccountSecurityRoutes(app, db, auth);

  return app;
}
