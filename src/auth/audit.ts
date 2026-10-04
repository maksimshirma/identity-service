import { randomUUID } from "node:crypto";
import type { Kysely } from "kysely";
import type { Database } from "../db/schema.js";

export type ActorType = "user" | "service" | "public";

export interface AuditEntry {
  eventType: string;
  actorType: ActorType;
  actorId?: string | null;
  hid?: string | null;
  appId?: string | null;
}

export async function recordAudit(db: Kysely<Database>, entry: AuditEntry): Promise<void> {
  await db
    .insertInto("audit_log")
    .values({
      id: randomUUID(),
      eventType: entry.eventType,
      actorType: entry.actorType,
      actorId: entry.actorId ?? null,
      hid: entry.hid ?? null,
      appId: entry.appId ?? null,
      createdAt: new Date(),
    })
    .execute();
}
