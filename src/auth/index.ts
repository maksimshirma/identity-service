import { betterAuth } from "better-auth";
import { organization, twoFactor } from "better-auth/plugins";
import { env } from "../config/env.js";
import { createKyselyInstance } from "../db/kysely.js";
import { emitAccessChanged } from "./webhooks.js";

export const db = createKyselyInstance(env.postgres);

export const auth = betterAuth({
  database: { db, type: "postgres" },
  emailAndPassword: { enabled: true },
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
  ],
});
