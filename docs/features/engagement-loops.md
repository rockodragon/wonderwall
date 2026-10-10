# Engagement loops: PostHog decides when, the app sends

Rick, 2026-10-09: "lets use PH for nudge timing and our app webhook to send email." No marketing texts, ever: SMS stays sign-in codes and transactional.

The first loops get a new member to share a project, the activation event (docs/features/activation-onboarding-audit.md).

## How it works

1. **The app tells PostHog what happened, from the server, under the user's id.**
   - `user_signed_up`: new.
   - `project_created`: done, `convex/posthog.ts` `trackEvent`.
   - `nudge_sent`: new.

   These are server events, so the browser id can't be lost to an ad blocker. The browser identifies by the same id (`PostHogIdentify`).
2. **A PostHog workflow decides when.** For example: trigger on `user_signed_up`, wait 1 day, exit if `project_created`, then call the webhook. Each workflow is set up by hand in PostHog; see "PostHog setup" below.
3. **The webhook asks the app to send.** It's a `POST` to `https://<deployment>.convex.site/api/nudges`:
   - header `X-Nudge-Secret: <NUDGE_WEBHOOK_SECRET>`
   - body `{"loop": "share_project_day1", "distinct_id": "{event.distinct_id}"}`
4. **The app decides whether to send, and sends.** Before every send it re-checks, because PostHog can't see the app's data:
   - the loop is on;
   - the person exists and has an email;
   - their email settings allow the category;
   - the loop's condition still holds (share_project: they still have no project);
   - this loop hasn't already reached them;
   - no other nudge reached them in the last 24 hours (Rick 10/4: one message a day is the most);
   - the daily cheers email didn't reach them in the last 24 hours;
   - their address hasn't bounced or complained (the sender would drop it anyway; this keeps the log honest).

   If every check passes, the app sends through the existing email pipeline (Resend, templates, unsubscribe). Either way it logs the result: sent, or skipped with the reason. After a send it reports `nudge_sent` to PostHog.

The app never sends email addresses to PostHog.

## Loops (v1)

"No project of theirs" means no project they posted. The finished piece onboarding used to ask for is stored as a hidden companion project (`origin: "portfolio"`); it doesn't count, and `project_created` never fires for it. "Shared" on the admin page uses the same rule.

| Key | When (PostHog) | Condition (app) | Category |
|---|---|---|---|
| `share_project_day1` | 1 day after `user_signed_up`, exit on `project_created` | no project of theirs | activity |
| `share_project_day4` | 4 days after `user_signed_up`, exit on `project_created` | no project of theirs | activity |

**First cheer** isn't a PostHog loop. It happens in the app: the first cheer a member ever receives (on any of their projects, not counting their own) emails them at once, instead of waiting for the 17:00 digest, and is marked so the digest doesn't send it again (`digestedAt`, set when the notification is made). This is Rick's exception to the one-a-day rule. Every later cheer stays in the daily email. It uses the daily email's wording for one cheer.

Each loop's on/off switch, subject and text live in the database. Admins edit them at `/admin/engagement-loops`, with no deploy. Defaults are seeded in code.

## /admin/engagement-loops (admins only)

- One row per loop with an on/off switch and its subject and text.
- Counts for the last 7 and 30 days:
  - sent;
  - skipped, by reason;
  - shared: a project created within 7 days of the send.
- A setup box with each loop's webhook URL and JSON body. The secret isn't shown.

## PostHog setup (once per loop, in PostHog → Workflows)

1. **Trigger:** event `user_signed_up`. Only the server sends it, under the user id; the signup page's own event is `signup_completed` and carries no email.
2. **Conversion goal:** event `project_created`, with "exit on conversion" on.
3. **Wait:** 1 day (or 4).
4. **Webhook:**
   - method POST;
   - URL `https://courteous-rabbit-750.convex.site/api/nudges`;
   - header `X-Nudge-Secret`;
   - JSON body `{"loop": "share_project_day1", "distinct_id": "{event.distinct_id}"}`.

## Environment

`NUDGE_WEBHOOK_SECRET` is a long random string, set on the dev and prod Convex deployments. The app refuses any webhook call without it.

Until it is set the endpoint answers 503 and sends nothing. The loops start on (the defaults are on), so they send as soon as PostHog calls with the secret; turn one off on `/admin/engagement-loops` first to wire PostHog without sending.
