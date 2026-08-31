# Gated Event Video Link + Recording — PRD

*2026-08-31. Supersedes the LiveKit-first build order in `docs/events-video-hosting-prd.md` for week one. That doc stays valid as the Phase 2 in-app-embed plan; this one is what ships by 2026-09-06.*

> **The honest one-line summary:** this gates *the display of a URL*, not access to a video. It ships in a day instead of a week and carries no SDK risk. Read "Criticism" before agreeing to it — the weaknesses are structural, not fixable by better implementation.

## Why link-out instead of LiveKit

Same call the D8 research already made for Table sessions: link out now, embed later. The organizer runs the session on the tool they already use (their own YouTube Live, Zoom, Meet); The Exchange controls **who is shown the link** and stores the replay link afterward. No SDK, no token minting, no env vars, no new runtime dependency on the critical path of a one-week deadline.

The $50/mo LiveKit account stays sunk either way — building the integration in September rather than this week doesn't unspend it, and the build-risk objection that research raised (`video-provider-research.md:101`) is sharper at one week than it was at seven.

## The story

Danny runs a citywide gathering: an open panel anyone curious can drop into, and a paid critique workshop for people who committed. Today he passes Zoom links around by hand, takes money through a separate tool, and the recording lives in his Drive where nobody finds it. After this: he pastes his stream link into the event, sets a price if it's paid, and confirms payers himself. Attendees see a Join button on the event page. When it's over he pastes the recording link and it stays on the event page for the people who were entitled to it.

## Jobs to be done

- **Public session** — anyone with the event link joins. Zero friction for a stranger checking the community out.
- **Paid session** — the organizer controls who gets in, without The Exchange becoming a payment processor.
- **After the event** — the recording lives on the event page, visible to the same people who could have attended.
- **Organizer** — one place to manage who's confirmed, without a spreadsheet.

## Verified codebase facts (checked 2026-08-31 — build against these, not memory)

- `events` (`convex/schema.ts:131-168`) has **no** video, price, or access field. `status` is `"draft" | "published" | "cancelled" | "completed"`.
- **Nothing in the codebase ever writes `status: "completed"`.** `create` writes `"published"` (`events.ts:183`), `cancel` writes `"cancelled"` (`events.ts:254`). There is no completion cron and no transition. See Criticism #4.
- **Three queries spread the raw event doc**: `list` (`events.ts:53`), `get` (`events.ts:120`), `search` (`events.ts:466`) all `return { ...event }`. `list` and `search` are unauthenticated public browse surfaces. **Any field added to the `events` table is published to the world by default.** See Criticism #1 — this is the highest-severity item in this doc.
- `rsvpToEvent` (`convex/garden/eventRsvps.ts:96`) is **unauthenticated**. Any name + email creates an RSVP row. `eventRsvps.userId` is optional; guests are real and supported.
- `eventRsvps` (`schema.ts:907`) is `{ eventId, userId?, name, email, invitedBy?, createdAt }` — **no status field of any kind**.
- Events with `requiresApproval` route attendance through `eventApplications` (`status: "accepted"`), *not* `eventRsvps`. Both paths are live. `announcements.ts:132`'s `resolveAudience` already unions them — the video eligibility check must too, or every approved applicant is locked out.
- Ownership idiom to follow: `getAuthUserId` + `ConvexError({ code, reason })` (the newer pattern, used by `announcements.ts` and `garden/*`), not `events.ts`'s older `auth.getUserId` + `throw new Error`.
- `visibleMeetingUrl(meetingUrl, isMember)` already exists at `convex/garden/tables.ts:72` — the exact "strip the URL for ineligible viewers" helper. Reuse it; do not write a fourth copy.
- Email rails shipped this session: `scheduleNotificationEmail` (`convex/emailHelpers.ts:38`), `internal.emails.sendNotificationEmail`. The email template interpolates unescaped — **escape any user-authored string before it goes in** (the hole the announcements audit caught).

## Data model

```typescript
// events additions
accessType: v.optional(v.string()),      // "public" | "paid" — absent = public (back-compatible)
priceCents: v.optional(v.number()),      // paid only, display + email copy
paymentLinkUrl: v.optional(v.string()),  // off-platform, mirrors offerings.externalPaymentLinkUrl
meetingUrl: v.optional(v.string()),      // the live join link — NEVER returned to ineligible callers
recordingUrl: v.optional(v.string()),    // the replay link — same gating as meetingUrl
recordingPostedAt: v.optional(v.number()),

// eventRsvps addition
paymentStatus: v.optional(v.string()),   // "pending" | "confirmed" — absent on free events
```

No new tables. No file storage — we store other people's URLs, not video bytes (Criticism #5).

## Gating rule — one function, three callers

```typescript
// convex/eventAccess.ts
export type EventVideoRole = "organizer" | "entitled" | "none";

export async function resolveVideoRole(ctx, event, userId): Promise<EventVideoRole>
// organizer  → event.organizerId === userId
// entitled   → public event: any signed-in user, or any RSVP/accepted-application row
//              paid event:   an eventRsvps row with paymentStatus === "confirmed",
//                            OR an accepted eventApplications row (approval path)
// none       → everyone else
```

Applied at exactly three call sites, and the field is **deleted from the payload** for `"none"`:

1. `events.get` — strip `meetingUrl`/`recordingUrl`/`paymentLinkUrl` unless role ≠ `"none"`.
2. `events.list` — strip unconditionally. A browse listing never needs a join link.
3. `events.search` — strip unconditionally. Same reason.

Write these as an explicit allowlist (`const { meetingUrl, recordingUrl, ...safe } = event`), not a denylist, so the next field added to `events` fails closed instead of leaking.

## Mutations

```typescript
setEventVideo(eventId, meetingUrl?, accessType?, priceCents?, paymentLinkUrl?)  // organizer only
confirmRsvpPayment(rsvpId, confirmed: boolean)                                  // organizer only
postEventRecording(eventId, recordingUrl)                                       // organizer only
```

`confirmRsvpPayment` is **load-bearing and cannot be cut**: without it `paymentStatus` never reaches `"confirmed"` and no paid event ever unlocks for anyone. It needs a roster UI (the organizer's attendee list with a confirm toggle per row) — `events.getAttendees` (`events.ts:392`) already exists as the starting point.

On confirm, and on `postEventRecording`, send the entitled person the link by email via the existing rails. This is how a **guest** (no account, no session) ever receives a link at all — see Criticism #7.

## UI

- **Event page, organizer**: a video section — paste join link, choose Public/Paid, set price + payment link, and after the event, paste the recording link. Plus the roster with confirm toggles.
- **Event page, entitled**: a Join button while the event is near/live; the recording link after it's posted.
- **Event page, paid + unconfirmed**: the price, the payment link, and plain copy — "Once your payment is confirmed, the join link appears here." No silent empty state.
- **Event page, nobody**: no trace that a video exists beyond what the organizer wrote in the description.

## Explicit scope cuts

1. **No in-app video.** That's `docs/events-video-hosting-prd.md`, Phase 2, unblocked once this proves demand.
2. **No file upload / hosted recording.** We store a URL.
3. **No refunds, no charge verification, no ticketing.** Blocked on `wonderwall-sxi`.
4. **No completion automation.** The organizer posts the recording when they have it.
5. **No expiring or per-viewer links.** Structurally impossible with link-out — see Criticism #2.

---

## Criticism

Written against this doc deliberately. Items 1–3 are build blockers; 4–8 are accepted limitations that must not be discovered later as surprises.

**1. The `...event` spread is a live leak waiting to happen — highest severity.** Three query sites (`events.ts:53`, `:120`, `:466`) return the raw document, two of them unauthenticated public browse surfaces. Adding `meetingUrl` to the table without touching those three sites publishes every paid event's join link on the public events listing. The mitigation (explicit destructure, allowlist not denylist) is in the spec above, but note what this really says: **the schema is not the security boundary here — three hand-maintained query sites are.** Any future query that spreads an event re-opens this. A stronger design would keep the URLs in a separate `eventVideo` table that no existing query touches, so leaking requires writing new code rather than forgetting to strip. I did not spec that, because it adds a join to every read path for a one-week build — but it is the more defensible shape and should be revisited if this survives past V1.

**2. An unlisted link is not access control — this is the deepest flaw and it is unfixable within this approach.** Once one paying attendee forwards the URL, gating is over: no revocation, no expiry, no per-viewer identity, no way to even detect it happened. We gate the *display* of a string. LiveKit's per-user tokens with short TTLs are materially stronger, and that difference is the actual thing being traded away for a week of schedule. For a free/cheap community event this is a fine trade. **For a genuinely paid event with real money and real scarcity, it is weak**, and the spec should not be read as claiming otherwise. If the first paid event has meaningful revenue attached, that changes the calculus and Phase 2 should be pulled forward.

**3. RSVP is unauthenticated, so RSVP existence is worthless as a credential.** `rsvpToEvent` takes any name + email with no auth. Two consequences the spec must hold: paid gating can *never* key off "an RSVP row exists" (only off organizer-set `paymentStatus`), and for public events, gating on RSVP is security theater — it is an email-capture ask, not a gate, and calling it gating in the UI would be dishonest. The spec's public rule ("any signed-in user or any RSVP row") is therefore effectively "anyone who asks." That's the correct behavior for public, but name it plainly rather than implying a check happened.

**4. "After the event completes" has no completion signal to hang on.** Nothing in the codebase ever writes `status: "completed"` — the value exists in the schema and is never produced. So the recording flow is really "organizer pastes a link whenever they get around to it," which means: many events will simply never get a recording posted, and there is no system state that distinguishes "no recording yet" from "no recording ever." Options were (a) add a cron that flips events to completed after `datetime`, or (b) drop the pretense. The spec takes (b) for scope reasons. That's defensible, but "save recording after the event completes" as a requirement is not actually being met — what's being met is "organizer can post a recording link at any time." If a real completion state is wanted, that's a separate small cron and it should be its own bead, not assumed.

**5. We don't own the recording, and the archive is a pile of other people's URLs.** The bytes live in the organizer's YouTube or Zoom account. Practical consequences: Zoom deletes cloud recordings on plan limits and the link 404s with no notice to us; an organizer who leaves takes the archive with them; the recording's gating is exactly as weak as the live link's (item 2). The vision docs talk about a canonical event archive — this does not build one, and nothing in this design gets closer to one. That's an honest V1 cut, but it's a cut, not a step toward the goal.

**6. Honor-system confirmation puts the whole support burden on the organizer.** Money moves off-platform, so The Exchange has no record a payment happened. Someone pays and doesn't get confirmed → they're locked out and complain to the organizer, who has to reconcile against a Stripe/Venmo/PayPal dashboard we can't see. Someone gets confirmed by mistake → free access, no audit trail. This matches the posture already accepted for `projectSupport.status` and `offeringSignups.status`, so it's consistent — but those cases don't lock anyone out of a live event happening at a fixed time. **The failure mode here is time-sensitive in a way the existing honor-system cases are not**: a confirmation that arrives an hour late means someone missed the event entirely. At minimum the confirm action must email the link immediately, and the organizer needs the roster visible *before* the event, not just during.

**7. Guests are a real design fork the spec resolves weakly.** `eventRsvps.userId` is optional and the guest path is deliberate, existing behavior. A guest with no account has no session, so on returning to the event page we cannot recognize them and cannot show them a gated link. The spec's answer is "email them the link on confirm," which works — and immediately means the gate is "whoever holds that email," fully forwardable, looping back to item 2. The alternative (require an account for paid events) contradicts an existing, intentional product decision. Neither option is clean. The email path is the right pick, but it should be understood as *delivering* the link, not gating it.

**8. Minor, but real: this adds a fourth copy of a pattern that already exists three times.** `gardenTables.meetingUrl` + `visibleMeetingUrl`, `offerings.externalPaymentLinkUrl`, `projects.supportPaymentLinkUrl`, and now `events.meetingUrl` + `events.paymentLinkUrl`. Four tables, four optional-URL-plus-gating implementations, four places to get the stripping wrong. The spec reuses `visibleMeetingUrl` to blunt this, but the honest read is that "gated external link" has become a recurring shape in this codebase and deserves one abstraction rather than a fifth instance next quarter.

**What I would change if the deadline moved:** items 1 (separate table) and 2 (real tokens) are both schedule casualties, not judgment calls. Both are worth revisiting the moment there's a week to spend.
