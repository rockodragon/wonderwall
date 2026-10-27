export const SERVER_EVENTS = [
  "user_signed_up", "project_created", "nudge_sent", "message_sent", "first_reply",
  "conversation_read", "follow_created", "follow_removed", "invite_redeemed",
] as const;
export type ServerEvent = (typeof SERVER_EVENTS)[number];
export type EventProperties = Record<string, string | number | boolean | null>;
export const EVENT_ATTEMPTS = 5;
export const EVENT_LEASE_MS = 60_000;

export function isServerEvent(value: string): value is ServerEvent {
  return (SERVER_EVENTS as readonly string[]).includes(value);
}

/** A failed event stays available for operator recovery after bounded retries. */
export function eventRetryDelay(attempt: number): number {
  return Math.min(60_000 * 2 ** Math.max(0, attempt - 1), 15 * 60_000);
}

/** Domain emitters carry identifiers and counters, never private content. */
export function eventProperties(input: EventProperties | undefined): EventProperties {
  const result: EventProperties = {};
  for (const [key, value] of Object.entries(input ?? {}).slice(0, 32)) {
    if (/body|content|password|token|phone|email|(^|_)name($|_)/i.test(key)) continue;
    if (typeof value === "string") result[key] = value.slice(0, 256);
    else if (typeof value === "number" && Number.isFinite(value)) result[key] = value;
    else if (typeof value === "boolean" || value === null) result[key] = value;
  }
  return result;
}
