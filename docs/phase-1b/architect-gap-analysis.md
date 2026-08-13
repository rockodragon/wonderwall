# Phase 1B — Integration Architecture & Gap Analysis

*Architect report, 2026-08-13. Scope: the October seven (signup + Stripe · coverage codes · project backing · AP Fund ledger · Tables/rosters/sessions · real event RSVPs · public story pages). All product decisions taken as final per `docs/the-garden-product-plan.md`; this doc decides only where things live and in what order.*

---

## 1 · Current-state map

**Topology.** SPA (React Router 7, `ssr:false`, prerender list in `app/react-router.config.ts`) deployed as static assets to Cloudflare Pages (`app/wrangler.toml`, `pages_build_output_dir=./build/client`, `_redirects` SPA fallback), talking to Convex cloud (`courteous-rabbit-750.convex.cloud`) over WebSocket. All backend code is in **`app/convex/`** (not repo root). Beads `wonderwall-lrh` documents why SSR was turned off (Convex `ws` needs Node APIs unavailable in Workers; a misplaced functions handler once 404'd signup invite links).

**Auth** — `app/convex/auth.ts`: `@convex-dev/auth` with Password + Google. `afterUserCreatedOrUpdated` auto-creates a `profiles` row. **No email verification flow** on the Password provider. No Stripe customer mapping anywhere.

**Schema** (`app/convex/schema.ts`) — what matters for 1B:

| Table | Role today | 1B relevance |
|---|---|---|
| `users` (authTables) + `profiles` | Identity. `profiles.plan` is a legacy `"free"\|"paid"` string, checked in exactly one place (`wonderings.ts:67`) | `plan` gets deprecated; level derives from new `memberships`. `inviteSlug` invite flow keeps working untouched |
| `jobs` + `jobInterests` | The legacy job board: `title/description/location/jobType/visibility(Private\|Members)/compensationRange(string)/status(Open\|Closed)`; `jobInterests` = apply-lite (note + up to 3 work links). **No money anywhere** — `compensationRange` is free text, no budget field, no payment | The plan (§3) says jobs *become* paid projects. Copy already says "Projects"; URLs/identifiers still `jobs.*` |
| `events` + `eventApplications` | Real event model with location/geo/cover images, and an application flow (`apply` → pending/accepted/declined, `requiresApproval`) — i.e. **RSVP-with-approval already exists in the app** | Item 6's gap is not the model — it's that the *public* event page (`app/public/events/first-table/index.html`) is static HTML whose CTA is `mailto:rickmoy@gmail.com` |
| `invites` | Invite codes + slugs, signup gating | Coverage codes are a *separate* mechanism (payment-bound); don't overload this table |
| `conversations/messages/blocks/notifications/reports` | Messaging + moderation | Untouched by 1B; notifications reused for RSVP/backing events |
| `crawledOrganizations` + crawler tables | **Leads/prospects only** | Never the org-account table. `hostOrgs` is new (the entitlements doc says the same) |
| `wonderings/artifacts/favorites/embeddings` | Portfolio + community | Untouched; artifacts feed story-page media later |

**HTTP layer** — `app/convex/http.ts` already routes auth, location autocomplete, and a PostHog proxy through Convex's `httpRouter`. This is the precedent and the home for the Stripe webhook.

**The contract** — `app/app/garden/capabilities.ts` is a *pure* `can(user, capability)` function; `capabilities.test.ts` is the 86-assertion executable form of plan §2.3 (matrix rows, passion caps 1/5/10, denial anatomy, covered-seat-equals-seat). `demo-data.ts` + `routes/demo.app.tsx` are the binding reference UI (FilterChips, SectionIntro descriptors, AddAction gated-create panels that render the `can()` denial + upgrade path). All `/demo/*` routes are prerendered — any new public route must either join the prerender list or be served by a worker, or the SPA-fallback hydration mismatch (React #418) kills it.

**Jobs → paid projects mapping, honestly:** legacy jobs are *structurally* paid projects minus the two things that matter — a declared numeric budget and a payment rail. `jobInterests` maps cleanly to paid-project applications. Nothing in `jobs` maps to passion projects; those are net-new.

**What to DO with this section:** treat `app/convex/` as the only backend; extend the existing schema (no parallel database, no second Convex project); build every new gated mutation on the pattern `auth.getUserId(ctx)` → `assertCan(...)` that the codebase currently lacks.

---

## 2 · Target architecture

### 2.1 New Convex tables (all in `app/convex/schema.ts`)

```
hostOrgs            slug, name, kind ("platform"|"church"|"org"), givingUrl?, status
                    — rows: the-garden (default), abiding-practice, grace-fellowship…
                    — §6: exists in schema day one, invisible in UI until a second brand earns it

memberships         userId, level ("seat"|"five"|"host"), status ("active"|"past_due"|"canceled"),
                    source ("stripe"|"coverage"|"admin"), hostOrgId,
                    stripeSubscriptionId?, coverageRedemptionId?, currentPeriodEnd?, cancelAtPeriodEnd?
                    idx: by_userId, by_stripeSubscriptionId

billingCustomers    userId, stripeCustomerId          idx: by_userId, by_stripeCustomerId

(profiles gains)    patronRole?: boolean, partnerRole?: boolean, roleOrgName?, roleLogoStorageId?
                    — roles are additive booleans per the plan; a table is overkill for two flags

coverageCodes       code ("GRACE-FALL"), sponsorName, sponsorOrgId (hostOrgs),
                    stripeSubscriptionId, seats (mirror of Stripe quantity), expiresAt?,
                    status ("active"|"suspended"|"expired"), createdBy      idx: by_code

coverageRedemptions codeId, userId, membershipId, creditVisible (default true), redeemedAt
                    idx: by_codeId, by_userId

projects            kind ("passion"|"paid"), ownerId, hostOrgId, slug, title, blurb,
                    coverStorageId?, disciplines[], status ("draft"|"active"|"funded"|"complete"|"archived"),
                    budgetCents? (paid — required, the guardrail), goalCents?/raisedCents? (passion),
                    legacyJobId? (v.id("jobs"))       idx: by_ownerId, by_kind_status, by_slug, by_legacyJobId

projectApplications projectId, userId, note?, workLinks[]   (jobInterests shape, new table)

backings            projectId, backerUserId, amountCents, platformFeeCents (10%),
                    stripeCheckoutSessionId, stripePaymentIntentId?, status ("pending"|"succeeded"|"refunded")
                    idx: by_projectId, by_backerUserId, by_stripeCheckoutSessionId

payouts             projectId, creativeUserId, amountCents, method ("manual"|"connect"),
                    status ("owed"|"paid"), reference?, paidAt?      idx: by_projectId, by_status

tables              hostOrgId, hostUserId, slug, name, mode ("in-person"|"virtual"|"hybrid"),
                    capacity?, term ("ongoing"|"fixed"), cadence, joinPolicy ("open"|"apply"|"invite"),
                    format? ("Workshop"|"Class"|…), program?, meetingUrl?, status
                    — §6 verbatim: one object, four settings, no subtypes

tableMemberships    tableId, userId, status ("member"|"invited"|"removed"), via? (provenance), joinedAt
tableSessions       tableId, title?, startsAt, endsAt?, meetingUrlOverride?, calendarUid, status
sessionRsvps        sessionId, userId, status ("going"|"out")     idx: by_sessionId, by_userId

allocations         fundOrgId (hostOrgs — AP), recipientUserId?, projectId?, amountCents,
                    cadence ("monthly"|"one-time"), label ("AP Fund"), publicNote?, startedAt, endedAt?
                    — display-only ledger; NO payment processing on this lane

storyUpdates        projectId, authorId, slug, title, body (markdown), mediaStorageIds[],
                    credits[] ({name, kind: "sponsor"|"patron"|"venue"|"fund"}), publishedAt
                    idx: by_projectId, by_slug

eventRsvps          — do NOT add. `eventApplications` with requiresApproval:false IS the RSVP;
                    auto-accept in `events.apply` when approval is off (small change to events.ts:260)
```

### 2.2 Server-side `can()` — the non-negotiable

- **Move the pure function** to `app/convex/garden/capabilities.ts` (Convex bundles it fine; it has zero imports). `app/app/garden/capabilities.ts` becomes a **re-export** of the same module — one source, so client `can()` (UX-only) and server `can()` can never drift.
- The existing **86-assertion vitest suite passes unchanged** against the moved module — that literally satisfies "the test table must run against the server implementation," because the server implementation *is* that module. Add it to CI alongside the Playwright suite.
- New server file `app/convex/garden/entitlements.ts`:
  - `getGardenUser(ctx, userId) → GardenUser` — derives `level` from the active `memberships` row (none → `"free"`; unauthenticated → `"visitor"`), `coveredBy` from `coverageRedemptions`→`coverageCodes.sponsorName`, `patronRole/partnerRole` from `profiles`, `activePassionProjects` from a `projects by_ownerId` count where `kind="passion" && status in (active,funded)`.
  - `assertCan(ctx, capability) → GardenUser` — throws `ConvexError({reason, upgradePath, limit, used})` on denial so the client renders the same denial anatomy the demo mocks.
  - Add `convex-test` unit tests for the *derivation* (membership row → level; coverage → identical answers to paid seat; passion count feeds caps) — that's the part the pure-function suite can't see.
- **Every gated mutation calls it**: `projects.createPassion` / `projects.createPaid` / `projects.apply` (→ `project.applyPaid`) / `events.create` / `tables.join` (open vs member by joinPolicy) / `backings.create` (→ `project.pledge`; auto-grant `patronRole` after the 60-second registration per §3) / `tables.create` (admin/operator-only in October, but enforce `table.create` anyway so the future path is already guarded).

### 2.3 Stripe topology (SPA + Convex)

```
Browser ── useAction(createCheckoutSession) ──► Convex action ("use node", stripe SDK)
                                               └► stripe.checkout.sessions.create
Browser ◄── {url} ── window.location = url ──► Stripe Checkout (Stripe collects card + email)
Stripe ── webhook POST ──► Convex httpAction  https://<deployment>.convex.site/stripe/webhook
                           (http.ts route; constructEventAsync + SubtleCrypto provider —
                            httpActions run in the V8 runtime, use the async verifier)
                           └► internal mutations: upsert billingCustomers / memberships / backings
Browser ── /join/success?session_id= ──► reactive useQuery(membership) — Convex reactivity IS the
                                         "payment pending → active" UX; poll nothing
```

- **Files:** `app/convex/stripe.ts` (actions: `createMembershipCheckout`, `createBackingCheckout`, `createCoverageCheckout`, `createBillingPortalSession`; internal mutations: `upsertSubscription`, `recordBackingPaid`), webhook handler registered in `app/convex/http.ts` (same pattern as the PostHog proxy).
- **Products/prices:** three recurring prices (seat $10, five $25, host $50) + the seat price reused with `quantity=N` for coverage. Checkout `metadata: {userId, intent: "membership"|"coverage"|"backing", tier?, projectId?, coverageCodeDraftId?}` is the join key — never trust client-reported outcomes.
- **Subscription lifecycle → membership state:** `checkout.session.completed` creates the membership; `customer.subscription.updated` maps Stripe status → `active|past_due|canceled` and syncs `currentPeriodEnd`; `customer.subscription.deleted` → `canceled`. Idempotent upserts keyed `by_stripeSubscriptionId`. A nightly reconcile action (`crons.ts`) lists Stripe subscriptions and repairs drift — webhooks get missed; reconciliation is the backstop.

### 2.4 Church coverage codes (quantity model → redemptions)

ONE subscription on the church's card, `quantity = seats`. Flow:
1. Operator runs `coverage.issue` (admin mutation) or sends the church a Checkout link from `createCoverageCheckout(seats, sponsorName)`; webhook creates the `coverageCodes` row bound to `stripeSubscriptionId`, `seats = quantity`.
2. Creative hits `/join?code=GRACE-FALL` → signup → `coverage.redeem` mutation: code `active`, `count(redemptions) < seats` → insert redemption + `memberships{level:"seat", source:"coverage"}`. The church pays for all N from day one; unredeemed seats render as "9 of 25 seats waiting" on the sponsor dashboard (that idle count is the sponsor's nudge, per §4.2).
3. Quantity changes on the subscription (webhook) update `coverageCodes.seats`; `past_due`/`deleted` → code `suspended` → covered memberships flip to `past_due` at period end (grace, don't guillotine). Covered creatives keep `coveredBy` credit on story updates via `creditVisible`.

### 2.5 Backing payouts — recommendation: **manual transfers for October**

| | Stripe Connect Express | Manual (recommended) |
|---|---|---|
| Split | Automated 90/10 destination charges | Recorded in `backings.platformFeeCents` + `payouts` rows; operator pays weekly (bank/Zelle), marks `paid` with reference |
| Creative friction | KYC onboarding per creative, days of drop-off | Zero |
| Build cost | ~1–2 weeks incl. onboarding UX + edge cases | ~1 day (table + runbook + "paid out weekly" copy on project pages) |
| Honest downside | Overkill at 2-customer scale | Platform is merchant of record: backing revenue lands as platform income, creatives get 1099-visible payments (>$600/yr/creative), bookkeeping is on us. Fine at October volume; **does not scale and must not be the Phase 3 host-payout answer** |

Plan §2.4 already reserves Connect Express for host earnings in Phase 3 — adopt it then for *both* lanes. Keep-what-you-raise + immediate payout means no escrow logic anywhere: `backings.succeeded` → `payouts.owed` in the same webhook handler.

**What to DO with this section:** add the schema block above in one migration-safe pass (all new tables + two optional profile fields), move `capabilities.ts` into `app/convex/garden/`, build `stripe.ts` + the webhook route, and write the coverage issuance/redemption mutations — in that order.

---

## 3 · Integration seams & gaps

1. **Extend, don't fork.** New tables sit beside legacy ones in the one schema. Existing users need **no backfill**: no `memberships` row already means `"free"`, which is correct for every current account. Deprecate `profiles.plan` by routing `wonderings.ts:67` through `getGardenUser` (seat+ ⇒ old "paid" behavior); delete the field in a later cleanup.
2. **Jobs: freeze + migrate, don't merge live.** One-shot internal migration copies `status:"Open"` jobs → `projects{kind:"paid", legacyJobId, budgetCents: parsed from compensationRange else operator backfill}`. `jobs.createJob` is retired; `/jobs/new` redirects to the paid-project create flow; `/jobs/:id` resolves via `by_legacyJobId` and redirects to `/projects/:id` (old links keep working). `jobInterests` stays read-only history; new applications write `projectApplications`. Do **not** try to keep two write paths in sync.
3. **/demo stays the showroom.** It's prerendered, noindex, persona-switched, and the acceptance mock — mutating it into production burns the reference. Production shell: extract `FilterChips`, `SectionIntro`, the AddAction denial panel, and card components from `demo.app.tsx` into `app/app/garden/ui/`, consumed by real routes (`/projects`, `/events`, `/tables`, `/offers`) backed by Convex queries. Demo keeps importing the same components — the showroom then *proves* the production UI.
4. **Auth is sufficient for Stripe, with two additions.** Stripe Checkout collects and verifies card + email itself; pass `customer_email` (prefill) and persist `stripeCustomerId` in `billingCustomers` on first checkout so later checkouts and the billing portal reuse one customer. Password-provider **email verification is missing** — not a Stripe blocker, but a receipts/recovery hygiene gap; schedule it, don't block October on it.
5. **Public story pages vs the WebSocket/SSR issue (`wonderwall-lrh`).** Recommended pattern — **prerendered shell + client hydrate + a tiny Cloudflare Pages Function for crawler HTML using `ConvexHttpClient`** (plain fetch, no `ws`, Workers-safe — this sidesteps the entire Node-API incompatibility):
   - `app/functions/story/[slug].ts` (and later `events/[id].ts`): fetch `api.stories.getPublic` over HTTP, return the shell with real `<title>/<meta og:*>` and the story body inlined; browsers hydrate into the live Convex client as usual.
   - Do **not** flip `ssr:true` for this — full SSR is the Phase-later answer and the thing that broke signup links before.
   - Guardrails from the earlier failure: the `functions/` dir must sit at `app/` (next to `wrangler.toml`), verify with `wrangler pages dev`, and confirm `_redirects` SPA fallback still catches everything else. **Acceptance test: `curl` a deployed story URL returns that story's unique OG tags.** Fallback if Pages Functions fight the static deploy again: build-time prerender of story pages via a Convex HTTP query in a prebuild script (accepting staleness until next deploy) — fine for October's handful of stories.
6. **Event RSVPs (item 6).** The model exists; the work is (a) auto-accept in `events.apply` when `requiresApproval` is false, (b) a real public `/events/:id` route with the same crawler-HTML treatment, (c) retire the static `app/public/events/first-table/index.html` mailto CTA in favor of the live page (301 the old path). RSVP requires a free account per plan §2.1 — the page is readable logged-out, the CTA routes through signup.
7. **Tables (item 5).** No self-serve creation: `tables.create` is an admin/operator mutation (still guarded by `assertCan` + `isAdmin`). Sessions ≠ events — `tableSessions` is its own table; the meeting link is returned **only** to roster members (`tableMemberships` check inside the query — entitlement filtering in the query, not the client). Calendar invite: generate an `.ics` (VEVENT with `calendarUid`, meeting URL in LOCATION/DESCRIPTION) — a pure-string Convex query or client util; no Google/Zoom API integration in October, the link is pasted by the operator.
8. **AP Fund (item 4).** Zero payment surface: `hostOrgs.givingUrl` powers the outbound donate button; `allocations` renders the `/fund/ap` ledger and a credit block on each allocated project's page and story updates (`credits[{kind:"fund"}]`). Operator CRUD mutation only.

**What to DO with this section:** write the jobs migration + redirect first (it de-risks everything downstream), extract the demo components into `garden/ui/` before building production routes, and spike the Pages-Function-vs-static question in week 2 — it's the only genuinely uncertain seam.

---

## 4 · Risk register

| # | Risk | Sev | Mitigation | Decide-by |
|---|---|---|---|---|
| R1 | **Server `can()` drifts from the 86-test contract** — someone reimplements instead of importing | High | Single pure module in `convex/garden/`, client re-exports it; suite in CI; `convex-test` covers the `getGardenUser` derivation | Week 1, before any gated mutation merges |
| R2 | **Webhook races / missed events** → paid user sees "free" or a canceled church keeps seats | High | Idempotent upserts by `stripeSubscriptionId`; reactive success page (no polling); nightly reconcile cron against Stripe's list API | Before first real-money checkout (end W1) |
| R3 | **Public-page serving pattern breaks the SPA-fallback fix** (the exact 404 regression `lrh` records) | Med-High | Pages-Function spike with `wrangler pages dev` + deployed `curl` OG test + signup-link regression in the Playwright suite | Week 2 spike; fallback = build-time prerender |
| R4 | **Manual payouts = platform is merchant of record** (bookkeeping, 1099s >$600/creative/yr, refund exposure) | Med | `payouts` ledger + weekly runbook; "paid out weekly" stated on project pages; flag to the accountant now; hard ceiling: revisit Connect when any creative crosses ~$500 raised | Before backing goes live (start W3) |
| R5 | **Church card failure orphans covered creatives** mid-season | Med | `past_due` grace to period end, sponsor + host notified, code suspended not deleted; covered seats never silently vanish | Ship with coverage (W2) |
| R6 | **Coverage seats vs Stripe quantity drift** (church upgrades 10→25 in the dashboard) | Med | `subscription.updated` webhook syncs `coverageCodes.seats`; redemption mutation re-reads seats transactionally | With coverage (W2) |
| R7 | **Jobs migration breaks live links/flows** | Low-Med | `legacyJobId` + 301s; migration is read-copy (jobs table untouched); Playwright covers `/jobs/:id` redirect | W2, before nav flips |
| R8 | **New public routes miss the prerender list** → React #418 dead pages on deep links | Low | Checklist item in the route-adding PR template; e2e deep-link smoke per new public route | Each route's ship week |

---

## 5 · Build sequence — 5 weeks, dependency-ordered

**W1 — Money foundation + server entitlements.**
Schema pass (all §2.1 tables + profile role fields) · move `capabilities.ts` → `convex/garden/`, client re-export, suite in CI · `entitlements.ts` (`getGardenUser`, `assertCan`) + `convex-test` derivation tests · Stripe products/prices · `stripe.ts` checkout actions + webhook in `http.ts` + reconcile cron · `/join` tier flow wired to real checkout.
**Exit:** test-mode $10 checkout yields an active `memberships` row, and `assertCan` allows `project.create.passion` for that user while denying a fresh free account — verified by automated test, not by hand.

**W2 — Coverage codes + projects.**
`coverage.issue`/`redeem` + `/join?code=` pre-applied signup + sponsor dashboard (redeemed/idle counts) · `projects` CRUD with the two gated create flows (denial anatomy from `garden/ui/` extraction) · jobs migration + redirects · `/projects` browse (chips + gated add-action) · Pages-Function OG **spike concludes**.
**Exit:** a GRACE-FALL-style code redeems into a full seat with sponsor credit; every open legacy job renders as a `PAID · $N` project at a redirected URL; serving pattern for public pages is decided in writing.

**W3 — Backing + stories.**
`backings` one-time Checkout (90/10 recorded) + `payouts` ledger + operator payout runbook + "paid out weekly" copy · patron-role auto-registration at first pledge · `storyUpdates` CRUD + public `/story/:slug` using the W2 pattern, credits block (sponsor/patron/venue/fund).
**Exit:** a test backing moves real (test-mode) money, ledger shows the split and an `owed` payout; a deployed story URL returns its own OG tags to `curl` and hydrates live in the browser.

**W4 — Tables + real event RSVPs.**
`tables`/`tableMemberships`/`tableSessions`/`sessionRsvps` + operator table creation · join gated by `table.join.open|member` per joinPolicy · meeting link visible to roster only (query-side filter) · `.ics` download per session · `events.apply` auto-accept + public `/events/:id` + retire the first-table mailto (301).
**Exit:** a member joins a roster, RSVPs a session, downloads a working `.ics`, sees the Zoom link; a logged-out visitor sees the event page but hits signup at the RSVP CTA; AP's real gathering exists as a hand-created table.

**W5 — AP Fund + hardening.**
`allocations` + `/fund/ap` page (donate → `givingUrl`, ledger of "AP Fund → $500/mo → name/project") + credit blocks on allocated project pages · sponsor dashboard polish · reconcile cron proven green over a week · prerender/OG checklist swept across all new public routes · Playwright persona suite extended to checkout, redemption, backing, RSVP paths.
**Exit:** the October seven each pass an end-to-end scripted walkthrough on the deployed preview; reconcile has run 5+ nights clean; no public route fails the deep-link or OG check.

Buffer lives inside W5; if the schedule slips, cut sponsor-dashboard polish and `.ics` styling — never the reconcile cron, the server-side `can()`, or the payout ledger.
