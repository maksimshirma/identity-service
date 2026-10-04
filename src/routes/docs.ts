import { swaggerUI } from "@hono/swagger-ui";
import type { Hono } from "hono";
import type { auth as Auth } from "../auth/index.js";
import { env } from "../config/env.js";
import { customOpenApiPaths } from "../openapi/custom-paths.js";

export function registerDocsRoutes(app: Hono, auth: typeof Auth) {
  app.get("/openapi.json", async (c) => {
    const betterAuthSchema = (await auth.api.generateOpenAPISchema()) as {
      paths?: Record<string, unknown>;
      [key: string]: unknown;
    };

    const prefixedBetterAuthPaths = Object.fromEntries(
      Object.entries(betterAuthSchema.paths ?? {}).map(([path, def]) => [`/api/auth${path}`, def]),
    );

    return c.json({
      ...betterAuthSchema,
      info: { title: "identity-service", version: "0.0.1" },
      // better-auth's own servers[0].url already bakes in its basePath
      // (/api/auth), which we've already folded into the path keys above —
      // keeping that server entry here would double the prefix at request
      // time. Every path (ours and the re-keyed better-auth ones) is
      // correct relative to the bare origin, so that's the only server.
      servers: [{ url: env.baseUrl }],
      paths: { ...prefixedBetterAuthPaths, ...customOpenApiPaths },
    });
  });

  app.get("/docs", swaggerUI({ url: "/openapi.json" }));
}
