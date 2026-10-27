import type { QueryCtx } from "../_generated/server";
import { getLoopRow } from "./settings";

export const UNREAD_REMINDER_KEY = "unread_message";
export const UNREAD_REMINDER_DELAY_MS = 24 * 60 * 60 * 1000;
export const UNREAD_REMINDER_DEFAULTS = {
  subject: "A conversation is waiting for you",
  body: "You have an unread message. Open your inbox whenever you have a moment.",
};

/** Missing settings always mean off. This reminder never enters signup schedules. */
export async function readUnreadReminder(ctx: Pick<QueryCtx, "db">) {
  const row = await getLoopRow(ctx, UNREAD_REMINDER_KEY);
  return {
    enabled: row?.enabled ?? false,
    subject: row?.subject ?? UNREAD_REMINDER_DEFAULTS.subject,
    body: row?.body ?? UNREAD_REMINDER_DEFAULTS.body,
  };
}
