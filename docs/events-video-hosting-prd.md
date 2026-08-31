# Events Video Hosting — Revised Plan (LiveKit consolidation)

*Written 2026-08-30, revised after codebase verification. Supersedes the provider choice in wonderwall-8o1.11 and the deferral in wonderwall-99kd. Driven by a new fact: LiveKit Cloud is now a provisioned, paid account ($50/mo Ship tier) — not a future decision, a sunk cost sitting idle. Priority: HIGH. Deadline: 2026-09-06.*

> **Read the "Verified state" and "What one week actually buys" sections before writing code.** Several claims in the first draft of this doc were wrong and have been corrected in place. If you are building from this file, the corrected versions are the ones below.

## The story

Danny wants to run a citywide creative gathering live — some of it open (a public panel anyone curious about the community can drop into), one part gated (a paid critique workshop for people who committed). Today he'd need Zoom links passed around by hand, a separate payment tool, and no record on the platform of who actually showed up. Instead: he sets a price on the paid session (or leaves it open), shares one link either way, and people land in a video room inside The Exchange itself — no Zoom account, no separate checkout. For the paid session, he confirms who's in by hand (same honor-system pattern as everything else in V1); for the public one, anyone with the link is in immediately.

## Job to be done (brief)

- **Public session** — anyone with the link joins instantly. No friction for someone just checking the community out.
- **Paid session** — the organizer controls who gets in without the platform becoming a payments processor.
- **Organizer** — mute/remove control over their own room, so one disruptive guest doesn't derail it.
- **Paid RSVP** — a real "you're confirmed" state, not an RSVP that may or may not actually grant access.

## Next steps

1. Get the LiveKit API key/secret from the dashboard, set as Convex env vars — the one external dependency; everything else below is buildable without it.
2. Build Events-only this week: `accessType`/`priceCents`/`paymentLinkUrl` on `events`, `paymentStatus` on `eventRsvps`, JWT token minting, room join UI. Offerings is cut to week two (see `wonderwall-8o1.11`).
3. Ship `confirmRsvpPayment` + an organizer roster view — without it, a paid event has no path to ever unlock for anyone.
4. Get a real headcount estimate for the first public event before the build locks in — decides whether the `maxParticipants: 50` room cap is enough or whether the YouTube Live fallback needs to be in scope from day one, not discovered on the day of the event.
5. Deploy and run one real test event through the full flow (public join + paid confirm-and-join) before 2026-09-06.

## What changed and why this supersedes the prior evaluation

The prior evaluation split video across two providers: Daily.co for Offerings/classes, and "defer, start with YouTube Live" for community broadcast/AMA (cost-driven — a per-participant-minute WebRTC provider is a 200x cost trap for a passive audience).

Both calls were made on *marginal* cost: which provider is cheapest to add. That comparison is weaker now that LiveKit Cloud is already paid for. Adding Daily.co as a second provider buys two SDKs, two token paths, two join UIs, and two things to debug, for a saving that is now much smaller than it looked.

**Revised call: one provider, LiveKit, for in-app interactive video** — Offerings/classes, Events, and (later) Table sessions.

**What the revised call does *not* do is overturn wonderwall-99kd's large-passive-audience reasoning.** That bead's argument was about *delivery shape*, not vendor: piping hundreds of watch-only viewers into a WebRTC room is the wrong mechanism at any price. That is still true on LiveKit. See "The egress call" below — it is a decision here, not an open question.

### Honest read of the research this plan cites

`docs/phase-1b/video-provider-research.md` is cited below for cost. Two things about that citation:

1. **Its own bottom line was "No" to LiveKit as the single bet** (line 101), and the stated reason was *not* cost — it was build risk: *"Using LiveKit for October means building and deploying a join page in week one of a seven-week runway, which is precisely the risk October is trying to avoid."* The sunk-cost fact neutralizes the cost half of that research. It does not touch the build-risk half, and this plan proposes that same from-scratch build on a **one-week** runway rather than seven. The build-risk objection is not resolved by the new information; it is sharper. Scope accordingly.
2. **The "$50/mo already covers Year-1 including HLS" claim is oversold.** See below.

### What the $50/mo Ship tier actually covers

From the research (lines 35, 39, 41) and LiveKit's tier structure:

| Ship tier ($50/mo) | Included | Overage |
|---|---|---|
| WebRTC participant-minutes | 150,000 | $0.0005/min |
| Transfer | 250 GB | $0.12/GB |
| Recording/transcode minutes | 600 | $0.02/min |

The research's Year-1 scenario **[b]** — the one that produced the "~$50–55/mo" figure — assumed a *specific, capacity-planned* shape: 30 Table sessions/week × 75 min × 12 people = **116,910 participant-min/month**, plus 2 monthly livestreams. That is **78% of the included 150,000 minutes consumed by Table sessions alone**, leaving roughly **33,000 minutes/month of headroom** for everything else.

What that headroom actually buys once Tables land on this account: about **eleven** 60-minute events with 50 attendees each, or **one** 60-minute event with 550 attendees. That is not "comfortably covers Year-1 scale."

Two further corrections to the flat-price story:

- **Egress recordings/HLS segments write to your own S3/GCS bucket** (research line 39, line 93: *"you own that bill and its egress costs"*). LiveKit's $50 covers *producing* a stream. Delivering it to viewers is an AWS/Cloudflare bandwidth bill that is not in the $50 and scales with viewer count. A 200-viewer, 60-minute HLS event is roughly 150–200 GB of your-bucket egress.
- **Tables are not on this account yet.** Short term that is in this plan's favor: Events and Offerings currently have the whole 150,000 to themselves. The risk is structural, not immediate — a *public* Events feature has an open-ended organizer count and unplanned audience sizes, which is the opposite of the capacity-planned shape scenario [b] priced.

**Action, not just a caveat:** set a hard `maxParticipants` cap when creating each room (see Permissions). That converts an unbounded billing surface into a bounded one, and it is a two-line change. Do not ship without it.

## Scope: what "public ones, as well as paid ones" means for Events

`events` (`convex/schema.ts:131-168` — verified) has no price or access field today; everything is free and open. Two access tiers:

- **Public**: anyone with the event link can join the room. No gating.
- **Paid**: joining requires an organizer-confirmed paid RSVP.

**This does not mean building payment processing.** wonderwall-sxi (entity structure) is unresolved and per-event ticketing stays out of scope. "Paid" here means: the organizer sets a price and an off-platform payment link, an RSVP carries `paymentStatus`, an **organizer marks it confirmed by hand**, and the room token is only minted for confirmed RSVPs (or the organizer). Same posture as `offerings.externalPaymentLinkUrl` and `projectSupport.status`.

*Precision on the Stripe constraint:* Stripe **is** real in this codebase — `convex/garden/stripe.ts`, `convex/garden/stripeHandlers.ts`, `hostOrgs.stripeCustomerId`, `coverageSubscriptions`. It exists solely for the Host-org coverage-subscription lane. Do not reuse it here and do not extend it; per-event ticketing is a different money shape and is blocked on wonderwall-sxi.

## Verified state of the codebase (checked 2026-08-30 — trust this over the first draft)

- **LiveKit is not wired in.** No `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` in Convex env. *(The first draft claimed `npx convex env list` shows "only `RESEND_API_KEY`" — that is wrong. There are ~13 vars, including `AUTH_GOOGLE_*`, `CLOUDFLARE_*`, `GOOGLE_PLACES_API_KEY`, `JWT_PRIVATE_KEY`, `OPENAI_API_KEY`, `POSTHOG_API_KEY`, `RADAR_API_KEY`, `RESEND_API_KEY`, `SCRAPER_SERVICE_API_KEY`, `SITE_URL`. The only true part is that no `LIVEKIT_*` vars exist.)*
- No `livekit-server-sdk`, no `@livekit/components-react`, no `livekit-client` in `package.json`. This is a from-scratch integration, not config wiring.
- `eventRsvps` (`schema.ts:907`) is `{ eventId, userId?, name, email, invitedBy?, createdAt }`. **There is no `status` field, and `userId` is optional.**
- `rsvpToEvent` lives in **`convex/garden/eventRsvps.ts:96`**, not `convex/events.ts`. It is **unauthenticated** — name + email is enough, upserted on `by_eventId_email`.
- `offeringSignups` (`schema.ts:848`) is `{ offeringId, userId, name, status, createdAt }` with `status: "pledged" | "confirmed"`.
- Ownership checks are **two divergent inline patterns, not a shared helper**: `convex/events.ts` uses `auth.getUserId(ctx)` + `if (event.organizerId !== userId) throw new Error("Not authorized")` (lines 225, 251, 295, 333, 377); `convex/offerings.ts` and `convex/garden/*` use `getAuthUserId(ctx)` from `@convex-dev/auth/server` + `ConvexError({ code, reason })`, and offerings additionally allows an admin bypass (`offering.userId !== userId && !profile?.isAdmin`, lines 177/207/267/350). New code should follow the `getAuthUserId` + `ConvexError` idiom — it is the newer one and what `announcements.ts` uses.
- `"use node"` precedent exists (`convex/emails.ts:1`, `convex/garden/stripe.ts:1`) and `convex/garden/stripe.ts:4` documents the rule: a `"use node"` file is **actions-only — no query, mutation, or httpAction may live in it.**

## Three problems in the first draft that would have shipped broken

### 1. `canPublish: false` does not mean what the first draft said

The first draft claimed `canPublish: false` is "about host-level controls, not silencing attendees — LiveKit still allows mic/cam per room config." **That is false.** In a LiveKit `VideoGrant`, `canPublish: false` prevents that participant from publishing any track. There is no room setting that overrides a token grant. Shipping that would have given every public-event attendee a mic and camera that silently do nothing.

Correct model:

| Role | `canPublish` | `canSubscribe` | `canPublishData` | `roomAdmin` |
|---|---|---|---|---|
| Organizer / owner | `true` | `true` | `true` | `true` |
| Attendee (public or confirmed-paid) | `true` | `true` | `true` | `false` |
| Watch-only (future, if ever) | `false` | `true` | `true` | `false` |

`roomAdmin: true` is what actually grants the host mute/remove powers. `canPublish: true` alone does not. Never grant `roomCreate` to an attendee token.

### 2. `offeringSignups.status` cannot be used for paid gating

The first draft said: *"Offerings already has its own pledged/confirmed status — reuse it directly for the same gating purpose, no new field needed there."* That is wrong on the semantics. From `convex/offerings.ts:318`:

```ts
const status = isFree || offering.externalPaymentLinkUrl ? "confirmed" : "pledged";
```

Status is decided **at insert time, before any money moves**, and **nothing in the codebase ever patches it afterward** (verified — no mutation writes `offeringSignups.status` after creation). So:

- Paid offering **with** an external payment link → every signup is instantly `"confirmed"`. Gating on `"confirmed"` is equivalent to no gating at all, for exactly the paid case this feature exists to serve.
- Paid offering **without** a link → every signup is `"pledged"` forever, with no path to `"confirmed"`. Gating on `"confirmed"` locks those people out permanently with no organizer UI to fix it.

`offeringSignups.status` answers "how did this signup originate," not "did this person pay." It is not a payment gate and must not be used as one. (`announcements.ts` gets this right — it deliberately treats `pledged` and `confirmed` identically.) Offerings needs its own organizer-confirmed field, which is one of the reasons Offerings is cut from week one below.

### 3. Approval-required events have a second attendance path the plan ignored

`events.requiresApproval` routes attendance through `eventApplications` (`status: "accepted"`), not `eventRsvps`. `announcements.ts:resolveAudience` correctly unions both. The first draft's eligibility rule only read `eventRsvps`, so **on an approval-required event, every accepted applicant would be denied video access.** Eligibility must union both paths, exactly as `resolveAudience` does.

## Security: honor-system text is not honor-system video

The gating posture ("organizer marks it paid") is fine and consistent with the rest of V1. The *credential* is not comparable to the text cases, and this deserves its own controls: a leaked event description is a static string; a leaked room token is a live A/V feed, and on a metered account it is also a billing surface.

Two facts about the current RSVP flow make this concrete:

- `rsvpToEvent` is unauthenticated. **Anyone can create an RSVP row for any event with any email.** RSVP existence is not a credential. This is fine for public events (they are public) but means the paid path must never derive eligibility from RSVP existence alone — only from `paymentStatus === "confirmed"`, written by an organizer-only mutation that checks `event.organizerId`.
- Guest RSVPs have **no `userId`**. The first draft's `identity` argument has nothing to bind to for a guest.

Required token discipline:

- **One token per person per request, never a shared per-event token.** Mint on demand from an authenticated call; never store a token on the event document and never return one from a list query.
- **`identity` must be unique and stable per person**: `user:{userId}` for account holders, `rsvp:{rsvpId}` for guests. This is the highest-leverage control available, because **LiveKit enforces one live connection per identity per room** — a token passed around a group chat lets in exactly one person at a time, and each new use kicks the previous one. Getting identity right does most of the anti-sharing work for free.
- **Short TTL.** The SDK default is ~6 hours; set **10 minutes** explicitly. TTL governs the *join window only* — it does not disconnect an already-joined participant, so a short TTL costs joined users nothing and makes a copied token near-worthless. Re-mint on rejoin.
- **`maxParticipants` on room creation.** Caps both a leak and the bill. Default 50 for week one; the organizer UI does not need to expose it yet.
- **No `roomCreate` or `roomAdmin` on attendee tokens.** Grants are explicit, never defaulted.

Per-RSVP short-TTL tokens plus identity uniqueness plus a participant cap is enough for this threat model. Room-locking and waiting rooms are not needed for week one.

## Data model

```typescript
// events table additions (convex/schema.ts:131-168)
accessType: v.optional(v.string()),       // "public" | "paid" — absent = public (backward compatible)
priceCents: v.optional(v.number()),       // paid only
paymentLinkUrl: v.optional(v.string()),   // off-platform, mirrors offerings.externalPaymentLinkUrl
videoEnabled: v.optional(v.boolean()),    // organizer opt-in; absent = no video panel
roomName: v.optional(v.string()),         // LiveKit room identifier, set on first video-enabled save

// eventRsvps additions (convex/schema.ts:907)
paymentStatus: v.optional(v.string()),    // "pending" | "confirmed" — absent on free/public events
paymentConfirmedAt: v.optional(v.number()),
paymentConfirmedBy: v.optional(v.id("users")),
```

`videoEnabled` was missing from the first draft. Without it, `accessType: "public"` on every legacy event is indistinguishable from "this event has a video room," and every past event sprouts a join panel.

**Effect on the just-shipped announcements feature:** `resolveAudience` (`convex/announcements.ts:169`) reads every `eventRsvps` row for a target and includes all of them. Adding an optional field does **not** break it — Convex optional fields are read-compatible and the resolver does no exhaustive validation. There is one *semantic* change worth naming: after this ships, a paid event's announcement audience includes `paymentStatus: "pending"` RSVPs, so people who have not paid will receive its broadcasts. That is almost certainly what you want (it is the natural channel for "here is your payment link"), but it is a behavior change, and it is deliberate rather than accidental. Do not add a payment filter to `resolveAudience`.

## Module layout — corrected for the Convex runtime

The first draft proposed a single `convex/video.ts` holding both the token minter and the eligibility query. **That is not legal in this codebase** if the minter needs Node: `convex/garden/stripe.ts:4` documents the rule that a `"use node"` file is actions-only. Split it:

```
convex/videoToken.ts   // "use node" if using the SDK — actions only, the ONLY place a signing key is touched
convex/video.ts        // plain runtime — queries/mutations: eligibility, room naming, organizer confirm
```

**Strongly consider skipping `livekit-server-sdk` entirely.** A LiveKit access token is just an HS256 JWT: `{ iss: apiKey, sub: identity, nbf, exp, name, video: { room, roomJoin, canPublish, canSubscribe, canPublishData, roomAdmin } }`, signed with the API secret. Signing that with WebCrypto `HMAC-SHA256` is about 25 lines, runs in Convex's default runtime with no `"use node"` split, and removes an untested dependency from the critical path of a one-week build. You still need the client SDK (`@livekit/components-react` + `livekit-client`) for the UI — that is browser-side and unaffected.

**Spike this on day one, before anything else.** Whether `livekit-server-sdk` runs in Convex's default runtime is the single highest-variance unknown in the schedule, and the hand-rolled JWT is the de-risked fallback that does not depend on the answer.

## The DRY claim — where it holds and where it does not

Shareable, genuinely:

- **The token minter.** One function, one place the secret is read. `mintRoomToken(roomName, identity, name, grants, ttlSeconds)`. This is real DRY.
- **The React component.** `<VideoRoomPanel roomName role onRequestToken />` where `role` is `"host" | "participant"`. The component stays dumb — it does not fetch eligibility, it renders what it is told.

Not shareable, and forcing it will cost more than it saves:

- **The eligibility resolvers.** Events and Offerings are genuinely different shapes: `eventRsvps.userId` is optional (guests) while `offeringSignups.userId` is required; Events has a second attendance path (`eventApplications`) that Offerings does not; the ownership field is `organizerId` on events and `userId` on offerings; offerings has an admin bypass and events does not; and the two "confirmed" concepts mean different things (see problem 2 above).

The first draft's `eligible` boolean is the wrong seam — it collapses `host` vs `participant`, which is exactly the distinction that drives `canPublish`/`roomAdmin`. Use a **role**, and resolve it with one switch that mirrors the idiom `announcements.ts` already established:

```typescript
// convex/video.ts
type VideoRole = "host" | "participant" | "blocked";
export async function resolveVideoAccess(
  ctx, targetType: "event" | "offering", targetId: string, userId?: Id<"users">, rsvpId?: Id<"eventRsvps">
): Promise<{ role: VideoRole; identity?: string; reason?: string }>
```

One function, one `switch`, per-surface bodies inside it. That is the same structure as `resolveAudience` and it is the right amount of sharing: one call site, one contract, honest about the fact that the three lookups differ. Do not try to make the *lookups* identical.

## The egress call — a decision, not an open question

The first draft deferred egress and flagged an open question to Rick about audience size. Cutting egress is right; leaving the question open is not, because it leaves the week-one build with no answer for the case it cannot handle.

**Call: cut LiveKit egress. Ship the WebRTC room with `maxParticipants: 50`. If the first public event needs to be bigger than that, the answer for 2026-09-06 is a YouTube Live link on the event page, not a rushed egress build.**

Reasoning: you cannot build a WebRTC room *and* an egress pipeline (start/stop jobs, bucket wiring, a hosted player page, storage lifecycle) in one week from a standing start. So the real question is what the fallback is, and wonderwall-99kd already answered it — a plain YouTube Live link, zero build, zero marginal cost. Pasting a URL into the event description is a one-line change and it covers the large-passive-audience case completely for a first event. Rebuilding that capability on LiveKit egress under deadline pressure would be worse on every axis: cost (your own CDN bill), time, and risk.

So: **still ask Rick the headcount question**, but ask it to pick between two things that both already work, not to decide whether to expand scope. Over ~50 expected attendees → YouTube Live link. Under → the LiveKit room.

## One-week scope — what actually ships

**One week from a standing start does not fit the first draft's scope.** No LiveKit SDK, no env vars, a new access-tier concept across schema + organizer UI + RSVP flow, a new organizer payment-confirm surface, a second surface (Offerings) with its own broken gating story, *and* a shared abstraction over two surfaces you have only built one of. That is roughly two weeks of work.

Cut to this, in order:

**Ships by 2026-09-06 — Events only:**

1. **Day 1 spike:** LiveKit keys into Convex env; prove a token mints and a browser joins a room. Decide SDK vs. hand-rolled JWT here and do not revisit.
2. Schema: the `events` and `eventRsvps` additions above. `ensureRoomName` on save (`existing ?? \`event-${id}\``), `maxParticipants: 50` on room creation.
3. `resolveVideoAccess` for `targetType: "event"` — unioning `eventRsvps` **and** accepted `eventApplications`, returning a role.
4. Organizer composer UI: `videoEnabled`, `accessType`, `priceCents`, `paymentLinkUrl`.
5. **`confirmRsvpPayment` mutation + organizer roster UI to call it.** Organizer-only (`event.organizerId` check). **This is a shipping blocker, not a nice-to-have** — the first draft never specified it, and without it `paymentStatus` never reaches `"confirmed"` and *nobody can ever join a paid event*.
6. `<VideoRoomPanel>` on `app/routes/event.tsx`, plus the pre-check query so the page can show "Join" vs "Pay to join" vs nothing without minting a token.

**Cut, in the order I would cut them if the week slips:**

1. **Offerings video — cut first.** This is the biggest single saving (~2 days) and the one with a known blocker: `offeringSignups.status` cannot gate payment (problem 2), so Offerings needs its own confirmed-payment field *and* its own organizer confirm UI — a second copy of item 5 above, on a surface with a different ownership check and an admin bypass. Do it in week two, and let the Events implementation tell you what the shared seam actually is. Building the abstraction across two surfaces when only one exists is how this week gets lost.
2. **The organizer price/link composer UI (item 4).** If tight, set `accessType`/`priceCents`/`paymentLinkUrl` for the first event via a one-off operator mutation. The gating logic is the load-bearing part; the form is not.
3. **The "shared module" framing itself.** Build the minter and the component with clean seams and Events-only call sites. Generalize when Offerings lands. The DRY win is preserved by *where the seams are*, not by having two callers on day one.

**Explicitly out of scope, named so it does not silently become a gap:**

- HLS/broadcast egress (see "The egress call" — the fallback is a YouTube Live link).
- Recording / VOD archive.
- Refunds and cancellation for a paid event (organizer handles by hand, same as `projectSupport.status`).
- Table-session migration onto this module. Note `gardenTables.meetingUrl`'s schema comment still reads `(D8: Daily.co)` — stale after this decision, worth a one-line fix whenever Tables are next touched.
- Any per-event Stripe/ticketing (blocked on wonderwall-sxi).

## Open question for Rick

**Expected headcount for the first public video event.** Over ~50 → use a YouTube Live link on the event page for that one. Under → the LiveKit room ships as specced. This changes what we tell the first organizer; it does not change what gets built this week.
