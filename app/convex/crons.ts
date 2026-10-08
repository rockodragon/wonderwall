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

// Live booking (docs/features/live-booking.md §3): every open gig series
// keeps dates open HORIZON_WEEKS ahead. Idempotent — a date that already
// has a slot is skipped, so any cadence is safe.
crons.daily(
  "extend-gig-series",
  { hourUTC: 10, minuteUTC: 30 }, // ~3am Pacific
  internal.garden.gigs.extendGigSeries,
);

// The one daily email about cheers, offers of help, backings and gifts
// (supportDigest.ts): at most one a day per person, nothing on a quiet day.
crons.daily(
  "support-digest",
  { hourUTC: 17, minuteUTC: 0 }, // 10am Pacific (9am in winter)
  internal.supportDigest.sendSupportDigest,
);

// Notification retention: there's no archiving of in-app notifications
// otherwise, so rows accumulate forever. Read notifications older than 30
// days and unread notifications older than 90 days are deleted (see
// notificationRetention.ts for the rule and index rationale).
crons.daily(
  "sweep-expired-notifications",
  { hourUTC: 11, minuteUTC: 0 },
  internal.notificationRetention.sweepExpiredNotifications,
);

// Member-directed giving (docs/features/member-directed-giving.md): an
// open monthly amount nobody directed goes to the fund 35 days after it
// opened or when the next one opens. Idempotent — a decided row is skipped.
crons.daily(
  "default-open-member-gifts",
  { hourUTC: 12, minuteUTC: 0 }, // ~5am Pacific
  (internal as any).garden.giving.defaultOpenGifts,
  {},
);

// Stripe Connect transfer sweep: moves what connected creatives are owed
// (gifts and backings) once it reaches the $50 minimum. Also kicked per
// payee when money lands and when onboarding finishes; the nightly run is
// the backstop for anything that failed (e.g. a low platform balance).
crons.daily(
  "connect-transfer-owed",
  { hourUTC: 12, minuteUTC: 30 },
  (internal as any).garden.connect.transferOwed,
  {},
);

// No sweep for Table checkout holds: a hold stops counting the moment it
// expires (every read checks expiresAt), Stripe's checkout.session.expired
// releases it, and the next checkout marks old ones expired (Rick,
// 2026-10-07: no 15-minute jobs).

export default crons;
