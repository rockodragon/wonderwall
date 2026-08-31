# Web copy audit — pricing, splits, and business model

**Date:** 2026-08-31
**Canonical model:** the 2026-08-31 decision (free account $0 · seat $10/mo · $25/mo five projects · $50/mo Leader tier for grant programs · member receipt "$5 funds other creatives' projects · $5 runs the place" · hosting free with 90/10 on host sales · backings 90/10 · donations only on the General Grant Fund lane · coverage codes at $10/seat · "creative", never "artist").
**Scope:** all public-facing marketing/web surfaces — `docs/flyers/*.html`, `app/public/**`, `docs/mocks/*.html` (audit-only), plus a grep sweep of `docs/` and `app/` for straggler pricing strings.

Verdicts: **correct** (matches model, untouched) · **fixed** (edited in place) · **flagged** (needs a human decision; not edited).

---

## docs/flyers/operator.html (edited — 3 fixes)

| Claim found | Verdict | Replacement |
|---|---|---|
| "Half of all membership dues flow to creative projects." | **fixed** | "Of every $10 seat, $5 funds other creatives' projects and $5 runs the place." |
| "its first artist Fellowships" | **fixed** | "its first creative Fellowships" |
| "Start as a Guide — Host multiple tables and curate your own project spaces. **$50/mo**" | **fixed** — charged $50/mo rent for hosting; hosting is free | New row: "Start hosting — Hosting is free. Host tables and events, and keep 90% of anything you sell — classes, cohorts, premium tiers. The platform keeps 10%. — **Free**". Added a correct "$50/mo" row: "Run grant programs — Funded contests, cohort-ending grants, hackathons — skill-based and judged, for your community." |
| "Your whole church — Up to 100 seats … covered. Contact us" | **fixed** (invented seat cap, no per-seat price) | "Seats for every creative in your congregation or organization — $10 a seat, any number of seats on one subscription. A covered seat is a full seat. — Contact us" |
| "Setup & support — Contact us" | correct | — |
| Footer/CTA URL `thegarden.app` | **flagged** | About pages link `thecrossboard.org`; platform is creatives.exchange with "The Garden" name frozen through Nov 6. Which URL do printed flyers carry? |

## docs/flyers/creative.html (edited — 3 fixes; straggler caught by grep, same flyer set as operator.html)

| Claim found | Verdict | Replacement |
|---|---|---|
| "Host a project … $10/mo" / "Host up to five … $25/mo" | correct | — |
| "Become a Guide — Host tables … walk with other **artists** … **$50/mo**" | **fixed** — $50/mo hosting rent + "artists" | "Host a table — Host tables and curate your own project spaces free — you keep 90% of anything you sell — and walk with other creatives as a pathfinder, director, or coach. — **Free**" |
| "**50% of all membership dues** support other creative projects … backing other **artists**" | **fixed** | "Of every $10 seat, $5 funds other creatives' projects and $5 runs the place. From day one, your money is backing other creatives — instead of hoping to hear back." |
| "Support for local **artists** and their passion projects" | **fixed** | "Support for local creatives and their passion projects" |

## docs/flyers/patron.html (edited — 1 fix)

| Claim found | Verdict | Replacement |
|---|---|---|
| "A Fellowship — Ongoing stipend to a named creative — $500+/mo" | **flagged** | Fellowships are not priced in the canonical model; $500/mo coincides with the church bundle. Confirm the product and its price. |
| "A Project — One-time backing … $25–$5,000" | correct (uses "back", no split claimed) | — |
| "Seats at the Table — 10 or 25 seats" | correct (coverage-code quantities) | — |
| "Your whole church — Up to 100 seats" | **fixed** (invented cap) | "Seats for every creative in your congregation — $10 a seat, any number of seats on one subscription. A covered seat is a full seat." |

## app/public/about/index.html (edited — 1 fix)

| Claim found | Verdict | Replacement |
|---|---|---|
| Creatives card: "from $10/mo, with half of every membership funding another creative's work" | **fixed** | "from $10/mo. $5 funds other creatives' projects; $5 runs the place." |
| Patrons card: "cover a seat from $10/mo" | correct | — |
| Hosts card: "Get paid to gather the people you already gather." | correct (canon sentence, verbatim) | — |

## app/public/about/creatives/index.html (edited — 2 fixes)

| Claim found | Verdict | Replacement |
|---|---|---|
| "A seat — $10/mo — Post one passion project … One active project at a time." | correct | — |
| "Five seats — $25/mo — run several projects at once" | correct ($25 = up to five projects) | — |
| "Host a table — **$50/mo** — Gather ten creatives and curate their project space." | **fixed** — hosting is free | "Host a table — **Free** — Gather your people and curate their project space — hosting is free. You keep 90% of anything you sell; the platform keeps 10%. Walk with other creatives as the person who sets the table." |
| "**Half of every membership** funds another creative's project." | **fixed** | "$5 of every $10 seat funds another creative's project — the other $5 runs the place. From day one your money is supporting someone — instead of hoping to hear back." |
| Shua Fellowship vignette | correct (no price claimed) | — |

## app/public/about/hosts/index.html (edited — 3 fixes)

| Claim found | Verdict | Replacement |
|---|---|---|
| Title/meta/h1: "Get paid to gather the people you already gather." | correct (canon sentence, verbatim) | — |
| "Half of every membership funds another creative's project." | **fixed** | "Of every $10 seat, $5 funds other creatives' projects and $5 runs the place." |
| "Host a table — **$50/mo** … money is never the only door **in**." | **fixed** — $50/mo hosting rent + non-verbatim canon line | "Host a table — **Free** — Hosting is free — and you keep 90% of anything you sell (classes, cohorts, premium tiers); the platform keeps 10%. Every host keeps at least one table free or open. Money is never the only door." Added correct "$50/mo — Run grant programs" row (funded contests, cohort-ending grants, hackathons — skill-based and judged). |
| "Your whole church — Up to 100 seats" | **fixed** | "Seats for every creative in your congregation or organization — $10 a seat, any number of seats on one subscription. A covered seat is a full seat." |

## app/public/about/patrons/index.html (edited — 1 fix)

| Claim found | Verdict | Replacement |
|---|---|---|
| "Cover one seat — $10/mo — story updates, your name in the credit line" | correct (matches coverage + sponsor credit line) | — |
| "A Fellowship — $500+/mo" | **flagged** (same as patron flyer) | — |
| "A Project — $25–$5,000" | correct | — |
| "Your whole church — Up to 100 seats" | **fixed** | "Seats for every creative in your congregation — $10 a seat, any number of seats on one subscription. A covered seat is a full seat." |
| "Every gift becomes a story" | correct-enough ("gift" is not "donate"; left) | — |

## app/public/about/partners/index.html (no changes)

| Claim found | Verdict | Replacement |
|---|---|---|
| "No fee, no contract, no minimum" | correct | — |
| "Sponsor a table or a show — when you want to fund the scene directly" | correct (visibility-door sponsorship; no "donate") | — |

## app/public/events/first-table/index.html (no changes)

| Claim found | Verdict | Replacement |
|---|---|---|
| "Event · Free" / "Free — bring nothing" | correct (public event, free to attend) | — |
| "WHEN: A Thursday this September — date landing soon / WHERE: San Diego — venue being set" | **flagged** | Today is Aug 31 and the page still has TBD date/venue; the event-page mock pins it as Thu Sep 4, Bread & Salt. This is a separate gathering, not the Nov 6 showcase — but a human should either publish the real date or decide whether this page should now funnel to the Nov 6 showcase (Lightchurch, Encinitas). No October/La Paloma claims present. |
| "What is The Garden?" module | correct | — |

---

## docs/mocks/*.html — findings only (mocks not edited, per instructions)

### docs/mocks/creative-flow.html
- **Serious:** the "named host org" paywall variant shows a three-cell member receipt "**$4 your host · $5 another creative's project · $1 us**" (annotation and S3B screen). The canonical model forbids any member-facing per-member host share or partnership split. The default two-cell "$5 / $5" strip is correct; the three-cell variant must be removed if this mock is built.
- "Half of every membership funds another creative's project" (paywall and confirmation screens) — should be the receipt language ("$5 funds other creatives' projects · $5 runs the place").
- $10/mo seat pricing, paid-work gating, "$400 paid gig" examples: consistent.

### docs/mocks/event-page.html
- No contradictions. "$10/mo cover a creative's seat" correct; the Sep 4 / Bread & Salt event is the first-table gathering, not the showcase; no October/La Paloma references.

### docs/mocks/host-tables.html
- **Serious:** paid-table hint reads "You keep 90% — the garden takes 10%, **and your $50/mo goes away while you charge**." The trailing clause encodes the old $50/mo hosting rent (waived-when-charging). Hosting is free; there is no monthly base to waive. Note the mock's own annotation ("10% of what the host collects, no monthly base") already states the correct model — the screen copy contradicts its annotation.
- "money is never the only door **in**" — canon sentence should be verbatim: "Money is never the only door."
- 90/10 on host sales, free-open-table enforcement: consistent.

### Other mocks caught by the grep sweep (also not edited)
- **docs/mocks/host-dashboard.html — serious:** the monthly ledger shows a **40/50/10 dues receipt** ("→ to creatives' projects (50%) / → to operations (40%)" with the annotation naming "the 40/50/10 receipt"). That split must not appear anywhere member- or host-facing; the mock predates the 2026-08-31 decision.
- docs/mocks/patron-flow.html, project-gates.html, story-page.html: $5/$5 receipt and $10/$25 seat pricing all consistent; project-gates repeats the "named host orgs get the three-cell variant" instruction (same problem as creative-flow); no other contradictions.

---

## Stragglers outside the marketing-copy edit scope (flagged, not edited)

- **App product UI still sells the old hosting model** (code + tests, needs an eng pass, not a copy edit):
  - `app/app/routes/garden._index.tsx` — "price=\"$50/mo, waived once a table charges\"" for hosting.
  - `app/app/routes/demo.host.tsx` — "your $50/mo goes away while you charge".
  - `app/app/routes/join.tsx` — "Half of every membership funds another creative's project" (twice); tier list with $50/mo.
  - `app/app/routes/demo.join.tsx`, `app/app/routes/demo.patron.tsx` — old tiers and $500/mo Fellowships.
  - Backing data/tests: `app/app/garden/*`, `app/convex/garden/*` encode the old splits.
- `docs/decks/thecrossboard-board-review.html` — internal board deck; uses "artist(s)" throughout and older TheCrossBoard framing. Not a public surface; decide whether to refresh or retire it.
- Internal planning docs under `docs/` (product plan, exchange briefs, phase-1b, research) contain historical splits — ledger/planning material, intentionally left alone.

---

## Needs a human decision

1. **first-table event page date/venue** (`app/public/events/first-table/index.html`): publish the real September date (mock says Thu Sep 4, Bread & Salt) or repoint the page at the Nov 6 showcase (Lightchurch, Encinitas — ticketed fundraiser, free livestream).
2. **Fellowship pricing** ("$500+/mo" on patron flyer and patron about page): not part of the canonical model — confirm the offering and its price, or fold it into church coverage / business sponsorship.
3. **Flyer vs. site URL**: flyers point to `thegarden.app`, about pages to `thecrossboard.org`, and the platform is `creatives.exchange` with "The Garden" name frozen through Nov 6 — pick the URL public print materials should carry.
4. **App UI old-model copy** (garden._index, join, demo routes): "$50/mo waived once a table charges" is live product copy contradicting free hosting; needs a code change with test updates.
5. **Mocks that encode forbidden splits** (creative-flow/project-gates three-cell "$4 host · $5 · $1 us"; host-dashboard 40/50/10 ledger): rework before any build hand-off.
