import { Hono } from "hono";
import { type Kysely, sql } from "kysely";
import type { auth as Auth } from "./auth/index.js";
import { isStepUpFresh } from "./auth/step-up.js";
import type { Database } from "./db/schema.js";
import { createRateLimiter } from "./middleware/rate-limit.js";
import { registerAccountSecurityRoutes } from "./routes/account-security.js";
import { registerGrantRequestRoutes } from "./routes/grant-requests.js";
import { registerIntrospectRoutes } from "./routes/introspect.js";
import { registerOrganizationRoutes } from "./routes/organization.js";
import { registerTokenRoutes } from "./routes/token.js";

const ALWAYS_STEP_UP_PATHS = new Set(["/api/auth/organization/delete", "/api/auth/organization/remove-member"]);
const PROMOTION_ROLES = new Set(["admin", "owner"]);

export function createServer(db: Kysely<Database>, auth: typeof Auth) {
  const app = new Hono();

  app.get("/health", async (c) => {
    await sql`select 1`.execute(db);
    return c.json({ status: "ok" });
  });

  app.use("/api/auth/organization/*", async (c, next) => {
    if (c.req.method !== "POST") {
      return next();
    }

    let requiresStepUp = ALWAYS_STEP_UP_PATHS.has(c.req.path);

    if (c.req.path === "/api/auth/organization/update-member-role") {
      const body = (await c.req.raw
        .clone()
        .json()
        .catch(() => null)) as { role?: unknown } | null;
      const roles = Array.isArray(body?.role) ? body.role : [body?.role];
      requiresStepUp = roles.some((r: unknown) => typeof r === "string" && PROMOTION_ROLES.has(r));
    }

    if (!requiresStepUp) {
      return next();
    }

    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) {
      return c.json({ error: "unauthenticated" }, 401);
    }
    const fresh = await isStepUpFresh(db, session.session.token);
    if (!fresh) {
      return c.json({ error: "step_up_required" }, 403);
    }

    return next();
  });

  app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));

  const patCreateLimiter = createRateLimiter({ windowMs: 60_000, max: 5, keyPrefix: "pat-create" });
  app.use("/account/security/pat", async (c, next) => {
    if (c.req.method !== "POST") {
      return next();
    }
    return patCreateLimiter(c, next);
  });

  registerOrganizationRoutes(app, db, auth);
  registerIntrospectRoutes(app, db, auth);
  registerTokenRoutes(app, db, auth);
  registerAccountSecurityRoutes(app, db, auth);
  registerGrantRequestRoutes(app, db, auth);

  return app;
}
