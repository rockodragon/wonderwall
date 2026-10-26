# Messaging, interaction measurement and nurturing foundation

Date: 2026-10-26. Source baseline: `3d9664f47db2c9b6f0b11db1993da30f3b883dd9` on main. Assessment: `wonderwall-tz37`; implementation epic: `wonderwall-udsw`.

## Verdict

**Enough raw application state for useful analysis and a small operator pilot; not yet a trustworthy foundation for broad reply-aware automated nurturing.** Convex records more meaningful interactions than PostHog currently receives. The missing layer is a reliable chain from person -> interaction -> eligibility -> contact -> delivery -> intended action, with clear definitions and shared contact controls.

Keep the existing architecture: **Convex owns state, eligibility and scheduling; PostHog measures funnels, cohorts and experiments.** The engagement-loop spec already makes this decision and prohibits marketing SMS. Extend the existing notification/email pipeline rather than introducing a parallel campaign sender or moving clocks into PostHog.

Three delegated source reviews covered analytics, messaging and delivery. No live PostHog project, production counts, credentials, webhook registration or provider logs were inspected. Therefore this report establishes code coverage and defects, not actual reply rates, email success rates or campaign effectiveness. The public PostHog capture key cannot establish historical ingestion. Production verification is a required work item, not a claimed result.

## What exists today

| Capability | Evidence | What it supports / limit |
|---|---|---|
| Message and conversation history | `app/convex/schema.ts:729-745`; `messaging.ts:235-245` | Participants, sender, created/last-message time and message readAt support retrospective first-response/response-time calculations. No stored waiting-on participant, first-reply summary or replyTo relationship. |
| Immediate message email | `messaging.ts:219-276` | One email for the first unread message in a burst, not every message. This is not a delayed still-unread/unanswered journey; a chronically unread burst can prevent later emails. |
| Signup nurture | `engagement/loops.ts:40-66`; `schedule.ts:13`; `nudges.ts:129` | Day 1/day 4 no-project reminders, execution-time condition checks, per-loop enable/text editing, skip reasons and admin counts. Only one activation goal is encoded: posting a project. |
| Preferences and deliverability | `emailPreferences.ts:1-4,45-51`; `emailHelpers.ts:65-88`; `http.ts:205-241`; `resendWebhook.ts:84-143` | Category opt-outs, unsubscribe/one-click headers, signature verification, delivery status and hard-bounce/complaint suppression. Missing preferences default on; this is not a consent-provenance history. Live setup is unverified. |
| Other useful reminders | `crons.ts`; `supportDigest.ts:41-53,157-160`; `engagement/firstCheer.ts` | Support/likes digests, announcement reminders and immediate first-cheer exception exist. Reuse them before adding new reminders. |
| Interaction records | `schema.ts:468-474,525-534,1718-1756`; `analytics.ts:6-38`; `garden/tables.ts:887-928` | Invites, follows/saves, RSVP/payment context, profile views/likes and host-recorded Table attendance. RSVP is not attendance; a current follow row is not historical follow churn. |
| Update action tracking | `updates.ts:444-497` | Idempotent per-person opened/clicked/archived timestamps are an existing pattern to reuse. Archive itself also implies opened; it is not proof of reading every word. |
| Operator visibility | `admin.engagement-loops.tsx`; `garden/activity.ts`; `routes/admin.activity.tsx` | Loop on/off/content/counts and recent joins/content. No integrated “needs attention” queue, audience preview, journey history or reply/outcome dashboard found. |
| PostHog baseline | `app/app/lib/posthog.ts:21-35`; `components/PostHogIdentify.tsx:20-28`; `convex/posthog.ts:26-55` | Live-host browser pageviews/autocapture plus selected product events and scheduled server capture. Coverage and delivery guarantees are incomplete. |

## Findings to fix before increasing automation

1. **Identity ownership is inconsistent.** The shared identifier is Convex userId, but `routes/login.tsx:97` identifies by email and `:142` by phone, including a phone property. `_app.tsx:246-256` independently identifies by userId. `hooks/useAnalytics.ts:6-14,32-40` uses a separate local analytics_id for `give.tsx`, without observed identify/reset consumers. This can fragment person histories and exposes more personal data than the canonical policy intends. Consolidate on `PostHogIdentify`, audit prior merge/history effects carefully, and do not blindly alias email/phone identities into accounts.

2. **Messaging/reply outcomes are not explicit analytics events.** Actual server `trackEvent` callers found emit `user_signed_up`, `project_created` and `nudge_sent`. No authoritative send/read/first-reply/follow/redemption/RSVP events were found. `useStartConversation.ts:47-50` conditionally emits `conversation_started` when optional properties are supplied, even for an existing conversation. An empty/reopened conversation is not a sent message or relationship.

3. **Read signals cannot safely drive nurturing as attention evidence.** Opening the conversation or Messages index marks all notifications read (`messages.$conversationId.tsx:48-53`; `messages._index.tsx:61-66`), including unrelated items. `markConversationRead` marks every unread thread message, including those outside the displayed page. The UI watches message count with a 100-message limit (`:39-63`), so new messages need not retrigger it once the returned count stays 100. No visibility/focus gate is checked. Define separate thread-open/read-boundary, notification-view and CTA-click semantics; none proves comprehension or intent to reply.

4. **Nudge “sent” means scheduled, not delivered.** `nudges.ts:155-161` logs sent and emits nudge_sent after scheduling email. Later dispatch can suppress, fail or use the console provider (`emails.ts:54-57,114-128`; `email/index.ts:14-27`), without reconciling the nudge result. That false sent record also blocks another same-loop attempt. Record queued/accepted/delivered/failure separately and preserve a deduplicated retry/reconciliation path. Provider acceptance still does not mean inbox placement or human attention.

5. **Delivery cannot be reliably joined to the journey.** `emailDeliveries.recordSend` persists provider ID, address, subject and category but no recipient userId, loop/run/notification/entity ID (`emailDeliveries.ts:45-64`). RecipientUserId already reaches the email action for branding, so extend that shared path rather than add another lookup/sender. The webhook ignores opens/clicks/unrecognized statuses (`resendWebhook.ts:72-92`); no inbound email-to-app reply routing was found. Decide explicitly whether replies must happen in-app or whether inbound email threading is a future requirement.

6. **The contact cap and eligibility checks are partial.** Nudge spacing checks nudgeLog plus digestedAt in the 50 newest notifications, not all outbound contact (`nudges.ts:108-119`). Digest does not reciprocally check last nudge. Preferences are checked before queueing; dispatch rechecks suppression but not current preferences, account deletion/block state or whether the desired action already happened. The admin label “No other email from us in the last day” overstates the implementation. Create one dispatch policy with named transactional/first-cheer exceptions, atomic reservations and cancellation, not blanket suppression of essential account mail.

7. **Growth and conversion numbers need definitions.** `invites.redeemBySlug:318-334` inserts/increments on every call; mutual following is idempotent but the invite counter/notification are not pair-deduplicated. Favorite removal deletes history. QR/follow browser events lack stable target/inviter/community correlation. `countShared` credits each send with any project in the following seven days, so one project can credit day-1 and day-4 sends (`engagement/rules.ts:142-150`). That is association, not causal lift. Define distinct attribution and mature windows, then introduce a stable holdout if volume permits.

8. **Two reliability gaps deserve separate fixes.** Server PostHog capture silently returns without a key, logs errors without durable retry, and stamps delivery time rather than occurrence time (`posthog.ts:39-55`). Public telemetry actions accept caller-supplied identities/events: treat those as untrusted, not authorization or authoritative nurture eligibility. Separately, notification retention reschedules whenever the first 500 survivors fill the batch, even if no deletion occurs (`notificationRetention.ts:70-84`). It can repeatedly scan the same rows indefinitely; add progress/cursor bounds before scaling scheduled work.

The event catalog `app/.posthog-events.json` is stale relative to call sites (for example, listed event_joined/search events were not found in current capture paths). Do not treat a documented event name or test stub as evidence it is emitted or received.

## Minimum foundation

| Layer | Smallest useful contract | DRY owner |
|---|---|---|
| Identity and events | One authenticated user ID; typed event catalog, schemaVersion, eventId, occurredAt, actor/entity/community IDs, platform/source; optional journeyRunId/intentId | Existing browser identity/capture and `convex/posthog.ts`; client UI intent separate from server-confirmed success |
| Conversation state | Per-participant last inbound/outbound/read boundary, first recipient response, waiting-on participant/since; indexed bounded lookup | Existing messaging writes; derive legacy history in a bounded backfill, not repeated whole-table scans |
| Contact/delivery record | Stable user and journey/run/step IDs, target notification/entity, scheduled/queued/accepted/delivered/failed/suppressed/cancelled, provider ID, attempts, timestamps and dedupe key | Extend `scheduleNotificationEmail`, `emails`, `emailDeliveries`, `insertNotification`; one contact ledger, not one per campaign |
| Eligibility and preferences | Current account/contactability, category choice/source/time, suppression, current block/visibility rules, goal still missing, common cooldown with explicit exceptions | Shared dispatch rule; same rule powers audience preview, operator queue and automated execution |
| Attribution and measurement | Journey -> delivery -> validated click -> intended server action; deterministic attribution window, target action/version and optional experiment arm | Convex records outcomes/eligibility; PostHog reports funnels/cohorts/experiments |
| Operations | Queue age, failures/retries, unknown/out-of-order provider events, environment/project match, kill switch, audit trail, preview and contact history | Existing admin pages/helpers and signed webhooks; no raw private-DM access added to admin analytics |

Keep private message bodies, phone numbers, email text and token-bearing URLs out of event properties. Store only necessary IDs/counts/times. Audit transitive autocapture and error payloads too. A new native client should use the same event contract and userId, with a platform property, rather than inventing a second analytics schema. Keep analytical history independently of expiring notifications (read+30 days/unread+90 days).

No new general-purpose CRM or customer-data platform is necessary for this foundation. Existing app data should remain authoritative. PostHog Workflows are a later option if nontechnical editing or substantially more loops justify revisiting the recorded decision; running the same journey in both systems would create duplicate contact risk.

## Metrics and first actionable journeys

| Question / metric | Definition to implement | First useful action |
|---|---|---|
| Do introductions become conversations? | Share of distinct conversations with a first sent message whose other participant sends a first response within 24/72 hours; only mature cohorts in denominator; exclude self/system/blocked cases | Operator pilot for still-unread inbound messages; then one opt-in/category-allowed reminder cancelled on read/reply. Do not pressure a person who chose not to reply. |
| Do new members connect? | First user-initiated non-self follow, automatic invite follow and first two-way conversation within seven days are separate outcomes, also separate from posting a project | Invite accepted but no subsequent intentional action/conversation: show a relevant next step using current privacy rules. Automatic mutual follows must not masquerade as intentional connection; historical rows lack explicit follow-origin metadata. |
| Does QR sharing work? | Code/link opened -> unique visit through the QR/follow link -> authenticated identity -> distinct invite acceptance/follow -> optional first message/reply, by target/community and source | Repair signup/link friction before sending more invitations; no-app web fallback remains useful. A copied `ref=f2f` link is not proof of a camera scan; distinguish tagged-link visits from explicitly observed scanner events. |
| Do reminders help events? | Eligible RSVP -> reminder accepted/delivered -> event detail/join action -> host-recorded attendance where available | Reuse current event reminder machinery; preserve cancellation, capacity and timing rules. Do not substitute RSVP for attendance. |
| Do nurtures improve outcomes? | Per journey: eligible, skipped reasons, queued, accepted, delivered, clicked, target action, opt-out/complaint; compare randomized holdout when viable | Keep current project nudges, repair truthful reporting, then trial one new journey. Opens are auxiliary, not the primary success metric. |
| Who needs staff attention? | Bounded queue with reason, age, last contact, current eligibility, owner and next allowed action | Staff can review or snooze candidates before enabling automatic sends. Metadata-only aggregates do not grant staff access to private conversations. |

Thresholds above are proposed starting definitions, not claims about current behavior or an approved sending cadence. A browser click, notification read, server-delivered email and human reply are different steps. Email replies are currently outside the app measurement model unless separate inbox instrumentation is added.

## Work order and validation

1. **Trust fixes:** canonical identity; correct read/badge semantics; retention progress; truthful queue/send status. Each function change requires GitNexus impact analysis before editing and affected-flow checks after.
2. **Shared foundation:** bounded conversation summaries, typed authoritative events, contact/delivery correlation, dispatch-time policy and replay-safe webhook/event handling. Coordinate messaging pagination with the already-filed native-readiness work rather than duplicate it.
3. **Operator pilot:** build one metadata-based needs-attention queue and audience preview. Choose one journey, retain per-loop disable, record cancellation and outcomes, and review contact volume before enabling it.
4. **Live verification:** confirm browser/server target the same PostHog project and correct environment; authenticated identity across devices and logout; delivery/provider configuration; signed webhook replay/order behavior; one controlled eligible/excluded journey through actual action. This must use authorized test recipients, not send real member campaigns as a verification shortcut.
5. **Measure before expanding:** reply latency/response rate, new-member connection, QR activation and contact harm metrics. Add experiments only with sufficient traffic; a before/after conversion count alone is not uplift.

Repository validation: **90 tests passed across six existing files** (`notificationRetention`, `resendWebhook`, `supportDigest`, and engagement rules/loops/firstCheer), run directly through installed Vitest. These tests cover current rules, not all newly identified edge cases; retention tests only exercise expiry arithmetic, not the self-rescheduling handler. No runtime source changed and no messages were sent.

## References

- [Current engagement-loop decision](engagement-loops.md): app-owned orchestration, PostHog measurement, no marketing SMS.
- [PostHog identity documentation](https://posthog.com/docs/getting-started/identify-users): join browser/server activity with a stable ID and reset at logout.
- [Resend webhook event definitions](https://resend.com/docs/webhooks/event-types): API acceptance, recipient-server delivery, failure, suppression, clicks and inbound receipt are distinct signals.

Implementation order under `wonderwall-udsw`:

| Task | Priority | Deliverable |
|---|---|---|
| `.1` | P1 | Canonical identity, one capture path and accurate event catalog |
| `.2` | P1 | Message-read boundaries and independent notification attention |
| `.3` | P1 | Retention traversal terminates/makes bounded progress |
| `.4` | P1 | Truthful correlated queue/send/delivery states and replay handling |
| `.5` | P2 | Shared dispatch-time eligibility and contact policy; follows `.4` |
| `.6` | P2 | Bounded conversation summaries and authoritative reply/outcome events; follows `.2` |
| `.7` | P2 | Replay-safe social/QR/invite/RSVP attribution |
| `.8` | P2 | Controlled live verification and aggregate baseline; follows `.1`, `.4`, `.6`, `.7` |
| `.9` | P2 | Operator action queue, audience preview and trustworthy reporting; follows `.5`, `.6`, `.7`, `.8` |

The source audit is complete; runtime fixes and production verification remain open. No campaign launch or production sending is included in this assessment.
