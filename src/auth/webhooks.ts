import { env } from "../config/env.js";

export interface AccessChangedEvent {
  hid: string;
  userId?: string;
  appId?: string;
}

export function emitAccessChanged(event: AccessChangedEvent): void {
  if (!env.bffWebhookUrl) {
    return;
  }
  fetch(env.bffWebhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(event),
  }).catch((err) => {
    console.error("[webhook] failed to deliver access.changed", err);
  });
}
