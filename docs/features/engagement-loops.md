# Engagement loops: all in the app

Rick, 2026-10-10: "keep it in the app." The app keeps the clock, checks, and sends. PostHog only measures. (On 10/9 PostHog Workflows held the timing behind a webhook. That was removed before anyone set it up.) Revisit PostHog Workflows when someone non-technical needs to build flows, or past about 10 loops.

No marketing texts, ever: SMS stays sign-in codes and transactional.

The first loops get a new member to share a project, the activation event (docs/features/activation-onboarding-audit.md).

## How it works

1. **Signup schedules the loops.** When a new account is created (`convex/auth.ts`), the app sends `user_signed_up` to PostHog and calls `scheduleSignupNudges` (`engagement/schedule.ts`). That makes one scheduled run per loop, each for its day (`afterDays` in `engagement/loops.ts`). There are no crons.
2. **Each run decides whether to send** (`engagement/nudges.ts` `attemptNudge`). It re-checks:
   - the loop is on;
   - the person exists and has an email;
   - their email settings allow the category;
   - their address hasn't bounced or complained;
   - the loop's condition still holds (share_project: still no project they posted);
   - this loop hasn't already reached them;
   - no other nudge reached them in the last 24 hours (Rick 10/4: one message a day is the most);
   - the daily cheers email didn't reach them in the last 24 hours.
3. **Send, log, measure.** It sends through the existing email pipeline (Resend, templates, unsubscribe) and logs the result: sent, or skipped with the reason. After a send it reports `nudge_sent` to PostHog. Identity everywhere is the user id. Name and email are only properties on that person.

A delay changed in code applies to people who sign up after the deploy. Runs already scheduled keep their time but re-check everything, so turning a loop off stops them.

## Loops (v1)

"No project of theirs" means no project they posted. The finished piece onboarding used to ask for is a hidden companion project (`origin: "portfolio"`). It doesn't count, and `project_created` never fires for it.

| Key | When | Condition | Category |
|---|---|---|---|
| `share_project_day1` | 1 day after signup | no project of theirs | activity |
| `share_project_day4` | 4 days after signup | no project of theirs | activity |

**First cheer:** the first cheer a member ever receives (on any of their projects, not counting their own) emails them at once instead of waiting for the 17:00 digest. It's marked so the digest doesn't send it again (`digestedAt`). This is Rick's exception to the one-a-day rule. Every later cheer stays in the daily email.

## /admin/engagement-loops (admins only)

- One row per loop: an on/off switch, its subject and text (editable, no deploy), and when it runs.
- Counts for the last 7 and 30 days:
  - sent;
  - skipped, by reason;
  - shared: a project created within 7 days of the send.

## Measuring in PostHog

Events: `user_signed_up` (server), `nudge_sent` (server, `{ loop }`), `project_created` (server), and the onboarding events from the browser. A funnel from `nudge_sent` to `project_created`, split by `loop`, shows each loop's lift.
