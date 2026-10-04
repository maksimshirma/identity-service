import { swaggerUI } from "@hono/swagger-ui";
import type { Hono } from "hono";
import type { auth as Auth } from "../auth/index.js";
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
      paths: { ...prefixedBetterAuthPaths, ...customOpenApiPaths },
    });
  });

  app.get("/docs", swaggerUI({ url: "/openapi.json" }));
}
