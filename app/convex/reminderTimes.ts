// When the automatic reminders go out for an event or a class: one a day
// before it starts, one 2 hours before (convex/announcements.ts sends them,
// from a cron that runs every 15 minutes). Pure, so the host's page shows the
// same times the cron uses.

export const REMINDER_DAY_BEFORE_MS = 24 * 60 * 60 * 1000;
export const REMINDER_SOON_MS = 2 * 60 * 60 * 1000;

/** The reminders still to go out for a start, soonest first: a time, or
 * "now" for one the cron sends on its next tick. That happens to an event
 * posted less than a day ahead: the cron sends the day-before reminder the
 * first time it sees it (announcements.ts reminderStageFor). `sentAt` is
 * when this target's reminders went out, so one already sent isn't listed. */
export function upcomingReminderTimes(
  startsAt: number,
  now: number,
  sentAt: readonly number[] = [],
): (number | "now")[] {
  if (now >= startsAt) return [];
  const dayBefore = startsAt - REMINDER_DAY_BEFORE_MS;
  const soon = startsAt - REMINDER_SOON_MS;
  const sentSince = (at: number) => sentAt.some((sent) => sent >= at);
  if (now >= soon) return sentSince(soon) ? [] : ["now"];
  if (now < dayBefore) return [dayBefore, soon];
  return sentSince(dayBefore) ? [soon] : ["now", soon];
}
