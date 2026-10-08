# Tables: IA, architecture, migration, and test plan

Prepared 2026-10-03 on branch `tables`. The MVP is now implemented using Claude’s latest Turn 3 design. See [MVP rollout and handoff](tables-mvp-rollout.md) for shipped behavior, verification, deployment order, compatibility, and deferred work. Production data is unchanged.

The [accepted Tables ADR](../adr/tables-primary-community-container.md) defines the domain direction. This document translates it into the current codebase. The confirmed policies below govern the MVP; remaining phases describe follow-up work.

Codex owns information architecture, domain architecture, reuse, tests, and implementation planning. Claude owns visuals and UX. Coordinate through this contract; avoid concurrent edits to the same route/component files. The implemented UI uses Claude’s Turn 3 design, with shared components and the policies below.

## Confirmed scope and enrollment rules

Rick confirmed on 2026-10-03 that Table is platform-wide. All communities use the shared model; their presentation can use community vocabulary. The storage name `gardenTables` is a compatibility detail, not a Garden-only restriction.

Membership eligibility and Table price are independent:

| Required membership | Table price | Enrollment requirements |
| --- | --- | --- |
| None | Free | Table participation record only. |
| None | One-off fee | Confirmed Table payment; no paid platform/community membership required. |
| Required | Free to members | Eligible membership; no additional Table payment. |
| Required | Additional one-off fee | Eligible membership and confirmed Table payment. |

Table membership records belonging to the group; it is distinct from a community membership entitlement. Rick confirmed that membership-gated Tables require membership in their own community. Store an explicit membership requirement and use the Table's community as its scope; a membership-gated Table must have a community association. Another community's membership does not qualify. Price and schedule are independent: a one-off fee must not automatically imply a recurring membership or a member-only Table.

The shared participation decision must evaluate membership eligibility and payment separately. Open paid Tables must work for people with free accounts. Eligible members still owe any additional Table fee; paying a fee does not bypass an explicit membership gate. Public summaries must distinguish “Free,” “One-off price,” “Included with membership,” and “Membership + additional price.” Do not infer any of these states from a price or schedule alone.

### Creator policy and first release

Rick's direction: a free account can create a free, one-time Table. Charging money or running an ongoing Table takes membership in the Table's community. An approved-host tier is not an additional requirement. Community moderation/pausing still applies to programming published under its name. This applies to creators; people with free accounts can still pay to join an open paid Table.

The latest [discussion brief](../creatives-exchange-discussion-brief.md) already allows free Event posting and requires membership to sell tickets; its ongoing class/coaching rule requires community membership without host status. Legacy Events currently allow a free organizer to save a ticketed draft that cannot be public. Preserve those drafts during transition; the new free-account creation flow offers a free one-time Table. Older host-only/$50 hosting language is superseded.

The first release supports **free enrollment and a fixed one-time enrollment payment**. Donation and pay-what-you-can pricing are future possibilities, not launch requirements. Begin with one-time Tables and manually scheduled series; defer automatic recurrence generation. Recommend one new commercial enrollment price on the Table, covering its included Events, rather than charging both a Table fee and another ticket fee for the same access. Preserve legacy Event ticket tiers/routing through compatibility adapters while deciding their later unified presentation.

### External guests

Guest participation is configured per Table (`allowsExternalGuests`), not globally allowed or globally forbidden. A permitted guest may RSVP to an Event without a paid community membership or account; do not silently create Table Membership from an email. Keep their Event RSVP/payment/attendance history separate from the authenticated Table roster. Additional payment or invitation/approval rules still apply. Disabling guest participation prevents new guest RSVPs, without deleting old attendance or purchases.

For the first release, recommend that member-only Tables keep external guests off. If a host later needs invited guests at a member-only Table, make that an explicit limited invitation/exception, not a flag that silently bypasses the community-membership gate. Whether to include that exception in V1 remains a small product decision.

### Confirmed roster privacy and recommended supporting defaults

Rick confirmed: keep the roster private until guests join. Joining means accepted Table participation with any required community membership and Table payment satisfied; a guest RSVP to an Event alone does not unlock the roster. The roster rule below is confirmed. Public-profile and support-access guidance remains the recommended implementation of that rule.

- Table discoverability is independent of enrollment eligibility: a member-only Table can have a public description and requirements; an invite-private Table is unlisted.
- Roster identities and the relationship “this person belongs to this Table” are private by default. Active, accepted participants who satisfy the Table's membership and payment requirements can see one another's display names and profile links. Pending requests, abandoned checkout, denied applicants, guests and former participants do not grant roster access.
- Public profiles remain public according to the person's profile settings. Hiding a Table's roster does not make each participant's entire public creative profile private. Never show private Table membership on a public profile or in an unrestricted API response.
- Hosts can manage the roster. Contact details, payment state, applications and private attendance history are for the participant themselves and authorized hosts; other participants receive only the roster projection. Moderator/support access must be specifically authorized and scoped.
- External guests receive their own Event logistics/confirmation, not the Table roster. Meeting links remain credential-gated. Public roster sharing should be an explicit later choice, not the initial default.

This policy keeps discovery useful while protecting the private participation relationship.

## Baseline before this MVP

| Domain/surface | Implementation | Reconciliation needed |
| --- | --- | --- |
| Tables | `app/convex/garden/tables.ts`; `gardenTables`, `tableMemberships`, `tableSessions`, `sessionRsvps` in schema | Already has join/leave and a persistent roster. `mode=open/member/cohort` mixes access, schedule, and pricing. Membership has no lifecycle/payment/role fields; leaving deletes it. |
| Table creation | `app/convex/garden/operator.ts` | Operator-only; requires a host organization. No member-facing creation flow. |
| Events | `app/convex/events.ts`, `garden/eventRsvps.ts`, `eventVideo.ts` | Existing guest RSVP, applications, co-hosts, calendar/location/media, tickets and protected video. No Table parent. Preserve IDs and existing consumers. |
| Classes/coaching | `app/convex/offerings.ts`; `offerings`, `offeringSignups`, `offeringReports` | Self-serve creation, schedule descriptions, signup, community pause/report rules, external payment links. Overlaps the proposed Table container. |
| Class payments | `garden/stripe.ts`, `garden/stripeHandlers.ts`, `garden/memberships.ts` | Checkout metadata, signup confirmation and owed ledger reference offering IDs. Historical references must survive migration. |
| Paid/community membership | `garden/entitlements.ts`, `garden/capabilities.ts`, `garden/communities.ts` | Different relationship from belonging to a Table. Keep those identities and authorization scopes distinct. |
| Public routes | `app/app/routes.ts`: `/tables`, `/tables/:slug`, `/offerings`, `/offerings/:offeringId`, `/events`, `/events/:eventId` | Preserve deep links; unify the domain underneath the surfaces before retiring routes. Desk event cards, shortlist, profiles, community pages and share previews are consumers too. |

The live discussion brief and class-payment spec disagree in places with one another and with code. For example, the brief requires community membership for offering a class; the existing mutation requires authentication and, when tagged to a community, `assertCommunityMember`. The creator policy above supersedes the older host-only Table gate and unrestricted offering creation as these objects are reconciled; it is now implemented for canonical Tables; legacy writes remain during the additive rollout.

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
5. Community membership and Table membership remain separate. Each membership-gated Table requires membership in its own community; another community's membership must not authorize it. Open paid Tables must not inherit the legacy `cohort` paid-member gate. Display host labels never grant permissions. Reuse organizer/co-host permissions with an explicit policy for inherited Table hosts and any occurrence-specific hosts.
6. Split `format`, `scheduleType`, `access`, `pricingType`, and lifecycle status. Keep fixed-group enrollment closure separate from paid/community eligibility. Migrate `cohort` only with explicit rules: its existing paid-member gate does not prove invite-only access or a fixed enrollment roster.
7. Use integer `priceCents` plus currency for money. Table capacity and Event capacity are independent. Derived remaining-seat counts need active memberships and unexpired checkout holds; avoid editable duplicate counters without reconciliation.
8. Recurrence yields concrete Events. Store timezone and an occurrence identity; generation must be bounded and idempotent across DST, retries and schedule edits. Editing a series must preserve past attendance and clarify “this occurrence” versus “future occurrences.” Manually scheduled Events can ship before a recurrence engine.
9. Keep public projections separate from private roster/contact/payment data and meeting URLs. Reuse the existing protected `eventVideo` boundary; do not copy secret links onto public Events or Table DTOs. Apply community visibility, Table visibility and viewer policy to every list/detail/profile/join/checkout path.
10. Derive participation segments later from time-bounded attendance and membership history. No Cohort, Course, Program, Workshop or participation-segment entity in the initial model. A service project can reference a creative Project without duplicating its backing/work-ownership model.

Proposed Table fields include owner/co-host identities, community association, explicit membership requirement/scope, title/description/media, the independent configuration axes, host display label, lifecycle/moderation, capacity, price/currency and timestamps. Tables are platform-wide; whether an unassociated Table can be created remains a creator-policy decision. Location and timing belong to Events; Table defaults may initialize new Events but should not retroactively change occurrences. Description-only or prelaunch Tables can have no published Event if that lifecycle is approved.

Keep shared rules in a small domain module: configuration validation, participation decision, viewer permissions, membership transitions, capacity policy and public summaries. Convex queries and mutations call the same rules; the client renders a typed participation result instead of duplicating access/payment logic. Suggested action variants: sign in, join, request approval, accept invitation, checkout, already joined, closed/full, and unavailable. Use structured reasons, not client interpretation of strings.

Reuse existing event validation, location/media/host helpers, moderation rules, payment routing, fee calculation, webhook idempotency and owed ledger interfaces. Extend them where needed instead of copying entire Events or Offerings services. Tighten generated Convex types as the schema evolves; do not expand `any` or create hand-maintained mirrors of generated IDs.

## Migration strategy and delivery slices

### Reconcile the three implementations into one model

| Existing object | Canonical object | Preserve/migrate |
| --- | --- | --- |
| `gardenTables` | Table container | Existing IDs, group identity and roster; normalize independent policy fields. |
| `offerings` | Table container | Program description, creator, community, price, moderation and media; legacy ID mapping for links/checkout/ledger. |
| `tableSessions` | Event occurrence | Exact date/time, title and protected meeting link; map old session IDs to Event IDs. |
| `events` | Event occurrence | Existing Event IDs, organizer/co-hosts, ticket routing, guest RSVP, calendar/location/media and private video; attach a parent Table. |
| `tableMemberships` and `offeringSignups` | Table participation/enrollment | Preserve membership/enrollment lifecycle and payment evidence; never infer actual attendance. |
| `sessionRsvps` and `eventRsvps` | Event RSVP intent | Account and guest paths remain distinguishable; not proof of attendance. |

Tables and Offerings are two implementations of the group/program container. Sessions and Events are two implementations of a scheduled occurrence. A Table and an Event have different responsibilities and should remain separate entities: a six-week class is one Table with six Events; a dinner is one Table with one Event. Use one container service, one occurrence service and one enrollment policy, keeping format labels as configuration.

| Slice | Work | Exit criteria |
| --- | --- | --- |
| 0: decisions and contract | Resolve questions below; agree shared DTOs with design; inventory actual legacy rows and payment references using a read-only tool | Approved rule matrix and migration manifest; no production writes. |
| 1: additive foundation | Table configuration/lifecycle, optional Event relationship, richer membership, typed public/viewer projections; preserve legacy readers | New schema accepts old data; indexed join/update is idempotent; compatibility tests pass. |
| 2: membership and access | Free-account creation of free one-time Tables; membership-gated paid/ongoing creation; independent membership lifecycle, per-Table guest policy, role, approval/invite/fixed-group rules; privacy projections | Actual Convex handler tests cover authorization, hidden communities, creator restrictions, guests, state transitions, capacity and races. |
| 3: occurrences and attendance | Create/link Events; migrate sessions and RSVP intent; record attendance; series ordering and manual schedules; recurrence only if launch requires it | Old session links resolve; history and event permissions survive; RSVP is never counted as attendance. |
| 4: offerings and paid enrollment | Adapt offerings into Tables; migrate signups/moderation; reuse existing checkout/webhook/ledger for fixed one-time payments and seat holds | Historical payments unchanged; no double charge/ledger credit; only confirmed or explicitly operator-verified payment activates paid access. |
| 5: UX integration and retirement | Wire Claude's designs to the shared contract; community/profile/Desk/shortlist/notification/calendar/share consumers; legacy routes/adapters | Complete browse → join → Event → attendance flows; old URLs work; duplicate write paths retired after audit. |

Keep backfill helpers idempotent and batched, with dry-run reports, explicit legacy→canonical mapping IDs, checkpoints and rollback/read-cutover switches. Re-running a migration must not create another Table, membership, Event, RSVP or payment. Do not automatically merge similarly titled legacy Tables and Offerings; name matching cannot establish identity.

Legacy standalone Events can remain unparented temporarily, as the ADR allows. New creation should establish a Table parent once the new flow lands; a one-time event form may do this internally. Decide when to wrap old standalone Events using inventory and preserve their URLs/organizers/media/ticket routing. Do not create an extra Event for an offering with only cadence text and no reliable timestamp.

Offering signups map to enrollment, not attendance. Preserve `pledged` as pending. `confirmed` can mean free enrollment, externally recorded signup, or verified checkout: it is insufficient by itself to establish payment. Keep historical offering IDs in receipts, Stripe metadata and ledger records, and resolve both old and new payment events during cutover. Do not silently transfer existing offering pricing/moderation semantics to the old Table `paymentPending` path, which currently grants membership before payment.

## Test plan

| Level | Required behavior |
| --- | --- |
| Domain tests | All four confirmed membership/price combinations; free-account creators limited to free one-time Tables; paid/ongoing creators need own-community membership; open paid enrollment for a free account; additional fee still required for an eligible member; payment cannot bypass membership; own-community eligibility; per-Table guest allowance; independent format/schedule/access/pricing combinations; unknown config fails closed; host label does not change role; join/leave/rejoin/request/approve/invite; capacity semantics and payment states; explicit clock for expiry/segments. |
| Convex handler/integration tests | Authenticated actor enforcement; community isolation; public/profile visibility; private roster and secret URL redaction; transactional membership uniqueness; concurrent final-seat attempts; paused/archived/full/closed Tables cannot accept new enrollment; viewer query and mutation agree. |
| Migration tests | Realistic fixtures for legacy Tables, Offerings, sessions, signups and standalone Events; second run is a no-op; missing timestamps/owners; partial retries; preserve payment IDs/amounts/routing, permissions and historical participation. |
| Payment tests | Fixed one-time payment only at launch; webhook replay and ordering; unpaid/failed/expired checkout; concurrent duplicate checkout; external unverified payment; hold expiry; cancellation/refund bookkeeping; in-flight payment after pause; historical offering metadata resolution. Stripe test-mode verification remains a separate gate. |
| UI/route tests | Read-only browse and sign-in return intent; server-provided action state; no client-side authorization authority; Event/Table navigation; legacy redirects; date/capacity/price summaries; inaccessible and empty states. |
| E2E | Host creates one-time/series Table; member joins and RSVPs; host records attendance; invitation/approval flows; capacity contention; guest Event flow; paid flow if enabled. Isolate test accounts/data from production. |

The existing Tables tests cover the pure join decision and meeting-link visibility. They do not prove the mutations, indexes, concurrency, or membership persistence work. Add a suitable Convex handler harness before claiming those contracts are tested; keep pure tests for deterministic policy and Playwright for a small number of complete user flows.

Normal application quality gates: `npm test`, `npm run typecheck`, `npm run build`, and targeted `npm run test:e2e` once relevant routes change. Run GitNexus symbol impact before edits and `detect_changes` before each commit. No production deploy/backfill is included in this orientation session.

Orientation baseline: 7 existing test files, 346 tests passed on 2026-10-03 (Tables, Event RSVPs, class payments, Events, offering moderation, hidden-community rules, capabilities). Command: `npm test -- --pool=forks --maxWorkers=1 convex/garden/tables.test.ts convex/garden/eventRsvps.test.ts convex/garden/classPayments.test.ts convex/events.test.ts convex/offeringModeration.test.ts convex/garden/hiddenCommunity.test.ts app/garden/capabilities.test.ts` from `app/`. The sandboxed attempt hit `EMFILE`; the captured run outside that watcher restriction passed. The local pnpm launcher also attempted an automatic dependency reinstall and stopped at its noninteractive confirmation, so npm ran the installed runner directly. This baseline covers existing behavior, not the proposed new model. Typecheck/build/E2E were not run for this documentation-only change.

## Decisions still open

Roster privacy until joining is confirmed above. External guests are Table-configured; recommendation is to defer exceptional guest admission to membership-gated Tables and keep the membership gate strict in V1. The first release's free and fixed one-time pricing is confirmed; donation/pay-what-you-can are deferred, and automatic recurrence remains a later implementation. Rick is considering whether even free Table hosting should require a paid account as a growth/revenue strategy; this is an open alternative, not a change to the currently documented free one-time hosting rule.

### Hosting subscription strategy: recommendation, not a policy change

For the initial launch, keep free one-time hosting and require community membership for paid/ongoing Tables. A paid-hosting gate can create recurring revenue, fund host tools and filter low-intent organizers; it can also reduce the supply of gatherings before organizers experience value and discourage volunteers who bring in new guests. Paying is not proof of host quality, so moderation and identity rules remain separate.

Comparable models show this is a choice rather than a prerequisite: [Meetup](https://help.meetup.com/hc/en-us/articles/39428334646541-Who-pays-for-a-Meetup-group) uses organizer subscriptions and also offers an eligible [limited Starter plan](https://help.meetup.com/hc/en-us/articles/40507261509645-Can-I-organize-a-Meetup-group-for-free); [Luma](https://luma.com/pricing) supports free event hosting with transaction fees for paid events; [Eventbrite](https://www.eventbrite.com/organizer/pricing/) permits free events without organizer fees. These policies do not prove which model would grow our community faster.

Recommendation: let a host run a free one-time Table, bring guests, and experience the product; ask for membership when they continue the program or charge. Track host activation, published Tables, actual attendance, guests who join accounts, repeat hosting and paid enrollment—not membership checkout alone. Test a stronger hosting gate only after those measurements show where value and drop-off occur. This is a product hypothesis, not a measured conclusion about our users.

Follow-up validation for the title change: 132 existing focused fund/card tests passed; `npm run typecheck` and `npm run build` passed after restoring the already-declared missing Phosphor icon package locally. No package manifest or lockfile changed. The build still emits sourcemap/prerender warnings in unchanged files.

Implementation ownership is tracked under Beads epic `wonderwall-t670`; the existing `wonderwall-jxho` decision about offerings versus operator-only Tables remains relevant until the reconciliation is implemented.
