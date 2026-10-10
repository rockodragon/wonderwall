// POST /api/nudges, the call a PostHog workflow makes to ask the app to send
// a nudge (docs/features/engagement-loops.md). Wired in http.ts.
//
//   header  X-Nudge-Secret: <NUDGE_WEBHOOK_SECRET>
//   body    {"loop": "share_project_day1", "distinct_id": "<user id>"}
//
// Answers: 503 when no secret is set on the deployment (nothing is sent, ever,
// until one is), 401 for a missing or wrong secret, 400 for a body that isn't
// right or a loop that doesn't exist, 404 when distinct_id isn't one of our
// members, 200 with {"status": "sent"} or {"status": "skipped", "reason": ...}
// otherwise. It's an httpAction, so it runs in Convex's V8 runtime, not Node:
// the secret check uses crypto.subtle (rules.ts), not node:crypto. CORS isn't
// needed; the caller is PostHog's server.

import { httpAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { checkNudgeSecret, parseNudgeBody } from "./rules";

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

export const nudgeWebhook = httpAction(async (ctx, request) => {
  const secret = await checkNudgeSecret(process.env.NUDGE_WEBHOOK_SECRET, request.headers.get("X-Nudge-Secret"));
  if (secret === "not_configured") {
    console.error("[nudges] NUDGE_WEBHOOK_SECRET is not set; refusing the call");
    return json(503, { error: "Not configured." });
  }
  if (secret === "denied") return json(401, { error: "Unauthorized." });

  const parsed = parseNudgeBody(await request.text());
  if (!parsed.ok) return json(400, { error: parsed.error });

  try {
    const result = await ctx.runMutation(internal.engagement.nudges.attemptNudge, {
      loop: parsed.call.loop,
      distinctId: parsed.call.distinctId,
    });
    // A distinct_id that isn't a member can never succeed, so say so with a
    // 404 (PostHog shows it in the workflow's log) rather than a 200 or a 5xx
    // it would retry.
    if (result.status === "skipped" && result.reason === "unknown_user") return json(404, result);
    return json(200, result);
  } catch (error) {
    // Idempotent per loop and person, so PostHog retrying a 500 can't send twice.
    console.error("[nudges] attemptNudge failed", error);
    return json(500, { error: "Something went wrong." });
  }
});
