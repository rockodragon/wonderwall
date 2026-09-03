# Decisions required before implementation

Five decisions. Each blocks at least one task. **An agent should not make any of these** — they
are business, legal, and pricing choices. Answer them, then hand the README to Claude Code.

Tasks 1 (server-rendering) and 2 (vocabulary) are blocked on **nothing** — start there.

---

## 1. The name — blocks Tasks 7, and all assets

**Recommendation: The Garden. Retire TheCrossBoard as a consumer brand.**

Why: a garden is a *container* that holds many distinct plantings, which is exactly the tenancy
model — Abiding Practice, Table Art Society, and churches each run their own tables inside it
without any of them being the whole. "Board" is a listings surface from an earlier version of
the product. "Table" is one gathering, not a platform (and would collide with Table Art
Society's actual name). "Exchange" promises a transaction the product deliberately doesn't run.

Tables go inside a garden. A garden can't go inside a table. The container gets the bigger name.

**Blocked sub-decision:** run a trademark screen in **classes 42 and 36** before committing.
"The Garden" is a crowded mark. If it's unworkable, the fallback is a modified form
("The Garden Collective", a compound) — and everything else in this package survives that change
unaltered, because the framework doesn't depend on the name.

**Also decide:** is `TheCrossBoard` the legal entity? If so it stays — in the footer, at 11px,
forever. That's a legal credit, not a brand.

---

## 2. Host pricing and platform cut — blocks Task 5

Hosts can now charge for tables. Decide:

- **What percentage do you take** of what a host collects?
- **Do paid-table hosts still pay the $50/mo base?** (Recommendation: no. Charging rent *and*
  commission on your cheapest acquisition channel is how you lose hosts to a group chat and
  Venmo.)
- **Do host fees feed the 50% project pool?** Whatever the answer, it must be stated in one
  sentence wherever the 50% claim appears. This claim is your most valuable asset and the
  easiest to muddy by accident.
- **Do you want payouts in v1?** Stripe Connect Express is the usual path, but it brings KYC,
  1099s, refunds, and chargebacks. A legitimate v1 alternative: hosts settle with their own
  people off-platform, and you add payouts once there's demand. Slower, far less operational
  weight.

---

## 3. Is "This week's buzz" city-scoped from launch? — blocks Task 6

The buzz only feels real if it's local, and local only feels full if there's density.

**Two cities with real activity beats twelve with one event each.** An empty local surface is
worse than no local surface — it's evidence that nothing is happening.

Decide:

- Which cities launch with it? (San Diego is clearly first. Nashville appears in the material.)
- What's the **minimum activity threshold** below which the surface is hidden for a city rather
  than shown near-empty? (A number, not a vibe — e.g. fewer than 3 upcoming items ⇒ show a
  national/virtual view instead.)
- What does a creative in a city with no activity see? This is the majority case early on and it
  needs a real answer, not an empty state.

---

## 4. Community Partners — persona or feature? — blocks Task 4 scope

The README specifies a **light version** (hosts list partners; no partner accounts) and a
**heavy version** (partner accounts, self-serve offers, request inbox).

**Recommendation: build light.** It gets you the map — the thing creatives actually want — for a
fraction of the work, and it doesn't require a second onboarding funnel that may not convert.
The light version is a strict subset of the heavy one, so nothing is wasted.

Decide only: **do you want a partner directory as a public, SEO-indexed surface?** If yes, it
becomes a real product with its own quality bar and moderation load. If it's an internal
resource creatives browse while logged in, it's much cheaper.

---

## 5. Domain — blocks nothing technically, but blocks assets and launch comms

**Recommendation: don't buy `thegarden.app` yet.**

- $128/yr is **premium pricing** — a standard `.app` runs roughly $15–20/yr. That rate renews
  forever: ~$1,300 a decade, and you never own it outright.
- `.app` reads *consumer app*. You sell to churches and arts organizations and move patronage
  money. `.org` matches what you actually are, matches the domain you already have, and costs
  about a tenth as much. **Price `thegarden.org` and a two-word `.org` before settling.**
- Buying the exact-match domain before the trademark screen is backwards.

**This week instead:** point `creatives.exchange` — which you already own, at no extra cost — at
the site. It reads as a phrase rather than a label, and says "creatives" to a stranger in a way
`thegarden.app` never will.

**Then:** if the trademark clears and you commit, buy the exact-match domain that week and make
it canonical. At that point $128/yr is trivially worth owning your own name — stop debating it.

Regardless: keep `thecrossboard.org` registered forever and **301** it. Never let two live
domains serve the same content.

---

## Suggested order

1. **Now, unblocked:** Task 1 (server-render) and Task 2 (vocabulary). Neither needs a decision
   and Task 1 is the highest-value item in the package.
2. **This week:** order the trademark screen; point `creatives.exchange` at the site.
3. **Then:** Task 3 (Table primitive) — structural, and every other surface depends on it.
4. **Then:** decisions 2–4, and Tasks 4–6 as they clear.
5. **Last:** Task 7 and the visual rebrand, shipped to **marketing and the app in the same
   release.** Do not roll a new brand out to one surface only — that is exactly how the current
   two-brand split happened.
