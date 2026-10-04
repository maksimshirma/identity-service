import type { Hono } from "hono";
import type { Kysely } from "kysely";
import type { auth as Auth } from "../auth/index.js";
import { getHouseholdIntrospection } from "../auth/grants.js";
import { getJwks } from "../auth/signing.js";
import type { Database } from "../db/schema.js";

export function registerIntrospectRoutes(app: Hono, db: Kysely<Database>, auth: typeof Auth) {
  app.get("/introspect", async (c) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) {
      return c.json({ error: "unauthenticated" }, 401);
    }
    return c.json({ userId: session.user.id });
  });

  app.get("/introspect/household", async (c) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) {
      return c.json({ error: "unauthenticated" }, 401);
    }

    const hid = c.req.query("hid");
    if (!hid) {
      return c.json({ error: "bad_request" }, 400);
    }

    const result = await getHouseholdIntrospection(db, { userId: session.user.id, hid });
    if (!result) {
      return c.json({ error: "forbidden" }, 403);
    }

    return c.json(result);
  });

  app.get("/jwks.json", async (c) => {
    const jwks = await getJwks(db);
    return c.json(jwks);
  });
}
