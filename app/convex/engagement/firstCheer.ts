// The first cheer a member ever receives is emailed at once, instead of
// waiting for the 17:00 daily email (supportDigest.ts). Rick, 2026-10-09: an
// exception to the one-message-a-day rule, because the first cheer is the
// moment a new member learns that someone is looking (docs/features/
// engagement-loops.md). Every later cheer stays in the daily email.
//
// How it's kept out of the daily email: the notification is inserted with
// `digestedAt` already set, the same mark the daily email puts on a row it has
// sent, and pickDigestRows leaves those alone.

import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { scheduleNotificationEmail } from "../emailHelpers";
import { celebrationContext } from "../notifications";
import { buildSupportDigestEmail, digestLinks } from "../supportDigest";

type CheerRow = { _id: string; type: string; supporterUserId?: string };

/** True when `thisId` is the only cheer the member has received: no other
 * "encouragement" on their projects from someone else. A cheer from the owner
 * on their own project is not received (supportNotice tells nobody about it),
 * and the one just posted is excluded by id. Pure. */
export function isFirstCheer(rows: readonly CheerRow[], ownerId: string, thisId: string): boolean {
  return !rows.some((r) => r._id !== thisId && r.type === "encouragement" && r.supporterUserId !== ownerId);
}

/** Whether the cheer just posted (`supportId`) is the first the member has
 * ever received on any of their projects. Read from projectSupport, which
 * keeps every cheer; the notifications table can't say, because retention
 * deletes old read ones (notificationRetention.ts). */
export async function isFirstCheerReceived(
  ctx: QueryCtx,
  ownerId: Id<"users">,
  supportId: Id<"projectSupport">,
): Promise<boolean> {
  const rows: CheerRow[] = [];
  for await (const project of ctx.db.query("projects").withIndex("by_userId", (q) => q.eq("userId", ownerId))) {
    for await (const support of ctx.db
      .query("projectSupport")
      .withIndex("by_projectId", (q) => q.eq("projectId", project._id))) {
      rows.push(support);
    }
  }
  return isFirstCheer(rows, ownerId, supportId);
}

/** Email the cheer now, in the daily email's words for one cheer (its subject
 * is "Dana cheered on Small Acts", the person and project linked, their words
 * in quotes). Category "activity", so the member's email settings and the
 * unsubscribe link apply as they do to the daily one. */
export async function emailFirstCheer(ctx: MutationCtx, notificationId: Id<"notifications">): Promise<void> {
  const notification = await ctx.db.get(notificationId);
  if (!notification) return;
  const links = digestLinks(await celebrationContext(ctx, notification));
  await scheduleNotificationEmail(ctx, {
    userId: notification.userId,
    category: "activity",
    ...buildSupportDigestEmail([
      { type: notification.type, title: notification.title, message: notification.message, links },
    ]),
  });
}
