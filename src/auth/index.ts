import { betterAuth } from "better-auth";
import { openAPI, organization, twoFactor } from "better-auth/plugins";
import type { Kysely } from "kysely";
import { env } from "../config/env.js";
import { createKyselyInstance } from "../db/kysely.js";
import type { Database } from "../db/schema.js";
import { sendMail } from "./mail.js";
import { emitAccessChanged } from "./webhooks.js";

export interface CreateAuthOptions {
  rateLimitEnabled?: boolean;
  trustedOrigins?: string[];
}

export function createAuth(db: Kysely<Database>, options: CreateAuthOptions = {}) {
  return betterAuth({
    database: { db, type: "postgres" },
    baseURL: env.baseUrl,
    // Server-to-server callers that send an Origin other than baseURL — the
    // hostyara BFF proxies sign-in/organization calls with its own public origin.
    trustedOrigins: options.trustedOrigins ?? env.trustedOrigins,
    // Better-Auth silently disables the Origin check when NODE_ENV=test;
    // keep it on so the test suite exercises the production CSRF behavior.
    advanced: { disableOriginCheck: false },
    rateLimit: { enabled: options.rateLimitEnabled ?? true },
    emailAndPassword: {
      enabled: true,
      sendResetPassword: async ({ user, url }) => {
        sendMail({ to: user.email, subject: "Сброс пароля", text: `Ссылка для сброса пароля: ${url}` });
      },
    },
    emailVerification: {
      sendVerificationEmail: async ({ user, url }) => {
        sendMail({ to: user.email, subject: "Подтверждение почты", text: `Подтвердите почту: ${url}` });
      },
    },
    plugins: [
      organization({
        organizationHooks: {
          afterAcceptInvitation: async ({ member }) => {
            emitAccessChanged({ hid: member.organizationId, userId: member.userId });
          },
          afterAddMember: async ({ member }) => {
            emitAccessChanged({ hid: member.organizationId, userId: member.userId });
          },
          afterRemoveMember: async ({ member }) => {
            emitAccessChanged({ hid: member.organizationId, userId: member.userId });
          },
          afterUpdateMemberRole: async ({ member }) => {
            emitAccessChanged({ hid: member.organizationId, userId: member.userId });
          },
          afterDeleteOrganization: async ({ organization: org }) => {
            emitAccessChanged({ hid: org.id });
          },
        },
      }),
      twoFactor({ issuer: "identity-service" }),
      openAPI(),
    ],
  });
}

export const db = createKyselyInstance(env.postgres);

export const auth = createAuth(db);
