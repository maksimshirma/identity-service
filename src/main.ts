import { serve } from "@hono/node-server";
import { auth, db } from "./auth/index.js";
import { env } from "./config/env.js";
import { createServer } from "./server.js";

const app = createServer(db, auth);

serve({ fetch: app.fetch, port: env.port }, (info) => {
  console.log(`identity-service listening on http://localhost:${info.port}`);
});
