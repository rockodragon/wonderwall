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
| **A seat** | $10/mo | Creative | Everything free, plus: **create 1 active passion project**, **post paid projects** (budget declared), **put on events**, apply to paid projects, join member tables, propose to grant pool |
| **Five seats** | $25/mo | Prolific creative | As seat, but **up to 5 active passion projects**, invite collaborators onto them |
| **Host** | $50/mo, waived for charging hosts — §2.4 | Creative who leads | As five seats (10 active passion projects), plus: **create tables** (any mode), spawn closed tables from open ones, curate a project space, receive patron routing, earn on paid tables |
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
| `project.create.passion` | — | 1 active | 5 active | 10 active | — | — |
| `project.create.paid` | — | ✓ | ✓ | ✓ | ✓ | ✓ |
| `project.applyPaid` | — | ✓ | ✓ | ✓ | — | — |
| `pool.propose` | — | ✓ | ✓ | ✓ | — | — |
| `event.create` | — | ✓ | ✓ | ✓ | — | ✓ |
| `table.join.open` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `table.join.member` | — | ✓ | ✓ | ✓ | — | — |
| `table.create` | — | — | — | ✓ | — | — |
| `seat.cover` / `fellowship.fund` / `project.pledge` | — | — | — | — | ✓ | ✓ |

**Capability legend:**

- `project.create.passion` — start your own creative work seeking community support
- `project.create.paid` — post work with a declared budget attached (a commission, a gig)
- `project.applyPaid` — apply to someone else's paid project
- `pool.propose` — put your passion project forward for a **grant-pool** award (the pot 50% of dues feeds). Seat-gated because the pool is members' dues money reserved for members' work; patrons/partners direct their own money instead
- `table.join.open` / `table.join.member` — sit in on an open table / join a members-only table
- `event.create` — put on a **one-off happening with attendees** (a show, an open mic, a gallery night). Seat-level on purpose: creatives gathering people is the community working, not a premium feature. Partners can post their own venue nights.
- `table.create` — create a **Table**: a *continuing* gathering with a roster — people belong, it has a term, it can spawn a cohort, it gets a curated project space and patron routing. The event/table line: attendees show up; a roster belongs. Not a tenant — host *organizations* are provisioned by us, not self-serve
- `seat.cover` / `fellowship.fund` / `project.pledge` — the patron money-in acts

`project.create.paid` requires a **declared budget** in every case — the guardrail on paid projects is that the money is real, not which persona posts it (a creative with a grant hiring a composer is exactly the money-in we want). Passion-project caps (1/5) exist because passion projects consume community attention and pool funds; paid projects bring money in and are uncapped in v1.

Denials always return the upgrade path ("Take a seat — $10/mo") — the paywall UX rules in the entitlements doc apply unchanged.

### 2.4 Host earnings — DECIDED: Model A (2026-08-09)

**The decision:** a host who charges for tables pays **~10% of what they collect and no monthly base**; a host who doesn't charge pays **$50/mo** for the hosting tools; free/open tables are always free to run. The Skool-style buy-down tier (Model B) gets added when any host's collections make the 10% take consistently exceed ~$100/mo (≈ $1k/mo collected). The three models considered, for the record:

| Model | Shape | Precedent | Read |
|---|---|---|---|
| **A — % only** (handoff recommendation) | Paid-table hosts pay ~10% of what they collect, **no** monthly base. Free tables stay free. | — | Cleanest story: "get paid to gather." No rent + commission double-dip. |
| **B — Skool-style two-tier** | Low sub + high take: $9/mo + 10% + 30¢ · High sub + low take: $100/mo ($80 annual) + 2.9% + 30¢ | Skool (David's reference) | Lets serious hosts buy down the take rate. More to explain. |
| **C — Status quo** | $50/mo flat, no commission | Current flyer | Simple, but taxes hosts before they earn and gives us no upside in their growth. |

**Why %-only is not in tension with platform revenue — hosts are the channel, not the customer.** The platform's stack doesn't depend on host fees: (1) 10% of every membership a host's community generates, plus processing margin; (2) the 40% operator share of dues, which accrues to the platform itself while The Garden is the default host org (§6); (3) 10% of all patronage flows; (4) 10% of paid-table collections once payouts ship; (5) **$50/mo from hosts who don't charge** — Model A waives the base only for monetizing hosts. A host who gathers 100 members at $10 generates $1,000/mo in dues before charging for anything. Renting the tools *and* taking commission is how the channel leaves for a group chat.

Whatever is chosen: state whether host fees feed the 50% pool (recommendation: they don't — dues do), and don't put paid tables on any pricing page before the payout path (Stripe Connect Express) exists.

### 2.5 What drives upgrades

Every upgrade fires at a **denial moment with intent** — someone tries to do a thing and meets the gate with a clear path through it (the paywall UX rules in the entitlements doc). The ladder:

| Upgrade | The moment | Strongest driver | Weakest link / lever |
|---|---|---|---|
| **Free → Seat** | Tries to apply to a paid project, start a passion project, put on an event, or join a members-only table | **Access to paid work** — "get my work seen and funded" is the JTBD verbatim. Second: belonging + "half your dues fund another creative" | If there are no paid projects to apply to, the top driver is dead. **Supply of paid projects is the seat-conversion lever** — recruit patrons/partners posting gigs before pushing seat upgrades |
| **Seat → Five** | Hits the 1-active cap mid-momentum on a second work | Prolific output + **collaborator invites** (five's distinctive perk) | Narrow audience by design — a convenience tier, not a pillar |
| **Five → Host** | Already gathers people; wants a roster, the open→cohort spawn, the credit on funded works | Today: identity + tools ("I want to be the one who makes that room"). **After payouts ship: earnings** — "get paid to gather the people you already gather" becomes the #1 driver | Until payouts exist, $50 buys tools only; expect slow host conversion until Phase 3 |
| **Free → Patron acts** | A *specific person* they want behind — cover Shua's seat, not "support the arts" | The name in the ask, then the **story update with their credit line** (the retention loop) | Generic asks convert poorly; never lead with the $500 door — the $10 covered seat is the funnel mouth |
| **Coverage codes** | A church removes the price objection entirely | $0 seat + sponsor credit | Idle unredeemed seats — surface them to the sponsor, whose announcement is the distribution |

Two portfolio-level conclusions: (1) **paid-project supply drives seat conversion** more than any pricing tweak — patron/partner recruitment is growth work for the creative funnel; (2) **host payouts are the host tier's real engine** — before Phase 3, sell hosting on identity and tools, honestly.

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
2. **Passion path** → `can(user,'project.create.passion')`. No seat → inline upsell: "Take a seat — $10/mo. One active project, and half your dues fund someone else's." At limit → "You have 1 active project. Five seats — $25/mo." Allowed → form, **media-first**: a cover image or video leads ("let the work speak first"); title and one-liner are **auto-drafted from the upload and description** for the creative to edit — never auto-published. Then: discipline, what support looks like, optional funding target, optional partner venue.
3. **Paid path** → `can(user,'project.create.paid')`. Any seat holder qualifies; an account with neither seat nor role gets a 60-second patron/partner role registration (org name, contact verification — free). Registration includes an optional **logo upload** — the funder's mark goes in the credit line on the work. Form requires **budget** (a number, not "negotiable"), scope, timeline, and optionally a photo/sketch of the space or vision — creatives apply to what they can see. **No applicant counts are shown on paid projects** — a competition scoreboard discourages the exact person we want to apply; time facts only ("posted this week · reviewed Fridays"). Payment settles off-platform in v1; the ledger records the commitment (`project_contribution`).
4. Both land on a project page with the kind badge, and enter the "just posted" rotation (Buzz rule: every new project surfaces within a minute, by rotation not merit).

Migration note: existing `jobs` become paid projects; existing behavior is preserved under the new badge. "Jobs" disappears from nav (→ "Projects").

---

### 3.1 UI decisions locked by the mocks (2026-08-09)

- **Signup order:** I make things → I fund work → I have a place or resources → I gather people. Funders second because paid-project supply drives seat conversion (§2.5); hosts last because hosts arrive already knowing they're hosts.
- **The split strip is the receipt.** While The Garden is the default host org it shows two cells ("$5 another creative's project / $5 the garden — the place itself"); a named host org gets the three-cell "$4 your host · $5 · $1 us" variant. The default-host share flowing to the platform is true and unstated.
- **Every checkout ends in an invitation** ("Save a seat for someone") — a personal introduction, not a referral link; skippable in one tap.
- **The anti-ad line appears at the seat gate:** "No ads. No algorithm. You're not the product — your seat is what keeps this place alive."
- **Patronage has two doors, one copy rule.** Warm patrons (the launch channel — they arrive knowing a creative) get the named cover module. Cold patrons get "Cover a seat — we'll seat a creative": host discernment matches them to one opted-in person within a week, then updates + credit line follow. The copy rule stands — name the person, never the abstract cause — but matching solves the cold start. Guardrails: creatives opt in to being coverable, every surface leads with work not need, and $10 is literally one seat (no pooling).
- **Hosts distribute invitations both ways:** platform-sent personal introductions, or a self-serve table link + QR (`garden.app/t/<slug>`) for the group chat, bio, or bulletin.
- Mocks live in `docs/mocks/` and are the design source for these flows.

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
| **0 — Onramp** (now) | Be findable, shareable, watchable | Task 1 SSR (home + public pages, OG cards) · YouTube channel linked from site + profiles · public story pages · open tables/events browsable without account · app vocabulary pass (Jobs→Projects, Guide→Host…) · **the first Garden event, posted publicly in the platform** — the conversation that widens the tent beyond Rick, David, Haley, Joseph; the outside-visitor view of that event page is the acceptance test for public events | Nothing — all unblocked |
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
