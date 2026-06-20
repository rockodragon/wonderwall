# The Exchange — Vision & Feature Requirements

*Draft for review by David Russo (Abiding Practice) and Haley (Table Art Society)*

*Version 0.1 — 2026-06-19*

---

## TL;DR

We're renaming TheCrossboard to **The Exchange** and turning it into a multi-tenant platform where mission-aligned organizations run their own creative communities — called **Tables** — that they brand, moderate, and monetize.

Abiding Practice and Table Art Society are the launch Tables. Churches and patron organizations can buy seats at a Table for the creatives they support, and Table operators (like AP) can run recurring grant pools and ongoing artist fellowships that fund creatives to do their work *out in the community* — not as employees of the sponsor.

The product job is to make patronage feel like patronage again. Artists as missionaries, not handouts.

---

## What changed in this round

Three things from the recent conversations are reshaping the product:

1. **AP wants to operate on the platform, not build a parallel one.** That means the platform has to be genuinely multi-tenant, with AP as one of many customer operators.
2. **"Tables" is the metaphor.** Both David and Haley independently landed on it. Seat at the table, round table, Table Art Society. We'll use it everywhere user-facing.
3. **Patronage has two distinct shapes.** A church buying *seats* for creatives to participate (existing model) is different from a church or AP sponsoring a *specific artist* to do outward-facing work in the community (new model — closer to a fellowship). Both are first-class.

---

## The three constructs

### 1. The Exchange (the platform)

The Exchange is the platform layer. It runs the identity system, the entitlements model, billing, the discovery layer, and the shared content surface (story showcases, public profiles, public projects). One operator account — us — runs it.

### 2. Tables (the tenant communities)

A **Table** is a branded community run by a customer organization. AP runs the AP Table. TAS runs the TAS Table. Each Table has:

- Its own brand, intro, and landing page on The Exchange
- Its own membership policy (who can join, free vs. paid-to-participate, invite-only vs. open)
- Its own projects, fellowships, sponsored seats, and patronage pool
- Its own Groups (niche forums — photographers, musicians, etc.)
- Its own Practice (working meetings, feedback loops, formation prompts)
- Its own Pathfinding (guides/mentors network)
- A Table operator (the customer org) who configures all of the above

Tables can have **sub-Tables for cities** (AP → AP Nashville → AP Austin). Sub-Tables inherit branding and policy from the parent but have their own local members, projects, and showcases. This is how syndication works.

### 3. People (one identity, many Tables)

A creative builds one profile on The Exchange and joins as many Tables as they want — like joining multiple school communities. Each Table membership has an overlay (a Table-specific intro emphasis, visibility settings, role) on top of the shared core profile (bio, portfolio, skills, links).

This matters because Haley's TAS members and David's AP members will overlap, and a creative shouldn't have to rebuild themselves twice.

---

## The two patronage models

Both are first-class. Both are scoped to a Table.

### Model A — Sponsored Seats

A patron organization (often a church) buys seats at a Table. Each seat funds one creative's *participation* in the Table — access to the community, projects, Practice, and Pathfinding.

This maps cleanly onto the existing entitlements model already specced in [features/entitlements-paywall-foundation.md](features/entitlements-paywall-foundation.md). We just scope sponsored seats per-Table instead of platform-wide.

**Operator-facing:** A Table dashboard where the operator org allocates seats to specific creatives or makes them claimable by invite link.

**Member-facing:** A "sponsored by [Church X]" badge on the member's Table-specific profile, surfaced with whatever visibility the member opts into.

**Sponsor-facing:** A simple dashboard showing seats funded, seats claimed, and aggregate community impact.

### Model B — Sponsored Artist Fellowships

This is the Dan-and-the-musician model. A patron sponsors a specific named artist to do outward-facing creative work in the community — playing bars, festivals, public spaces, etc. — *not* serving on the patron's campus.

A Fellowship is a recurring sponsorship (monthly or quarterly stipend) tied to a public story surface. The product job is to make that story visible, so the patronage looks like real patronage instead of a generic donation, and so the sponsoring org gets to see and share what their support is producing.

**Shape:**

- A Fellowship is a relationship: sponsor → artist, with a recurring payment commitment (cadence and amount configurable).
- The Fellowship has a **public story page** on the platform — updates, performances, photos, places the artist went, who they met, what they made.
- The sponsoring patron is credited (with their opt-in) on the public story page.
- The artist is in the driver's seat for posting story updates; the sponsor gets a private dashboard view.

**Why this matters strategically:** these public Fellowship stories are the content engine for the platform. They're how new patrons discover the model, how new artists imagine themselves into it, and how Table operators (AP, TAS) prove what they're doing matters. The October showcase is the first big example.

---

## Projects (renamed from Jobs)

The Jobs feature gets renamed to **Projects**. The schema is mostly the same; the framing shifts from hiring to collaboration. Projects can be:

- **Paid projects** — an org or individual hires a creative for a defined piece of work. (Existing Jobs flow.)
- **Passion projects** — a creative proposes something they want to make, optionally seeking collaborators, optionally seeking funding from a Table's grant pool.

Each Table operator configures:

- Who can post projects (members only, sponsored members only, anyone)
- Whether a payment gate applies to participate in projects (e.g., AP requires a small annual fee; TAS may not)
- Whether the Table runs a funded passion-project pool (yes for AP, undecided for TAS)

### Funded passion projects (grant pool)

AP is committing **$500/month** to fund passion projects. We model this as a recurring pool, not a one-time fund:

- Operator (AP) configures a pool: amount per cycle, cycle cadence (monthly), max grant per project.
- Members propose projects during an open application window.
- Allocation is **hybrid**: community signal (upvotes/comments from Table members) feeds into a jury decision made by the Table operator. This is the explicit choice — not pure community vote, not pure operator pick.
- Selected projects are funded; the project gets a public page tracking outcomes; outcomes feed back into the showcase / story surface.
- Unspent pool rolls forward to the next cycle (operator-configurable).

This isn't an escrow/marketplace — we're not handling project payments ourselves yet (see existing strategic plan re: payment handling). We track commitment and fulfillment; payout is operator-driven for now.

---

## Practice and Pathfinding

These come from the AP vision PDF and slot in once Tables and Groups exist.

**Practice** is small-group working sessions — sharpen-your-craft-together, peer/hero feedback loops, spiritual formation prompts for group settings. We compose this from existing event/Group/media primitives:

- A Practice session is a scheduled, capped-attendance event inside a Group
- It carries a prompt template, an attendee list, a shared artifact space, and a feedback capture flow
- Live media options (Zoom / Cloudflare Stream / LiveKit) inherit from the media plan in [features/paid-community-youtube-media.md](features/paid-community-youtube-media.md)

**Pathfinding** is a guides/mentors directory inside a Table. A guide is a profile with a "available for guidance" flag, optional rates, and a request flow that lands in their inbox. Mechanically it's the same shape as project interest — minor extension to existing primitives. Likely combined with Practice's "peers + heroes" pattern rather than built as a separate feature.

---

## The Showcase / Story surface

This is a **new platform-level surface** that emerged from the call: a public-facing space where Fellowship stories and funded-project outcomes live.

**Public-by-default.** Stories drive sponsor acquisition and member acquisition; gating them undercuts the content loop.

**Two layers:**

- **Per-Table showcase** — AP's public Table page features its Fellowship artists and funded projects. The October showcase pivots from "artists on stage" to "artists embedded in community" and lives here.
- **Platform-wide showcase** — The Exchange surfaces the strongest stories across all Tables on its homepage, in search, and in social-shareable cards. This is how a TAS visitor discovers an AP artist and vice versa.

**Story format:** mixed media (text, photo, video, audio), authored primarily by the artist, with the patron and Table credited. Updates accrue over time (not a one-shot post) so a Fellowship reads as an ongoing journey.

---

## Where this connects to existing work

| Existing doc | What stays | What changes |
|---|---|---|
| [thecrossboard-strategic-plan.md](thecrossboard-strategic-plan.md) | Pricing tiers logic, hybrid 501c3/LLC structure, monetization sequencing | "Crossboard" rebrands to The Exchange; pricing tiers move from platform-wide to per-Table; the customer is now the Table operator, not directly the patron |
| [prd.md](prd.md) | Profile, wonderings, events, discovery, invites | Add Table-scoping to every entity; profile becomes global core + per-Table overlay |
| [jobs-feature-prd.md](jobs-feature-prd.md) | Schema and flows | Rename Jobs → Projects; add passion-project / grant-pool flow; per-Table policy on who can post |
| [features/entitlements-paywall-foundation.md](features/entitlements-paywall-foundation.md) | Capability-based gates, plans, memberships, sponsored seats, admin overrides | Add Table scope to plans and capabilities; sponsored seats become Table-scoped; add Fellowship as a new entitlement source |
| [features/paid-community-youtube-media.md](features/paid-community-youtube-media.md) | Zoom → Cloudflare Stream → LiveKit sequencing | Tie media to Practice sessions and Fellowship story updates; Table-scope all event media |

The good news: the existing entitlements foundation was designed capability-first, so adding a Table dimension is additive, not a rewrite.

---

## Proposed sequencing (around the October showcase)

The October showcase is the forcing function. Working backwards:

### Phase 1 — Tables + AP/TAS as launch Tables (must ship for showcase)

- Table abstraction (entity, branding, landing page, operator dashboard)
- Per-Table profile overlay on top of global identity
- Migrate the existing Crossboard community into the AP Table (or sunset Crossboard's standalone surface, TBD with David)
- TAS Table provisioned for Haley
- Basic Table-scoped membership (claim seat, browse Table)

### Phase 2 — Fellowship model + Story surface (the showcase narrative)

- Fellowship entity (sponsor, artist, cadence, amount, public story page)
- Public per-Table showcase page
- Story authoring (mixed media updates accrue over time)
- Patron dashboard for Fellowships they fund
- At least one Fellowship live by October so the showcase has a real story

### Phase 3 — Projects rename + funded passion-project flow (post-showcase, but ideally before to demo)

- Rename Jobs → Projects across schema and UI
- Per-Table policy on who can post and who can participate
- Grant pool entity, application flow, hybrid community-signal + jury allocation
- Funded-project outcome surface that feeds into the showcase

### Phase 4 — Groups, Practice, Pathfinding

- Groups (niche forums inside a Table)
- Practice sessions (small-group working meetings)
- Pathfinding guides directory and request flow

### Phase 5 — Sub-Tables for cities and broader syndication

- AP Nashville, AP Austin, etc.
- Cross-Table discovery polish on the platform-wide showcase

### Phase 6 — Live media depth and billing

- Cloudflare Stream signed playback for gated Fellowship updates and Practice recordings
- LiveKit for interactive Practice sessions
- Stripe for recurring Fellowships, grant pools, and Table operator billing

---

## Strategic principles to hold

These are the threads that should run through every product decision:

- **Patronage feels like patronage.** The sponsor isn't a customer of a service; they're a patron of a person or a community. Surface their support visibly, gratefully, and proportionally.
- **Artists are missionaries, not employees.** The product should make it natural for a sponsored artist to do work *outside* the sponsor's walls — in bars, at festivals, in public spaces — and to make that work visible back to the sponsor as the value of the relationship.
- **Tables, not silos.** Every shared identity, every cross-Table discovery, every platform-wide story makes the whole system more valuable. Multi-tenant doesn't mean isolated.
- **Operator autonomy with platform coherence.** Table operators set policy inside their Table; The Exchange sets policy for the platform. Operators get configurability; members get a consistent platform feel.
- **The story surface IS the marketing engine.** Public Fellowship stories and funded-project outcomes are how new patrons, artists, and Tables discover us. Don't let it be an afterthought.

---

## Open decisions for David and Haley

These are the questions where we need your input before going further:

1. **TheCrossboard's fate.** David has said "Exchange = Crossboard renamed." Are we comfortable sunsetting the Crossboard brand entirely and rolling its audience into the AP Table at launch, or do we want to keep `thecrossboard.org` as a separate redirect/marketing layer?
2. **AP's payment gate.** The platform supports "operator decides," and you've signaled a small payment to participate in projects. What's the right number — annual ($25–$50), monthly ($5), per-project micro-fee, or something else?
3. **Fellowship cadence and stipend ranges.** $500/month is the project grant pool. Are Fellowships separate from that (e.g., a dedicated $X/month stipend per fellow), or do Fellowships draw from the same pool?
4. **Allocation jury composition.** For the hybrid community-signal-informed jury — is the jury the Table operator alone, or a small council (e.g., David + Haley + a rotating member)?
5. **Patron credit conventions.** When a church sponsors an artist Fellowship, how prominently do they want to be credited on the public story page? Default-prominent, default-subtle, or opt-in per story?
6. **Sub-Table governance for cities.** If AP Nashville launches, who's the operator — David, or a local lead empowered by David? Inheritance vs. autonomy questions follow from that.
7. **October showcase format.** Is the showcase an in-person event with a digital story layer, a fully digital story drop, or both? What needs to be true for it to feel right?

---

## What we'd build first if we got the green light tomorrow

The smallest credible version that lets us run AP and TAS as real Tables with one live Fellowship story by October:

1. Tables entity, AP and TAS provisioned
2. Per-Table profile overlay on existing global profile
3. Fellowship entity (sponsor relationship + recurring commitment + public story page)
4. One Table-scoped public showcase page per Table
5. Sponsored Seat allocation, per-Table

Everything else — projects rename, grant pool, Groups, Practice, Pathfinding, sub-Tables, billing, live media — can sequence after the showcase. The showcase needs the story, and the story needs Tables, Fellowships, and a public surface. That's the minimum.

---

*Next steps: align with David and Haley on the open decisions above; convert this into a sequenced engineering plan tied to October.*
