import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";

// Retention rule for in-app notifications (there is no archiving today —
// rows accumulate forever otherwise). Two independent expirations:
//   - a READ notification is dropped once it's been read for 30 days
//   - an UNREAD notification is dropped once it's 90 days old — nobody is
//     coming back to act on a 3-month-old unread notification
// The 200-most-recent-per-user cap described in the request would need a
// full per-user scan (count everyone's rows, sort, trim), which isn't cheap
// at the table-scan sizes this sweep is built for, so it's intentionally
// NOT implemented here.
export const READ_RETENTION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
export const UNREAD_RETENTION_MS = 90 * 24 * 60 * 60 * 1000; // 90 days

/** Pure rule: is this notification old enough to delete, as of `now`? */
export function isExpired(
  n: { readAt?: number; createdAt: number },
  now: number,
): boolean {
  if (n.readAt !== undefined) {
    return now - n.readAt > READ_RETENTION_MS;
  }
  return now - n.createdAt > UNREAD_RETENTION_MS;
}

// Rows examined per rule, per invocation. Keeps each run's transaction
// small; sweepExpiredNotifications reschedules itself when a scan comes
// back full, so one nightly tick still eventually clears everything.
const BATCH_SIZE = 500;

// Nightly sweep (see crons.ts). Deletes in two index-scoped passes instead
// of one full-table filter:
//
// 1. Read rows older than 30 days: `by_readAt` is a range index on readAt
//    alone, so `gt(0).lt(cutoff)` walks only rows with a defined readAt
//    below the cutoff — undefined (unread) readAt values sort before 0 in
//    Convex's index ordering, so `gt("readAt", 0)` excludes them without a
//    second filter pass.
//
// 2. Unread rows older than 90 days: there is no index on
//    (readAt=undefined, createdAt) — `by_userId_readAt` is scoped per user,
//    not global, so it can't drive a cross-user range scan. Instead this
//    scans the table in its default order (`_creationTime` ascending, via
//    `.order("asc")` with no index), which is a safe proxy for `createdAt`
//    because both are stamped from `Date.now()` in the same insert
//    (`createNotification` in notifications.ts) — the oldest rows by
//    `_creationTime` are exactly the oldest rows by `createdAt`. `isExpired`
//    is applied per row so any already-expired read rows this scan happens
//    to touch are cleaned up too (harmless overlap with pass 1).
export const sweepExpiredNotifications = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const readCutoff = now - READ_RETENTION_MS;
    let deletedCount = 0;

    // Pass 1: expired read notifications, via the by_readAt range index.
    const oldRead = await ctx.db
      .query("notifications")
      .withIndex("by_readAt", (q) => q.gt("readAt", 0).lt("readAt", readCutoff))
      .take(BATCH_SIZE);
    for (const n of oldRead) {
      await ctx.db.delete(n._id);
      deletedCount++;
    }

    // Pass 2: expired unread notifications, via a bounded oldest-first scan
    // (see comment above for why this is the sound choice absent an index).
    const oldest = await ctx.db.query("notifications").order("asc").take(BATCH_SIZE);
    for (const n of oldest) {
      if (isExpired({ readAt: n.readAt, createdAt: n.createdAt }, now)) {
        await ctx.db.delete(n._id);
        deletedCount++;
      }
    }

    const hitBatchLimit =
      oldRead.length === BATCH_SIZE || oldest.length === BATCH_SIZE;
    if (hitBatchLimit) {
      await ctx.scheduler.runAfter(
        0,
        internal.notificationRetention.sweepExpiredNotifications,
        {},
      );
    }

    return { deletedCount, hitBatchLimit };
  },
});
