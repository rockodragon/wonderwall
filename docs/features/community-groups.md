# Community Groups — architecture review and build plan

v0.2 · 2026-09-03 · owner: Rick · status: **step 1 built on branch `claude/community-groups-architecture-g76xza`; step 0 is Rick's runbook (`docs/runbooks/step-0-go-live.md`); pay-what-you-want deferred (§3)**

This doc reconciles the four places the "community" idea lives (product plan §6, the creatives.exchange discussion brief, the V1 PRD §16, and the 2026-08-31 money-model decision) against what is actually in `app/convex/`, and turns the result into a build plan. Where an older doc disagrees with this one, this one wins for the community layer; the 2026-08-31 money model (`docs/marketing/web-copy-audit.md` header line) stays canonical for prices and splits.

## 0 · The decision this doc records

- **Communities come back now, not post-V1.** The V1 PRD (2026-08-30) deferred `hostOrgs` to a §16 "reattachment path." That path starts now, with one community.
- **The first community is The Garden — the Kingdom Creatives group.** Provisional name; rename is a data edit, not a migration. The Garden stops being "the platform default" and becomes one named community on creatives.exchange, exactly as the discussion brief §1 proposed.
- **A host can create a community** (self-serve), replacing "communities are provisioned by us" (brief §3.6). Guardrail: new communities are `pending` until an operator approves them for public listing, reusing the waitlist-approval posture already in the app.
- **Everything the base platform does is available inside a community**: projects, events, tables and sessions, classes and offerings, announcements, coverage codes, a public fund ledger, and a grant program. Content stays owned by the person (one account, portable identity) and is *tagged* to a community, never owned by it.
- **Launch shape (Rick, 2026-09-03): the platform plus one visible, faith-based community.** creatives.exchange launches with The Garden (Kingdom creatives) as the only listed community. Anyone can apply to host their own; operators review by hand and start approving around November.
- **Membership is the asked price, plus a separate way to add to the pool.** Pay-what-you-want checkout is deferred (§3). A seat is $10, five is $25, Leader is $50, exactly as priced. Anyone who wants to put more in uses a separate "Add to the project pool" button, a one-time payment on the platform's Stripe. It is a contribution to the pool, never a donation.

## 1 · What the docs say, and where they disagree

| Source | Date | Says | Status after this doc |
|---|---|---|---|
| `the-garden-product-plan.md` §2, §6 | Aug 9 | Tiers seat/five/host, 40/50/10 dues split, Garden-as-default-host, tenancy invisible until a second community | Tiers and capability matrix stand. 40/50/10 and Garden-as-default are superseded (already flagged in its banner). |
| `creatives-exchange-discussion-brief.md` | Aug 13 | Communities visible on top of the platform; one seat = platform-wide standing; no default community; per-community pool by default; communities provisioned by us | Adopted, except provisioning: hosts self-serve with operator approval. |
| `phase-1b/*` (spec, architect, dev inventory) | Aug 12–13 | The Nov 6 seven; W1 money foundation code-complete, awaiting live Stripe/Convex | Still the integration blueprint; W1 exit is step 0 below. |
| `the-exchange-v1-prd.md` §12, §15, §16 | Aug 30 | No `hostOrgs` in V1; flat $10 only; 50/50 grant/platform; communities reattach later | §16 reattachment begins now. Flat-only pricing superseded by the Aug 31 tiers; the 50/50 dues split is now written to a ledger (§3). |
| Aug 31 money model (web-copy audit, playbook, `community-grant-pools.md`) | Aug 31 | Seat $10 · $25 five · $50 Leader for grant programs · hosting free, 90/10 on what a host sells · receipt "$5 funds other creatives' projects · $5 runs the place" · "Donate" only on the General Grant Fund (AP 501(c)(3), out-link) · community grant pools are Phase 2, nothing built | Canonical. This doc adds the pool-contribution button and the inflow ledger on top of it. |

Two contradictions to close explicitly:

1. **Self-serve vs provisioned.** Brief §3.6 said provisioned. The ask now is that a host creates the group. Resolution: self-serve create, `pending` until approved, and the host owns it from creation.
2. **Whose seat is it.** `memberships.hostOrgId` is a required field today, which encodes "membership belongs to a community." The brief §5.6 (and the IA page at `/ia`) say a seat is platform membership, not community membership. Resolution: the field becomes optional and stops being written for new seats. Entitlements already ignore it, so this is a schema loosening, not a behavior change.

## 2 · What is actually built (audited 2026-09-03)

Real, tested, in `app/convex/garden/` and `app/convex/schema.ts`:

| Piece | State | Community-ready? |
|---|---|---|
| `hostOrgs` | name, slug, kind, givingUrl, paymentLinkUrl, stripeCustomerId. Seeded rows: `the-garden` (kind platform), `abiding-practice`. No create mutation, only seeds. | **Half.** Needs description, cover, owner, status, visibility, join policy. |
| `memberships` + Stripe | Checkout action (fixed Stripe price per level, quantity 1), webhook state machine, nightly reconcile, 25 fixture tests. `/join` still submits to the waitlist; checkout is not wired in the UI. | Works. Dues shares were not recorded anywhere until the ledger in §3. |
| `coverageCodes` + `/c/:code` | Redemption path built; church checkout creation is a stub. | Yes, already per-hostOrg. Note the `/c/` prefix is taken, so community pages cannot live at `/c/:slug`. |
| `allocations` + `/fund/:slug` | Operator-entered public ledger per hostOrg. | Yes, already per-hostOrg. This is the only grant surface that exists. |
| `gardenTables`, sessions, RSVPs, `/tables` | Operator-created tables per hostOrg; roster-gated meeting links. | Yes, already per-hostOrg. Listing does not show which community a table belongs to. |
| `projects`, `events`, `offerings`, `announcements` | User-owned; **no community field on any of them.** `offerings` was deliberately built without hostOrgs. | **No.** Each needs an optional `hostOrgId` plus a filter. |
| Capability service (`can()`), server-side | Levels visitor/free/seat/five/host, 86-assertion matrix, `assertCan` on gated mutations. `pool.propose` is defined but nothing consumes it. | Yes. Community role checks (host/moderator) are new. |
| Community membership (user ↔ community) | **Does not exist.** | Needs a `communityMembers` table. |
| Community page, host create flow, community filter in browse | **Do not exist.** Only `/fund/:slug` and the admin operator panel touch hostOrgs. | New routes. |
| Grant pools (Leader tier) | Spec pinned in `community-grant-pools.md`; **0% built.** Depends on Stripe Connect (Phase 3). | Concierge for Nov 6 (§4). |
| General Grant Fund accounting ($5 of every seat) | **Not tracked anywhere in code.** It is receipt copy only; no ledger row is written when dues arrive. | Needs a contributions ledger (§3). |

Live-verification gate still open (bead `wonderwall-7r4`, W1): `npx convex dev` codegen against the current schema, test-mode Stripe keys, three prices, webhook endpoint, and the `the-garden` seed. Nothing money-related can be exercised end to end until that is done, and it needs Rick's logins.

## 3 · Money in — the asked price, a separate pool button, and a ledger

**Pay-what-you-want is deferred (Rick, 2026-09-03).** The reasons, for the record: Stripe Checkout can't do choose-your-amount on a recurring price, so it needs ad-hoc prices and an in-app "change my amount" path; and on the sites that offer it (Patreon's custom pledge, Ko-fi, Buy Me a Coffee, public-radio style memberships) the large majority of people take a preset, and the custom-amount minority mostly gives *less*, not more. Fixed tiers plus a separate "give extra" action is the standard shape, and it is what we ship.

**What ships instead:**

- **The asked price.** `/join` sells seat $10 · five $25 · Leader $50 through the existing subscription checkout. No amount picker.
- **"Add to the project pool."** A separate one-time payment button on the pool's public fund page (`/fund/creatives-exchange`, and a community's own `/fund/:slug` once it runs a pool). Presets $10 / $25 / $50 / $100 plus a custom amount, $5 minimum. Guests can pay. Words on this lane: *fund, back, add to the pool*. Never *donate*, *gift*, or *tax-deductible*; those belong to the AP out-link lane only.
- **The ledger.** `grantContributions` records every dollar in, typed (`dues_share`, `contribution_in`, `topup_in`, `sponsor_in`, `entry_fee_in`, `adjustment`), with `grossCents`, `platformCents`, and `poolCents` on every row so the math is auditable line by line. `allocations` stays the money out. The fund page shows money in by type, money out, and the balance. This is what makes "run one grant by hand" trustworthy: the operator awards by hand, but the pool balance is a number the ledger computed, not a spreadsheet.
- **Dues shares land automatically.** On every paid Stripe invoice for a membership, the webhook writes a `dues_share` row: 50% to the pool, 50% platform including processing. Renewals count because the hook is `invoice.paid`, not the first checkout.

**Fee decision (what we decided, and the recommendation to keep it).** The rule on record since Aug 31 is *one bite per dollar*: the platform takes 10% once, when money first moves, and that 10% includes card processing. Stripe's ~2.9% + 30¢ means the platform nets about 7% on a $100 contribution and less on small ones (about 4% on $10). That is thin, but the 10% is already the public promise ("90% reaches the work", playbook and about pages), and changing it means changing the copy everywhere. Recommendation: keep 10% including processing, set the $5 minimum so the 30¢ fixed fee can't eat the margin, and revisit only with volume data. The lever other platforms use for exactly this problem is an optional "cover the processing fee" checkbox at checkout; add it later if the net matters, not now. Dues stay 50/50 as published; processing comes out of the platform's half.

**Legal line, restated.** Everything on the platform's Stripe (Reveal Brand, Inc. as merchant of record) is a membership fee or a pool contribution. Only the AP-administered General Grant Fund, reached by out-link, is a donation and tax-deductible. How and whether the platform pool is transferred into AP's fund is the CPA question under `wonderwall-sxi`; until it is answered, the pool is the platform's and the copy says so.

## 4 · Grant programs — where they stand

| Program | Spec | Built | Nov 6 answer |
|---|---|---|---|
| Platform project pool (the $5 of every seat, plus pool contributions) | Receipt copy; PRD §15 says 50% of dues; allocation decided manually | **Built (step 1):** `grantContributions` inflows from `invoice.paid` and the pool button, `allocations` outflows, balance on `/fund/creatives-exchange`. | Run the first grant by hand: award from the balance the ledger shows, record it as an allocation, it publishes. |
| Community grant pools (Leader tier, $50/mo) | `community-grant-pools.md`: pledge per revenue product as **percent of price or fixed dollars per payment**, four inflow types, one-bite fee rule, locked sub-balance on the host's Connect account, award-by deadline, $25 minimum, W-9 above $600, skill-based only | Nothing. `pool.propose` exists as a capability with no consumer. | Concierge, per the spec's own §8: collect the pledge inside a cohort price, track it in the existing admin allocations surface, award by hand, publish on `/fund/:slug`. Real rails follow Stripe Connect in Phase 3. |

The percent-or-fixed pledge configuration is fully specified and not implemented; it needs Stripe Connect. What is implemented is the accounting underneath it: a community's pool is just `grantContributions` rows with that community's `hostOrgId`, so when pledges arrive they write into the same ledger.

## 5 · Build plan and status

**Step 0 — clear the money gate (Rick, about an hour).** Runbook with exact commands: `docs/runbooks/step-0-go-live.md`. Convex login and codegen, Stripe test keys, `scripts/stripe-bootstrap.ts` (creates the three prices and the webhook with the five events), `garden/devSeed:seedCommunityLaunch` (platform row, The Garden as a community, Abiding Practice). Blocks every money check below; nothing in step 1 needs it.

**Step 1 — communities and the ledger. Built 2026-09-03 on this branch.**

1. `hostOrgs` extended (tagline, description, cover, website, location, owner, status, visibility, joinPolicy, applicantNote). Kinds: `community`, `platform`, `org`, `church`. The Garden is re-kinded to a community by the seed; `creatives-exchange` is the unlisted platform row that owns the pool.
2. `communityMembers` (host / moderator / member; active / pending / removed; one home community).
3. Optional `hostOrgId` on `projects`, `events`, `offerings` with a "post to a community" picker on each create form and a quiet community line on cards. Tables and allocations already carried it.
4. Routes: `/communities` (directory), `/communities/:slug` (page: hosts, join, tables, events, projects, classes, fund, host tools), `/communities/apply` (application, lands pending), approvals in `/admin/garden`. Communities in both navs.
5. Capability `community.create` (any signed-in account; hosting is free). Host-only actions check `communityMembers.role`.
6. Ledger: `grantContributions`, `invoice.paid` and `pool_contribution` webhook handlers with replay tests, `createPoolContributionCheckout`, fund page money-in section and "Add to the project pool" button, operator `recordContribution` for top-ups, sponsors, entry fees, adjustments.
7. `memberships.hostOrgId` optional; self-paid seats no longer name a community.

Exit (to run after step 0): a test-mode $10 seat yields an active membership and a `dues_share` row of 500 pool cents; a $25 pool contribution yields a `contribution_in` row of 2250 pool cents and 250 platform cents; a new account applies to host, an operator approves, a member joins The Garden and posts a project and an event into it, and both show on the community page.

**Step 2 — pay-what-you-want checkout. Deferred (§3).** Revisit only if the pool button sees real use and members ask to make it recurring.

**Step 3 — community grant programs (Leader tier), after Stripe Connect.** `grantPrograms` (`hostOrgId`, `pledgeType` percent | fixed, `pledgeValue`, `awardBy`, `rolloverTo`, `selectionMode`, `status`) and `grantProposals`; awards written as `allocations`. Pledges write `grantContributions` rows at charge time inside the same webhook path, so the only new rail is the Connect sub-balance. Until then, concierge per §4.

## 6 · Gaps and risks to keep in view

- **`/c/` is taken by coverage codes.** Community pages live at `/communities/:slug`; do not reuse `/c/`.
- **Two events surfaces still exist** (`/events` legacy and `/garden/events`). Community-tagging events should target the surface the V1 PRD §5 keeps, not both.
- **`offerings` was built to avoid hostOrgs.** Adding the optional field is safe; the "post to community" picker is the only UI change.
- **Public copy still contradicts the model** in `garden._index.tsx` and `join.tsx` ("waived once a table charges," "half of every membership"). Step 2 replaces `/join`; the landing copy is a one-line fix to do at the same time.
- **If pay-what-you-want ever ships, it needs an in-app "change my amount" path** (the Stripe portal can't edit ad-hoc prices). One more reason it is deferred.
- **Webhook coverage.** Dues shares depend on `invoice.paid` being enabled on the Stripe endpoint (the bootstrap script does this). The nightly reconcile sweep repairs membership state, not invoices; a missed invoice event is an operator adjustment.

## 7 · Line items for sale, and the operator ledger (added 2026-09-03, evening)

Navigation and shell decisions for the community layer (one app shell, a community switcher under the wordmark, no chip rows, The Garden's framing) live in [`community-ux.md`](community-ux.md).

**A community sells products.** Any number, each at its own price, one-time or monthly: a premium circle, a resource bundle, a cohort seat. Each product carries gated **resources** (private links) that only a buyer with current access, the community's hosts, or an operator ever receive; the public listing shows the count, never the links. Hosts manage products from their community page. Buyers check out on the platform's Stripe; monthly products require sign-in so the subscription follows the account.

**Money on a sale.** Host 90% / platform 10% including processing, the published split for anything a host sells, recorded on every `productPurchases` row (one row per payment: the checkout, then each renewal invoice). The host share accrues as **owed**; there is no payout rail until Stripe Connect, so an operator records each manual transfer as a `hostPayouts` row and the owed figure nets it out. Access follows the row: one-time purchases are forever, subscriptions lapse a week after their last paid period unless renewed.

**The operator ledger, `/admin/ledger`.** One page that answers the money questions from the tables that already exist: fees collected by source and by month (dues shares, pool contributions, host sales; event tickets show gross with "split not recorded"), pool balances per organization, host earnings and payouts owed per community with a record-payout form, members per community broken down by platform seat level (free, seat, five, Leader, covered, home), platform-wide seats and coverage codes, and a recent money-events feed. Hosts see their own slice on their community page.

**Not in this round.** Refunds still need an operator adjustment; there is no self-serve cancel for monthly products (Stripe's portal handles it once the billing portal action exists); tickets keep their pre-existing no-split record.
