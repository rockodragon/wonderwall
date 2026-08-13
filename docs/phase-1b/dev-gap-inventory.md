# Dev Gap Inventory — Phase 1B (October Build)

v1.0 · 2026-08-13 · DEV analyst · companion to `docs/phase-1b/spec.md` (product, frozen) and `architect-gap-analysis.md` (sibling, integration architecture)

Scope covered: the seven October items in `spec.md` §1. This file is file-level reuse/gap only — no new decisions, no re-litigating scope.

---

## 1 · Schema inventory — `app/convex/schema.ts` (545 lines, 21 tables)

| Table | Phase 1B relevance | Notes |
|---|---|---|
| `...authTables` (Convex Auth) | **Reuse as-is** | users/sessions/accounts. No changes needed for Stripe — link via `profiles`, not auth tables. |
| `profiles` | **Extend** | Has `plan?: string` ("free"/"paid" — stale binary, not the $10/$25/$50 tiers), `isAdmin`, `inviteSlug` system. **Missing entirely**: `level` (visitor/free/seat/five/host per `capabilities.ts`), `patronRole`, `partnerRole`, `activePassionProjects` counter, `stripeCustomerId`, `stripeSubscriptionId`, `coveredBy` (church code link). All four `GardenUser` fields capabilities.ts needs are absent from the real schema — the demo type and the real table have zero field overlap today. |
| `attributes`, `links`, `artifacts` | **Reuse as-is** | Artifacts already power `jobInterests.workLinks` (work samples) — same mechanic backs "project" applications. |
| `wonderings` / `wonderingResponses` | Untouched | Not in October scope. |
| `events` | **Reuse + extend for RSVP** | Has full location/tags/status/cover-image model. Missing: no-account RSVP (name+email), only `eventApplications` gated to logged-in `applicantId: v.id("users")`. |
| `eventApplications` | **Reuse as basis, extend** | This *is* the RSVP mechanic today — `apply` mutation, `status: pending/accepted/declined`, `requiresApproval` gate, notification+email on apply. Gap: `applicantId` is a hard `v.id("users")`, no guest path. Needs either a nullable-user + guest name/email variant, or a parallel `eventRsvps` table. |
| `invites` | **Reuse as-is** | Invite-slug system (`profiles.inviteSlug`, `getInviteLimit` progressive unlock) is a complete, working analog for "personal invite link" in spec item 6 ("bring someone"). Direct reuse, zero new schema. |
| `embeddings`, `profileViews`, `profileLikes`, `artifactLikes` | Untouched | Not in scope. |
| `favorites` | **Reuse pattern for project-following** | Polymorphic `targetType/targetId` (`"profile" \| "event"`) — trivially extends to `"project"` by adding a union literal. No schema migration needed, just widen the `v.union` in `favorites.ts` (3 call sites: `toggle`, `isFavorited`, `getFavoriteCount`). |
| `waitlist` | Untouched | Not in scope. |
| `jobs` | **Rename target — becomes `projects`** | See §5. Structurally close to what "paid projects" need (title/description/location/status/visibility) but has zero money fields (no `budget`, no `raised`, no `goal`, no `backers`). `compensationRange: v.optional(v.string())` is free text, not a number — cannot back the 90/10 split math as-is. |
| `jobInterests` | **Reuse pattern for backing intent, not the transaction** | `note` + `workLinks` (max 3 artifacts) is a good model for "apply to paid work," but has no `amount` field — cannot double as the backing/payment record. Backing needs its own table (§3). |
| `conversations` / `messages` | **Reuse as-is** | `getOrCreateConversation` + `sendMessage` is exactly the "coaching contact" / "Ask a question" affordance implied for AP Fund and Tables. Already has block-list respect, read receipts, notification+email hooks. Zero schema change. |
| `blocks` | Reuse as-is | Supports messaging above. |
| `notifications` | **Reuse as-is** | Generic `type/title/message/linkUrl/relatedUserId` shape already used for `invite_accepted`, `job_interest`, `event_application`. Same insert pattern covers "backing received," "allocation posted," "table session reminder" — no schema change, just new `type` string values. |
| `reports` | Untouched | Not in scope. |
| `crawledOrganizations`, `crawlerRuns`, `crawlerSources`, `crawlerQueue`, `crawledJobs` (5 tables, ~200 lines) | **Not applicable — false friend** | This is the outbound partner-discovery crawler (finding churches/orgs to sell to), unrelated to host orgs/Tables as a product concept. `organizations.tsx` route is a static marketing page, not backed by any of these tables. Do not confuse "crawledOrganizations" with the "host org" concept the product plan uses — there is no host-org table today. |

**Net:** 13 of 21 tables reusable as-is or with trivial extension; `jobs`/`jobInterests` need renaming + new money fields; 5 crawler tables are irrelevant to Phase 1B; 6 greenfield table groups needed (§3).

---

## 2 · Reuse inventory — effort saved

| Existing asset | File(s) | What Phase 1B gets for free | What still changes |
|---|---|---|---|
| Auth + onboarding | `app/convex/auth.ts` (47 lines), `app/app/routes/signup.tsx` (610), `onboarding.tsx` (540) | Password + Google OAuth, profile auto-creation on signup (`afterUserCreatedOrUpdated` callback), full onboarding flow UI | Signup flow must gain a tier-selection + Stripe checkout step (spec item 1: "doors → basics → tier → checkout → confirmation"). `demo.join.tsx` (627 lines) is the UX reference already built as a demo — becomes the template to wire to real signup. |
| Invite-slug system | `invites.ts` (459 lines) | Complete: slug generation, progressive unlock (3→8→18→38...), redemption, network-size stats, admin unlimited-invite override | None needed for event "bring someone" reuse — direct call to `getMyInviteLink`. Church coverage codes (item 2) are a **structurally different** system (org-owned code, quantity=seats, no progressive unlock) — do not try to bend `invites.ts` to fit; it's a new table (§3). |
| Jobs CRUD | `jobs.ts` (711 lines) | Full CRUD (`createJob`/`updateJob`/`closeJob`/`reopenJob`), interest expression with work-sample attachment, notification+email on interest, poster-only interest visibility | Becomes the skeleton for "paid projects." Concretely: add `kind: "passion" \| "paid"` (currently absent — jobs are all one kind), replace `compensationRange: string` with `budget: v.number()` for paid / `goal: v.number()` for passion, add `raised: v.number()`, add a `backers` relation. `expressInterest`/`jobInterests` stays as the "apply to paid work" path; a **new, separate** mutation handles the money movement (backing is not "interest"). |
| Events + applications | `events.ts` (475 lines), `event.tsx` (1237), `events.tsx` (312), `CreateEventModal.tsx` | Full event CRUD, location/geocoding fields, `apply`/`getApplications`/`getAttendees`/`updateApplicationStatus`, organizer notification+email on apply | `apply` requires `auth.getUserId` — hard-fails for guest RSVP (spec item 6: "no account required"). Needs a guest branch (name+email, no `applicantId`) or a schema change to make `applicantId` optional + add `guestName`/`guestEmail`. |
| Favorites | `favorites.ts` (195 lines) | Polymorphic target pattern already built | Widen `targetType` union to include `"project"` — 3 call sites, no data migration. |
| Messaging | `messaging.ts` (600+ lines), `messages.$conversationId.tsx`, `messages._index.tsx` | Full DM system with blocking, read state, notifications | Direct reuse for "Ask a question" on Tables/AP Fund — no changes needed, just new entry points (a "message the host" button wired to `getOrCreateConversation`). |
| Admin surface | `admin.tsx` (336 lines route + `admin.ts` convex, 347 lines) | `requireAdmin` helper, admin user list, admin mutations pattern (bootstrap, setAdminStatus, deleteUser) already established | This is the natural home for the operator concierge tools spec calls for: hand-creating Tables, entering AP allocations, creating church coverage codes. None of those admin UIs exist yet — the *pattern* (auth-gated admin route + admin-only mutations) is reused, the screens are new. |
| Capability/entitlement matrix | `app/app/garden/capabilities.ts` (165 lines) + `capabilities.test.ts` (125 lines, cited in spec as "86-assertion matrix") | **This is the single largest reuse asset in the repo.** The entire `can(user, capability)` gate logic — passion project caps by level, paid-project budget guardrail, pool.propose, table join (open/member), table.create (host-only), seat.cover/fellowship.fund/project.pledge (patron/partner gated) — is already written and spec-frozen ("UI callers must not change" per file header). Per spec §2, this moves server-side into Convex verbatim and the existing test file becomes the CI gate. | Port `can()` into a Convex query/helper (e.g. `convex/capabilities.ts`), call it from every gated mutation, and make `GardenUser` resolve from real `profiles` fields (§1 gap: those fields don't exist on `profiles` yet — this is the load-bearing schema change). |

---

## 3 · Greenfield — no existing counterpart

| Area | New Convex tables | New Convex functions | New routes | Effort | Riskiest detail |
|---|---|---|---|---|---|
| **Memberships/Stripe** | Extend `profiles` (see §1) or new `memberships` table (customerId, subscriptionId, tier, status, currentPeriodEnd) | `stripeWebhook` handler (checkout.session.completed, customer.subscription.updated/deleted), `createCheckoutSession` action, entitlement resolver reading webhook-derived state | `app/convex/http.ts` webhook route (file exists, needs Stripe route added), checkout success/cancel routes | **M** (3-4 dev-days) | Webhook idempotency + ordering. Convex mutations aren't naturally idempotent against Stripe's at-least-once delivery; a replayed `subscription.updated` after a `subscription.deleted` can resurrect entitlements. Spec §6 already flags "every webhook handler has a replay test" — take that literally, it's the thing most likely to silently corrupt entitlement state in production. |
| **Church coverage codes** | New `coverageCodes` (sponsorOrgId/name, code, seatsTotal, stripeSubscriptionId, status) + `codeRedemptions` (codeId, userId, redeemedAt) | `createCoverageCode` (admin/operator-only), `redeemCode`, `getCodeStatus` (seats issued/redeemed/idle), idle-seat nudge query | `…/c/:code` redemption route, admin screen to create/view codes | **S/M** (2-3 dev-days) — logic is simple (decrement-a-counter), but sits behind Stripe quantity-based subscriptions | The "11th redemption politely fails" + "church cancels → covered seats lapse at period end with operator-mediated grace" (spec acceptance criteria) means redemption count and Stripe seat quantity must reconcile on every webhook, and the grace-period lapse is a scheduled job (cron), not an immediate cutoff — easy to under-scope as "just check `redeemed < seats`" and miss the grace-period timing entirely. |
| **Project backing / payout ledger** | New `backings` (projectId, backerUserId, amountCents, platformFeeCents, creativeAmountCents, status, stripePaymentIntentId, createdAt) | `createBacking` (Stripe PaymentIntent + immediate transfer), `getProjectBackers` (names, not counts, per spec), `getBackerHistory` | Backing UI on project detail page (extends `jobs.$id.tsx` pattern → new `projects.$id.tsx`) | **L** (5-7 dev-days) | **This is a real money-movement feature with no existing precedent in the codebase** — nothing in the repo today touches Stripe Connect, split payments, or "keep-what-you-raise" immediate transfer. The architect report is explicitly deferred on "Connect Express vs operator-mediated transfers" (spec item 3) — until that's resolved, this item can't be estimated tightly. Card-on-file-after-first-back (spec: "$10–$500 in v1, card on file after first back") adds a second Stripe object (SetupIntent) to sequence correctly. |
| **AP Fund allocations ledger** | New `fundAllocations` (fund slug, dateLabel, amountCents, artistProfileId, projectId, enteredBy, createdAt) | `createAllocation` (admin-only), `getPublicLedger` (no-auth query, since spec requires it readable without an account) | `/fund/abiding-practice` public page | **S** (1-2 dev-days) | Lowest-risk item in the list — display-only, operator-entered, no money touched (donate button links out). The only real risk is scope creep: spec explicitly says "not in October: automated AP integration, multiple funds" — resist building a generic multi-fund system when one hardcoded slug + one admin form is what's asked. |
| **Tables: roster, sessions, RSVP, meeting links** | New `tables` (name, hostOrgId/hostUserId, mode: open/member/cohort, format, cadence, price), `tableMembers` (tableId, userId, joinedAt), `tableSessions` (tableId, datetime, meetingLink, recordingUrl), `sessionRsvps` (sessionId, userId, status) | `joinTable` (gated by `can('table.join.open'|'table.join.member')`), `createSession`/`listSessions` (operator-only per spec — no self-serve create), `rsvpToSession`, `getTableRoster` | Table browse (adapts `TablesSection`/`TableDetail` from `demo.app.tsx`), table detail/session page, admin "create table" screen | **M** (4-5 dev-days) | Cohort pricing ($40/$120) is "simple Stripe checkout attached to the cohort" per spec — a **third** distinct Stripe integration pattern (subscription for membership, one-time-with-split for backing, one-time-flat for cohort). Three different checkout flows sharing one Stripe account is easy to under-budget as "just Stripe again." Also: `.ics` calendar invite generation for sessions has no existing library/pattern in the repo. |
| **Real event RSVPs** | Extend `eventApplications` (make `applicantId` optional, add `guestName`/`guestEmail`) — no new table if extending; new `eventGuestRsvps` if kept separate | `rsvpAsGuest` (no auth), `rsvpAsMember` (reuses `apply`), host-side list merging both | Extends existing `event.tsx` | **S** (1-2 dev-days) | Guest RSVP with no account creates a duplicate-detection problem (same email RSVPing twice, or a guest RSVPing then later signing up) — spec doesn't mention dedup and it's the kind of thing that surfaces as a support ticket, not a spec line. |
| **Public story pages** | Extend `jobs`/`projects` with `storySlug`, or new `storyUpdates` (projectId, body, imageStorageId, createdAt) for the "updates timeline" | `getStoryPage` (public, no-auth, must be crawlable per spec), `addStoryUpdate` | `…/story/:slug` | **M** (3-4 dev-days) | "Crawlable... renders content without JS for crawlers" (spec item 7 acceptance) — this is a React Router SPA today (`app/app/routes/*`). Getting server-rendered/prerendered HTML for a single route inside an otherwise client-rendered app is an architecture decision, explicitly deferred to the architect report ("the prerender/Convex pattern comes from the architect report"). Do not start this until that lands — building it twice is the likely failure mode. |

---

## 4 · Demo layer — `app/app/garden/*`, `app/app/routes/demo*.tsx`

| File | Disposition | Detail |
|---|---|---|
| `capabilities.ts` (165 lines) | **Carries into production as-is (ported, not rewritten)** | Per its own header comment: "Phase 1B swaps the demo store for Convex + Stripe behind this exact function; UI callers must not change." Move logic into a Convex function; `GardenUser` becomes a resolved-from-`profiles` shape instead of a demo literal. |
| `capabilities.test.ts` (125 lines) | **Carries into production as-is** | Spec §2 names this explicitly as the CI gate ("86-assertion matrix... runs against the server implementation"). Same test file, new implementation under test. |
| `garden.css` (236 lines) | **Carries into production as-is** | Shared visual language (`.g-hairline`, `.g-label`, `.g-h`, `.g-credit`, `.g-photo-strip` etc.) used by every demo section — becomes the real app's styling for these surfaces, not a rewrite. |
| `icons.tsx` (169 lines) | **Carries into production as-is** | Icon set referenced by demo sections (`IconEvent` etc.) — no reason to redo. |
| `demo-context.tsx` (67 lines) | **Demo-only** | Persona-switcher React context for the walkthrough. Not needed once real auth drives `GardenUser`. |
| `demo-data.ts` (342 lines) | **Demo-only, but read as spec** | `PERSONAS`, `PROJECTS`, `TABLES`, `OFFERS`, `COVERAGE`, `DASHBOARD` are hand-authored fixtures that double as the most concrete spec for shape of real data — e.g. `COVERAGE` object (sponsor/code/qrUrl/seats/redeemed/redeemedBy) maps almost field-for-field onto the `coverageCodes` table proposed in §3. Worth reading before writing schema, not worth reusing as code. |
| `demo.app.tsx` (1506 lines) — sections | **Adapted, not carried** | `ProjectsSection`/`ProjectDetail`, `EventsSection`/`EventDetail`, `TablesSection`/`TableDetail` are the UI reference for real `projects.*`, `event.tsx`, and new `tables.*` routes — same layout/component shape, swap `DemoProject[]`/`DemoTable[]` literals for `useQuery(api.*)`. `OffersSection`/`OfferDetail` and `BuzzSection` are **explicitly out of scope** ("offers directory backend (static demo stands)... Buzz backend" per spec §4) — do not build a backend for these in October. |
| `demo.join.tsx` (627), `demo.patron.tsx` (581), `demo.host.dashboard.tsx` (605), `demo.create.tsx` (659), `demo.offers.tsx` (235) | **Demo-only, cited as UX references** | Spec explicitly names `demo.join.tsx` as "the binding UX reference" for real signup+checkout, and `demo.patron.tsx` P4 flow as "the reference" for coverage-code sponsor UX. These stay live as `/demo/*` routes (not deleted) and get manually re-implemented as real routes — not code-shared, since they're demo-state (`useState`/`localStorage`) per the file header's own rule ("flows keep their own transient state... never mutate this [demo-data]"). |

---

## 5 · Vocabulary collision check — `wonderwall-77w`

Bead `wonderwall-77w` (closed 2026-08-10): *"Visible-copy pass done: 49 strings across 9 files, Jobs→Projects; Guide absent from app copy. URLs/identifiers/analytics names left for Phase 1B rename."* Confirmed by grep — the visible-copy pass is real and holding:

- `app/app/routes/_app.tsx:9` — nav already reads `{ path: "/jobs", label: "Projects", icon: BriefcaseIcon }`. Copy says Projects; everything under it still says Job.
- No remaining `Guide` collisions found anywhere in `app/app` (`rg -n -i '\bguide\b'` — zero hits outside node_modules).

**What's left, graded** (this is the literal scope of the "legacy-jobs rename" the spec excludes from October — "legacy-jobs rename beyond vocabulary pass" — listed here for completeness, not proposed as October work):

| Layer | Count | Files | Grade |
|---|---|---|---|
| Route paths | `/jobs`, `/jobs/:id`, `/jobs/:id/edit`, `/jobs/new` | `app/app/routes/jobs*.tsx` (4 files) | Rename is a URL-breaking change — needs redirects if done later, not a same-session find/replace. |
| Convex module/table names | `jobs`, `jobInterests` tables; `jobs.ts` file; `getJobs`/`getJob`/`createJob`/`updateJob`/`closeJob`/`reopenJob`/`expressInterest`/`withdrawInterest`/`getJobInterests`/`getUserJobInterest` (10 exported functions) | `app/convex/jobs.ts` (711 lines), `schema.ts` (2 table defs) | Schema table rename in Convex requires a migration (or dual-write period); not cosmetic. |
| Type-level literal `"job"` in code | `Id<"jobs">` usage | `jobs.$id.tsx:13`, `jobs.$id.edit.tsx`, `InterestModal.tsx:21-24` | Follows from table rename above — mechanical once the table is renamed. |
| In-code UI comments (not user-visible) | `/* Job Title */`, `/* Job Description */` etc. | `jobs._index.tsx` (~7 comments), `jobs.$id.tsx` (~6 comments) | Cosmetic, zero user impact, zero urgency. |
| Analytics event names | `jobs_page_viewed`, `jobs_filters_changed`, `job_viewed` | `jobs._index.tsx`, `jobs.$id.tsx` | Renaming breaks PostHog historical continuity (dashboards/funnels built on old names) — needs a "dual-emit" period or a documented cutover, not a silent rename. |
| Unrelated `crawledJobs` table | `crawledJobs`, `jobScraper.ts`, `crawlerClassifier.ts` etc. (~80 refs across 5 crawler files) | `app/convex/crawler*.ts`, `jobScraper.ts` | **Do not touch** — this is the outbound partner-discovery crawler's own "jobs" (jobs *scraped from other sites*), semantically unrelated to the marketplace "jobs"/"projects" being renamed. A blind repo-wide rename would corrupt this system. |

**Bottom line:** the user-facing collision is already closed by `wonderwall-77w`. What remains is infrastructure-level (`jobs` table → `projects`) and is correctly excluded from October scope per spec §4. If Phase 1B builds "paid projects" as new fields *on* the existing `jobs` table (§2/§3 recommendation — reuse the CRUD, add `kind`/`budget`/`raised`), the collision actually **widens** temporarily (schema says `jobs`, product says "Projects," code says both) until a post-October rename lands. Flag this tradeoff explicitly to product: building on `jobs` is the fast path but banks technical debt the spec already knows about and defers.

---

## 6 · Totals

| Scope item | Effort | Basis |
|---|---|---|
| 1. Membership + Stripe subscriptions | M (3-4d) | New webhook/checkout, profile schema extension, capabilities port |
| 2. Church coverage codes | S/M (2-3d) | New tables, simple redemption logic, grace-period cron |
| 3. Project backing + payout | **L (5-7d)** | No precedent in repo; blocked on architect's Connect-vs-manual call |
| 4. AP Fund allocations ledger | S (1-2d) | Display-only, operator-entered |
| 5. Tables (roster/sessions/RSVP/meeting links) | M (4-5d) | 3rd distinct Stripe pattern (cohort checkout); .ics generation is new |
| 6. Real event RSVPs | S (1-2d) | Extends working `eventApplications`; guest-dedup risk |
| 7. Public story pages | **M (3-4d)** | Blocked on architect's crawlability/prerender call |
| Capabilities server-port + CI wiring (cross-cutting, spec §2) | S/M (2-3d) | Mostly a port of `capabilities.ts`; profile schema fields are the real work |
| **Total** | **~21-30 dev-days** | Sequential estimate; some items parallelize across dev+agents |

**Against a 5-week (25 working-day) solo-plus-agents budget:** the point estimate (21-30d) consumes the entire budget with ~0 slack, and that's *before* two items are cleanly scoped. Cheap-subagent-eligible work (mechanical CRUD extension, e.g. widening `favorites` union, porting `capabilities.ts`, building the AP ledger display) should go to sonnet/haiku per the standing preference, freeing solo-dev time for the two risk items below.

**Two items most likely to blow up:**

1. **Project backing / payout (item 3, L, 5-7d).** This is the only feature touching real money movement to a third party (not just collecting a subscription) and the only one with zero existing code to build on. The architect's Connect-vs-manual-transfer decision is a prerequisite, not a parallel-track detail — starting UI work before that lands risks building the wrong checkout shape (Stripe Connect Express onboarding is a materially different user flow than an operator-mediated manual transfer). Recommend treating this as a hard blocking dependency in the build sequence, not a "lands with the architect report" footnote.

2. **Public story pages (item 7, M, 3-4d nominal — but open-ended if it goes wrong).** The estimate assumes the prerender/crawlability question resolves cleanly; if the answer is "add SSR to one route in an otherwise SPA React Router app," that's an app-wide architecture change disguised as a single-feature estimate. Same pattern as item 3: don't start until the architect's specific mechanism (not just "yes it'll be crawlable") is named.

Both items share a root cause: they were estimated against a UX spec, not an integration architecture, because the architecture isn't written yet. Treat the M/L grades above as provisional pending `architect-gap-analysis.md`.
