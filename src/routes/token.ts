import type { Hono } from "hono";
import type { Kysely } from "kysely";
import type { auth as Auth } from "../auth/index.js";
import { recordAudit } from "../auth/audit.js";
import { verifyBffClient, verifyServiceClient, getServiceGrantScope } from "../auth/clients.js";
import { getHouseholdIntrospection } from "../auth/grants.js";
import { verifyPat } from "../auth/pat.js";
import { issueToken } from "../auth/token-issue.js";
import type { Database } from "../db/schema.js";

interface TokenBody {
  hid?: string;
  appId?: string;
  clientId?: string;
  secret?: string;
}

async function resolveUserGrant(db: Kysely<Database>, userId: string, hid: string, appId: string) {
  const introspection = await getHouseholdIntrospection(db, { userId, hid });
  if (!introspection) {
    return null;
  }
  if (!introspection.installedApps.includes(appId)) {
    return null;
  }
  const level = introspection.grants[appId];
  if (!level) {
    return null;
  }
  const permissions = introspection.permissions[appId] ?? [];
  return {
    scope: [level === "edit" ? "app:edit" : "app:view", ...permissions],
  };
}

export function registerTokenRoutes(app: Hono, db: Kysely<Database>, auth: typeof Auth) {
  app.post("/token", async (c) => {
    const grantType = c.req.query("grant_type");
    const body = await c.req.json<TokenBody>().catch(() => ({}) as TokenBody);

    if (grantType === "session") {
      const session = await auth.api.getSession({ headers: c.req.raw.headers });
      if (!session) {
        return c.json({ error: "unauthenticated" }, 401);
      }
      if (!body.hid || !body.appId) {
        return c.json({ error: "bad_request" }, 400);
      }
      const grant = await resolveUserGrant(db, session.user.id, body.hid, body.appId);
      if (!grant) {
        return c.json({ error: "forbidden" }, 403);
      }
      const token = await issueToken(db, {
        sub: session.user.id,
        hid: body.hid,
        aud: body.appId,
        scope: grant.scope,
        grant_type: "session",
      });
      await recordAudit(db, {
        eventType: "token.issued",
        actorType: "user",
        actorId: session.user.id,
        hid: body.hid,
        appId: body.appId,
      });
      return c.json({ token });
    }

    if (grantType === "pat") {
      const authHeader = c.req.header("Authorization");
      const bearer = authHeader?.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : null;
      if (!bearer) {
        return c.json({ error: "unauthenticated" }, 401);
      }
      const pat = await verifyPat(db, bearer);
      if (!pat) {
        return c.json({ error: "unauthenticated" }, 401);
      }
      if (!body.hid || !body.appId) {
        return c.json({ error: "bad_request" }, 400);
      }
      const grant = await resolveUserGrant(db, pat.userId, body.hid, body.appId);
      if (!grant) {
        return c.json({ error: "forbidden" }, 403);
      }
      const token = await issueToken(db, {
        sub: pat.userId,
        hid: body.hid,
        aud: body.appId,
        scope: grant.scope,
        grant_type: "pat",
      });
      await recordAudit(db, {
        eventType: "token.issued",
        actorType: "user",
        actorId: pat.userId,
        hid: body.hid,
        appId: body.appId,
      });
      return c.json({ token });
    }

    if (grantType === "service") {
      if (!body.clientId || !body.secret || !body.appId) {
        return c.json({ error: "bad_request" }, 400);
      }
      const client = await verifyServiceClient(db, body.clientId, body.secret);
      if (!client) {
        return c.json({ error: "forbidden" }, 403);
      }
      const scope = await getServiceGrantScope(db, client.clientId, body.appId);
      if (!scope) {
        return c.json({ error: "forbidden" }, 403);
      }
      const token = await issueToken(db, {
        hid: body.hid,
        aud: body.appId,
        scope,
        grant_type: "service",
      });
      await recordAudit(db, {
        eventType: "token.issued",
        actorType: "service",
        actorId: client.clientId,
        hid: body.hid,
        appId: body.appId,
      });
      return c.json({ token });
    }

    if (grantType === "public") {
      if (!body.clientId || !body.appId) {
        return c.json({ error: "bad_request" }, 400);
      }
      const client = await verifyBffClient(db, body.clientId);
      if (!client) {
        return c.json({ error: "forbidden" }, 403);
      }
      const token = await issueToken(db, {
        aud: body.appId,
        scope: ["view"],
        grant_type: "public",
      });
      await recordAudit(db, {
        eventType: "token.issued",
        actorType: "public",
        actorId: client.clientId,
        appId: body.appId,
      });
      return c.json({ token });
    }

    return c.json({ error: "unsupported_grant_type" }, 400);
  });
}
