# Community Grant Pools (Leader tier)

v0.1 · 2026-08-31 · owner: Rick · status: **Phase 2 — not in the Nov 6 build.** Concept decided; this doc pins the financial rules.

A Leader-tier host ($50/mo) can run a funded pool for their community: seeded from their own collections, top-ups, sponsors, or a declared slice of their premium dues; members propose; the community votes or the host decides; the winner is funded; the story publishes. Contests and hackathons are the time-boxed version.

## 1 · Pool funding configuration

A host configures each revenue product's pledge as **either**:

- **Percent of price** — e.g. 25% of a $20/mo premium → $5/payment to the pool, or
- **Fixed dollar amount per payment** — e.g. "$5 of every $20" (must be ≤ the host's net share of the price).

Plus three direct inflows: **host top-up** (their money), **sponsor contribution**, **contest entry fees**. All four are typed ledger events, never free-text.

Pledges apply **at charge time** — the pool's share routes to a locked balance in the same transaction that charges the member. The host cannot spend pledged funds; the member's receipt shows the pool line (split-strip pattern: `$5 community pool · $13 host · $2 platform`).

## 2 · Fee rules — one bite per dollar

- Platform takes its 10% **once, when money first moves**. A dues pledge comes out of already-fee'd money: member pays $20 → $2 platform → of the remaining $18, the pledge (e.g. $5) locks to the pool → $13 host. **No second fee on the pledge.**
- Direct inflows (top-ups, sponsor money, entry fees): 10% on entry to the pool.
- **Awards out of the pool: 0%.** An award is a transfer, not revenue.

## 3 · Custody and rails

- A pool is a **locked ledger sub-balance on the host's Stripe Connect Express account**. Creatives Exchange never holds pool funds — no custodial/money-transmitter exposure.
- No Connect onboarding (KYC), no pool. `pool.create` is gated on Leader tier + completed Connect.

## 4 · Ledger event types

`pledge_in · topup_in · sponsor_in · entry_fee_in · award_out · rollover_out · adjustment` (chargeback clawback). Every pool has a **public mini-ledger** (reuse the AP allocations-ledger machinery): date · type · amount · who, readable without an account.

## 5 · Refunds and chargebacks

- Refund/chargeback of a pledged payment claws the pledge portion back from the pool **if not yet awarded**.
- If the pool was already awarded, the clawback debits the **host's** balance — the host controls award timing, so the host bears the timing risk. Stated in Leader terms of service.

## 6 · Award rules

- Every pool declares an **award-by deadline** at creation. On expiry, unawarded funds **auto-roll** to the host's next pool (default) or to the General Grant Fund (host's choice, set at creation). Never silent, never stuck.
- Minimum award: $25 (no dust awards).
- Awards totaling ≥ $600/creative/year require **W-9 capture before payout**; the platform generates 1099 data. The host (via their Connect account) is payer of record.
- Selection mode per pool: host-decides · community vote · judged panel. Criteria and results publish to the mini-ledger.

## 7 · Legal guardrails

- **Skill-based contests and judged/voted grants only. Raffles and chance-based mechanics are prohibited** (product-enforced and in ToS) — raffles are regulated gambling, nonprofit-only under state law.
- Pool money is never called a **donation** and is never presented as tax-deductible. Exception path (v2): a nonprofit host may run their pool through their own 501(c)(3) — that uses the out-link lane like the AP fund, not these rails.

## 8 · What v1 (Nov 6) does instead

**Nothing is built.** Validation is concierge: run one pool manually for a single workshop/cohort — collect the pledge as part of the cohort price, track it in the existing admin allocations surface, award by hand, publish the allocation on the existing ledger page. If members rally around it, the build above is justified; it depends on Stripe Connect, which is already Phase 3.
