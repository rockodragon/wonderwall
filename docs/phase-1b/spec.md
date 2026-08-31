# Phase 1B — October Build Spec

v0.9 · 2026-08-12 · owner: Rick · status: product sections final; integration sections pending architect/dev gap reports (same directory)

The seven things the showcase requires, and nothing else. Decisions below are final (Rick, 2026-08-12); changing one is a scope conversation, not a drive-by.

> **Showcase date/venue update (Rick, 2026-08-31): the showcase is November 6, 2026 at Lightchurch, Encinitas** — five extra build weeks vs. the October assumption baked into this spec. "October" below reads as the original build-deadline shorthand; the ship-by date is now early November.

---

## 0 · Decisions this spec is built on

| # | Decision | Final call |
|---|---|---|
| D1 | Backing payout model | **Keep-what-you-raise.** Money moves to the creative immediately, 90/10 split, no escrow, no all-or-nothing. |
| D2 | Church seat purchase | **One subscription on the church's card** (quantity = seats, e.g. $100/mo = 10 seats), one redemption code. |
| D3 | Money vocabulary — two lanes | **"Donate"** only on the AP lane (real 501(c)(3), tax receipt from AP, AP allocates). **"Back / fund"** on the direct lane (90/10, immediate, no receipt). The words never cross lanes. |
| D4 | Name | **"The Garden" is frozen through October.** Rename conversation happens after the showcase (with Haley). |
| D5 | October scope | The seven items in §1. Cut: self-serve table creation, host payouts, owned video infra. |

Tax note (both lanes): recipients owe income tax on funds received; payers issue 1099s above IRS thresholds. AP's accountant confirms their grant paperwork. Product copy never implies deductibility on the direct lane.

Additions (Rick, 2026-08-12 evening):

| # | Decision | Final call |
|---|---|---|
| D6 | Payments provider | **Stripe, confirmed.** MoR alternatives (Paddle/Lemon Squeezy) can't do Phase 3 marketplace payouts; Stripe covers subscriptions + quantity codes + backings + future Connect on one integration. |
| D7 | Auth | **SMS-first (Twilio Verify via @convex-dev/auth custom OTP), email OTP + social as fallback.** Verify uses Twilio's own senders — no A2P 10DLC registration delay. Lands in W2. Closes wonderwall-cwb + wonderwall-a27. |
| D8 | Session video | **RESOLVED (research 2026-08-13, see video-provider-research.md): Daily.co room links for October** (~$22/mo at launch scale, REST-minted per session, hosted join page, zero build) → **LiveKit Cloud for the Phase 3 in-app embed** (flat ~$50/mo covers even Year-1 scale incl. HLS livestream; no hosted join page, so wrong for link-only October). Rick's LiveKit bet is right for Phase 3 — LiveKit beats per-seat products past ~3–4 concurrent hosts. W4 stores a per-session `meetingUrl`; the Daily-vs-LiveKit swap later is a URL-source change, not a schema change. |
| — | Confirmed | CF Pages Function public-page pattern (no SSR); manual payouts for October. |

---

## 1 · The October seven

Each item: what ships, what it must do (acceptance), and what it explicitly does not do.

### 1. Membership signup with real payment
- Stripe subscriptions: **$10 seat / $25 five seats / $50 host**. Free account requires no card ever.
- Checkout follows the demo join flow (demo.join.tsx is the binding UX reference): doors → basics → tier → checkout → **confirmation that is an invitation** (first table, not a receipt).
- The two-cell dues split ($5 another creative's project / $5 the garden) renders at tier choice and checkout.
- Membership state drives **server-side entitlements** (§2).
- Accepts: a new user pays $10 and immediately can start a passion project, apply to paid work, and join a member table; cancel/lapse drops them to free cleanly (existing work is never deleted — caps enforce on *starting new*, not retroactively).
- Not in October: annual billing, plan proration niceties, self-serve refunds (operator handles).

### 2. Church coverage codes
- Church buys one subscription (D2), gets one code + QR + printable/slide asset (demo patron-flow P4 is the reference).
- A creative lands on `…/c/CODE`, signs up (or logs in), redeems → **covered seat identical to a paid seat** (hard rule, tested).
- Sponsor sees: seats issued / redeemed-by-name / idle, plus the idle-seats nudge. Sponsor credit line appears on covered creatives' story updates.
- Accepts: 10-seat code; 6 redemptions; the 7th through 10th still work; the 11th politely fails; church cancels → covered seats lapse at period end with operator-mediated grace.
- Not in October: self-serve church purchase (sold "contact us", operator creates the subscription + code).

### 3. Backing projects with real money
- Patron role ($0 to hold) can back a passion project: $10–$500 in v1, card on file after first back.
- **Keep-what-you-raise (D1):** funds transfer on each backing, 90/10. Backer names appear on the project (names, never counts). Goal bar reflects raised-so-far.
- Copy says **back/fund** — never donate (D3).
- Accepts: Diane backs Shua $25 → Shua's balance/payout reflects $22.50, project page shows Diane by name, story update credits her.
- Payout rail decision (Connect Express vs operator-mediated transfers at 2-customer scale) lands with the architect report — the UX above is fixed either way.
- Not in October: pledges to *paid* projects (those are hire conversations), recurring backings, backer refunds beyond operator goodwill.

### 4. AP Fund page + public allocations ledger
- `/fund/abiding-practice`: what the fund is, **Donate button → links OUT to AP's own giving platform** (we process nothing on this lane), and the **public allocations ledger**: date · amount · artist · project, e.g. "Aug 2026 · $500/mo · Shua · *Psalms for the 2AM*".
- Every allocation is also credited on the project page ("Funded by the Abiding Practice Fund").
- Allocations are entered by operators (admin surface); AP decides them off-platform.
- Accepts: a church treasurer can see exactly where fund money went without an account. This page is the trust engine of the church pitch.
- Not in October: processing donations, automated AP integration, multiple funds (schema allows more later).

### 5. Tables — join, sessions, meeting links
- Browse tables (format tags + filters per the demo app shell), join: open tables free to anyone with an account; member tables gated by server-side `can('table.join.member')` with the standard denial-and-path.
- Each table has sessions (date/time), session RSVP, a **meeting link (Zoom/Meet)** revealed to roster members, and a calendar invite (.ics).
- Tables are **hand-created by operators** for AP + TAS (concierge; admin surface). Cohort pricing ($40/$120) collected via simple Stripe checkout attached to the cohort.
- Accepts: an AP creative joins the Pathfinding Fall Cohort, pays $120, gets the session schedule, clicks into the Thursday Zoom from the table page.
- Not in October: self-serve table creation, host payouts, spawn links, owned video (recordings = unlisted YouTube links on the table page).

### 6. Real event RSVPs
- `/events/first-table` (and event pages generally) replace mailto with a real RSVP: name + email, no account required; account holders one-click.
- Host-side list with counts + names; "bring someone" passes a personal invite link.
- Accepts: 40 RSVPs collected for the September event with zero manual email handling.

### 7. Public story pages
- Every project gets `…/story/{slug}`: photo hero, updates timeline, backer + sponsor credit lines, share-ready OG tags (demo story-page mock is the reference).
- Publicly readable without an account and **crawlable** (the prerender/Convex pattern comes from the architect report).
- Accepts: a story link unfurls correctly in iMessage/Slack and renders content without JS for crawlers.

---

## 2 · Entitlements go server-side (non-negotiable)

- `can(user, capability, context)` moves into Convex: **every gated mutation calls it server-side**; the client copy remains for instant UX only.
- The **86-assertion matrix table** (app/app/garden/capabilities.test.ts) runs against the server implementation in CI. The demo table and the server must never disagree.
- Membership state (from Stripe webhooks) + roles + active-passion-project count are the inputs; denials return `{reason, limit, used, upgradePath}` verbatim to power the standard denial UI.

## 3 · Money map (published)

- Dues: 40% host org · 50% creative project pool · 10% platform — while The Garden is the default host org the 40% accrues to the platform, published plainly (plan §2.2).
- Backing: 90% creative · 10% platform. Immediate (D1).
- AP lane: 100% to AP minus their processor; we touch nothing, we display allocations (D3).
- October has **no host payouts** — cohort collections accrue to ledger, paid out when Phase 3 rails exist (visible in operator ledger from day one).

## 4 · Out of scope (October)

Self-serve tables · host payouts (Stripe Connect) · owned video/Stream · media-first auto-drafting · Buzz backend · offers directory backend (static demo stands) · SMS auth · legacy-jobs rename beyond vocabulary pass (wonderwall-77w).

## 5 · Integration architecture (synthesis — details in `architect-gap-analysis.md` + `dev-gap-inventory.md`)

**Decisions taken from the gap analyses (2026-08-12):**

- **Payouts: manual transfers for October.** Stripe Connect Express is 1–2 weeks of KYC friction that two customers don't justify. The platform is merchant of record until Phase 3 (1099/bookkeeping exposure flagged to AP's accountant before W3); Connect adopted in Phase 3. This collapses the dev inventory's largest risk (backing was graded L on the Connect assumption).
- **Public story/event pages: keep `ssr:false`.** A small CF Pages Function serves story/event routes via `ConvexHttpClient` (plain fetch — sidesteps the known Convex-WebSocket-vs-Workers incompatibility entirely). Acceptance: `curl` returns per-story OG tags. Fallback: build-time prerender. W2 spike with an explicit regression test on signup deep links (this pattern near the SPA fallback is where we got burned before).
- **Server-side `can()` by construction, not by copy:** the pure module moves to `app/convex/garden/capabilities.ts`; the client re-exports it. One source file means the 86-assertion suite tests the server implementation automatically. `getGardenUser` + `assertCan` gate every mutation, throwing the denial anatomy (`reason/limit/used/upgradePath`) as `ConvexError` for the standard UI.
- **Stripe topology:** Convex `"use node"` actions create Checkout Sessions; webhooks land on a Convex `httpAction` (`constructEventAsync`); membership state via idempotent upserts keyed by subscription id; **nightly reconcile cron as the backstop** (webhook races are a named top risk). Success pages use Convex reactivity — no polling.
- **Coverage codes:** one church subscription, `quantity = seats`, bound to a `coverageCodes` row; redemption mutation enforces the seat count; card failure suspends with grace — never silently strips a covered creative's seat.
- **Legacy jobs → projects:** freeze `jobs`, one-shot copy into `projects {kind:"paid", legacyJobId}`, 301 the old URLs. `jobInterests` maps to project applications. (Dev: `jobs.ts`'s 711-line CRUD is the skeleton; needs numeric `budget`.)
- **Schema additions:** `hostOrgs, memberships, billingCustomers, coverageCodes, coverageRedemptions, projects, projectApplications, backings, payouts, tables, tableMemberships, tableSessions, sessionRsvps, allocations, storyUpdates`; `patronRole/partnerRole/level` fields on `profiles` (the first domino — capabilities reads them).
- **Demo stays the showroom;** `FilterChips`/`SectionIntro`/denial panel extract to `app/app/garden/ui/` shared with production routes.
- **AP Fund:** zero payment surface — `hostOrgs.givingUrl` outbound button + `allocations` ledger + credit blocks on project pages.

**Build sequence (exit criteria in the architect doc):**
W1 money foundation + server entitlements → W2 coverage codes + projects + jobs migration (+ public-page spike) → W3 backing + story pages → W4 tables/sessions + real event RSVPs → W5 AP Fund + hardening. W6 real-world dry run (AP creatives, real codes, small dollars). W7 buffer.

**Effort honesty:** dev graded 21–30 days against ~25 available *before* the architect resolved both blowups downward (manual payouts; no-SSR story pages) — realistic landing zone is the low 20s, still tight. **If it slips, cut:** dashboard polish, `.ics` styling. **Never cut:** the reconcile cron, server-side `can()`, the payout ledger.

## 6 · Test bar

- capabilities matrix green against server (CI-blocking)
- Playwright persona suite extended to: real signup (test-mode Stripe), code redemption, backing flow, table join+RSVP
- Every Stripe webhook handler has a replay test.
