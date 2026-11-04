---
title: 'Message texts setup: own number, opt-in, STOP, delivery'
type: 'feature'
created: '2026-11-04'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '455d301268910ebfcc433cf22f78db86ab449212'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Message texts (`convex/messageAlerts.ts`, off via `engagementLoops` key `message_texts`) would send from the sign-in number, to anyone with a phone and no email, with no recorded consent, no STOP handling and no delivery record. Telnyx toll-free verification of the new "updates" number needs a public opt-in screen and a privacy-policy line.

**Approach:** Text only people who switched texts on. Send only from the updates number. Record STOP/START and delivery from a signed Telnyx webhook. Add the texting section to the privacy policy. Texts stay off.

**Decisions (Rick, 2026-11-04):**
- Only accounts with a verified phone and **no email** can switch texts on. The 10/29 "only when there's no other way" rule stands.
- Ask in two places. One is Settings → Phone number. The other is one Canvas card, phone Today and desktop, for accounts that can switch texts on and haven't decided: "Get a text when someone messages you?" with Turn on / Not now, plus the consent line. Either button closes it for good.
- Keep this as one build.

## Boundaries & Constraints

**Always:**
- Message texts send from `TELNYX_UPDATES_FROM` only. When it is unset, skip with `no_updates_number`. Never fall back to `TELNYX_FROM`. Sign-in and phone-link codes are unchanged.
- A text needs all of these: an active consent, a consent phone equal to the account's current verified phone, and no active STOP on that phone. Every existing check stays.
- Verify webhook signatures (Ed25519 over `{telnyx-timestamp}|{raw body}`, key `TELNYX_PUBLIC_KEY`). Reject timestamps older than 5 minutes. A bad signature gets 401. A missing key gets 500 "not configured" (like `/resend/webhook`).
- STOP applies to the phone, not the account.
- Consent wording is saved with the consent.

**Never:** turn texts on (`message_texts` stays off); text anyone to ask for consent; send marketing texts; quiet hours, GSM-7 trimming, sender-name hardening, lease, cap counting or operator views (they stay in deferred-work); HELP auto-reply.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Opted in | consent on, same verified phone, no STOP, no email | text queued, sent from updates number, `telnyxId` stored | send error → `failed` + code |
| No consent | phone, no email, switch never on | no text | skipped `no_text_consent` |
| Phone changed | consent phone ≠ current phone | no text | skipped `no_text_consent` |
| STOP | webhook `message.received`, text "stop" (trim, any case) from a phone | opt-out recorded; later texts skipped `opted_out`; Settings shows STOP note | duplicate STOP harmless |
| START | `message.received` "start"/"unstop" | opt-out cleared | none on record → no-op |
| Delivery | `message.finalized` with `payload.id` = stored `telnyxId` | row gets `deliveryStatus` (`to[0].status`) and error code if any | unknown id → 200, nothing written |
| Bad signature | wrong/missing signature or stale timestamp | 401, nothing written | logged |
| Updates number unset | `TELNYX_UPDATES_FROM` missing | no send | skipped `no_updates_number` |
| Has email | account has an email | no switch, no card | `setMyTexts` refuses with a reason |
| Card | can switch, no decision yet | card shows. Turn on → consent, card gone. Not now → `dismissedAt`, card gone | none |

</frozen-after-approval>

## Code Map

- `app/convex/messageAlerts.ts` -- `textEligibility` (add consent + STOP checks), `claimMessageText`/`finishMessageText`/`sendMessageText` (updates number, store `telnyxId`), `messageTextBody` (already ends "Reply STOP to opt out.").
- `app/convex/smsSender.ts` -- `sendSms(to, message)`. Add an optional `from` and return Telnyx's `data.id`. Callers `auth.ts:452` and `phoneLink.ts:113` stay as they are (GitNexus impact LOW: 2 direct).
- `app/convex/schema.ts` -- `messageTexts` (~2603): add `telnyxId`, `deliveryStatus`, `deliveryDetail`, index `by_telnyxId`. New `textConsents`, one row per user (userId, phone?, agreedAt?, wording?, revokedAt?, dismissedAt?; `by_userId`) and `smsOptOuts` (phone, optedOutAt, optedInAt; `by_phone`).
- `app/convex/http.ts` -- copy the `/resend/webhook` route shape and add `POST /telnyx/webhook`.
- `app/convex/admin/mergeUsers.ts` -- add `textConsents.userId` to `USER_ID_FIELDS` (`mergeUsers.test.ts` enforces this).
- `app/convex/phoneLink.ts` -- `getMyPhone`, `maskPhone`, `currentUserId`. Reuse these for the Settings query.
- `app/app/routes/settings.tsx` -- `PhoneSection` (~1052). Put the switch under the number using `SwitchRow` (`app/components/SwitchRow.tsx`) and `errorMessage` (`app/lib/convexError.ts`).
- `app/app/components/ShareProjectCard.tsx` + `cardTone.ts` -- the pattern for the new card (tone `desk` or `page`, `CARD_TONE`, `FOCUS_RING_CLASS`). Placement: `app/app/desk/Desk.tsx` ~254 `underGreeting` chain (share project → texts card → invite nudge), and `app/app/routes/today.tsx` ~155, after `InviteNudge`.
- `app/app/routes/legal.privacy.tsx` -- `SECTIONS`: phone in Account information, a "Text messages" section, and Telnyx in Service providers. `app/app/legal/entity.ts:55` `privacyEffective` → "November 4, 2026".
- `app/convex/messageAlerts.test.ts` -- existing text tests; extend them.

## Tasks & Acceptance

**Execution:**
- [x] `app/convex/schema.ts` -- add the tables and fields above.
- [x] `app/convex/smsSender.ts` -- optional `from`, return `{ id?: string }` from the response JSON. The dev log fallback is unchanged.
- [x] `app/convex/textConsent.ts` (new) -- query `getMyTextSettings` returns `{ available, on, optedOut, decided, updatesNumber }`, where available means a verified phone and no email. Mutation `setMyTexts({ on })` requires available (ConvexError with a reason otherwise), writes the consent with `TEXT_CONSENT_WORDING`, or stamps `revokedAt`. `dismissTextsAsk()` stamps `dismissedAt`. Export the pure `isStopWord` / `isStartWord` and `activeConsentFor(ctx, userId, phone)`.
- [x] `app/convex/messageAlerts.ts` -- eligibility uses `activeConsentFor` and `smsOptOuts`. Send passes `from: process.env.TELNYX_UPDATES_FROM`, skips when it is missing, and stores `telnyxId`.
- [x] `app/convex/telnyxSignature.ts` (new, `"use node"`) -- `internalAction verifyTelnyxSignature({ body, signature, timestamp })` using `node:crypto` with the raw 32-byte key as JWK OKP/Ed25519. Export the pure verify function for tests.
- [x] `app/convex/telnyxWebhook.ts` (new) -- `internalMutation applyTelnyxEvent({ eventType, payload })` handles the STOP/START and delivery rows. Ignore other event types.
- [x] `app/convex/http.ts` -- `/telnyx/webhook`: read the raw body, verify through the action, parse, apply, return 200.
- [x] `app/convex/admin/mergeUsers.ts` -- add the `USER_ID_FIELDS` entry.
- [x] `app/app/routes/settings.tsx` -- switch "Text me when someone messages me". Under it, the dim line: `Up to 3 texts a day. Message and data rates may apply. Reply STOP to stop, HELP for help.` followed by a Privacy Policy link. When opted out, show `You replied STOP. Text START to {updatesNumber} to turn texts back on.` Hide the switch when not available.
- [x] `app/app/components/TextsAskCard.tsx` (new) + `Desk.tsx` + `today.tsx` -- the card. It reads `getMyTextSettings`, shows nothing while that loads or when not `available && !decided`, and uses the same consent line as Settings.
- [x] `app/app/routes/legal.privacy.tsx` + `app/app/legal/entity.ts` -- the policy text in Design Notes, and the date.
- [x] Tests -- one per matrix row: `messageAlerts.test.ts`, new `textConsent.test.ts`, `telnyxWebhook.test.ts`, `telnyxSignature.test.ts` (keypair generated in the test), a Settings render test, and a privacy render test that the required sentence is present.

**Acceptance Criteria:**
- Given texts are off, when anything in this change runs, then no text is sent.
- Given the privacy page, when anyone loads it, then it contains "No mobile information will be sold or shared with third parties for promotional or marketing purposes."

## Design Notes

Privacy section "Text messages": "If you sign in with a phone number, we text you one-time sign-in codes. If you turn on texts in Settings, we text you when someone messages you, up to three a day. Message and data rates may apply. Reply STOP to stop texts or HELP for help, or turn them off in Settings. No mobile information will be sold or shared with third parties for promotional or marketing purposes." Service providers: "Telnyx — sending text messages: sign-in codes and the message alerts you turn on."

`TEXT_CONSENT_WORDING` = the switch label plus the line under it, stored verbatim. Settings and the card share one constant for that line (export it from `app/convex/textConsent.ts` or a pure module both sides import, like `convex/phone.ts`).

## Verification

**Commands:**
- `cd app && npx vitest run` -- expected: all pass
- `cd app && npx tsc --noEmit -p .` -- expected: no errors

## Implementation Notes

## Spec Change Log

- 2026-11-04, Rick: "Add it" (email-first ask). 39 accounts have only a phone and there was nowhere to add an email. The card now asks "How should we reach you when someone messages you?": an email box with Email me first, then "Text me instead" (the text opt-in, consent line under it), then Not now. Settings → Email shows an add-email box in place of the switches when the account has no address (emailPreferences.get returns hasEmail; missing means show the switches, for an older backend). Saving reuses profiles.fillMissingBasics, now on the shared isValidEmail and a { code, reason } error. The card's saved wording is question + "Text me instead" + consent line. The Canvas clearance grew to 236px. The toll-free card picture was re-shot.

## Review Triage Log

Pass 1, 2026-11-04. VG = verification gap, BH = blind hunter, EC = edge case hunter.

| # | Finding | Verdict | Evidence | Route |
|---|---|---|---|---|
| VG1 | The success path of the real `sendSms` (body `from`, returned id) is untested | medium | Every test mocks `sendSms`; the only real-fetch test is a 422 | patch |
| VG2 | Webhook envelope unwrapping and the 401 path are untested | medium | `applyTelnyxEvent` tests pass a payload already unwrapped; no route test exists | patch |
| VG3 | Which mutation each card button calls is untested | medium | `useMutation` is one shared no-op in the card test | patch |
| VG4 | The Settings switch "on" state is untested | low | All three cases use `on: false` | patch |
| VG5 | Card placement on Desk and Today is untested | low | Neither harness answers `getMyTextSettings` | patch |
| BH8/EC8/VG-o | `textConsents` is missing from `DEDUPE_KEYS` and from accountToOrganization `HANDLED_USER_FIELDS` | medium | `mergeUsers.ts:334` lists `emailPreferences.userId: []` but not textConsents; accountToOrganization.ts:31 set lacks it, so conversion is blocked | patch |
| BH6/EC15/VG-o | Today stacks the texts card with the share card and the invite nudge | medium | `today.tsx` renders it unconditionally; Desk shows one card | patch |
| BH1/EC11 | After a STOP, the switch still shows on and the card still offers Turn on | medium | `on` comes from the consent row alone; `useTextsAskShown` ignores `optedOut` | patch |
| BH2/EC12 | The saved wording isn't what the card showed | medium | The card's headline differs from `TEXT_CONSENT_LABEL`, which `setMyTexts` always saves | patch |
| BH3/EC7 | A finalized 40300 (Telnyx "Blocked (STOP)") doesn't record an opt-out | medium | Telnyx error docs list 40300 as STOP in effect; the handler only stores the code | patch |
| BH4/EC1 | STOP words miss revoke/opt out and punctuation | medium | The FCC revocation rule (effective 2025-04-11) names stop, quit, end, revoke, opt out, cancel, unsubscribe; matching is exact | patch |
| BH5/EC2 | "HELP for help" has no responder | medium (unverified) | The frozen Never excludes a HELP auto-reply; whether Telnyx's toll-free network answers HELP is unconfirmed | defer |
| BH7 | Two copies of "verified phone, no email" | medium | `textConsent.textPhoneOf` and `messageAlerts.textEligibility` can drift (CLAUDE.md reuse rule) | patch |
| BH9/EC10 | The card collects consent while texts are off | false | The frozen decisions say texts stay off and the card asks anyone who can switch on and hasn't decided; collecting consent before launch is intended | reject |
| BH9b | No opt-in confirmation text (CTIA) | medium (unverified) | Texts are off, so it applies at launch | defer |
| BH10 | The `setMessageTexts` comment says 10DLC, and it can be enabled with no updates number or key | low | Comment at messageAlerts.ts:68-74; no guard | patch |
| BH11 | "3 a day" isn't tied to `MESSAGE_TEXT_DAILY_CAP` | low | Hard-coded in the line and the policy | patch (test) |
| BH12 | The privacy text names only Settings and omits consent/STOP records | medium | The card also opts in; the records are new | patch |
| BH13 | The STOP note shows raw E.164 | low | `displayPhone` exists in convex/phone.ts:57 | patch |
| EC3 | STOP/START to another number on the same webhook | maybe-false | Only the updates profile gets the webhook URL; if true, low | reject |
| EC4 | Retried or reordered STOP/START events | low | Needs STOP and START seconds apart plus a retry; the fix adds event-time guards | reject |
| EC5 | A START and a STOP in the same ms leaves the phone opted in | low | `optedInAt < optedOutAt` strictness; direct correction (`<=`) | patch |
| EC6 | `message.finalized` can arrive before `telnyxId` is stored | low | `finishMessageText` runs ms after the POST returns; the fix needs buffering | reject |
| EC9 | Can't turn texts off once unavailable; consent can revive on re-adding the same number | low | `setMyTexts` checks availability before off; direct correction | patch |
| EC13 | The texts card is taller than Desk's 72px under-greeting clearance | medium | `BELOW_GREETING_CLEAR = { w: 600, h: 72 }` (Desk.tsx:85); the card is three rows | patch |
| EC14 | The Desk card flashes while `hasProject` is loading | low | The chain shows texts when `hasProject` is undefined | patch |
| EC16 | A dry run reports a text when the updates number is unset | low | The check lives only in `claimMessageText` | patch |
- 11/4 email-first review (one reviewer): kept the clear-on-typing, role="alert", and submit-button test points. Dismissed the "typed email takes over the owner's sign-in" point: Google and emailed-code sign-in only link to an account that signs in by password with that email (auth.ts / authLinking.ts), so the owner gets a new account. Dismissed the deploy-order wording point: the card has never shipped, and front and back ship from the same merge. Left as is: an email already on another account is still saved, the same as at signup.
