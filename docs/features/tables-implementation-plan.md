# Tables: IA, architecture, migration, and test plan

Prepared 2026-10-03 on branch `tables`. Planning only; application behavior and production data are unchanged.

The [accepted Tables ADR](../adr/tables-primary-community-container.md) defines the domain direction. This document translates it into the current codebase. Recommendations below are provisional where a product decision remains open.

Codex owns information architecture, domain architecture, reuse, tests, and implementation planning. Claude owns visuals and UX. Coordinate through this contract; avoid concurrent edits to the same route/component files. No design changes are included in this planning pass.

## What exists today

| Domain/surface | Implementation | Reconciliation needed |
| --- | --- | --- |
| Tables | `app/convex/garden/tables.ts`; `gardenTables`, `tableMemberships`, `tableSessions`, `sessionRsvps` in schema | Already has join/leave and a persistent roster. `mode=open/member/cohort` mixes access, schedule, and pricing. Membership has no lifecycle/payment/role fields; leaving deletes it. |
| Table creation | `app/convex/garden/operator.ts` | Operator-only; requires a host organization. No member-facing creation flow. |
| Events | `app/convex/events.ts`, `garden/eventRsvps.ts`, `eventVideo.ts` | Existing guest RSVP, applications, co-hosts, calendar/location/media, tickets and protected video. No Table parent. Preserve IDs and existing consumers. |
| Classes/coaching | `app/convex/offerings.ts`; `offerings`, `offeringSignups`, `offeringReports` | Self-serve creation, schedule descriptions, signup, community pause/report rules, external payment links. Overlaps the proposed Table container. |
| Class payments | `garden/stripe.ts`, `garden/stripeHandlers.ts`, `garden/memberships.ts` | Checkout metadata, signup confirmation and owed ledger reference offering IDs. Historical references must survive migration. |
| Paid/community membership | `garden/entitlements.ts`, `garden/capabilities.ts`, `garden/communities.ts` | Different relationship from belonging to a Table. Keep those identities and authorization scopes distinct. |
| Public routes | `app/app/routes.ts`: `/tables`, `/tables/:slug`, `/offerings`, `/offerings/:offeringId`, `/events`, `/events/:eventId` | Preserve deep links; unify the domain underneath the surfaces before retiring routes. Desk event cards, shortlist, profiles, community pages and share previews are consumers too. |

The live discussion brief and class-payment spec disagree in places with one another and with code. For example, the brief requires community membership for offering a class; the existing mutation requires authentication and, when tagged to a community, `assertCommunityMember`. The accepted ADR does not specify creator eligibility. Resolve that rule explicitly before enforcing it.

Existing Table roster names are public, while offering signup details are creator/admin-only. An ADR access value such as `invite` does not by itself answer whether the Table, roster, or profile membership is public. Do not inherit one of these contradictory privacy policies accidentally.

No checked-in attendance model was found. Existing RSVP/signup records describe intent or enrollment, not observed attendance.

## Proposed information architecture

Tables answer “what can I belong to?” Events answer “what is happening, and when?” Keep both browse intents available; Events are occurrences of the same Tables, rather than a second source of community containers.

| User intent | Domain destination | Contract for design |
| --- | --- | --- |
| Discover a group/program | Table browse/detail | Format, access, schedule, pricing, host label, next Event, session count and capacity are independent facets. |
| Find an occurrence | Event/calendar browse/detail | Date, venue/online state, RSVP/attendance state, and a link to its parent Table. |
| Return to my groups | Your Tables | Active Table memberships; historical participation is separate. |
| Start something | Set a Table | Container configuration plus first Event when appropriate; creator permission is server-enforced. |
| Participate | Pull Up a Chair | Join/request/invite/checkout decision comes from server state. Event RSVP remains a separate operation. |
| Run a Table | Host management | Roster, requests, Events, attendance, invitations, moderation and enrollment/payment state. |

Canonical public URLs should retain `/tables/:slug` and `/events/:eventId`. Slug edits need aliases; existing offering links need permanent resolution to their corresponding Table once migration is complete. Reconcile community-specific vocabulary before replacing platform-wide “Learn” or community navigation. Communities remain the parent organizational/discovery layer, not another name for a Table.

## Domain and reuse recommendations

1. Evolve `gardenTables` as the canonical container initially, preserving existing IDs. Expose a neutral TypeScript `CommunityTable` contract. A physical rename to `tables` is not required to deliver the ADR and would invalidate typed Convex IDs.
2. Add optional `tableId` to existing `events` for the compatibility period. Events become the canonical occurrence records. Retire `tableSessions` after each old session has a mapped Event; do not maintain two independent schedules long term.
3. Keep `tableMemberships` as the unique logical relationship per Table/user, with explicit lifecycle, role, enrollment/payment state, and timestamps. Preserve leave/rejoin history through transitions/history records rather than interpreting a deleted row as “never participated.” Convex indexes do not enforce uniqueness; indexed lookup and write must occur in the same mutation.
4. Keep existing Event RSVP/ticket/application concepts. Add actual attendance records keyed to Event/person, with checked-in/attended status, timestamp and recorder/provenance. RSVP, membership, payment and attendance are separate facts; never infer attendance from an RSVP or migration.
5. Community membership and Table membership remain separate. Access checks must use the Table's own community; another community's paid seat must not authorize it. Display host labels never grant permissions. Reuse organizer/co-host permissions with an explicit policy for inherited Table hosts and any occurrence-specific hosts.
6. Split `format`, `scheduleType`, `access`, `pricingType`, and lifecycle status. Keep fixed-group enrollment closure separate from paid/community eligibility. Migrate `cohort` only with explicit rules: its existing paid-member gate does not prove invite-only access or a fixed enrollment roster.
7. Use integer `priceCents` plus currency for money. Table capacity and Event capacity are independent. Derived remaining-seat counts need active memberships and unexpired checkout holds; avoid editable duplicate counters without reconciliation.
8. Recurrence yields concrete Events. Store timezone and an occurrence identity; generation must be bounded and idempotent across DST, retries and schedule edits. Editing a series must preserve past attendance and clarify “this occurrence” versus “future occurrences.” Manually scheduled Events can ship before a recurrence engine.
9. Keep public projections separate from private roster/contact/payment data and meeting URLs. Reuse the existing protected `eventVideo` boundary; do not copy secret links onto public Events or Table DTOs. Apply community visibility, Table visibility and viewer policy to every list/detail/profile/join/checkout path.
10. Derive participation segments later from time-bounded attendance and membership history. No Cohort, Course, Program, Workshop or participation-segment entity in the initial model. A service project can reference a creative Project without duplicating its backing/work-ownership model.

Proposed Table fields include owner/co-host identities, optional community association (pending scope decision), title/description/media, the independent configuration axes, host display label, lifecycle/moderation, capacity, price/currency and timestamps. Location and timing belong to Events; Table defaults may initialize new Events but should not retroactively change occurrences. Description-only or prelaunch Tables can have no published Event if that lifecycle is approved.

Keep shared rules in a small domain module: configuration validation, participation decision, viewer permissions, membership transitions, capacity policy and public summaries. Convex queries and mutations call the same rules; the client renders a typed participation result instead of duplicating access/payment logic. Suggested action variants: sign in, join, request approval, accept invitation, checkout, already joined, closed/full, and unavailable. Use structured reasons, not client interpretation of strings.

Reuse existing event validation, location/media/host helpers, moderation rules, payment routing, fee calculation, webhook idempotency and owed ledger interfaces. Extend them where needed instead of copying entire Events or Offerings services. Tighten generated Convex types as the schema evolves; do not expand `any` or create hand-maintained mirrors of generated IDs.

## Migration strategy and delivery slices

| Slice | Work | Exit criteria |
| --- | --- | --- |
| 0: decisions and contract | Resolve questions below; agree shared DTOs with design; inventory actual legacy rows and payment references using a read-only tool | Approved rule matrix and migration manifest; no production writes. |
| 1: additive foundation | Table configuration/lifecycle, optional Event relationship, richer membership, typed public/viewer projections; preserve legacy readers | New schema accepts old data; indexed join/update is idempotent; compatibility tests pass. |
| 2: membership and access | Self-serve creation under agreed policy; independent membership lifecycle, role, approval/invite/fixed-group rules; free join/leave | Actual Convex handler tests cover authorization, hidden communities, state transitions, capacity and races. |
| 3: occurrences and attendance | Create/link Events; migrate sessions and RSVP intent; record attendance; series ordering and manual schedules; recurrence only if launch requires it | Old session links resolve; history and event permissions survive; RSVP is never counted as attendance. |
| 4: offerings and paid enrollment | Adapt offerings into Tables; migrate signups/moderation; reuse existing checkout/webhook/ledger; add seat holds only if paid MVP is required | Historical payments unchanged; no double charge/ledger credit; only confirmed or explicitly operator-verified payment activates paid access. |
| 5: UX integration and retirement | Wire Claude's designs to the shared contract; community/profile/Desk/shortlist/notification/calendar/share consumers; legacy routes/adapters | Complete browse → join → Event → attendance flows; old URLs work; duplicate write paths retired after audit. |

Keep backfill helpers idempotent and batched, with dry-run reports, explicit legacy→canonical mapping IDs, checkpoints and rollback/read-cutover switches. Re-running a migration must not create another Table, membership, Event, RSVP or payment. Do not automatically merge similarly titled legacy Tables and Offerings; name matching cannot establish identity.

Legacy standalone Events can remain unparented temporarily, as the ADR allows. New creation should establish a Table parent once the new flow lands; a one-time event form may do this internally. Decide when to wrap old standalone Events using inventory and preserve their URLs/organizers/media/ticket routing. Do not create an extra Event for an offering with only cadence text and no reliable timestamp.

Offering signups map to enrollment, not attendance. Preserve `pledged` as pending. `confirmed` can mean free enrollment, externally recorded signup, or verified checkout: it is insufficient by itself to establish payment. Keep historical offering IDs in receipts, Stripe metadata and ledger records, and resolve both old and new payment events during cutover. Do not silently transfer existing offering pricing/moderation semantics to the old Table `paymentPending` path, which currently grants membership before payment.

## Test plan

| Level | Required behavior |
| --- | --- |
| Domain tests | Independent format/schedule/access/pricing combinations; unknown config fails closed; host label does not change role; join/leave/rejoin/request/approve/invite; capacity semantics and payment states; explicit clock for expiry/segments. |
| Convex handler/integration tests | Authenticated actor enforcement; community isolation; public/profile visibility; private roster and secret URL redaction; transactional membership uniqueness; concurrent final-seat attempts; paused/archived/full/closed Tables cannot accept new enrollment; viewer query and mutation agree. |
| Migration tests | Realistic fixtures for legacy Tables, Offerings, sessions, signups and standalone Events; second run is a no-op; missing timestamps/owners; partial retries; preserve payment IDs/amounts/routing, permissions and historical participation. |
| Payment tests, if in MVP | Webhook replay and ordering; unpaid/failed/expired checkout; concurrent duplicate checkout; external unverified payment; hold expiry; cancellation/refund bookkeeping; in-flight payment after pause; historical offering metadata resolution. Stripe test-mode verification remains a separate gate. |
| UI/route tests | Read-only browse and sign-in return intent; server-provided action state; no client-side authorization authority; Event/Table navigation; legacy redirects; date/capacity/price summaries; inaccessible and empty states. |
| E2E | Host creates one-time/series Table; member joins and RSVPs; host records attendance; invitation/approval flows; capacity contention; guest Event flow; paid flow if enabled. Isolate test accounts/data from production. |

The existing Tables tests cover the pure join decision and meeting-link visibility. They do not prove the mutations, indexes, concurrency, or membership persistence work. Add a suitable Convex handler harness before claiming those contracts are tested; keep pure tests for deterministic policy and Playwright for a small number of complete user flows.

Normal application quality gates: `npm test`, `npm run typecheck`, `npm run build`, and targeted `npm run test:e2e` once relevant routes change. Run GitNexus symbol impact before edits and `detect_changes` before each commit. No production deploy/backfill is included in this orientation session.

Orientation baseline: 7 existing test files, 346 tests passed on 2026-10-03 (Tables, Event RSVPs, class payments, Events, offering moderation, hidden-community rules, capabilities). Command: `npm test -- --pool=forks --maxWorkers=1 convex/garden/tables.test.ts convex/garden/eventRsvps.test.ts convex/garden/classPayments.test.ts convex/events.test.ts convex/offeringModeration.test.ts convex/garden/hiddenCommunity.test.ts app/garden/capabilities.test.ts` from `app/`. The sandboxed attempt hit `EMFILE`; the captured run outside that watcher restriction passed. The local pnpm launcher also attempted an automatic dependency reinstall and stopped at its noninteractive confirmation, so npm ran the installed runner directly. This baseline covers existing behavior, not the proposed new model. Typecheck/build/E2E were not run for this documentation-only change.

## Questions to resolve before implementation

1. Is the Table model platform-wide (with community-specific vocabulary), or is this launch specifically for The Garden? Recommendation: common model with Garden labels; retain Communities as organizational containers.
2. Who can set a Table: any signed-in person, a member of its community, or an approved host? Does paid versus free programming change eligibility? Recommendation: agree one explicit rule matrix, preserving public/free Event creation during migration.
3. Can a guest RSVP to an open Table's Event without joining the Table, or does every participation require an account and Table membership? Recommendation: preserve guest RSVP as separate participation; never silently create account-level membership from an email.
4. Must paid Tables, donations/pay-what-you-can, and automatic recurring schedules ship in the first usable release? Recommendation: ship free one-time/series Tables with manual Event scheduling first, then confirmed paid enrollment through the existing checkout/ledger.
5. For private/member Tables, who can see the Table, member names and profile membership? Recommendation: make this an explicit visibility policy rather than treating every gated Table as public or every gated Table as secret.

Implementation ownership is tracked under Beads epic `wonderwall-t670`; the existing `wonderwall-jxho` decision about offerings versus operator-only Tables remains relevant until the reconciliation is implemented.
