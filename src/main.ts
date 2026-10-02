import { serve } from "@hono/node-server";
import { createServer } from "./server.js";

const port = Number(process.env.PORT ?? 3000);
const app = createServer();

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`identity-service listening on http://localhost:${info.port}`);
});
