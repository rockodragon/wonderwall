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

export default crons;
