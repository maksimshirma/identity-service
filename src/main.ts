import { serve } from "@hono/node-server";
import { env } from "./config/env.js";
import { createKyselyInstance } from "./db/kysely.js";
import { createServer } from "./server.js";

const db = createKyselyInstance(env.postgres);
const app = createServer(db);

serve({ fetch: app.fetch, port: env.port }, (info) => {
  console.log(`identity-service listening on http://localhost:${info.port}`);
});
