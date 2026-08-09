# The Garden — Product Plan & Spec

*Canonical for: personas, membership levels, entitlements, pricing, revenue split, onboarding flows, and the passion/paid project model. Supersedes the corresponding sections of `the-exchange-vision.md` and `the-exchange-stakeholder-one-pager.md`. Where this doc and an older doc disagree, this doc wins.*

*v1.0 — 2026-08-09*

---

## 0 · Document canon

| Question | Canonical source |
|---|---|
| Personas, vocabulary, brand, Table primitive, Buzz, Partners | **The rebrand handoff** (`oside/handoff/audit-8-7/design_handoff_garden_rebrand/` — README, CHANGES, Personas & Onramps) |
| Membership levels, entitlements, pricing, revenue split, onboarding flows, project model | **This document** |
| Media strategy (YouTube / private video / live) | `features/paid-community-youtube-media.md` — still valid; restated in §5 |
| Entitlement architecture (capability model, Convex tables) | `features/entitlements-paywall-foundation.md` — still the technical blueprint; tier names updated here |
| The shipped app baseline (profiles, wonderings, events, invites, jobs, messaging) | `prd.md`, `jobs-feature-prd.md`, `messaging-feature-prd.md` — describe what exists, not where we're going |
| Historical / superseded | `the-exchange-vision.md` (strategy narrative; taxonomy + pricing superseded), `the-exchange-mvp.md` (banner says so), `the-exchange-stakeholder-one-pager.md` ("Space" retired), `thecrossboard-strategic-plan.md` (market research still useful) |

**Vocabulary is fixed by the handoff and used here:** Creative · Patron · Host · Partner · Table · Seat · Project · Fellowship. "Space" is retired ("space" means physical space only). Tenancy is three tiers: **The Garden** (platform) → **Host organizations** (AP, TAS, churches) → **Tables** (gatherings).

---

## 1 · Personas and jobs-to-be-done

Four personas. One account can hold several roles — roles are additive, never exclusive.

| Persona | Who | Job to be done | Reduces to |
|---|---|---|---|
| **Creative** | Anyone making something and putting it into the world. No portfolio bar. | *Get my work seen and funded without begging for it.* Places to show work, funding for a specific project, collaborators. | "I want to be in that room." |
| **Host** | A Kingdom-minded creative who leads a community — a practitioner who gathers, not an admin. | *Turn the people I already gather into something that outlasts my group chat.* Run tables without five tools; route patron money; get credited on every work it touches. | "I want to be the one who makes that room." |
| **Patron** | Anyone who can point money at a person's work — church, business, family, individual. $10 and $500 are the same instinct at different scales. | *Know exactly whose work my money made, by name.* A story page to forward instead of a report to write. | "I want to be part of that story." |
| **Partner** | A local organization with something the scene needs — room, wall, stage, press, audience. | *Fill my room on a slow night with people who come back, and be known for it.* | "I want to be the place this happens." |

**Onramp pattern (from the handoff, governs all onboarding):** every persona arrives through a person or a room, never through search. First action must finish in one sitting; first proof must land within a week. The highest-leverage build is therefore *open tables and public events browsable without an account*, and invites that feel like personal introductions.

---

## 2 · Membership levels, pricing, and entitlements — the canon

### 2.1 The levels

| Level | Price | Who buys it | Core entitlements |
|---|---|---|---|
| **Visitor** (no account) | $0 | Everyone | Browse public pages, public tables/events, public story pages, /about |
| **Free account** | $0 | Anyone who signs up | Profile + portfolio, join open tables, RSVP public events, follow projects, register patron/partner role |
| **A seat** | $10/mo | Creative | Everything free, plus: **create 1 active passion project**, apply to paid projects, join member tables, propose to grant pool |
| **Five seats** | $25/mo | Prolific creative | As seat, but **up to 5 active passion projects**, invite collaborators onto them |
| **Host** | $50/mo *(pricing model under review — §2.4)* | Creative who leads | As seat, plus: **create tables** (any mode), spawn closed tables from open ones, curate a project space, receive patron routing |
| **Covered seat** | $10/mo paid by a patron | Sponsored creative | Identical to *A seat*. Sponsor is credited on the creative's story updates. Never a lesser tier. |
| **Church / org bundle** | ~$500/mo, sold as "contact us" | Church or organization | Up to 100 covered seats + org credited as patron on all covered creatives' work |
| **Patron role** | $0 to hold; pays per act | Anyone | Cover a seat $10/mo · fund a Fellowship $500+/mo · pledge to a project $25–$5,000 · **post a paid project** |
| **Partner role** | $0 (light model: host-listed or self-claimed) | Local org | Listed in directory with offers · venue-credit on work · **post a paid project** (a commission is a paid project) |

Rules that keep this honest:

- **Money is never the only door.** Open tables and public events are joinable free. Every host must keep at least one free/open table (product-enforced).
- **A covered seat is a full seat.** Sponsorship changes who pays, never what the creative can do.
- **Roles are additive.** A partner who is also a creative pays for a seat like anyone else; the roles don't discount each other.

### 2.2 Where the money goes (published, load-bearing)

| Flow | Split |
|---|---|
| **Membership dues** (seat/five/host, incl. covered seats) | **40% host org · 50% creative project pool · 10% platform incl. processing** |
| **Patronage** (fellowships, pledges, paid projects, seat coverage pass-through) | **90% to the work · 10% platform incl. processing** |

The public sentence, everywhere pricing appears: *"Half of every membership funds another creative's project. From day one your money is supporting someone — instead of hoping to hear back."* If host earnings (§2.4) don't feed the pool, one clarifying sentence must appear wherever the 50% claim does.

While The Garden itself is the default host org (§6), the 40% operator share accrues to the platform — publish that plainly too.

### 2.3 Entitlement enforcement (what engineering builds)

Per `entitlements-paywall-foundation.md`, capability checks, not plan checks. The lookup every gated mutation makes:

```
can(user, capability, context) →
  capability: 'project.create.passion' | 'project.create.paid' | 'table.create'
            | 'table.join.member' | 'project.applyPaid' | 'pool.propose' | ...
  context:   { hostOrgId, tableId? }
  returns:   { allowed, reason, limit, used, upgradePath }
```

| Capability | Free | Seat | Five | Host | Patron role | Partner role |
|---|---|---|---|---|---|---|
| `project.create.passion` | — | 1 active | 5 active | 5 active | — | — |
| `project.create.paid` | — | — | — | ✓ | ✓ (budget declared) | ✓ (budget declared) |
| `project.applyPaid` | — | ✓ | ✓ | ✓ | — | — |
| `pool.propose` | — | ✓ | ✓ | ✓ | — | — |
| `table.join.open` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `table.join.member` | — | ✓ | ✓ | ✓ | — | — |
| `table.create` | — | — | — | ✓ | — | — |
| `seat.cover` / `fellowship.fund` / `project.pledge` | — | — | — | — | ✓ | ✓ |

Denials always return the upgrade path ("Take a seat — $10/mo") — the paywall UX rules in the entitlements doc apply unchanged.

### 2.4 Host earnings — the open pricing decision

Hosts will be able to charge for tables. Three candidate models, decision pending (handoff DECISIONS_REQUIRED #2):

| Model | Shape | Precedent | Read |
|---|---|---|---|
| **A — % only** (handoff recommendation) | Paid-table hosts pay ~10% of what they collect, **no** monthly base. Free tables stay free. | — | Cleanest story: "get paid to gather." No rent + commission double-dip. |
| **B — Skool-style two-tier** | Low sub + high take: $9/mo + 10% + 30¢ · High sub + low take: $100/mo ($80 annual) + 2.9% + 30¢ | Skool (David's reference) | Lets serious hosts buy down the take rate. More to explain. |
| **C — Status quo** | $50/mo flat, no commission | Current flyer | Simple, but taxes hosts before they earn and gives us no upside in their growth. |

**Recommendation: A now, add B's buy-down tier only when a host's volume justifies it.** Whatever is chosen: state whether host fees feed the 50% pool (recommendation: they don't — dues do), and don't put paid tables on any pricing page before the payout path (Stripe Connect Express) exists.

---

## 3 · Projects — passion vs. paid

One `projects` collection, two kinds. The distinction is **who brings the money**, and it must be visible everywhere a project appears.

| | **Passion project** | **Paid project** |
|---|---|---|
| Posted by | A creative (seat holder) | A patron, partner, or host — anyone bringing budget |
| Money | Seeks support: pool grants, pledges, patron interest | Declares budget up front ("$400 mural") |
| Badge | `PASSION · SEEKING SUPPORT` | `PAID · $400` (mono badge, always the amount) |
| Creative's action | — (it's theirs) | Apply (seat required) |
| Community's action | Support: pledge, signal, collaborate | — |
| Completion | Story page credits supporters | Story page credits the funder + venue partner |

### Create flow (the entitlement guardrail)

1. **"Start a project"** → chooser, two cards: *"I'm making something and want support"* (passion) / *"I have a budget and need a creative"* (paid).
2. **Passion path** → `can(user,'project.create.passion')`. No seat → inline upsell: "Take a seat — $10/mo. One active project, and half your dues fund someone else's." At limit → "You have 1 active project. Five seats — $25/mo." Allowed → form (title, discipline, description, what support looks like, optional funding target, optional partner venue).
3. **Paid path** → `can(user,'project.create.paid')`. No patron/partner role → 60-second role registration (org name, contact verification), free. Form requires **budget** (number, not "negotiable"), scope, timeline. Payment settles off-platform in v1; the ledger records the commitment (`project_contribution`).
4. Both land on a project page with the kind badge, and enter the "just posted" rotation (Buzz rule: every new project surfaces within a minute, by rotation not merit).

Migration note: existing `jobs` become paid projects; existing behavior is preserved under the new badge. "Jobs" disappears from nav (→ "Projects").

---

## 4 · Onboarding flows

### 4.1 Per persona (first action ≤ one sitting, first proof ≤ one week)

| Persona | Entry | Flow | First proof we must engineer |
|---|---|---|---|
| **Creative** | Friend's invite, a house show, an open table | Browse open tables **without an account** → sit in on one → sign up (free) → post one thing they already made → take a seat when ready to start a project | A real person responds to their first post. Instrument this; if week one is silence, we failed. |
| **Host** | Already leads something held together with texts | Sign up → "Set your first table" wizard (four settings, §6) → import/invite their existing 10 → tables live same day | One project from their table funded, org name publicly on it |
| **Patron** | A creative they know, their church, a host asking for someone specific | "Cover one seat — $10/mo" — smallest door first, never $500 | A story update from the covered creative with their name in the credit line |
| **Partner** | A creative or host walks in and asks (relationship, then listing) | Host lists them (light model, no partner account needed) → claim link (`?claim=`) if they want it → post one offer | A full room on a slow night + a credit on the work made there |

### 4.2 Sponsored seats — how a church covers its creatives

The mechanism is a **seat-coverage code**, one per sponsorship agreement:

1. Church commits (bundle or N seats) → we (or the host) generate a coverage code — e.g. `GARDEN-STMARKS-25` — with N redemptions, an expiry, and the sponsor's display credit.
2. Sponsor receives a **one-page handout + QR** (auto-generated, credit-sheet style) linking to `thegarden.../join?code=…` — built to be dropped in a bulletin, slide, or group chat.
3. Creative scans → signup with the code pre-applied → **full seat, $0 to them**, "Covered by St. Mark's" on their membership and story credits (creative can set credit visibility; default on).
4. Sponsor dashboard: seats covered / redeemed / active, and the story updates from covered creatives — the forwardable proof.
5. Unredeemed seats visibly idle ("9 of 25 seats waiting") — a nudge for the sponsor's own announcement, not ours.

Codes are **coverage**, not discounts. There are no discount codes in the model — a seat is $10; the only question is who pays.

### 4.3 Onboarding Abiding Practice (the concrete first run)

1. The Garden launches with AP's community as the **default, unbranded experience** — tables, projects, and events simply belong to The Garden (§6). David is the first Host.
2. David's existing people arrive via his invite link/QR (personal introduction, not referral link).
3. AP's weekly virtual gathering becomes the first **open table** — no cap, ongoing, join without payment. That's the sit-in-first onramp.
4. Creatives take seats ($10) when they want to start projects; the church-sponsorship flow (§4.2) runs for those who can't or shouldn't pay.
5. First proof loop: the first pool-funded or patron-funded project publishes a story page and gets pushed to every member — evidence within the first month.

### 4.4 Onboarding feature gaps (build order inside Phase 1–2)

1. **Public browse** — open tables + public events + story pages readable with no account (also requires Task 1 SSR for previews)
2. **Persona-aware signup** — "What brings you?" → creative / patron / host / partner, shaping the first screen; roles addable later in settings
3. **Seat-coverage codes + QR handout + sponsor dashboard** (§4.2)
4. **Invite-as-introduction** — invites carry the inviter's name/face and land on the thing they were invited to, not a generic signup
5. **First-proof instrumentation** — alert when a new creative's first post has zero responses at day 5; surface to the host
6. **Channel link + media on profiles/projects** — YouTube channel link, embedded public video, podcast RSS link (§5)

---

## 5 · Media: what we already decided (restating so it stays decided)

Decided in `features/paid-community-youtube-media.md`, unchanged:

- **YouTube is the onramp, not the product.** Public interviews, performances, clips, trailers live on YouTube — that's where strangers find and subscribe. Every description links back to the canonical Garden page.
- **Private/member content never relies on YouTube.** Unlisted links are not access control and don't grow the channel. Gated video = **Cloudflare Stream with signed URLs**, served inside the app after an entitlement check.
- **Livestreams:** public → YouTube Live. Member/paid live sessions → **Zoom links gated by entitlement** first (v1), LiveKit only if recurring interactive demand proves out. Recordings of paid sessions → Cloudflare Stream, gated.
- **Podcasts (same logic extended):** public feed on the open podcast ecosystem (Spotify/Apple, as discovery), episode pages canonical on The Garden; member-only audio served through the app like gated video.

The pattern in one line: **public artifacts go where discovery lives; the canonical page, the archive, and everything gated live here.**

---

## 6 · Tables, seats, and the Garden-as-host question

**Model (from the handoff, confirmed):** a Table is one object with four settings — mode (in-person/virtual/hybrid), capacity (number or no-cap), term (fixed/ongoing + cadence), join policy (open/apply/invite). Open tables can **spawn** closed ones, carrying selected people. No table subtypes, ever.

**"Does a seat at the table map to the host's space?"** — disambiguation, canon:

| Term | Means | Bought/granted how |
|---|---|---|
| **A seat** (membership) | Your standing as a creative in The Garden | $10/mo, or covered by a sponsor |
| **A seat at a table** | Your place in one specific gathering | Join per the table's policy; counts against its capacity |
| **Covered seat** | A membership seat someone else pays for | Coverage code (§4.2) |

Membership is to The Garden (via a host org); tables are joined individually. One membership, many tables.

**Garden-as-default-host (launch decision, recommended):** at launch there is **one host org — The Garden itself** — and AP's community *is* that unbranded default. Members see tables and projects, not tenant brands. "Hosted by Abiding Practice" appears only if David wants the credit. TAS (or AP-as-brand) becomes the second, visibly-named host org when a real second community arrives — the tenancy tier exists in the schema from day one but stays invisible until it earns its place in the UI. This avoids shipping multi-tenant chrome for a single tenant.

---

## 7 · Roadmap

Content first (per direction), then membership + projects, then tables, then the economy around them.

| Phase | Theme | Ships | Depends on |
|---|---|---|---|
| **0 — Onramp** (now) | Be findable, shareable, watchable | Task 1 SSR (home + public pages, OG cards) · YouTube channel linked from site + profiles · public story pages · open tables/events browsable without account · app vocabulary pass (Jobs→Projects, Guide→Host…) | Nothing — all unblocked |
| **1 — Membership & projects** | Money in, guardrails on | Stripe checkout for $10/$25/$50 · capability lookup service · passion/paid project split + create flows (§3) · persona-aware signup · seat-coverage codes + QR + sponsor dashboard | Phase 0 vocabulary |
| **2 — Tables** | The gathering primitive | Table object (4 settings) · Table card UI (handoff near-spec) · open→spawn→closed flow · per-table join policies · AP's gatherings migrated onto it | Phase 1 (member join policy needs entitlements) |
| **3 — The scene** | The economy around the work | Partners light (host-listed + claim link + directory) · "This week's buzz" (city decision pending) · host earnings (decision §2.4) + Stripe Connect · gated media (CF Stream) + Zoom-gated live sessions | Phases 1–2; decisions #2–#4 |

Pending human decisions that gate pieces of this (from the handoff): name/trademark screen (assets), host pricing (§2.4), Buzz city threshold, partner directory public vs. logged-in.

---

## 8 · Spec-to-implementation queue

Each of these becomes its own implementation doc when its phase starts; this plan is their single source of truth:

1. **SSR/OG for public routes** — acceptance criteria already written in handoff Task 1
2. **Capability service** — schema in `entitlements-paywall-foundation.md`, tier map in §2.3
3. **Project split + create flows** — §3, including the jobs migration
4. **Signup + roles + coverage codes** — §4.1–4.2
5. **Table primitive** — handoff Task 3 data model verbatim, plus §6 seat disambiguation
6. **Buzz / Partners / Host payouts** — handoff Tasks 4–6, blocked on decisions
