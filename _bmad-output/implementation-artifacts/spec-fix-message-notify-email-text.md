---
title: 'Message alerts reach people: no email cooldown, text when phone is the only contact'
type: 'bugfix'
created: '2026-10-30'
status: 'done'
route: 'dispatch'
review_loop_iteration: 1
baseline_commit: '21682ae957e1bd04e21769044d11c4691ecff2f0'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Since 88bf36f (2026-10-27) a direct-message email is cancelled (`contact_cooldown`, never retried) when the recipient got any other non-transactional email in the last 24h. People who signed up by phone have no email, so they get nothing outside the app. David Russo reports nobody answers his messages.

**Approach:** Give message emails their own named contact policy that skips the 24h cooldown, keeps every other check, and reserves no cooldown of its own. Build texting for recipients with no email but a verified phone (one text per unread burst, with a link to the conversation), switched off until an operator turns it on. Add an operator tool that re-sends the missed alert for unread, unanswered conversations from named senders (David Russo, Christina Bumann), dry run by default.

## Boundaries & Constraints

**Always:** Message emails still respect the Activity switch, suppressions, blocks and the read/replied/source-changed recheck at dispatch, and never set `cooldownAt`. Texts are off unless the `engagementLoops` row with key `message_texts` is enabled (missing row = off); while off, no text row is written and nothing is sent. Texts go only to a verified phone (`users.phoneVerificationTime`) when the recipient has no email (`getUserEmail` returns null), respect the same Activity switch, follow the same once-per-unread-burst rule as the email, and are rechecked at send time (still no email, not read or replied, not blocked). Every text attempt leaves a row saying sent, skipped or failed, and why. At most 3 message texts per recipient per 24h. The resend tool is an `internalMutation`, sends nothing unless `dryRun: false`, sends at most one alert per conversation, and running it twice sends nothing new.

**Never:** Change `scheduleNotificationEmail` (CRITICAL blast radius: 8 callers, 20 flows). Change `contactEligibility`'s logic. Use `phoneSendLimits` (it caps sign-in codes and would lock people out). Put message text in an SMS, an analytics event or the resend tool's output. Text anyone who has an email on file. Build a second copy of the email-or-text decision for the resend: it uses the same helper `sendMessage` uses.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Email after other email | Recipient got a digest 2h ago; David sends a message | Message email is claimed and sent; its row has no `cooldownAt` | N/A |
| Email after message email | Message email sent 1h ago; a nudge, digest or host announcement is due | It is sent; the message email does not hold it back | N/A |
| Texts switched off | No email, verified phone; `message_texts` off or missing | No text, no text row; outcome `none` / `texts_off` (dry run and resend show it) | N/A |
| Phone-only recipient | Texts on; no email, verified phone, Activity on | One text: "{Sender} sent you a message on {PLATFORM_NAME}: {SITE_URL}/messages/{id}" + "Reply STOP to opt out." | Telnyx error → row `failed` with status code only |
| Second message same burst | Earlier message still unread | No new text, no new email | N/A |
| Read before send | Recipient opens the thread before the action runs | Row `skipped`, reason `read_or_replied` | N/A |
| Has email | Email on file (any state) | No text | N/A |
| Unverified phone / Activity off / blocked | — | No text; row `skipped` with reason | N/A |
| Daily cap | 3 texts already sent to recipient in 24h | Row `skipped`, reason `daily_cap` | N/A |
| Resend dry run | Named senders, `since`; some conversations unread, some read/replied, some already emailed | Returns one row per conversation: recipient name, channel (`email`/`text`/`none` + reason) or skip reason (`read_or_replied`, `already_delivered`); sends and writes nothing | Unknown sender name → error naming it |
| Resend for real | Same, `dryRun: false` | One alert per listed conversation for its first unread message, via the shared helper with dedupe key `message-resend:{messageId}` | Second run → every row `already_queued`, nothing sent |

**Decisions (2026-10-30):**
- Text wording: sender name + link + "Reply STOP to opt out." Never any message content.
- Text only people with no email address on file. A bounced or complained email still counts as email, so no text.
- Spec kept as one piece (~1,700 tokens).
- Human asked to also send the missed alerts for messages from David Russo and Christina Bumann. The tool is built here; running it on production happens after deploy, dry run first, with the list shown to the human.
- After review (texts share the sign-in number, so STOP would lock phone-only people out): ship texting built but switched off; an operator turns it on once there is a separate number for it.
- After review: a message email holds back no other email (nudges, digests, announcements, reminders).

</frozen-after-approval>

## Code Map

- `app/convex/messaging.ts:329` -- `sendMessage` email call: replace with the shared `scheduleMessageAlert` in the same `!earlierUnreadFromSender` branch.
- `app/convex/emailContactPolicy.ts:17` -- `ContactPolicy` union: add `"message"`.
- `app/convex/emailDeliveries.ts:136` and `app/convex/schema.ts:2502` -- policy validators: add `v.literal("message")`. `contactEligibility` (line 122) already skips cooldown for any non-`standard` policy. `claimForDispatch` (line 225) sets `cooldownAt` for every non-transactional row: change it so `"message"` rows get none either. Its only caller is `emails.sendNotificationEmail`.
- `app/convex/engagement/reminderSettings.ts` + `engagement/attention.ts:135` (`setUnreadReminder`) -- the on/off switch pattern: `getLoopRow(ctx, key)`, missing row = off. Texts use key `message_texts`; add an operator-only `internalMutation` `messageAlerts:setMessageTexts { enabled }` in the same shape (`subject`/`body` are required fields: store empty strings).
- `app/convex/email/sender.ts:32` + `emailDeliveries.getCommunitySenderName` -- message emails use the recipient's community name (`defaultSenderFor("activity")` = community). The text uses the same name, falling back to `PLATFORM_NAME`.
- Prior implementation (reverted after review, otherwise sound): `/private/tmp/claude-501/-Users-rickmoy-Library-Application-Support-Claude-scratch-workspaces-c6b38ae1-e96d-467e-8e37-aafffdde09bb-5897a8dd-875e-42cf-921f-a65a6bfdb106-scratch-2026-10-30-2128b3/1ec04b62-5004-45fc-b381-f0fff1cb2643/scratchpad/impl-v1/` (`full.diff`, `messageAlerts.ts`, `messageAlerts.test.ts`). Start from it and apply the changes in Tasks; Implementation Notes below describe it.
- `app/convex/emailHelpers.ts:52` -- `scheduleNotificationEmail` returns `{ status: "skipped", reason: "no_email" }` when there is no address: the trigger for a text.
- `app/convex/smsSender.ts` -- reuse `sendSms(to, message)`; throws on non-2xx, logs when no Telnyx key.
- `app/convex/engagement/conversations.ts:113` -- reuse `conversationReminderEligibility` (send-time recheck with `{ cutoff: now, messageId }`; resend uses it to find each conversation's first unanswered unread message).
- `app/convex/profiles.ts:600` -- `setAdminByName` shows the `profiles.by_name` lookup for operator tools.
- `app/convex/phoneLink.ts:112` -- reuse `PLATFORM_NAME`; `emails.ts:61` -- `SITE_URL` fallback pattern.
- Tests: `app/convex/messagingMeasurement.test.ts` (`sendMessage` harness), `app/convex/emailContactPolicy.test.ts:130` (named-policy cooldown pattern).

## Tasks & Acceptance

**Execution:**
- [x] `app/convex/emailContactPolicy.ts`, `emailDeliveries.ts`, `schema.ts` -- add the `"message"` policy literal; `claimForDispatch` sets no `cooldownAt` for `"message"` rows; update the `ContactPolicy` comment.
- [x] `app/convex/schema.ts` -- add `messageTexts` table: recipientUserId, phone, conversationId, messageId, dedupeKey, status (`queued|sent|skipped|failed`), detail, createdAt, claimedAt, sentAt; indexes `by_recipientUserId_createdAt`, `by_dedupeKey`. List it in `admin/mergeUsers.ts` `USER_ID_FIELDS`.
- [x] `app/convex/messageAlerts.ts` (new) -- `scheduleMessageAlert(ctx, …)` (email with `policy: "message"`, else text on `no_email`), text internals (claim mutation, send action, finish mutation), `setMessageTexts`, and `resendMissedMessageAlerts` internalMutation `{ senderNames, since, dryRun? = true }`. Review fixes:
  - Texts off (switch missing or disabled) → outcome `none` / `texts_off`, no row written, checked before anything else on the text path and again at claim.
  - Sender name in the text: collapse whitespace, trim, cap at 40 characters; if it contains anything URL-like (`://`, `www.`, or a `word.tld` pattern) or is empty, use "Someone".
  - Brand in the text: the recipient's community name, as the message email chooses it; fallback `PLATFORM_NAME`.
  - Resend, live run: run the same preview the dry run uses first; if it says `none`, report that and send nothing for the email side.
  - Resend: skip with `in_flight` when an email for a message in the burst is `queued`, or a text row for it is `queued`.
  - Resend rows include `senderUserId`.
- [x] `app/convex/messaging.ts` -- call `scheduleMessageAlert`.
- [x] Tests (`emailContactPolicy.test.ts`, `messageAlerts.test.ts`, `messagingMeasurement.test.ts`) -- cover every matrix row, plus: the scheduled message email's subject, `ctaUrl` `/messages/{conversationId}` and HTML-escaped sender name; a phone-only text for a message stamped 1ms ahead (`lastMessageAt = now`) is `queued`; resend reports `already_delivered` for a `sent` text and an `accepted` email; `telnyx_<status>` comes from the real `sendSms` error (stubbed `fetch`, `vi.importActual`); texts-off writes no row; the name sanitizer; `in_flight`.

**Acceptance Criteria:**
- Given an existing `contact_cooldown` reservation for a recipient, when a message email is claimed, then it is claimed and not cancelled.
- Given any `sendMessage` call or resend run, when the test inspects SMS, analytics and tool output, then no message content appears.

## Implementation Notes

- `messageTexts` also has `claimedAt` (set when the send action takes the row). It stops a row being claimed twice and lets the daily cap count a text that is in flight, not only `sent` ones.
- `admin/mergeUsers.ts` lists `messageTexts.recipientUserId`, which the schema-coverage test requires; a merge carries the daily cap over.
- `convex/_generated/api.d.ts` gained the `messageAlerts` module by hand, in codegen's format.
- `scheduleMessageAlert(ctx, { recipientId, messageId, senderName, dedupeKey }, { dryRun })` loads the message itself. In a dry run the email side runs `getUserEmail` and then `contactEligibility` (read-only), which is what `scheduleNotificationEmail` and the claim would decide.
- When texting, the text check passes `cutoff: max(now, message.createdAt)` to `conversationReminderEligibility`. `sendMessage` can stamp a message 1ms ahead of `Date.now()`, and "too recent" is a reminder rule, not an alert rule.
- Skip reasons on text rows: `has_email`, `unverified_phone`, `activity_off`, `daily_cap`, plus whatever `conversationReminderEligibility` returns (`read_or_replied`, `blocked`, `source_changed`, ...). A failure is `telnyx_<status>`, or `send_error` for anything that isn't sendSms's own status error.
- Resend: conversations come from the sender's `conversationParticipants` (`by_userId_lastMessageAt` >= since, `lastOutboundAt` >= since). `already_queued` = any `message-resend:` email or text row for that recipient and conversation, and it is checked before `already_delivered`. A resend that wrote a skipped text row also reads `already_queued` on the next run.
- Loop 1 rebuild: the resend's `already_queued` now matches only the exact key `message-resend:{first unread message id}`, so a newer missed burst in the same conversation is still resent. The policy union lives once, as `contactPolicyValidator` in emailContactPolicy.ts.

## Spec Change Log

- **Loop 1 (intent_gap, 2026-10-30).** Trigger: review found "Reply STOP" on the shared sign-in number would lock phone-only people out (B1, plus B2, B3, E7), and the message policy's cooldown reservation would cancel host announcements and reminders (B14). Human decided: texting built but off behind `message_texts`; message emails reserve no cooldown. Amended Approach, Always, matrix, Decisions, Code Map and Tasks; folded in fixes B4, B5, B7, B8, B9 and V1–V4. Code reverted to baseline; the v1 implementation is kept at the Code Map path. Known-bad states avoided: texts sent without a separate number or consent; DM emails silencing host reminders; resend double-alerts; phishing via profile names in SMS. KEEP: one shared `scheduleMessageAlert` for `sendMessage` and the resend; `claimedAt` on text rows; dry run writes nothing; `max(now, createdAt)` cutoff; no message content in SMS, events or tool output.

## Review Triage Log

Pass 1 (2026-10-30). B = blind hunter, E = edge-case hunter, V = verification gap.

| # | Finding | Verdict | Evidence | Route |
|---|---------|---------|----------|-------|
| B1, E6 | "Reply STOP" on the shared `TELNYX_FROM` number also stops sign-in codes; phone-only people are locked out; no local opt-out record | high | `sendSms` serves `auth.ts:451`, `phoneLink.ts:113` and the text from one number; no Telnyx inbound route in `http.ts` | intent_gap (texting) |
| B2 | No disclosure or consent for notification texts; the off switch sits under "Email" | medium | `settings.tsx` EMAIL_TOGGLES; privacy policy has no phone/SMS text | intent_gap (texting) |
| B3 | No way to turn texts off without a deploy | medium | `getLoopRow` pattern exists for email loops; nothing gates `textEligibility` | intent_gap (texting) |
| E7 | Texts go out overnight | medium | Design Notes chose no quiet hours; overnight texts invite STOP (see B1) | intent_gap (texting) |
| B14 | Message emails reserve the 24h cooldown, cancelling host announcements, event reminders and digests | high | `claimForDispatch` sets `cooldownAt` for non-transactional; announcements are `standard` (`announcements.ts:670`) | intent_gap (cooldown) |
| B4 | Texts always say the platform brand; message emails use the recipient's community brand | medium | `defaultSenderFor("activity")` = community (`email/sender.ts:32`) | spec amendment |
| B5, E5 | Sender's profile name goes into the SMS unchecked (URLs, phishing text, length) | high | `messageTextBody` interpolates `displayNameOf` raw; `name: v.string()` has no cap | spec amendment |
| B7, E8, V5 | Live resend reports `email` where the claim will cancel; dry run reports `none` | medium | live path uses `scheduleNotificationEmail` (no suppression/block/read check) | spec amendment |
| B8, E11 | Resend can double-alert a burst whose first alert is still queued | medium | `already_delivered` ignores `queued` rows; dedupe keys differ | spec amendment |
| B9, E9 | A name matching several profiles silently widens the resend | low | `by_name` collect adds every match; rows show only the name | spec amendment (add sender user id to rows) |
| V1 | Message email subject, link and escaping are untested | pre-verified | three mutations survived the suite | spec amendment |
| V2 | `Math.max` cutoff for a 1ms-ahead message is untested | pre-verified | mutation to `cutoff: now` survived | spec amendment |
| V3 | `already_delivered` untested for a `sent` text and an `accepted` email | pre-verified | dropping either clause survived | spec amendment |
| V4 | `telnyx_<status>` parse is tested against a hand-written error | pre-verified | rewording `smsSender.ts:32` survived | spec amendment |
| B6, E1 | Daily cap counted at claim only; `take(100)` includes skipped rows | false / low | resend can create at most one row per sender per recipient (2 senders < cap 3); claim enforces the cap; >100 rows/day unrealistic | rejected |
| B10, E10 | Resend is one unbounded mutation | low | two named senders over four days is far below Convex limits | rejected |
| B11, E2, E3 | Rows can stay `queued` if the action dies; no-key dev marks `sent`; no Telnyx id stored | low | actions rarely die mid-send; prod has the key (phone sign-in works) | rejected; delivery receipts deferred |
| E4 | Email added between queue and claim → nothing sent | low | seconds-wide window | rejected |
| E12 | Account merge between queue and claim → link to dropped conversation | low | seconds-wide window during an operator merge | rejected |
| B5b | Email and text can name the sender differently | low | both read the same profile name; differs only for a blank name | rejected |
| B12 | `attention.ts` ignores texts; org conversion blocks on `messageTexts`; phone kept on skipped rows | low | `emailDeliveries.recipientUserId` already blocks org conversion the same way | rejected |
| B13 | No analytics events for texts | low | ledger rows answer the question | rejected |

Pass 2 (2026-10-30, after loop 1). Texts now ship off by human decision; findings that only matter once texts are switched on are deferred to the "before switching texts on" entry in deferred-work.md.

| # | Finding | Verdict | Evidence | Route |
|---|---------|---------|----------|-------|
| V1' | Daily-cap window and "sent or claimed only" rule not pinned one at a time | pre-verified | dropping the window or counting failed/skipped survived 38 tests | patch |
| V2' | Resend preview never tested against an active cooldown | pre-verified | removing `policy: contact.policy` survived; probe returned `contact_cooldown` | patch |
| E7' | `already_queued` matches any resend row in the conversation, so a newer burst is never resent | medium | `resent` checks `conversationId` + prefix only (`messageAlerts.ts:402`) | patch |
| B14' | Policy union written in three places | low | schema.ts, emailDeliveries.ts:136 and the type; a fourth policy must edit all three, and schema vs type is not type-checked | patch (repo rule: extract the shared helper) |
| B13' | Docs list only transactional and first-cheer as cooldown exceptions | low | `docs/features/nurture-foundation-rollout.md:17` | patch |
| B1', B2', B3' | `setMessageTexts` enforces no separate number; STOP has no opt-out record; consent and Settings copy missing | medium | texts are off; these gate switching them on | defer (texts-on) |
| B4', E12' | `sent` means accepted only; no Telnyx id or delivery webhook; missing key marks `sent` | medium | `sendSms` returns on no key; no inbound route | defer (texts-on) |
| B5', E1' | Stuck `queued` rows have no lease; `take(100)` can hide sent rows | low | carried B11/B6; texts off | defer (texts-on) |
| B7', B8', E4', E5', E6' | Name filter misses fullwidth dots, IPs, phone numbers; graphemes; segment length; brand not checked | medium | texts off | defer (texts-on) |
| B9' | Texts at any hour | medium | carried E7; texts off | defer (texts-on) |
| B11', B12' | Text rows not deleted with accounts; operators can't see texts | low | no rows are written while texts are off | defer (texts-on) |
| E8' | Burst older than the ledger: a delivered pre-ledger email is not seen, so the resend alerts again | low | the conversation is still unread; one more alert is harmless and the dry run lists it | rejected |
| E9' | Burst of over 100 messages | low | unrealistic | rejected |
| E10', B15' | Resend unbounded | low | carried B10 | rejected |
| E11' | Message email claimed while `createdAt` is ahead of the clock → `too_recent` | false | claim runs after commit, past the 1ms stamp; behavior predates this change | rejected |
| E13' | Merge leaves `messageTexts.conversationId` on the dropped conversation | low | no text rows while texts are off | rejected |

## Design Notes

Texts ship switched off. Turning them on (`npx convex run messageAlerts:setMessageTexts '{"enabled":true}' --prod`) waits for a separate Telnyx number or messaging profile for notifications, so a STOP reply cannot block sign-in codes, plus notice in Settings and the privacy policy. Quiet hours are left for that same follow-up. Texts send right away, like the email. Before switching them on, someone must also confirm the Telnyx 10DLC campaign covers notification texts, not only sign-in codes. Otherwise carriers may filter these texts, and possibly the sign-in codes too. Telnyx handles STOP replies on the number. A failed send is recorded and not retried, so nobody gets a duplicate text. A resent alert counts as `already_delivered` when any `emailDeliveries` row for a message in the unread burst is `accepted|sent|delivered|delayed`, or a `messageTexts` row is `sent`.

## Verification

**Commands:**
- `cd app && npx vitest run convex/emailContactPolicy.test.ts convex/messageAlerts.test.ts convex/messagingMeasurement.test.ts convex/messaging.test.ts test-support/driftGuard.test.ts` -- expected: all pass
- `cd app && npx tsc --noEmit` -- expected: no new errors versus baseline
