# Community Groups — architecture review and build plan

v0.1 · 2026-09-03 · owner: Rick · status: **reviewed; ready to build step 1 once the Stripe/Convex gate (§5, step 0) is cleared**

This doc reconciles the four places the "community" idea lives (product plan §6, the creatives.exchange discussion brief, the V1 PRD §16, and the 2026-08-31 money-model decision) against what is actually in `app/convex/`, and turns the result into a build plan. Where an older doc disagrees with this one, this one wins for the community layer; the 2026-08-31 money model (`docs/marketing/web-copy-audit.md` header line) stays canonical for prices and splits.

## 0 · The decision this doc records

- **Communities come back now, not post-V1.** The V1 PRD (2026-08-30) deferred `hostOrgs` to a §16 "reattachment path." That path starts now, with one community.
- **The first community is The Garden — the Kingdom Creatives group.** Provisional name; rename is a data edit, not a migration. The Garden stops being "the platform default" and becomes one named community on creatives.exchange, exactly as the discussion brief §1 proposed.
- **A host can create a community** (self-serve), replacing "communities are provisioned by us" (brief §3.6). Guardrail: new communities are `pending` until an operator approves them for public listing, reusing the waitlist-approval posture already in the app.
- **Everything the base platform does is available inside a community**: projects, events, tables and sessions, classes and offerings, announcements, coverage codes, a public fund ledger, and a grant program. Content stays owned by the person (one account, portable identity) and is *tagged* to a community, never owned by it.
- **Membership is pay-what-you-want with a floor.** A seat starts at $10/mo; a member can choose any higher monthly amount. Everything above the floor is additional grant dollars (§3).

## 1 · What the docs say, and where they disagree

| Source | Date | Says | Status after this doc |
|---|---|---|---|
| `the-garden-product-plan.md` §2, §6 | Aug 9 | Tiers seat/five/host, 40/50/10 dues split, Garden-as-default-host, tenancy invisible until a second community | Tiers and capability matrix stand. 40/50/10 and Garden-as-default are superseded (already flagged in its banner). |
| `creatives-exchange-discussion-brief.md` | Aug 13 | Communities visible on top of the platform; one seat = platform-wide standing; no default community; per-community pool by default; communities provisioned by us | Adopted, except provisioning: hosts self-serve with operator approval. |
| `phase-1b/*` (spec, architect, dev inventory) | Aug 12–13 | The Nov 6 seven; W1 money foundation code-complete, awaiting live Stripe/Convex | Still the integration blueprint; W1 exit is step 0 below. |
| `the-exchange-v1-prd.md` §12, §15, §16 | Aug 30 | No `hostOrgs` in V1; flat $10 only; 50/50 grant/platform; communities reattach later | §16 reattachment begins now. Flat-only pricing superseded by the Aug 31 tiers and by pay-what-you-want. |
| Aug 31 money model (web-copy audit, playbook, `community-grant-pools.md`) | Aug 31 | Seat $10 · $25 five · $50 Leader for grant programs · hosting free, 90/10 on what a host sells · receipt "$5 funds other creatives' projects · $5 runs the place" · "Donate" only on the General Grant Fund (AP 501(c)(3), out-link) · community grant pools are Phase 2, nothing built | Canonical. This doc adds the pay-more rule on top of it. |

Two contradictions to close explicitly:

1. **Self-serve vs provisioned.** Brief §3.6 said provisioned. The ask now is that a host creates the group. Resolution: self-serve create, `pending` until approved, and the host owns it from creation.
2. **Whose seat is it.** `memberships.hostOrgId` is a required field today, which encodes "membership belongs to a community." The brief §5.6 (and the IA page at `/ia`) say a seat is platform membership, not community membership. Resolution: the field becomes optional and stops being written for new seats. Entitlements already ignore it, so this is a schema loosening, not a behavior change.

## 2 · What is actually built (audited 2026-09-03)

Real, tested, in `app/convex/garden/` and `app/convex/schema.ts`:

| Piece | State | Community-ready? |
|---|---|---|
| `hostOrgs` | name, slug, kind, givingUrl, paymentLinkUrl, stripeCustomerId. Seeded rows: `the-garden` (kind platform), `abiding-practice`. No create mutation, only seeds. | **Half.** Needs description, cover, owner, status, visibility, join policy. |
| `memberships` + Stripe | Checkout action (fixed Stripe price per level, quantity 1), webhook state machine, nightly reconcile, 25 fixture tests. `/join` still submits to the waitlist; checkout is not wired in the UI. | Works, but no amount is recorded and the price is fixed. Pay-more needs a new checkout shape (§3). |
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

## 3 · Pay-what-you-want membership (new rule)

**Rule.** Every level has a floor (seat $10, five $25, Leader $50). At checkout the member picks a monthly amount at or above the floor: preset chips ($10 · $15 · $25 · $50) plus a custom field, validated server-side. Everything above the floor is **additional grant dollars**: it goes to the project pool the member's floor already feeds, on top of the pool's normal share.

**Receipt.** The split strip stays two cells and stays honest: a $25 seat reads "$5 runs the place · $20 funds other creatives' projects." The platform's share never rises with the member's generosity.

**Stripe shape.** Stripe Checkout cannot do "customer chooses amount" on a recurring price, so `createMembershipCheckout` takes `monthlyCents`, checks it against the floor for the level, and builds an ad-hoc recurring `price_data` on a fixed Product per level. Metadata carries `level`, `floorCents`, `monthlyCents`. The membership row gains `amountCents`. Changing the amount later is an in-app action that swaps the subscription item's price (the Stripe billing portal cannot edit ad-hoc prices), so "change my amount" is a small mutation, not a portal link.

**Ledger.** A `grantContributions` table records every inflow to a pool as a typed event, per the vocabulary already fixed in `community-grant-pools.md` §4: `dues_share` (the floor's $5), `member_extra` (everything above the floor), `topup_in`, `sponsor_in`, `entry_fee_in`. Rows are written on Stripe `invoice.paid` (a webhook type the handler does not process today), keyed by invoice id for idempotency, so monthly renewals count and refunds can be clawed back with an `adjustment`. Awards out continue to be `allocations`.

**Two decisions Rick owns before step 2 ships:**

- **Processing fees on the extra.** Options: (a) the platform absorbs Stripe's fee out of its $5 and the receipt shows the full extra, or (b) apply the "one bite per dollar" rule from the pools doc and take 10% of the extra. (a) matches the receipt the member expects; (b) matches the rule already written. Recommendation: (a) for member extras, (b) for sponsor top-ups and entry fees, which is what the pools doc already says.
- **Which pool the extra feeds.** Until community pools exist, all dues shares and extras feed the platform project pool. When a community runs its own program (Leader tier), a member who has named that community as home routes there instead. Important legal line: money that moves through the platform's Stripe (Reveal Brand, Inc. as merchant of record) is **never** called a donation and is never presented as tax-deductible. "Donate" stays reserved for the AP-administered General Grant Fund out-link. Whether the platform's pool is transferred to AP's fund periodically, and how that is booked, is a CPA question already tracked under `wonderwall-sxi`.

## 4 · Grant programs — where they stand

| Program | Spec | Built | Nov 6 answer |
|---|---|---|---|
| Platform project pool (the $5 of every seat, plus member extras) | Receipt copy; PRD §15 says 50% of dues; allocation decided manually | Ledger of awards only (`allocations`). Inflows untracked. | Build the contributions ledger in step 2 so the public fund page shows money in and money out. Awards stay a manual operator call. |
| Community grant pools (Leader tier, $50/mo) | `community-grant-pools.md`: pledge per revenue product as **percent of price or fixed dollars per payment**, four inflow types, one-bite fee rule, locked sub-balance on the host's Connect account, award-by deadline, $25 minimum, W-9 above $600, skill-based only | Nothing. `pool.propose` exists as a capability with no consumer. | Concierge, per the spec's own §8: collect the pledge inside a cohort price, track it in the existing admin allocations surface, award by hand, publish on `/fund/:slug`. Real rails follow Stripe Connect in Phase 3. |

The percent-or-fixed pledge configuration is therefore fully specified and zero percent implemented. The data shape for it is reserved in step 3 below so nothing in steps 1–2 has to be undone.

## 5 · Build plan

Estimates assume the existing test-first pattern (pure handlers plus `convex-test`) and the W1 code as the base.

**Step 0 — clear the money gate (Rick, about an hour).** Run `npx convex dev` once for codegen, add test-mode Stripe keys and the webhook endpoint, create the three Products, seed `the-garden`. This is the W1 exit in bead `wonderwall-7r4` and it blocks every money step below. Nothing in step 1 needs it.

**Step 1 — The Garden as the first community (2–3 build days).**

1. Extend `hostOrgs`: `description`, `tagline`, `coverUrl`, `ownerUserId`, `status` (`pending` | `active` | `archived`), `visibility` (`public` | `unlisted`), `joinPolicy` (`open` | `apply` | `invite`). Re-kind `the-garden` from `platform` to `community` and rename it "The Garden — Kingdom Creatives." Remove the default-host semantics from checkout (`DEFAULT_HOST_ORG_SLUG` stops being a fallback; `memberships.hostOrgId` becomes optional).
2. New `communityMembers` table: `hostOrgId`, `userId`, `role` (`host` | `moderator` | `member`), `status`, `joinedAt`, `isHome`. Join and leave mutations respect `joinPolicy`; the host row is written at create.
3. Optional `hostOrgId` on `projects`, `events`, `offerings`, `announcements`. Create forms get a "post to" picker listing the communities the user belongs to; browse pages get a community filter chip; tables and allocations already carry the field.
4. Routes: `/communities` (directory of active public communities), `/communities/:slug` (page: description, hosts, tables, upcoming events, projects, classes, fund ledger, join button), `/communities/new` (host create flow, lands `pending`), and an approve action in the admin operator panel. Both public routes join the prerender list.
5. Capabilities: `community.create` (any signed-in account; hosting is free), `community.manage` (owner or moderator, via `communityMembers.role`), `community.join.member` (seat holders, for `joinPolicy: apply`). Matrix tests extended.

Exit: a signed-in user creates a community, an operator approves it, a member joins it and posts a project and an event into it, and both appear on the community page and under the community filter in browse. The Garden page is live with its existing tables and the AP fund ledger.

**Step 2 — pay-what-you-want seats and the grant ledger (about 2 build days, after step 0).**

1. `createMembershipCheckout(level, monthlyCents)` with server-side floor validation and ad-hoc recurring `price_data`; `memberships.amountCents`.
2. `invoice.paid` handling in `stripeHandlers.ts` writing `grantContributions` rows (`dues_share`, `member_extra`); refund and chargeback write `adjustment`. Replay tests, same as the existing webhook fixtures.
3. `/join` swaps the waitlist form for the real tier picker with the amount chips and the two-cell receipt; `/join/success` reads the reactive membership query.
4. Public fund page shows inflows by type (aggregates, no member names) alongside the existing allocation awards.
5. "Change my amount" in settings.

Exit: a test-mode $25 seat yields an active membership with `amountCents: 2500`, one `dues_share` row of $5 and one `member_extra` row of $15, entitlements identical to a $10 seat, and the receipt reads "$5 runs the place · $20 funds other creatives' projects."

**Step 3 — community grant programs (Leader tier), after Stripe Connect.** Reserve now, build later: `grantPrograms` (`hostOrgId`, `pledgeType` `percent` | `fixed`, `pledgeValue`, `awardBy`, `rolloverTo`, `selectionMode`, `status`), `grantProposals` (`programId`, `projectId`, `userId`, `status`), awards written as `allocations` with `programId`. The pledge applies at charge time inside the same webhook path as step 2, so the only new rail is the Connect sub-balance. Until then, concierge per §4.

## 6 · Gaps and risks to keep in view

- **`/c/` is taken by coverage codes.** Community pages live at `/communities/:slug`; do not reuse `/c/`.
- **Two events surfaces still exist** (`/events` legacy and `/garden/events`). Community-tagging events should target the surface the V1 PRD §5 keeps, not both.
- **`offerings` was built to avoid hostOrgs.** Adding the optional field is safe; the "post to community" picker is the only UI change.
- **Public copy still contradicts the model** in `garden._index.tsx` and `join.tsx` ("waived once a table charges," "half of every membership"). Step 2 replaces `/join`; the landing copy is a one-line fix to do at the same time.
- **Stripe amount changes need an in-app path.** Covered in step 2.5; do not ship pay-what-you-want without it or members are stuck at their first choice.
- **`detect_changes` and impact analysis** apply to steps 1–3 as code work; this doc changes no symbols.
