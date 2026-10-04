import type { Hono } from "hono";
import type { Kysely } from "kysely";
import type { auth as Auth } from "../auth/index.js";
import { createPat, listPats, revokePat } from "../auth/pat.js";
import { recordStepUp } from "../auth/step-up.js";
import type { Database } from "../db/schema.js";

export function registerAccountSecurityRoutes(app: Hono, db: Kysely<Database>, auth: typeof Auth) {
  app.post("/account/security/reauth", async (c) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) {
      return c.json({ error: "unauthenticated" }, 401);
    }

    const body = await c.req
      .json<{ password?: string; code?: string }>()
      .catch(() => ({}) as { password?: string; code?: string });
    if (!body.password) {
      return c.json({ error: "bad_request" }, 400);
    }

    try {
      await auth.api.verifyPassword({ body: { password: body.password }, headers: c.req.raw.headers });
    } catch {
      return c.json({ error: "invalid_credentials" }, 401);
    }

    if (session.user.twoFactorEnabled) {
      if (!body.code) {
        return c.json({ error: "totp_required" }, 400);
      }
      try {
        await auth.api.verifyTOTP({ body: { code: body.code }, headers: c.req.raw.headers });
      } catch {
        return c.json({ error: "invalid_credentials" }, 401);
      }
    }

    await recordStepUp(db, session.session.token);
    return c.json({ status: "ok" });
  });

  app.post("/account/security/pat", async (c) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) {
      return c.json({ error: "unauthenticated" }, 401);
    }
    const body = await c.req.json<{ name?: string }>().catch(() => ({}) as { name?: string });
    const pat = await createPat(db, session.user.id, body.name);
    return c.json(pat);
  });

  app.get("/account/security/pat", async (c) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) {
      return c.json({ error: "unauthenticated" }, 401);
    }
    const pats = await listPats(db, session.user.id);
    return c.json({ pats });
  });

  app.delete("/account/security/pat/:id", async (c) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) {
      return c.json({ error: "unauthenticated" }, 401);
    }
    const ok = await revokePat(db, session.user.id, c.req.param("id"));
    if (!ok) {
      return c.json({ error: "not_found" }, 404);
    }
    return c.json({ status: "ok" });
  });
}
