// The one way server code puts a row in someone's notifications (and, with
// `email`, sends the matching email). Kept apart from notifications.ts,
// which imports garden/allocations: anything that notifies can import this
// without pulling that in.

import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { scheduleNotificationEmail } from "./emailHelpers";

/** A new notification's fields. `createdAt` defaults to now; readAt and
 * celebratedAt are set later, by reading it. digestedAt is set up front only
 * for one that was emailed at once, to keep it out of the daily email. */
export type NewNotification = Omit<
  Doc<"notifications">,
  "_id" | "_creationTime" | "createdAt" | "readAt" | "celebratedAt"
> & { createdAt?: number };

/** The email that goes with it, to the same person. scheduleNotificationEmail
 * checks their address and email preferences. */
export type NotificationEmail = Omit<Parameters<typeof scheduleNotificationEmail>[1], "userId">;

export async function insertNotification(
  ctx: MutationCtx,
  notification: NewNotification,
  { email }: { email?: NotificationEmail } = {},
): Promise<Id<"notifications">> {
  const id = await ctx.db.insert("notifications", {
    ...notification,
    createdAt: notification.createdAt ?? Date.now(),
  });
  if (email) await scheduleNotificationEmail(ctx, { userId: notification.userId, ...email });
  return id;
}
