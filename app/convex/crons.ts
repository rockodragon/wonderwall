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

export default crons;
