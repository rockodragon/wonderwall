# Handoff: The Garden — rebrand, vocabulary, and three new surfaces

## Overview

This package covers a brand and product-model change for a platform currently shipping as
**TheCrossBoard** (`thecrossboard.org`) with marketing pages branded **The Garden**
(`thecrossboard.org/about/*`, footer `thegarden.app`).

It contains four kinds of work, and **only two of them are code**:

| # | Work | Who |
|---|------|-----|
| 1 | Naming, trademark screen, domain purchase, pricing decisions | **Human — do not let an agent decide these** |
| 2 | Server-rendering the homepage (SEO/OG) | Code |
| 3 | Vocabulary find-and-replace across product + marketing | Code (mechanical, see `CHANGES.md`) |
| 4 | Three new/changed surfaces: the Table primitive, Community Partners, "This week's buzz" | Code (specs below) |

**Read `DECISIONS_REQUIRED.md` first.** Several tasks below are blocked on a human choice, and
implementing them early means redoing them.

---

## About the design files

The `.dc.html` files in this bundle are **design references created in HTML** — prototypes that
show intended look, vocabulary, and behavior. They are **not production code to copy**.

The task is to recreate the relevant pieces in the target codebase's existing environment
using its established patterns, component library, and routing. The current product appears to be
a client-rendered React app; confirm before choosing an approach.

The design files are documents *about* the product, not screens *of* it. Inside them are a handful
of embedded mockups that ARE near-spec — those are called out per task below with the file and
section to look at.

## Fidelity

**Mixed, deliberately:**

- **Hi-fi:** design tokens, type stack, the Table card, and the "This week's buzz" surface.
  Exact hex values and font stacks are given below and should be matched.
- **Lo-fi / directional:** the homepage hero and the redesigned flyer. These establish layout
  logic, hierarchy, and copy — not final pixel positions. Apply the tokens and the structure;
  don't treat the mockup's exact spacing as normative.
- **Not designed yet:** every authenticated app screen (feed, profile, project page, messages,
  the existing nav). Those need design work before implementation. Do not infer them.

---

## Design tokens

The new system is built around the idea of a **credit** (film titles, liner notes, gallery wall
labels) — monospace metadata, a tight grotesque for names, hairline rules, one acid accent.

### Color

| Token | Hex | Use |
|-------|-----|-----|
| `ink` | `#121212` | Primary ground |
| `paper` | `#F7F7F4` | Primary text on ink; light-mode ground |
| `hairline` | `#2A2A28` | Borders, rules, card edges |
| `dim` | `#6F6F69` | Metadata labels, disabled |
| `muted` | `#8B8B85` | Secondary metadata |
| `body` | `#A8A8A0` | Body copy on ink |
| `citron` | `#D7F25A` | Single accent — marks, links, primary button fill, one highlighted word |

Rules, and they matter:

- **No gradients anywhere.** The current site's blue→purple→pink gradient type and gradient CTA
  are the two most dated elements in the identity and are being removed, not restyled.
- **No pure black, no pure white.** Use `ink` and `paper`.
- **No drop shadows on dark grounds.** Elevation is a 1px `hairline` border, nothing else.
- **Citron is never a large fill.** It is a mark, a rule, a single word, or a button. Never a
  section background.
- Retire the existing 2×2 rounded-square logo mark. Ship a wordmark only
  (letterspaced, see typography). A symbol can be commissioned later.

### Typography

| Role | Family | Weights | Notes |
|------|--------|---------|-------|
| Display | **Bricolage Grotesque** | 500, 600 | Names, headlines. `letter-spacing: -0.02em` to `-0.04em`, tighter as size grows. `line-height: 0.98`–`1.15` |
| Body | **Archivo** | 400, 500 | Paragraphs, descriptions. `line-height: 1.6` |
| Metadata | **JetBrains Mono** | 400, 500 | All labels, credits, counts, timestamps, settings. Uppercase, `letter-spacing: 0.10em`–`0.18em`, sizes 10–12px |

All three are on Google Fonts. The wordmark is "The Garden" set in JetBrains Mono uppercase at
`letter-spacing: 0.28em`.

**Minimum body size is 17px.** The current flyers set 15px grey on white at a ~55-character
measure, which the client identified as unreadable. Do not go below 17px for body copy, and use
`ink`-level contrast, not grey.

### Geometry

| Token | Value | Use |
|-------|-------|-----|
| `radius-sm` | `3px` | Buttons, tags, badges |
| `radius-md` | `10px` | Cards |
| Border | `1px solid hairline` | All card and input edges |

---

## Task 1 — Server-render the homepage

**Priority: highest. Blocked on nothing. Ship independently of every other decision.**

### Problem

`GET https://thecrossboard.org` returns a client-rendered shell. Verified: no `<title>`, no
`<meta name="description">`, and a body containing only the string `Loading…`. The
`/about/*` pages are static and fully tagged, so the marketing sub-pages currently outrank and
out-share the site's own front door.

### Acceptance criteria

- [ ] `curl -s https://<domain>/ | grep -c "<title>"` returns 1, with real content
- [ ] `<meta name="description">` present and non-empty
- [ ] `<meta property="og:title|og:description|og:image">` present; OG image resolves to a real
      1200×630 asset
- [ ] `<meta name="twitter:card" content="summary_large_image">`
- [ ] The hero headline and subhead are present in the HTML source with JavaScript disabled
- [ ] Lighthouse SEO ≥ 95
- [ ] Same treatment applied to every public route: `/`, each `/about/*`, project story pages,
      public table pages, and partner pages

### Notes

Whatever the app framework, the public marketing surface and public story pages need SSR or
static generation. Story pages are the ones patrons forward to their boards — they must
render a correct preview card when pasted into a text message or Slack. This is arguably the
single highest-value item in the whole package.

---

## Task 2 — Vocabulary

**Blocked on: nothing (the six role words are settled). See `CHANGES.md` for exact strings.**

Six words are fixed platform-wide. They must mean the same thing in every host's space,
because they touch money and credit:

`Creative` · `Patron` · `Host` · `Table` · `Seat` · `Project` / `Fellowship`

The most important replacements:

- `Guide`, `Pathfinder`, `Director`, `Coach` → **`Host`** (four words collapse to one)
- `Community leader` → **`Host`**
- `cohort`, `group`, `space`, `circle` (as a noun for a gathering) → **`Table`**
- `member`, `artist`, `maker` → **`Creative`**
- `back` / `backed by` in headlines → **`support` / `supported by`**

`CHANGES.md` has the full table with exact before/after strings, including the marketing copy
rewrites. Treat it as a checklist; several are user-visible strings in more than one place
(product UI, marketing pages, transactional email templates, invite copy).

### Acceptance criteria

- [ ] `rg -i "pathfinder|guide|community leader" --type-add 'src:*.{ts,tsx,js,jsx,html,md,json}'`
      returns no user-facing role usages
- [ ] No user-facing string contains `backed by` except where it literally means cash
- [ ] Copy strings are centralized enough that a future rename is one file, not fifty

---

## Task 3 — The Table primitive

**Blocked on: nothing structural. Pricing fields are blocked on Task 5.**

### The requirement

A Table is **one object with settings**, not four types. Do not ship `VirtualTable`,
`OpenTable`, `CohortTable`, `ChurchTable` — that produces a matrix nobody can explain. A host
answers four questions and the table configures itself.

Two real host organizations to design against:

- **Table Art Society** — in person, San Diego, capped at 10, nine-month term, by application
- **Abiding Practice** — virtual, no cap, ongoing weekly, anyone can join

Both are correct. The model must hold both without branching.

### Data model

```ts
type TableMode = 'in_person' | 'virtual' | 'hybrid';
type TermType  = 'fixed' | 'ongoing';
type JoinPolicy = 'open' | 'apply' | 'invite';

interface Table {
  id: string;
  hostOrgId: string;         // tier-2 tenant — Abiding Practice, Table Art Society, a church
  hostUserId: string;        // the person; a Host is a creative who leads, not an admin role
  title: string;
  description: string;

  mode: TableMode;
  locationLabel?: string;    // "San Diego" — required unless mode === 'virtual'
  meetingUrl?: string;       // required unless mode === 'in_person'
  partnerId?: string;        // optional Community Partner venue (Task 4)

  capacity: number | null;   // null === open, no cap. Do NOT use 0 or -1 for unlimited.
  seatedCount: number;       // derived

  termType: TermType;
  termStart?: string;        // ISO date
  termEnd?: string;          // required iff termType === 'fixed'
  cadence?: string;          // free text, e.g. "Thursdays", "monthly"

  joinPolicy: JoinPolicy;
  visibility: 'public' | 'unlisted';

  parentTableId?: string;    // set when spawned from an open table — see below

  priceCents?: number;       // host earnings, Task 5
  priceInterval?: 'once' | 'month';

  status: 'draft' | 'open' | 'running' | 'closed' | 'archived';
}
```

### Open → closed is a progression, not a boolean

Table Art Society runs public tables (anyone walks in, topic per month, closer to an AA meeting
than a class), and some of those become committed cohorts. This is the healthiest onboarding
path in the product — nobody commits to nine months before sitting in once.

Build it as a first-class action:

- [ ] An open table can **spawn** a closed table via a host action
- [ ] The spawn flow lets the host select which current attendees to carry over and sends them
      an invitation — it does not silently move them
- [ ] `parentTableId` is set on the child; the parent stays open and running
- [ ] The child inherits host, org, and partner venue by default; everything else is re-set

Do not make hosts rebuild the group by hand. This is the feature, not a convenience.

### The Table card — near-spec

**Reference:** `Personas and Onramps.dc.html`, section `04 — The Table primitive`, the row of
three cards. Also `Brand Framework v2.dc.html`, same section.

- Card: `ink` ground, `1px solid hairline`, `radius-md`, `26px` padding, `16px` gap column flex
- Top row: host org name in JetBrains Mono `10.5px` uppercase `letter-spacing: 0.13em`, color
  `muted`; right side a status badge
- Badge, urgent (e.g. "2 seats left"): `citron` background, `ink` text, `radius-sm`, `4px 8px`
- Badge, neutral (e.g. "Virtual · open", "Invite only"): transparent, `1px solid hairline`,
  `body` text
- Title: Bricolage Grotesque `600`, `26px`, `letter-spacing: -0.025em`, `paper`
- `1px hairline` rule
- **Settings block — this is the important part.** A four-row definition list in JetBrains Mono
  `11.5px`, label left in `dim`, value right in `body`, `space-between`:
  `WHERE` / `SEATS` / `TERM` / `JOIN`
- Action: JetBrains Mono `11px` `citron` uppercase, e.g. `APPLY →`, `PULL UP A CHAIR →`.
  When the viewer can't act, render `dim` and non-interactive (`INVITATION REQUIRED`)

The settings block is what lets one card explain three completely different gatherings. Render
all four rows always — a missing row reads as an error, not as a default.

### Copy rules for the card

- `SEATS` shows `10 · seated`, `No cap · 34 seated`, or `25 · covered` — always the shape of
  the commitment, then the current count
- `TERM` shows `9 months`, `Ongoing · Thursdays` — duration then cadence
- Never render "Unlimited". Use "No cap".

---

## Task 4 — Community Partners

**Blocked on: one scoping decision — see `DECISIONS_REQUIRED.md` #4. Build the light version
first; it is a strict subset of the heavy one.**

### Concept

**Patrons back a *who*. Partners back a *where*.** A patron funds Shua. A partner funds
"songwriters' night at our place, every month."

A Community Partner is a local organization — coffee shop, gallery, venue, library, bookstore,
print shop, church with a building — that supports the local creative scene. A **place** is the
most common thing they offer but not the only one, which is why the entity is Partner and the
offer is a separate record.

### Data model

```ts
type OfferKind = 'space' | 'goods' | 'audience' | 'money';
type Commitment = 'one_off' | 'recurring' | 'anchor';

interface Partner {
  id: string;
  name: string;
  kind: 'cafe' | 'gallery' | 'venue' | 'library' | 'church' | 'shop' | 'studio' | 'other';
  locationLabel: string;
  geo?: { lat: number; lng: number };   // needed for "resources near me"
  url?: string;
  claimed: boolean;      // false === listed by a host, no partner account exists
  claimedByUserId?: string;
}

interface PartnerOffer {
  id: string;
  partnerId: string;
  kind: OfferKind;
  description: string;   // "The back wall, one month at a time" / "10 free prints a month"
  cadence?: string;      // "third Thursdays"
  commitment: Commitment;
  active: boolean;
}
```

### Light version (build this first)

A Host can create a Partner listing with offers **without the partner having an account**.
`claimed: false`. This gets you the map — the thing creatives actually want — without building a
second onboarding funnel and then discovering nobody walks through it.

- [ ] Host can add a partner + offers from within their table/event flow
- [ ] Partner appears on a browsable, city-scoped directory with its offers
- [ ] A table or event can reference `partnerId` as its venue
- [ ] Partner name renders as a credit on work that came out of their space (Task 6)
- [ ] A claim flow exists but is not required (`?claim=` link a host can send)

### Heavy version (only if partners ask)

Partner accounts, self-serve offer posting, an inbound request inbox, analytics.

### Copy guidance for the partner-facing page

Frame the ask as **cheaper and better than advertising — never as a donation.** A business says
yes for three reasons: people in the room on a dead night, standing in the local creative
conversation, and a credit they can point at. The commitment ladder is
`one-off → recurring → anchor`, and **most partners should never be asked for more than step
one.**

---

## Task 5 — Host earnings

**Blocked on: a pricing decision. See `DECISIONS_REQUIRED.md` #2. Do not build payouts before
this is settled.**

Hosts can charge for a table on top of the platform base. This changes the Host page from
selling software ("$50/mo for community tools") to selling a living ("get paid to gather the
people you already gather").

### Recommended model (needs sign-off)

- A host who charges pays a **percentage of what they collect** and **nothing else** — drop the
  $50/mo for them. Charging both a subscription and a commission on your cheapest acquisition
  channel pushes hosts to a group chat and Venmo.
- Free/unpaid tables stay free to run.

### Required norm, enforce in product

**Every host must keep at least one free or open table.** Money is never the only door into a
community. This is the open→closed pattern stated as a rule, and it is also what keeps a priced
discipleship table from reading badly.

- [ ] Validation: a host cannot set all of their tables to paid
- [ ] The join screen shows price plainly; no dark patterns, no "starting at"

### The 50% claim — protect it

Marketing says half of all **membership dues** fund other creatives' projects. That is the most
valuable claim the product has and the easiest to accidentally muddy. If host fees do **not**
feed the project pool, say so explicitly in one sentence wherever the 50% claim appears.

- [ ] A single source of truth for what feeds the pool, referenced by both the marketing copy
      and the accounting code
- [ ] Ledger distinguishes `membership_dues`, `host_fee`, `project_contribution`,
      `fellowship`, `seat_sponsorship`

### Operational weight — scope before promising

Paying hosts means payout accounts, KYC, 1099s (US), refunds, chargebacks, and disputes. This is
real work for a small team. Stripe Connect (Express) is the usual answer. Do not put paid tables
on the pricing page before the payout path exists.

---

## Task 6 — "This week's buzz"

**Blocked on: city-scoping decision, `DECISIONS_REQUIRED.md` #3.**

### The governing idea

The client wants the app to feel busy without importing what makes feeds miserable. The way
through:

> **Algorithms exist to rank people. Events don't need ranking — they already have a time and a
> place.** Sort by soonest and nearest and you get abundance with no judgement in it.

The product's public position is **"There is no algorithm. You seek and you find."** These are
therefore not style preferences — they are constraints the implementation must not violate.

### Six implementation rules

1. **Surface events, not posts.** Items have a clock: a show Thursday, a table seating three
   more, a project closing Friday. Urgency comes from time, honestly.
2. **Aggregate is atmosphere; individual is scoreboard.** Publish city totals generously.
   **Never expose a per-user or per-work count** — no views, likes, followers, or reactions in
   any API response or UI.
3. **If you feature, a person picks, and you say so.** Editorial curation is the opposite of an
   algorithm, not a weaker version. Byline it and rotate the curator.
4. **Guarantee a visibility floor.** Every new project and member gets a turn in a "just posted"
   rail — by rotation, not merit.
5. **Proof from your own people.** "3 people from your table are going" — never "trending".
6. **Count deeds, never applause.** Every visible number describes something someone *did*.

### Data model

```ts
type ActivityKind = 'event' | 'open_table' | 'funding_deadline' | 'new_project';

interface ActivityItem {
  id: string;
  kind: ActivityKind;
  title: string;
  startsAt: string;          // ISO — the sort key
  city: string;
  partnerId?: string;        // venue
  url: string;
  fundedPercent?: number;    // kind === 'funding_deadline' only
  attendingFromYourTables?: number;  // rule 5 — computed per viewer, never global
  // NO score, rank, weight, engagement, or popularity field. Do not add one.
}

interface CityStats {          // rule 2 — aggregate only
  city: string;
  showsThisWeek: number;
  projectsFundedThisMonth: number;
  seatsCoveredThisMonth: number;
  tablesSetThisMonth: number;
}

interface FeaturedPick {       // rule 3
  weekOf: string;
  curatorUserId: string;       // a human. required.
  curatorLabel: string;        // "Sarah R., host at Table Art Society"
  itemIds: string[];
}
```

### Sort order — normative

```
ORDER BY startsAt ASC, distance_from_viewer ASC
```

Both are facts, not opinions. There is no third term. A "just posted" rail is a separate query
with `ORDER BY createdAt DESC LIMIT n` and **round-robin across creators** so one prolific
person cannot fill it.

### The surface — near-spec

**Reference:** `Personas and Onramps.dc.html`, section `07 — The Buzz`, the dark
"This week's buzz · San Diego" panel.

- Ground `ink`, `radius-md`, padding `30px 36px 34px`, column flex `22px` gap
- Header: `This week's buzz · <City>` in JetBrains Mono `11px` uppercase
  `letter-spacing: 0.18em`, `paper`. Right side, `dim`, `10.5px`:
  `Sorted by soonest · no ranking` — **keep this label; it is the position, stated in the UI**
- `1px hairline` rule
- Stats row: four `CityStats`, auto-fit grid `minmax(180px, 1fr)`. Number in Bricolage
  Grotesque `600` `34px` `letter-spacing: -0.03em`; first one `citron`, rest `paper`. Label
  below in Mono `11px` `muted` uppercase
- `1px hairline` rule
- Item rows: baseline-aligned flex, `18px` gap, wrapping. Time in Mono `11px` `dim`
  `min-width: 76px`; title in Bricolage Grotesque `500` `17px` `paper`; trailing context in Mono
  `11px` `muted` — or `citron` when it's a funding percentage
- Footer: Mono `11px` `dim`, two lines —
  `FEATURED THIS WEEK CHOSEN BY <curatorLabel>` /
  `NOT BY POPULARITY. THERE IS NO ALGORITHM HERE.`

### Naming

- **Nav item: "This week"** — three words is too long for a tab
- **Page headline: "This week's buzz in <City>"** — naming the city is what makes it read as a
  place rather than a feed

### Acceptance criteria

- [ ] No endpoint returns a per-user or per-work engagement count
- [ ] No sort in the codebase weights activity by popularity
- [ ] `FeaturedPick.curatorUserId` is non-nullable
- [ ] Every new project appears in "just posted" within one minute of creation
- [ ] The "no ranking" label is present in the shipped UI

---

## Task 7 — Rebuild the `/about` flyers

**Blocked on: naming decision (#1). Copy is written; the wordmark depends on the name.**

The three `/about/*` pages are good structural work with a readability problem the client
flagged. Same content, same restraint, fixed:

| Problem now | Fix |
|-------------|-----|
| Body copy 15px grey on white | **17px minimum**, `ink`-level contrast |
| Prices exiled to a far-right rail | **Price adjacent to the tier name** — read as one object |
| Section labels the same size as body copy | Mono uppercase `12.5px` accent + rule |
| Best evidence (the Shua quote) mid-page and quiet | **Invert it** — the one dark block on the page |
| "Become a Guide" | **"Host a table"** |
| Measure inconsistent | Cap body at ~65 characters |

**Reference:** `Brand Framework.dc.html`, section `06 — Mockup two`, plus the annotation sidebar
which lists each change and why. Note that file uses the *superseded* cream/serif direction —
take its **layout and copy logic only** and apply the tokens in this README.

Also drop the homepage's "Closed Beta · Invite Only" pill from the hero. It is the first thing a
creative reads and it means *not for you yet*. Move it into the invite field.

---

## Files in this bundle

| File | What it is |
|------|-----------|
| `README.md` | This spec |
| `DECISIONS_REQUIRED.md` | Human decisions that block tasks. Read first. |
| `CHANGES.md` | Exact copy find-and-replace table |
| `Personas and Onramps.dc.html` | **Most current.** Four personas, onramps, Table settings, Community Partners, host economics, the Buzz. Contains the near-spec Table card and Buzz surface. |
| `Brand Framework v2.dc.html` | Tenancy architecture, metaphor budget, descriptor, domain reasoning, visual direction, homepage mockup |
| `Brand Framework.dc.html` | Superseded on name and palette. Kept for the flyer-readability mockup and its annotations. |
| `Brand Audit.dc.html` | Original findings. Historical. |

Open any of them in a browser.

## Assets

**None ship with this bundle.** The screenshots referenced inside the design files are the
client's own captures of the current site, for comparison only — do not use them as assets.

Needed and not yet created: an OG image (1200×630), a favicon set, and the wordmark as SVG.
All three depend on the naming decision.

## Fonts

Bricolage Grotesque, Archivo, JetBrains Mono — all Google Fonts, all open-licensed. Self-host
them rather than linking `fonts.googleapis.com`; the current site already has a render-blocking
problem and the marketing pages need to be fast.
