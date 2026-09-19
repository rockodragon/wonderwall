# Entitlements — live status

2026-09-15 · reality-check doc, code-verified. Supersedes `entitlements-paywall-foundation.md`
(deleted — pre-rebrand "TheCrossBoard" draft; its org tiers, `profiles.plan` field, and
`organizations` schema were never built). Upstream canon is unchanged: tier ladder and capability
names are `the-garden-product-plan.md` §2.1–§2.3; the money split is amended by the
2026-08-31 model in `community-groups.md`. This doc exists so "what's actually enforced today"
never has to be re-derived from grep again — update it whenever a gate is wired or unwired.

**The one-page visual model** — upgrade-trigger map, value ladder, money map, competitive check,
pressure-test verdicts, open decisions — is `seat-pool-payout.html` in this folder (open it in a
browser). This file is the text record; that page is the thing to argue over.

**Canon check (2026-09-15).** Per `docs/README.md` the live plan is
`creatives-exchange-discussion-brief.md` v0.5 (2026-09-08) — "start here." **The code implements the
earlier Aug 31 model, not the plan.** Where they differ:

| | The plan (v0.5) | The code (Aug 31 model) |
|---|---|---|
| Whose seat | Per community, at that community's price (The Garden $10) | Platform-wide; `memberships` has no community |
| Dues split | 10% platform; 90% the community's to divide (The Garden 40/50/10) | 50% pool · 50% platform (`duesSplit`) |
| Card processing | Payer covers, added at checkout | Platform absorbs from its share |
| Ladder | None — Free member / Member / Host $0 | Seat $10 · Five $25 · Host $50, 1/5/10 projects |
| Gathering word | Class | Table (`gardenTables`) |
| Paid work | "Applying takes membership" | `project.applyPaid` defined, not enforced |

The README's sequencing rule applies: agree the plan, then move the code. The tables below describe
the code so the gap is visible; they are not an endorsement of the Aug 31 numbers.

## Tiers (as coded — the plan has none)

| Level | Price | Active passion projects |
|---|---|---|
| Visitor / Free account | $0 | 0 |
| Seat | $10/mo | 1 |
| Five | $25/mo | 5 |
| Host (Community Host) | $50/mo | 10 |

Covered seat (patron-paid) = identical to Seat. Patron / Partner roles are $0 to hold.

## Money splits (as coded)

Both computed on the **gross**; the platform's share absorbs 100% of Stripe processing.
**The plan rejects this for dues:** 10% platform, 90% the community's, and the payer covers card
processing at checkout — "the platform's 10% is a real 10%." Pledge and class lanes (90/10) match.

| Flow | Split | Where |
|---|---|---|
| Membership dues (seat/five/host) | 50% pool · 50% platform | `stripeHandlers.ts` `duesSplit` |
| Patronage (pledges, fellowships, covered seats) | 90% work · 10% platform | `capabilities.ts` `SPLITS.patronage` |
| Host's own sales (classes, cohorts) | 90% host · 10% platform | `capabilities.ts` `SPLITS.sales` |

Hosting a community is free, unconditionally — 10% is only ever taken on what a host sells.

## Free vs. paid — proposed 2026-09-15, not yet decided

The spec in `capabilities.ts` gates *applying* to paid work and *starting* a project at the seat.
After the 2026-09-15 pressure test (UX + PM passes, eleven-platform competitive check — see
`seat-pool-payout.html` §4–§5) the proposal on the table moves both gates one step later:

| Action | Free account | Paid tier (seat+) |
|---|---|---|
| Browse | ✅ | ✅ |
| Give money — back a project, cover a seat, pledge | ✅ (free patron role) | ✅ |
| Volunteer — apply to an unpaid role | ✅ | ✅ |
| **Apply** to a paid role | ✅ (proposed; spec says ❌) | ✅ |
| Be **accepted** onto a paid role | ❌ | ✅ |
| **Draft** a project | ✅ (proposed; spec says ❌) | ✅ |
| **Publish** a project | ❌ | ✅ |
| Post paid work bringing your own budget (patron/partner) | ✅ (free patron/partner role — separate case, unchanged) | ✅ |

Rank applicants by fit, never by payment status — sorting seat-holders higher was considered and
rejected as a silent, pay-to-win gate. If adopted, the paid-work gate lands in
`projectTeam.decideRequest` (check the *applicant's* level when `project.kind === "paid"`), not in
`requestToJoin`; the project gate lands on publish, not on create. Longer term, once the payout rail
exists, the paid-work gate can become a 10% take at payout instead of a seat requirement.

## Capability enforcement — spec vs. live

| Capability | Spec says | Enforced live? | Where |
|---|---|---|---|
| `pool.propose` | seat+ only | ✅ enforced | `grantProposals.ts:217-218` |
| `table.join.member` | seat+ only | ✅ enforced | `tables.ts:242` |
| `table.create` | host only | ✅ enforced | `tables.ts` |
| `community.create` | any signed-in account | ✅ enforced | `communities.ts:598` |
| `project.create.passion` | seat+ only, capped 1/5/10 | ❌ **not wired — free today** | `projects.ts:92`, comment at :60-66 |
| `project.create.paid` | seat+, or patron/partner role | ❌ **not wired — free today** | `projects.ts:575` |
| `project.applyPaid` | seat+ only | ❌ **not wired — free today**, and `requestToJoin` doesn't yet distinguish paid vs. passion roles | `projectTeam.ts:617` (needs `project.kind === "paid"` check — field already exists) |
| `event.create` | seat+, or partner | ⚠️ no create-event mutation exists yet | — |

**Heads-up before wiring the three ❌ rows:** `the-garden-product-plan.md` §2.5 names paid-project
supply as the top seat-conversion driver, and warns that gating "apply to paid work" when there
isn't much paid work posted yet kills that funnel. The field agrees — Dribbble reversed a discovery
paywall in 2024 for throttling lead flow; Upwork's pay-to-apply is the sector's most resented fee.
Hence the accept-time / publish-time proposal above. Whatever is chosen, count live paid postings
first; under ten, don't gate anything yet.

## Payout rail — specified, untracked until 2026-09-15, unbuilt

Bead: **wonderwall-7avu** (P1). Step 1 is pre-Nov 6 without Connect; step 2 is Phase 3.

**Update 2026-09-18:** researched in [backing-payouts.md](backing-payouts.md). Decided: $50 minimum payout.
Recommended, not decided: move Stripe Connect (step 2) ahead of Nov 6, because charging backings on the
platform's own Stripe account is on Stripe's restricted list. Step 1's ledger is built in draft PR #15.

| Lane | Plan docs say | Code has |
|---|---|---|
| Stripe Connect Express | Phase 3; manual transfers for October; "never cut the payout ledger" (`phase-1b/spec.md` §5) | Zero |
| Pledge → creative | "Money moves to the creative immediately, 90/10" | Money in only (`projectSupport`, `raisedCents`). **No owed/paid row.** The 90% sits on the platform's Stripe balance. |
| Host earnings | "No host payouts in October" | Manual owed-vs-paid ledger built — `hostPayouts` + `recordHostPayout`, operator form, `/admin/ledger` |
| Paid project → hired creative | "Settles off-platform; ledger records the commitment (`project_contribution`)" | That ledger type doesn't exist in `grantContributions.type`. Nothing is recorded. |
| Grant awards | Operator-entered, public | Built (`allocations`) |
| Coverage codes | Church buys N seats | Live (`createCoverageCheckout`); bead f5e's "remaining" list is stale and now annotated |

Honesty gap: `/for/hosts` says "you keep 90 cents of every dollar." Today that is an owed balance an
operator pays by hand. Fine for pilot hosts, false at volume. Minimum step before Nov 6 is bead
7avu step 1: an owed row per pledge and copy that says earnings are tracked and paid out by us
until the rail ships.

## Decisions open (recommended default first)

0. **Which canon** — the plan (per-community seat, 10/90 dues, payer covers processing, no tiers) or
   the code (platform-wide, 50/50, platform absorbs, 1/5/10). The README says the plan; then the code,
   receipts and /for pages move in a scoped reconcile pass (memberships gain a required community,
   `duesSplit` changes, the pricing page loses two tiers).
1. **Free project** — draft free, publish with a seat. Fits the plan's "asking for support requires
   you to join first." Alt: keep 0 with a launch-window exception.
2. **Paid work** — apply free, rank by fit, membership to be accepted. No tier sorting. Revises one
   sentence in the brief ("applying takes membership" → "being hired takes membership").
3. **Tiers** — follow the plan: none. If a project cap is wanted, a Seat add-on, not Five. If 1/5/10
   is kept regardless, measure cap-hits for 60 days first. Both reviewers called Five the weakest rung.
4. **The $50 tier** — not in the plan. Off the pricing page; grant programs hand-sold until Connect.
   If it ever returns as a SKU, call it "Leader" — "Host" is the person who runs a class.
5. **Events** — free for informal gatherings, membership for private/ticketed. No create-event
   mutation exists, so this costs nothing to decide now.
6. **Payout rail** — bead wonderwall-7avu step 1 before Nov 6; Connect in Phase 3.
7. **Card processing** — the plan's answer stands: the payer, at checkout. Code and receipt copy
   currently say the opposite.

Unit economics of a $10 seat: as coded, the platform nets ~$4.41 after the pool's $5 and Stripe's
~$0.59 ($441/mo at 100 seats, $2,205 at 500, $8,820 at 2,000). Under the plan, $1 — a real $1, with
$4 to the community and $5 to its pool ($100 / $500 / $2,000). Either way dues are the marketing
engine; margin comes from the 10% funding lanes, and the pool share only earns its keep while it
produces visible, frequent grants.

## Terminology

- **Community ≠ Table/Class.** A Table (code) — a **Class** in the plan since 2026-09-08 — lives
  inside a Community (`gardenTables.hostOrgId`). "Space" is the retired name for **Community**, not
  for Table.
- No tiers exist *within* a community. In the code one platform-wide seat unlocks every
  members-only Table everywhere; in the plan a seat belongs to one community and unlocks that
  community's members-only classes.

## Tables — three modes, one is paid

| Mode | Cost | Status |
|---|---|---|
| `open` | Free, anyone | Live |
| `member` | Free, requires a platform seat | Live |
| `cohort` | Host sets a price | Join is live; **Stripe checkout not built** — membership is recorded immediately with `paymentPending`, reconciled by hand (`tables.ts:74-80`) |

## Privacy — not built

`hostOrgs.visibility` is `"public" \| "unlisted"` only — no real "private." And it wouldn't matter
yet: `listProjects` (`projects.ts:331`) pulls every project on the platform with no filter by
community or visibility at all. If private communities are a real requirement, they need to be
built, not just documented.

## Principles worth keeping (from the retired doc)

- Capability checks, not plan-name checks — one `can()` a feature asks, never scattered tier
  conditionals.
- Gate expansion, not identity — a free account should never feel like a lesser account, only a
  smaller one.
- Every denial names the value, says why now, and gives the upgrade path with an escape hatch.
- Manual/admin overrides are first-class, not a hack, while volume is low.
