// The engagement loops' clock (docs/features/engagement-loops.md): at signup,
// schedule each loop for its day. Its own small module so auth.ts can call it
// without importing nudges.ts, which reaches back to auth.ts through helpers.

import { internal } from "../_generated/api";
import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { signupNudgePlan } from "./loops";

/** One scheduled run per loop (Rick, 2026-10-10: keep it in the app). The run
 *  (nudges.ts attemptNudge) re-checks everything before it sends; PostHog only
 *  measures, through user_signed_up, nudge_sent and project_created. */
export async function scheduleSignupNudges(ctx: MutationCtx, userId: Id<"users">): Promise<void> {
  for (const { loop, delayMs } of signupNudgePlan()) {
    await ctx.scheduler.runAfter(delayMs, internal.engagement.nudges.attemptNudge, { loop, userId });
  }
}
