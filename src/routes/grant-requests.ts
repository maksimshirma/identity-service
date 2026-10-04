import type { Hono } from "hono";
import type { Kysely } from "kysely";
import type { auth as Auth } from "../auth/index.js";
import { recordAudit } from "../auth/audit.js";
import { approveGrantRequest, createGrantRequest, denyGrantRequest, listGrantRequests } from "../auth/grant-requests.js";
import { getMemberRole, hasRole } from "../auth/member-role.js";
import { emitAccessChanged } from "../auth/webhooks.js";
import type { Database } from "../db/schema.js";

interface CreateBody {
  hid?: string;
  appId?: string;
  requestedLevel?: "view" | "edit";
}

export function registerGrantRequestRoutes(app: Hono, db: Kysely<Database>, auth: typeof Auth) {
  app.post("/grant-requests", async (c) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) {
      return c.json({ error: "unauthenticated" }, 401);
    }

    const body = await c.req.json<CreateBody>().catch(() => ({}) as CreateBody);
    if (!body.hid || !body.appId || (body.requestedLevel !== "view" && body.requestedLevel !== "edit")) {
      return c.json({ error: "bad_request" }, 400);
    }

    const result = await createGrantRequest(db, {
      hid: body.hid,
      userId: session.user.id,
      appId: body.appId,
      requestedLevel: body.requestedLevel,
    });

    if ("error" in result) {
      return c.json({ error: result.error === "not_member" ? "forbidden" : result.error }, 403);
    }
    return c.json(result);
  });

  app.get("/grant-requests", async (c) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) {
      return c.json({ error: "unauthenticated" }, 401);
    }

    const hid = c.req.query("hid");
    if (!hid) {
      return c.json({ error: "bad_request" }, 400);
    }

    const role = await getMemberRole(db, hid, session.user.id);
    if (!role || !(hasRole(role, "owner") || hasRole(role, "admin"))) {
      return c.json({ error: "forbidden" }, 403);
    }

    const requests = await listGrantRequests(db, hid);
    return c.json({ requests });
  });

  app.post("/grant-requests/:id/approve", async (c) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) {
      return c.json({ error: "unauthenticated" }, 401);
    }

    const result = await approveGrantRequest(db, c.req.param("id"), session.user.id);
    if (!result.ok) {
      const status = result.error === "not_found" ? 404 : 403;
      return c.json({ error: result.error }, status);
    }

    emitAccessChanged({ hid: result.request.hid, userId: result.request.userId, appId: result.request.appId });
    await recordAudit(db, {
      eventType: "grant_request.approved",
      actorType: "user",
      actorId: session.user.id,
      hid: result.request.hid,
      appId: result.request.appId,
    });
    return c.json(result.request);
  });

  app.post("/grant-requests/:id/deny", async (c) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) {
      return c.json({ error: "unauthenticated" }, 401);
    }

    const result = await denyGrantRequest(db, c.req.param("id"), session.user.id);
    if (!result.ok) {
      const status = result.error === "not_found" ? 404 : 403;
      return c.json({ error: result.error }, status);
    }

    await recordAudit(db, {
      eventType: "grant_request.denied",
      actorType: "user",
      actorId: session.user.id,
      hid: result.request.hid,
      appId: result.request.appId,
    });
    return c.json(result.request);
  });
}
