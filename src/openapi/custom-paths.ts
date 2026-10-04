const errorResponse = (description: string) => ({
  description,
  content: { "application/json": { schema: { type: "object", properties: { error: { type: "string" } } } } },
});

export const customOpenApiPaths = {
  "/health": {
    get: {
      tags: ["health"],
      summary: "Liveness check with a live DB round-trip",
      responses: { "200": { description: "ok" } },
    },
  },
  "/introspect": {
    get: {
      tags: ["introspect"],
      summary: "Minimal session introspection — just the user id",
      responses: {
        "200": {
          description: "Authenticated",
          content: {
            "application/json": { schema: { type: "object", properties: { userId: { type: "string" } } } },
          },
        },
        "401": errorResponse("Unauthenticated"),
      },
    },
  },
  "/introspect/household": {
    get: {
      tags: ["introspect"],
      summary: "Household-scoped introspection — role, installed apps, grants, permissions",
      parameters: [{ name: "hid", in: "query", required: true, schema: { type: "string" } }],
      responses: {
        "200": {
          description: "Member of hid",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  userId: { type: "string" },
                  hid: { type: "string" },
                  role: { type: "string" },
                  installedApps: { type: "array", items: { type: "string" } },
                  grants: { type: "object", additionalProperties: { type: "string", enum: ["view", "edit"] } },
                  permissions: { type: "object", additionalProperties: { type: "array", items: { type: "string" } } },
                },
              },
            },
          },
        },
        "401": errorResponse("Unauthenticated"),
        "403": errorResponse("Not a member of hid (same body whether hid exists or not)"),
      },
    },
  },
  "/jwks.json": {
    get: {
      tags: ["introspect"],
      summary: "Public signing keys (JWK Set) for verifying internal-JWTs",
      responses: { "200": { description: "JWK Set" } },
    },
  },
  "/token": {
    post: {
      tags: ["token"],
      summary: "Issue a short-lived internal-JWT (60s) for one of 4 grant types",
      parameters: [
        {
          name: "grant_type",
          in: "query",
          required: true,
          schema: { type: "string", enum: ["session", "pat", "service", "public"] },
        },
      ],
      requestBody: {
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                hid: { type: "string" },
                appId: { type: "string" },
                clientId: { type: "string" },
                secret: { type: "string" },
              },
            },
          },
        },
      },
      responses: {
        "200": {
          description: "Issued",
          content: {
            "application/json": { schema: { type: "object", properties: { token: { type: "string" } } } },
          },
        },
        "400": errorResponse("Missing required fields"),
        "401": errorResponse("Unauthenticated (session/pat)"),
        "403": errorResponse("Forbidden (no grant / bad secret / wrong client type)"),
      },
    },
  },
  "/org/transfer-ownership": {
    post: {
      tags: ["organization"],
      summary: "Atomically transfer ownership from the caller (owner) to an existing admin",
      requestBody: {
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: { organizationId: { type: "string" }, newOwnerMemberId: { type: "string" } },
            },
          },
        },
      },
      responses: {
        "200": { description: "Transferred" },
        "401": errorResponse("Unauthenticated"),
        "403": errorResponse("Caller isn't owner, or target isn't admin, or step-up required"),
      },
    },
  },
  "/account/security/reauth": {
    post: {
      tags: ["account-security"],
      summary: "Step-up re-authentication (password + TOTP if 2FA enabled)",
      requestBody: {
        content: {
          "application/json": {
            schema: { type: "object", properties: { password: { type: "string" }, code: { type: "string" } } },
          },
        },
      },
      responses: {
        "200": { description: "Step-up recorded for the current session, valid 5 minutes" },
        "400": errorResponse("Missing password, or TOTP code required"),
        "401": errorResponse("Unauthenticated or invalid credentials"),
      },
    },
  },
  "/account/security/pat": {
    post: {
      tags: ["account-security"],
      summary: "Create a Personal Access Token (shown once)",
      requestBody: {
        content: { "application/json": { schema: { type: "object", properties: { name: { type: "string" } } } } },
      },
      responses: { "200": { description: "Created" }, "401": errorResponse("Unauthenticated") },
    },
    get: {
      tags: ["account-security"],
      summary: "List the caller's PATs (no raw token)",
      responses: { "200": { description: "ok" }, "401": errorResponse("Unauthenticated") },
    },
  },
  "/account/security/pat/{id}": {
    delete: {
      tags: ["account-security"],
      summary: "Revoke a PAT instantly",
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
      responses: {
        "200": { description: "Revoked" },
        "401": errorResponse("Unauthenticated"),
        "404": errorResponse("Not found or not owned by caller"),
      },
    },
  },
  "/grant-requests": {
    post: {
      tags: ["grant-requests"],
      summary: "Request access to an installed app",
      requestBody: {
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                hid: { type: "string" },
                appId: { type: "string" },
                requestedLevel: { type: "string", enum: ["view", "edit"] },
              },
            },
          },
        },
      },
      responses: {
        "200": { description: "Created" },
        "400": errorResponse("Missing/invalid fields"),
        "401": errorResponse("Unauthenticated"),
        "403": errorResponse("Not a member, or app not installed"),
      },
    },
    get: {
      tags: ["grant-requests"],
      summary: "List grant-requests for a household (owner/admin only)",
      parameters: [{ name: "hid", in: "query", required: true, schema: { type: "string" } }],
      responses: {
        "200": { description: "ok" },
        "401": errorResponse("Unauthenticated"),
        "403": errorResponse("Not owner/admin of hid"),
      },
    },
  },
  "/grant-requests/{id}/approve": {
    post: {
      tags: ["grant-requests"],
      summary: "Approve a pending grant-request (owner/admin only); creates/updates the grant",
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
      responses: {
        "200": { description: "Approved" },
        "401": errorResponse("Unauthenticated"),
        "403": errorResponse("Not owner/admin, or already decided"),
        "404": errorResponse("Not found"),
      },
    },
  },
  "/grant-requests/{id}/deny": {
    post: {
      tags: ["grant-requests"],
      summary: "Deny a pending grant-request (owner/admin only)",
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
      responses: {
        "200": { description: "Denied" },
        "401": errorResponse("Unauthenticated"),
        "403": errorResponse("Not owner/admin, or already decided"),
        "404": errorResponse("Not found"),
      },
    },
  },
};
