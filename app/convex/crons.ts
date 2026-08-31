import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Check for scheduled crawls every hour
crons.hourly(
  "check-scheduled-crawls",
  { minuteUTC: 0 },
  internal.crawlerScheduler.checkScheduledCrawls,
);

// Process crawler queue every 5 minutes
crons.interval(
  "process-crawler-queue",
  { minutes: 5 },
  internal.crawlerScheduler.processQueueCron,
);

// Likes digest - 3x daily (8am, 1pm, 6pm PT = 16:00, 21:00, 02:00 UTC)
crons.cron(
  "likes-digest",
  "0 2,16,21 * * *",
  internal.likesDigest.sendLikesDigest,
);

// The Garden — Phase 1B W1: nightly Stripe reconcile. Webhook races/misses
// are a named top risk (architect R2); this sweep lists Stripe's own
// subscription state and replays it through the same idempotent handler the
// webhook uses. Never cut this (spec §5, "Never cut" list).
// NOTE (codegen): internal.garden.stripe isn't in the generated API yet —
// cast through `as any` until `npx convex dev` regenerates it (see
// garden/memberships.ts's header for the same caveat).
crons.daily(
  "stripe-reconcile-memberships",
  { hourUTC: 9, minuteUTC: 0 }, // 1am/2am Pacific — off-peak
  (internal as any).garden.stripe.reconcileMemberships,
);

// Announcements (docs/announcements-prd.md): day-before reminders for
// events/offerings. reminderKey makes this safe at any cadence — a target
// already reminded on a prior tick is a no-op lookup, not a re-send.
crons.interval(
  "announcement-reminders",
  { minutes: 15 },
  internal.announcements.sendDueReminders,
);

export default crons;
