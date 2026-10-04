import { betterAuth } from "better-auth";
import { organization } from "better-auth/plugins";
import { env } from "../config/env.js";
import { createKyselyInstance } from "../db/kysely.js";

export const db = createKyselyInstance(env.postgres);

export const auth = betterAuth({
  database: { db, type: "postgres" },
  emailAndPassword: { enabled: true },
  plugins: [organization()],
});
