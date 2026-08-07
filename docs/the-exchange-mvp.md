# The Exchange — MVP: Single-Fellowship Validation

> **Status — superseded as the current validation plan (2026-06-22).** Do not implement this scope unchanged. The current direction must also test paid membership, sponsored membership, and a Project Award funded by the membership grant-pool contribution plus direct patron funding. Use the [discernment brief](the-exchange-discernment-brief.md) and [vision v0.9](the-exchange-vision.md) for the next decision; revise this MVP after those tests are chosen.

*Companion to [the-exchange-vision.md](the-exchange-vision.md)*

*Version 0.2 — 2026-06-22 — terminology aligned with vision v0.8+ (Creative, Space); Founding Patron signal check added. Scope itself still awaiting revision per the status note above.*

---

## What this doc is

The smallest possible build of The Exchange that produces real evidence — by October — about whether the **Creative Fellowship + public story page** is the marketing engine we believe it to be.

If this MVP works, everything else in the [full vision](the-exchange-vision.md) earns its build cost. If it doesn't, the full vision is over-investment and we re-scope.

---

## The hypothesis

> **A publicly-visible, ongoing story of one sponsored creative doing creative work in the community — credited to a named patron — will (a) deepen the patron's commitment enough to renew, and (b) attract at least one new inbound patron inquiry.**

This is the single thing the MVP tests. Everything else is supporting infrastructure for that test.

---

## Success metrics (what makes this a "win")

| Metric | Target | Why it matters |
|---|---|---|
| **Patron renews at month 3** | Yes | Validates the model from the sponsor side — they got enough value to keep paying |
| **Inbound patron inquiries attribuspace to the story** | ≥1 | Validates the content loop — the public story actually drives new patrons, not just retains existing ones |
| **Story updates published in 3 months** | ≥3 | Validates the creative's willingness/ability to feed the loop |
| **Story page visitors** | ≥200 unique | Baseline reach signal; tells us if distribution mechanics work at all |
| **At least one secondary "I want this for my church" or "I want to be a Fellow" conversation** | Yes | Soft signal that the model is contagious |

If we hit renew + ≥1 inbound + ≥3 updates, we ship the rest of the vision. If we miss renew, we re-examine the patron value proposition before building anything else.

---

## MVP scope (visual)

```mermaid
flowchart TD
    classDef artist fill:#E8F4FD,stroke:#1E88E5,color:#000
    classDef sponsor fill:#FFF3E0,stroke:#FB8C00,color:#000
    classDef tableop fill:#E8F5E9,stroke:#43A047,color:#000
    classDef public fill:#FCE4EC,stroke:#D81B60,color:#000

    PATRON[💖 Patron church or org<br/>named, real]:::sponsor
    ARTIST[🎨 Named creative<br/>David's pick]:::artist
    OP[🪑 AP / David provisions<br/>Fellowship manually]:::tableop

    PATRON --> OP
    ARTIST --> OP
    OP --> F[📜 Fellowship record<br/>sponsor + creative + cadence + amount]
    F --> STORY[Creative posts story updates<br/>text, photo, video, audio]
    STORY --> PUB[🌐 Public Fellowship<br/>story page]:::public
    PUB --> INBOUND[New patron inquiry]
    PUB --> RENEW{Month 3:<br/>patron renews?}

    PATRON -. "$ recurring stipend<br/>off-platform" .-> ARTIST
```

Notice what's missing on purpose: no Sponsored Seats UI, no grant pool, no jury, no projects rename, no Tables, no Events, no Pathfinding, no sub-Spaces, no Stripe, no TAS, no second Fellowship. All of that is in the full vision; none of it is in MVP.

---

## What's in / what's out

### In scope

| Surface | Build state | Notes |
|---|---|---|
| `spaces` entity with **AP provisioned** | Schema + seed | Single Space only; multi-tenant abstraction proves itself by being honestly used once |
| **Profile** (existing Wonderwall profile, lightly extended) | Reuse current | Add a per-Space "intro" overlay field — minimum viable identity polish |
| **Fellowship** entity | New | sponsor, creative, cadence, amount, start date, status, public slug |
| **Fellowship story** entity | New | Author, body, mixed media URLs, published timestamp |
| **Story update composer** (creative-facing) | New, simple | Text + image upload + YouTube/Vimeo URL + audio URL; publish toggles public |
| **Public Fellowship story page** | New | The marketing surface; URL like `/ap/fellowships/[slug]`; public-by-default |
| **Patron dashboard view** (minimal) | New, simple | "Your Fellowship: [creative]. Latest updates. Link to public page." That's it. |
| **Manual operator workflow** (David/us) | Convex dashboard | No operator UI built — David tells us, we run mutations |
| **Cross-link from Wonderwall/Crossboard** | Reuse | Existing audience finds Fellowship via existing channels |

### Explicitly out of scope (deferred to post-MVP)

- Sponsored Seats UI and self-serve allocation
- Grant pool, project applications, jury, voting
- Projects rename (Jobs stays "Jobs" in code for now)
- Tables (small groups & cohorts) within a Space
- Events (working meetings, feedback loops, formation)
- Pathfinding (guides directory)
- TAS Space provisioning
- Sub-Spaces for cities
- Cross-Space platform-wide showcase
- Stripe / Cloudflare Stream / LiveKit / Zoom integration
- Multiple Fellowships in parallel
- Per-Space billing configuration
- Self-serve Space operator dashboard
- Pay-to-participate gates
- Native messaging on Fellowship pages (use existing messaging)

If David or Haley pushes for any of the above before October, we explicitly trade against the renewal/inbound metric.

---

## User journeys (MVP)

### 1. Creative (the Fellow)

**Outcome:** Funded creative work + a public body of work that demonstrates what patronage produces.

```mermaid
flowchart TB
    classDef artist fill:#E8F4FD,stroke:#1E88E5,color:#000
    A1[Receive Fellowship invitation<br/>email from David]:::artist
    A1 --> A2[Sign in / create profile<br/>existing Wonderwall flow]:::artist
    A2 --> A3[See Fellowship dashboard<br/>'You are a Fellow of AP, sponsored by X']:::artist
    A3 --> A4[Compose story update<br/>text + photo + optional video/audio]:::artist
    A4 --> A5[Preview public page]:::artist
    A5 --> A6[Publish update]:::artist
    A6 --> A7[See update live on<br/>public Fellowship page]:::artist
    A7 --> A4
```

**Key UX requirements:**
- **One-screen onboarding** for an invited Fellow. Skip anything that isn't profile-essential.
- **Story composer is dead-simple** — single page, no rich-text gymnastics. Title + body + up to 5 media items (image upload, YouTube/Vimeo URL, audio URL, link). Publish or save draft.
- **Frictionless re-entry**: an creative who posts once should be able to post again in under 90 seconds from cold email.
- **Public preview before publish** — they always see what the patron and public will see.
- **No private/public confusion** — every update is published to the public page by default; a "keep this one private" toggle exists but defaults off.

### 2. Patron (the sponsor)

**Outcome:** Visible, ongoing proof that their money is producing creative-missionary work in the community — the kind of thing they can show their board, their congregation, or their next donor.

```mermaid
flowchart TB
    classDef sponsor fill:#FFF3E0,stroke:#FB8C00,color:#000
    S1[Receive patron invitation<br/>email from David]:::sponsor
    S1 --> S2[Sign in / create patron account<br/>minimal: name, email, org name]:::sponsor
    S2 --> S3[Patron dashboard:<br/>your Fellowship + creative + amount + cadence]:::sponsor
    S3 --> S4[See latest story updates inline]:::sponsor
    S3 --> S5[Click to public Fellowship page]:::sponsor
    S5 --> S6[Share public page<br/>with board / congregation]:::sponsor
    S3 --> S7[Optional: send encouragement<br/>via existing messaging]:::sponsor
    S4 --> S8[Month 3: renewal conversation<br/>handled off-platform by David]:::sponsor
```

**Key UX requirements:**
- **Patron account is minimal** — no portfolio, no skills, no bio required. Name + email + org affiliation. They're not building a profile; they're tracking a relationship.
- **Patron dashboard fits in one viewport**: Fellowship summary card → recent story updates → "View public page" button → "Send encouragement" button. That's it.
- **The public page IS the share artifact** — patron should be able to grab a clean URL and screenshot-worthy view to send to their congregation. The page should look polished even with one story update.
- **Patron credit is prominent but tasteful** — opt-in default-on for visible credit; opt-in for logo placement. Style with the Anthropic-brand-quality care you'd give a real publication.
- **No checkout flow in MVP** — money moves off-platform (check, ACH, whatever David and the patron already do). We just record the commitment.

### 3. Space Operator (David / us, manually)

**Outcome:** Run the Fellowship cleanly enough that the creative and patron both feel taken care of, and capture enough story output to make the case for the next Fellowship.

```mermaid
flowchart TB
    classDef tableop fill:#E8F5E9,stroke:#43A047,color:#000
    T1[David identifies sponsor<br/>+ creative pair offline]:::tableop
    T1 --> T2[Tell us: provision Fellowship<br/>via Slack / email]:::tableop
    T2 --> T3[We run mutation to create:<br/>Fellowship record + invite emails]:::tableop
    T3 --> T4[Creative and patron onboarded]:::tableop
    T4 --> T5[Monitor: are updates being posted?<br/>Is patron engaging?]:::tableop
    T5 --> T6[Nudge creative if no update in 3 weeks]:::tableop
    T5 --> T7[Light-touch curation:<br/>feature best update on AP Space page]:::tableop
    T7 --> T8[Month 3: David has renewal<br/>conversation with patron]:::tableop
    T8 --> T9[Capture renewal outcome<br/>+ inbound inquiry count]:::tableop
```

**Key UX requirements (for *us*, since the operator surface is manual):**
- **No operator UI built**. David tells us via Slack / Granola notes; we run Convex mutations. This is fine for one Fellowship and forces us to feel the operator pain before designing for it.
- **Internal runbook**: a short checklist for provisioning a Fellowship — schema fields needed, invite email template, monitoring cadence.
- **Engagement telemetry on us**: we set up basic page-view analytics, story-update counts, and a weekly "Fellowship health" check so David doesn't have to ask.
- **Nudge ourselves to nudge David** — calendar-driven, not vibe-driven. Week 4, week 8, week 12 check-ins.
- **Founding Patron signal check** — at week 6 and week 12, explicitly ask David whether the patron is showing institutional-scale interest (a $10k+/yr Founding Patron relationship). If yes, the MVP is also prototyping the platform's most important Year-1 revenue line.

---

## Financial mechanics (MVP)

### MVP money flow

```mermaid
flowchart LR
    classDef src fill:#FFF3E0,stroke:#FB8C00,color:#000
    classDef sink fill:#E8F4FD,stroke:#1E88E5,color:#000
    classDef pool fill:#E8F5E9,stroke:#43A047,color:#000
    classDef plat fill:#F3E5F5,stroke:#8E24AA,color:#000

    PATRON[💖 Patron org<br/>e.g. Dan's church]:::src
    ARTIST[🎨 Fellow creative]:::sink
    PLATFORM[⚙️ The Exchange<br/>$0 platform fee in MVP]:::plat

    PATRON -. "$ recurring stipend<br/>off-platform — check / ACH" .-> ARTIST
    PATRON -. "no platform cut yet" .-> PLATFORM
```

**MVP financial design choices:**
- **Money moves off-platform.** We're not handling payments in MVP. Patron pays creative directly (check, ACH, Venmo, however they prefer). We record the commitment in the Fellowship record but don't process the transaction.
- **No platform fee in MVP.** We forgo revenue to remove all friction. The validation question is whether the *model* works, not whether the *platform can take a cut*. We add the platform cut after the model is validated.
- **Cadence and amount are configurable per Fellowship.** Whatever David and the patron agree to — monthly, quarterly, lump sum + monthly check-ins. Schema supports any of these.
- **Fulfillment tracking is optional in MVP.** We can record "paid in month 1" as a manual checkbox if it's useful, but we don't enforce it.

For the full set of financial mechanisms the platform will eventually support, see [the full money-flow diagram in the vision doc](#full-vision-money-flow-for-reference) (also reproduced in the appendix below).

---

## Minimum data model

```typescript
// New
spaces: {
  slug: string,                // "ap"
  name: string,                // "Abiding Practice"
  brand: { logoUrl?, primaryColor?, intro? },
  operatorUserId: Id<"users">, // David
  status: "active" | "draft",
  createdAt: number,
}

spaceMemberships: {
  spaceId: Id<"spaces">,
  userId: Id<"users">,
  role: "member" | "fellow" | "patron" | "operator",
  introOverlay?: string,       // Space-specific intro emphasis
  joinedAt: number,
}

fellowships: {
  spaceId: Id<"spaces">,
  creativeUserId: Id<"users">,
  patronUserId: Id<"users">,   // the contact at the patron org
  patronOrgName: string,       // displayed publicly
  patronOrgLogoUrl?: string,
  cadence: "monthly" | "quarterly" | "one_time",
  amountCents: number,
  startDate: number,
  status: "active" | "paused" | "ended" | "renewed",
  publicSlug: string,          // for /ap/fellowships/[slug]
  publicVisibility: "public" | "members_only", // default public
  patronCreditVisible: boolean, // default true
  createdAt: number,
  endedAt?: number,
}

fellowshipStories: {
  fellowshipId: Id<"fellowships">,
  authorUserId: Id<"users">,   // typically the Fellow
  title?: string,
  body: string,                // markdown
  media: Array<{ kind: "image" | "video_url" | "audio_url" | "link", url: string, caption?: string }>,
  publishedAt?: number,        // null = draft
  isPublic: boolean,           // default true
  createdAt: number,
  updatedAt: number,
}
```

**Notes:**
- We're reusing existing `users` and `profiles` spaces — no changes needed.
- `spaceMemberships.role: "fellow" | "patron"` is the entitlement signal in MVP; full capability-based entitlements ([entitlements-paywall-foundation.md](features/entitlements-paywall-foundation.md)) come later.
- No `organizations` space — `patronOrgName` is a string in MVP. We promote to a real org record when we have more than one Fellowship from the same patron.

---

## Surfaces & routes (MVP-only)

| Route | Audience | Purpose |
|---|---|---|
| `/ap` | Public | AP Space landing — describes the Space, lists Fellowships, has "Become a patron" CTA |
| `/ap/fellowships/[slug]` | Public | The Fellowship story page — patron credit, creative intro, reverse-chronological story updates |
| `/dashboard/fellow` | Fellow (creative) | Story composer + list of past updates |
| `/dashboard/patron` | Patron | Fellowship summary + latest updates + share button |
| `/dashboard/operator` *(deferred)* | David | Not built — David uses Slack to talk to us |

**Public page styling notes:**
- Treat the public Fellowship page as the design centerpiece. It is the artifact that does the marketing. Every other screen can be utilitarian; this one should be beautiful.
- Mixed-media story updates should feel editorial, not feed-y. Think "longform with photos," not "Instagram grid."
- Patron credit appears in a dedicated "Supported by" section, with logo if provided, and a "Become a patron" CTA that goes to a contact form for David (not self-serve checkout).
- Mobile-first; share-card metadata (OG tags) are non-negotiable since the patron will share this externally.

---

## Manual operations (what's done by hand vs. built)

| Task | Built | Manual (us + David) |
|---|---|---|
| Provision Fellowship | mutation exists | David tells us via Slack; we run it |
| Invite creative and patron | invite email template | We send the email manually |
| Money transfer | – | Entirely off-platform |
| Renewal conversation | – | David handles, tells us outcome |
| Featuring a story update on AP landing | "featured" boolean on story | David tells us which one; we toggle |
| Attribution tracking for inbound inquiries | contact form on public page | We tag and report manually |
| Analytics review | basic page-view counter | We do weekly check-ins |

**This is intentional.** Building operator UI before we know if the model works is the most common way pre-validation products waste time. We feel the operator pain by being the operator.

---

## Timeline to October showcase

Assuming a typical 1–2 dev capacity and that October showcase is the deadline:

| When | Milestone |
|---|---|
| Now → +2 weeks | Schema + mutations for Spaces, SpaceMemberships, Fellowships, FellowshipStories. Seed AP Space. |
| +2 → +4 weeks | Public Fellowship story page (the design centerpiece). Public AP Space landing page. |
| +4 → +5 weeks | Fellow dashboard + story composer. Onboarding flow for invited creatives. |
| +5 → +6 weeks | Patron dashboard (minimal). Patron onboarding flow. Share-card metadata. |
| +6 weeks | Provision the real first Fellowship. David + the named patron + the named creative. Go live. |
| +6 → October | Story updates accrue; we monitor; David has renewal conversation; we measure metrics. |
| October | Showcase uses the live Fellowship as its centerpiece. |

Risk if any phase slips: cut the patron dashboard first (patron can use the public page + email). Cut Space landing page second (Fellowship page can stand alone). Don't cut the public Fellowship page or the story composer — those are the test.

---

## What we learn either way

| Outcome | What we do next |
|---|---|
| **Win** (renew + ≥1 inbound + ≥3 updates) | Ship the rest of the vision: Sponsored Seats, Grant Pool, second Fellowship, TAS Space, Stripe |
| **Partial** (renew but no inbound) | Story page works for retention but not for acquisition. Investigate distribution: is the showcase visible enough? Are share mechanics good enough? Iterate on the public page before expanding |
| **Partial** (inbound but no renew) | Story page works for acquisition but patron value isn't strong enough. Investigate: was the creative's output what the patron expected? Was the patron getting enough proof? Iterate on patron experience |
| **Miss** (no renew, no inbound) | The Fellowship-with-public-story is not the engine. Reconsider before building more. Could mean: wrong creative/patron pair, wrong story format, wrong audience, wrong model. Talk to David before re-scoping |

---

## Open questions for David before we start building

These need answers before Phase 1:

1. **Who's the first Fellow?** A specific named creative David is ready to commit to.
2. **Who's the first patron?** A specific named org/individual ready to commit funds for 3+ months. (Dan's church sounds like the candidate.)
3. **What's the stipend amount and cadence?** Drives the Fellowship record and the renewal math.
4. **How prominent should patron credit be?** Default-prominent in MVP, but confirm tone with David and the patron.
5. **Where does the showcase event live physically?** Affects whether we need an event-page component or just the public Fellowship page.
6. **What inbound channel do we instrument?** Contact form on public page → Slack notification → David? Email?

---

## Appendix: full vision diagrams (for reference)

The MVP is a deliberate subset of the full vision. These diagrams (from [the-exchange-vision.md](the-exchange-vision.md)) show where MVP fits and what gets added after.

### Full user-flow + money-flow diagram

```mermaid
flowchart TB
    classDef artist fill:#E8F4FD,stroke:#1E88E5,color:#000
    classDef sponsor fill:#FFF3E0,stroke:#FB8C00,color:#000
    classDef tableop fill:#E8F5E9,stroke:#43A047,color:#000
    classDef platop fill:#F3E5F5,stroke:#8E24AA,color:#000
    classDef outcome fill:#FFFDE7,stroke:#FBC02D,color:#000,stroke-width:3px

    subgraph ARTIST["🎨 ARTIST — outcome: funded work + visibility"]
        direction TB
        A1[Sign up + global profile] --> A2[Join a Space<br/>free OR pay-to-participate]
        A2 --> A3{Path}
        A3 -->|Apply to existing| A4[Apply to sponsor-posted project<br/>or grant pool opportunity]
        A3 -->|Propose own| A5[Propose passion project<br/>+ invite collaborators]
        A4 --> A6[Peer review + community signal]
        A5 --> A6
        A6 --> A7[Application submitted]
        A7 --> A8{Hybrid jury decision}
        A8 -->|Revise| A6
        A8 -->|Funded| A9[Kick off, post progress updates]
        A9 --> A10[Deliver work +<br/>public story page]
        A10 --> AO[✨ Funded work<br/>+ public visibility<br/>+ Fellowship pathway]
    end

    subgraph SPONSOR["💖 SPONSOR / DONOR — outcome: visible mission impact"]
        direction TB
        S1[Sign up + donor dashboard] --> S2[Discover Spaces]
        S2 --> S3{Choose path}
        S3 -->|Post new project| S4[Define project + commit funds]
        S3 -->|Back existing| S5[Browse + pledge]
        S3 -->|Sponsor seats| S6[Buy N seats at Space]
        S3 -->|Sponsor an creative| S7[Fellowship: recurring stipend]
        S4 --> S12[Reports + story updates]
        S5 --> S12
        S6 --> S12
        S7 --> S12
        S12 --> SO[✨ Mission impact<br/>+ visible patronage]
    end

    subgraph TABLEOP["🪑 SPACE OPERATOR — outcome: thriving community"]
        direction TB
        T1[Provision Space] --> T2[Configure entitlements]
        T2 --> T3[Recurring grant pool]
        T3 --> T4[Curate Tables]
        T4 --> T5[Review applications]
        T5 --> T6[Jury + community signal]
        T6 --> T7[Allocate grants]
        T7 --> T8[Publish stories]
        T8 --> T9[Report to sponsors]
        T9 --> TO[✨ Recurring patron base<br/>+ showcase story]
    end

    subgraph PLATOP["⚙️ THE EXCHANGE — outcome: sustainable network"]
        direction TB
        P1[Onboard Space operators] --> P2[Identity, billing, media infra]
        P2 --> P3[Cross-Space showcase]
        P3 --> P4["SaaS fee + transaction %"]
        P4 --> PO[✨ Recurring revenue<br/>+ network effect]
    end

    S6 -. "$ seat fees" .-> T2
    S4 -. "$ project funding" .-> T7
    S5 -. "$ project pledge" .-> T7
    S7 -. "$ recurring stipend" .-> T8
    T3 -. "$ grant pool" .-> T7
    T7 -. "$ payout" .-> A9
    T8 -. "$ recurring to fellow" .-> A9
    A2 -. "$ optional dues" .-> T2
    T2 -. "$ SaaS / % fee" .-> P4
    A10 -. story + report .-> S12
    A10 -. content for showcase .-> T8

    class A1,A2,A3,A4,A5,A6,A7,A8,A9,A10 artist
    class S1,S2,S3,S4,S5,S6,S7,S12 sponsor
    class T1,T2,T3,T4,T5,T6,T7,T8,T9 tableop
    class P1,P2,P3,P4 platop
    class AO,SO,TO,PO outcome
```

In MVP terms: we are building **only** the right-hand "Sponsor an creative" branch (S7), the creative's "post story update" leg (A9 → A10), the Space operator's "publish stories" step (T8), and the public showcase surface. Everything else is in the diagram so we don't forget it exists.

### Full vision money flow (for reference)

```mermaid
flowchart LR
    classDef src fill:#FFF3E0,stroke:#FB8C00,color:#000
    classDef pool fill:#E8F5E9,stroke:#43A047,color:#000
    classDef sink fill:#E8F4FD,stroke:#1E88E5,color:#000
    classDef platform fill:#F3E5F5,stroke:#8E24AA,color:#000

    SP1[Patron org]:::src
    SP2[Individual donor]:::src
    SP3[Member creative]:::src
    SP4[External grant]:::src

    SEATS[Sponsored Seat Pool]:::pool
    GRANT[Space Grant Pool]:::pool
    FELLOW[Creative Fellowship]:::pool
    PROJ[Project Pledge]:::pool

    ART[Creative payout]:::sink
    MEM[Subsidized seat]:::sink

    EXCH[The Exchange platform fee]:::platform
    TABLEOP[Space Operator retained]:::platform

    SP1 -- "buy seats" --> SEATS
    SP1 -- "fund Fellowship" --> FELLOW
    SP1 -- "pledge to project" --> PROJ
    SP2 -- "pledge to project" --> PROJ
    SP2 -- "fund Fellowship" --> FELLOW
    SP3 -- "membership dues" --> TABLEOP
    SP4 -- "top-up grant pool" --> GRANT
    TABLEOP -- "fund pool" --> GRANT
    SEATS -- "claimed by" --> MEM
    GRANT -- "jury allocation" --> ART
    FELLOW -- "recurring stipend" --> ART
    PROJ -- "on milestone" --> ART
    SEATS -. "% fee" .-> EXCH
    GRANT -. "% fee" .-> EXCH
    FELLOW -. "% fee" .-> EXCH
    PROJ -. "% fee" .-> EXCH
    TABLEOP -. "SaaS subscription" .-> EXCH
```

In MVP terms: we are only exercising the **FELLOW** path from SP1 → FELLOW → ART, and we're forgoing the platform fee. Everything else is post-MVP.

---

*Next steps: confirm the open questions with David, lock in the first Fellow + first patron, start Phase 1 schema work.*
