# Docs index

The project is **creatives.exchange** (repo: wonderwall). Four documents are the live set. Agree on these before changing code this cycle; everything else is a spec or history.

## The live set

| Doc | What it holds |
|---|---|
| [The plan](creatives-exchange-discussion-brief.md) | What the platform is, how membership and money work, who owns work, open questions. **Start here.** |
| [Financial model](financial-model-3yr.xlsx) | Small/Medium/Large 3-year budget. Blue cells are inputs; `Inputs!B9` toggles who absorbs card fees. |
| [Partner landscape](partner-landscape.md) | Who we approach, what we say to them, patrons, churches, the migration playbook. |
| [Product plan](the-garden-product-plan.md) | Product spec and build canon. **Lags the plan in spots** (host $50/mo, "Tables" vocabulary, single-tenant assumptions) — reconcile after the plan is agreed, before code changes. |

## Feature specs

- [Phase 1B spec](phase-1b/spec.md) — the October build plan (money foundation, entitlements, coverage codes)
- [Live booking](features/live-booking.md) — a venue posts recurring paid gigs, artists answer with clips, the venue picks and pays directly; includes the payment-linking research
- [V1 PRD](the-exchange-v1-prd.md)
- [Entitlements — live status](features/entitlements-live-status.md) — what the code enforces vs. the plan, the payout-rail gap, open decisions · [Seat, Pool, Payout](features/seat-pool-payout.html) — the money model on one page (open in a browser)
- [Backing payouts](features/backing-payouts.md) — how backer money reaches creatives: Stripe Connect vs Venmo/Zelle vs direct pay, costs, legal risk, taxes, the $50 minimum, and what's decided vs open
- [Handoff: backings for Nov 6](handoff/nov6-backings.md) — the plan to let people in the room back creatives on Nov 6: what's decided, built, missing, and the beads
- [Community groups](features/community-groups.md) · [Community grant pools](features/community-grant-pools.md) · [Paid community + media](features/paid-community-youtube-media.md)
- [Class payments and moderation](features/class-payments-and-moderation.md) — who can offer a class or coaching, how class money is collected and owed, how a community pauses a class
- [Rich project content](features/rich-project-content.md) — the block model behind project pages and project updates (headings, images, video embeds)
- Older PRDs: [jobs](jobs-feature-prd.md) · [messaging](messaging-feature-prd.md) · [event location](prd-event-location.md) · [announcements](announcements-prd.md) · [events video hosting](events-video-hosting-prd.md) · [gated event video](gated-event-video-prd.md)

## Marketing

- [What we say about money](marketing/claims.md) — every money sentence, word for word, and what we never say. The site reads the same sentences from `app/app/constants/claims.ts`.
- [Outreach playbook](marketing/constituent-playbook.md) — six audiences; points at the claims by name

## Runbooks and research

- [Step 0: go live in Stripe test mode](runbooks/step-0-go-live.md)
- [Entity structure research](entity-structure-research.md) · [research/](research/)

## Historical (superseded — do not quote from these)

Earlier eras of the same idea. Their money splits and vocabulary are out of date (60/30/10, "Spaces", per-tier pricing). The money-flow diagrams people remember live here.

- TheCrossBoard era: [strategic plan](thecrossboard-strategic-plan.md) · [core PRD](prd.md) · [priority brief](priority-brief.md) · [board deck](decks/)
- The Exchange era: [vision](the-exchange-vision.md) · [MVP](the-exchange-mvp.md) · [discernment brief](the-exchange-discernment-brief.md) · [stakeholder one-pager](the-exchange-stakeholder-one-pager.md)
- The Garden era: [old P&L](the-garden-pnl.xlsx) (superseded by the financial model) · [triage](triage.md)
