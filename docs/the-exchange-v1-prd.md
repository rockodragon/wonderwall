# The Exchange — V1 PRD

*Supersedes, for V1 build purposes: the Host/Table/Space multi-tenant scope in [the-garden-product-plan.md](the-garden-product-plan.md), and the Fellowship-pilot scope in [the-exchange-mvp.md](the-exchange-mvp.md) (already marked superseded). Those docs stay as reference for post-V1 — nothing in them is deleted, V1 just doesn't build toward them yet.*

*v0.1 — 2026-08-30 — drafted from a direct scope call: single-tenant Exchange, Projects not Portfolios, no Tables/Hosts/Offers in V1.*

> **Brand direction approved (provisional), 2026-08-30:** mark, wordmark, color/type tokens, and the "Give. Receive. Grow." tagline — [artifact](https://claude.ai/code/artifact/560679aa-a2ad-4583-9fdf-f8213cca04de). Asset cutting tracked as wonderwall-8o1.10, blocking nav collapse (§5) and the homepage rewrite (§11).

> **Onboarding built out to 3 roles, 2026-08-30:** Partner joined Creative/Patron as a full onboarding branch (not in the original v0.1 scope below — added from a live persona gap-analysis). §6 rewritten to match what's actually shipped, including the Patron/Partner interest-and-location matching on `/projects` and the Partner calendar-link CTA.

---

## 1. The call being made

Drop the multi-tenant "Garden" model (Host orgs, Tables, per-host revenue splits, capability tiers) for V1. Build one thing: **The Exchange** — a single, open network where a Creative signs up, builds a profile, posts Projects, tags who else was involved, and a Patron can find that work and support it. No sub-communities, no host branding, no entitlement matrix.

This is a narrower cut than the current canonical plan ([the-garden-product-plan.md](the-garden-product-plan.md)), which was already flagged mid-August as under revision for the "communities sit visibly on top" pivot. That question — do Host communities get their own identity — is now answered for V1: **not yet.** One Exchange, one namespace, no Tables.

---

## 2. Recommendation: keep Tables, Hosts, Offers, and Fellowships out of V1

You asked directly — here's the case, not just the conclusion.

**Defer them — nothing here is being cut.** Hosts, Tables, and Fellowships stay exactly as built in schema; V1 just doesn't route users into them yet. Offers isn't even deferred in the old sense — it gets absorbed into the Support widget as one support *type* instead of a standalone nav item (see §9). Three reasons to defer the rest:

1. **The core loop isn't built yet, and Tables don't help build it.** Right now there is no Creative/Patron split at signup, no team-tagging on a project, and no support/donation action that does anything beyond a stubbed button. Those are the actual gaps between what exists and what you described. Tables, host revenue splits (40/50/10), and capability tiers are *distribution and monetization* layers on top of a loop that doesn't exist yet. Building distribution for a loop nobody's used yet is the classic way to burn a quarter on the wrong thing.
2. **Tables are unresolved anyway.** The canonical plan's own revision banner says the community-layer question (per-community identity, per-community pool split) is open. Building V1 on top of an open question means rebuilding it once that question closes. Building V1 *without* it means you learn what the base loop needs first, and the Table question gets easier to answer with real usage data instead of speculation.
3. **Offers were never real.** They only exist in `/demo` — no schema, no live route. Nothing to "cut," just don't build them.

**What this simplifies, concretely:** no `hostOrgs`, no multi-tenant provisioning, no per-host revenue split, no capability-matrix enforcement (`can(user, capability, hostOrgId)`), no host operator role. A Patron supports a Project or a Creative directly. A platform fee (if any) is flat, not host-mediated. This removes most of the schema and UI complexity in the current plan's §2–§3.

**What V1 keeps from the Table/Fellowship thinking, because it's still true:** the "money is never the only door" principle, and public credit for patrons as the thing that makes them want to keep paying. Both show up below in the support-widget spec — they just don't need a Host to exist.

**What V1 does *not* defer, on reflection:** a simple, single, platform-wide paid membership with a portion routed into a grant fund for passion projects. That's real revenue infrastructure the core loop needs from day one, not a Host-tier feature — see §15. §16 lays out the most likely path for Host communities to reattach once the core loop is validated.

---

## 3. The four things V1 has to do

1. **Sign up** for The Exchange.
2. **Create a profile** — as a Creative, or as a Patron.
3. **Post a project** — something made (passion) or something that needs someone hired (paid) — and **credit everyone on the team**, whether or not they're on the platform yet.
4. **Be discoverable and supportable** — People can find a project through who made it or who's tagged on it; a Patron can back it with a visible, credited donation.

Everything below is in service of these four.

---

## 4. Terminology purge

Full audit results are in the research pass; the short version — three names currently coexist in production (TheCrossBoard, The Garden, The Exchange). V1 ships with exactly one: **The Exchange**.

| Remove | Where it lives now | Replace with |
|---|---|---|
| "TheCrossBoard" / "Crossboard" | `home.tsx`, `signup.tsx`, `login.tsx`, `faq.tsx`, `organizations.tsx`, `404.tsx`, `onboarding.tsx`, `_app.tsx`, `ShareButton.tsx`, `convex/emails.ts`, `public/about/*` | "The Exchange" |
| "The Garden" (as brand) | `app/garden/*` route tree, `garden/ui.tsx` nav, home page banner, event routes (`events_.garden.*`) | Fold into the single Exchange nav (§5) — no separate branded surface |
| "Kingdom-minded" framing | Welcome modal copy, homepage manifesto, `organizations.tsx` hero/FAQ | Drop from V1 default copy. This is a values statement for a specific customer segment (AP, TAS, churches) — real, but it's a Host-layer message. Without Hosts in V1, don't put a values claim in front of every signup; it narrows the funnel for a general Creative/Patron exchange. Revisit per-Host once Hosts exist. |
| `hostOrgs`, `gardenTables`, `memberships`, `coverageCodes`, `allocations` (as *live, wired* features) | `convex/schema.ts:560-718`, `convex/garden/*` | Not deleted — de-scoped. Leave schema in place (it's real, tested infrastructure for the Sponsored Seat model), just don't build new V1 surfaces on it. See §8. |

Note the doc-layer naming is already ahead of the code here — `the-garden-product-plan.md` and the discussion brief already call the platform "creatives.exchange." V1's job is to make the *code* catch up, not to re-decide the name.

---

## 5. Navigation — before / after

**Before** (two parallel navs today — see research notes): `Garden, Projects(/jobs), People, Portfolios, Events, Favorites, Profile` on the main shell, and a *second*, unrelated `Garden, Projects(/projects), Events, Tables, Fund` on the Garden shell.

**V1 — one nav, three items:**

| Nav item | Route | Replaces |
|---|---|---|
| **Projects** | `/projects` | Merges the legacy `/jobs` board *and* the Garden `projects` table *and* `/works` (Portfolios) into one entity — see §7 |
| **People** | `/search` | Existing People search, kept |
| **Events** | `/garden/events` route, renamed off `/garden` | Kept, de-branded. The legacy main-shell `/events` (auth-gated, separate `events`/`eventApplications` data — caught on review, not in the original audit) retires in favor of this one rather than running two events surfaces in parallel; migrating its data is in scope for 8o1.2. |

Profile, Messages, and admin tools stay as account-level nav (avatar menu), not top-level. **Portfolios drops as a nav item entirely** — a portfolio piece becomes a Project (§7), not a separate concept. **Tables, Fund, and the standalone Garden landing page drop from nav** per §2.

---

## 6. Onboarding — what it does today vs. what V1 needs

**Built** (`onboarding.tsx`): role-branched, three roles, additive flags. Signup itself (`signup.tsx`) still just collects name/email/password with no role question — role selection happens at the start of onboarding, not signup.

**Role** *(the biggest gap this closed)*: step 1 asks "How do you want to show up?" — Creative, Patron, or Partner. Roles are additive at the data layer (`profiles.patronRole` / `partnerRole` booleans only ever get set, never cleared; `primaryRole` just tracks which flow to start in next time), but role-*specific* fields (`orgName`, `supportInterests`, `partnerOfferings`) are last-write-wins per role — see the implementation note below.

1. **Creative branch** (4 steps): what do you do (`JOB_FUNCTIONS` multi-select) → "Share your first work," which creates an `artifacts` row that auto-creates a companion `projects` row (`kind="passion"`) via `artifacts.create`'s side effect — see §7. This is the one branch with a real "first action," so it gets its own step and its own confetti.
2. **Patron branch** (3 steps): individual-or-organization toggle (org name captured when "Organization" is picked), "What kinds of projects or causes do you want to support?" (multi-select from the same `JOB_FUNCTIONS` list, stored as `supportInterests`), plus optional location and bio. Finish screen deep-links into `/projects?interests=...&location=...`.
3. **Partner branch** (3 steps): org/business name, "What can you offer the community?" (venue, gear, funding, mentorship, promotion — `partnerOfferings`), plus optional location and bio. Finish screen's primary CTA is **"Schedule a conversation"**, linking to the operator's calendar (`cal.com/rickmoy`) — real anchor tag with `target="_blank"`, not a `window.open()` call, since some browsers block the latter even from a direct click handler. Secondary link: "Browse Projects."
4. **Done screen**: role-specific copy, no more generic "Explore TheCrossBoard."

**How the Patron/Partner data actually gets used (closed 2026-08-30):** `supportInterests` and `partnerOfferings` were captured at onboarding for a while with nothing downstream reading them — a real gap, caught in a live audit. Fixed as a **soft match, not a hard filter**: `/projects` reads `interests`/`location` from the query string, and projects whose creator's `jobFunctions`/`location` overlap are sorted first and marked with a "Matches you" badge — never excluded. A hard filter was considered and rejected: at friend-group scale (~30 launch users), an AND-filter on both interest and location would too easily return zero results. Partner's `partnerOfferings` doesn't have an equivalent surface yet — no page anywhere lets a Creative browse Partners or their offerings; the calendar-link CTA is Partner's whole "what happens next" for V1. A Partner directory is a plausible post-V1 addition, not scoped here.

**Known rough edge, not yet fixed:** `profiles.upsertProfile` treats `orgName`/`supportInterests`/`partnerOfferings` as one field each, shared across roles. A person who completes Patron onboarding (as an org) and later completes Partner onboarding will have their Partner `orgName` silently overwrite the Patron one (the mutation preserves fields the *current* submission doesn't touch, but a field both roles touch just takes the latest write). Low-risk for V1's additive-but-rare multi-role case; worth a real fix (split into `patronOrgName`/`partnerOrgName`) if multi-role adoption turns out to be common.

---

## 7. Project model — passion vs. paid, replacing Portfolio and Jobs

The `kind: "passion" | "paid"` split already exists in schema (`projects` table, `convex/schema.ts:626-645`) and is exactly the right shape — it just isn't the only place work lives yet. Two other entities currently do overlapping jobs:

- `artifacts` (the `/works` "Portfolio" item — image/video/text/link) is a *different* entity from `projects`. A film like the one you're describing for Maddie Kate currently has nowhere obvious to live: it's not a job, and Portfolio is disconnected from People/credits.
- The legacy `jobs` table (`convex/schema.ts:218-264`) is the old job board, structurally close to `projects.kind="paid"` and already has a migration link (`projects.legacyJobId`).

**V1 change:** collapse both into `projects`.

| Kind | What it's for | Budget/goal | Example |
|---|---|---|---|
| **Passion** | Something made for its own sake, posted to show and get credit/support | No budget required; optional support goal | Maddie Kate's film |
| **Paid** | Work that needs someone hired | Budget/compensation required | A commissioned design job |

`artifacts` becomes the *media attached to a project* (image/video/text/link — the fields already fit) rather than a standalone entity. `jobs` retires in favor of `projects.kind="paid"`, using the existing `legacyJobId` migration path. This is the single biggest data-model change in V1 — it's also what makes "Projects, not Portfolios" literally true instead of just a nav relabel.

**Migration default (resolved on review — this blocked everything downstream, so it needed an answer, not just an open question):** every existing `artifacts` row migrates 1:1 into its own new `projects` row (`kind="passion"`, no budget), with the artifact's `content`/`mediaUrl`/`title` becoming that project's first attached media item. No archiving, no re-posting burden on existing users, no data loss. This is a mechanical, well-bounded migration — a good candidate for a cheap/Haiku-tier pass once 8o1.3 is scoped for execution. Still confirmable/overridable (§13.2), but V1 proceeds on this default rather than blocking on the question.

---

## 8. Team tagging — the IMDb piece

This doesn't exist today (checked: `projects.$id.tsx` has a "Credits" section, but it only lists *funders*, not collaborators — see §9). It's the feature you called the growth engine, so it's core V1 scope, not a stretch goal.

**New:** a `projectCredits` (or similar) join, per project: `{ projectId, userId?, name, role, invitedByUserId, status: "linked" | "invited" | "pending" }`.

- Tag an existing user → shows on their profile as "credited on."
- Tag someone not yet on the platform by name/email → they get an invite ("You were tagged on *[Project]* by *[Creative]* — claim your credit"). On signup, the pending credit auto-links to their new profile.
- On the project page: a visible team/cast list, each name linking to a profile (or an "invited, not yet joined" state).
- On a profile: "credited on" list of every project they're tagged on — this is what turns one upload into a network.

This is the mechanic that makes the invite loop self-propagating: Maddie Kate posts the film, tags her DP and composer, they get pulled in, they tag their next collaborator. Two things make that loop actually turn, not just exist in the data model — both worth stating explicitly since the mechanic is the whole point:

- **Getting tagged notifies you and invites you to share.** A tagged Creative (existing user or fresh invite) should land somewhere that says, plainly, "you're credited on [project] — here's your page" with a share action front and center. This is the LinkedIn-shaped part: it's not enough that the credit exists, the tagged person needs a reason and a moment to push it to their own audience.
- **A project page has to be worth sharing off-platform.** That means real Open Graph previews — a strong image, the project title, the team list — so a link dropped into a text thread or Instagram bio actually renders well. wonderwall-vqq (prerender + OG for public routes) already covers this for other route types; it needs to explicitly cover project pages too, since that's now the page doing the sharing work. Linked as related to this bead.

---

## 9. Support-this-project — the canonical widget

Today: `ActionButton` on `projects.$id.tsx` is a display-only stub ("Backing opens when memberships go live this fall"). Separately, `/fund/:slug` has a real, working pattern for this — an off-platform Stripe Payment Link, a thank-you redirect, and a public ledger — but it's wired to a Host org, which V1 doesn't have.

**V1 spec — one component, reused everywhere support can happen (project page, profile page):**

- **Trigger:** "Support this project" button.
- **Four support types, one widget** — this is also where Offers lands in V1, as a type rather than a standalone marketplace/nav feature:
  | Type | What it is | Needs payment processing? |
  |---|---|---|
  | **Financial — one-time** | A single gift | Off-platform payment link (same pattern as `/fund`) |
  | **Financial — recurring** | Monthly pledge | Off-platform, using a Stripe Payment Link in subscription mode — still no in-house billing to build |
  | **Encouragement** | A word of encouragement, no money attached | No — pure text record, ships easiest, the lightest-friction way to show support |
  | **Resource** | An offer of goods, services, or time (studio time, gear, a skill) — what "Offers" used to mean, folded in here instead of living as its own nav item | No — a text/structured record (what's offered, how to claim it), same shape as encouragement |
- **Action (financial types):** off-platform payment link in V1 (don't build payment processing before the loop is validated), redirecting back to a thank-you state.
- **Payment confirmation (resolved on review — this was missing):** an off-platform link gives no signal that money actually moved. V1 does *not* build a webhook listener — that's real Stripe integration, exactly what "off-platform" was supposed to avoid. Instead: confirmation is operator-entered, the same manual pattern already used for `/fund` and the Fellowship pilot. A `projectSupport` row is created `pending` when someone clicks through, and an operator (or eventually the Creative themselves) marks it `confirmed`. Recurring pledges get the same treatment monthly, by hand, in V1 — this is a real limitation, not a nice-to-have, and should be said out loud before 8o1.6 starts.
- **Per-project attribution (resolved on review — this was missing):** a single shared payment link can't say which project it's for. Rather than build Stripe's API to mint one link per project on demand, V1 reuses the exact pattern `hostOrgs.paymentLinkUrl` already established: `projects` gets an optional `supportPaymentLinkUrl`, set once by whoever posts the project (or an operator) from their own Stripe dashboard. No new integration surface.
- **Visibility:** supporter chooses, at time of giving, to be shown as a named Patron on the project (default: visible — public credit is the thing that gets Patrons to come back, per §2) or to give anonymously. Applies to all four types — an encouragement note or an offered resource can be public-credited exactly like a gift.
- **Display:** a "Supported by" list on the project, mixing all four types chronologically — same visual weight for a $10 gift, a monthly pledge, an encouragement note, and an offered resource. Parity matters more than amount in V1, and mixing types in one feed is what makes the light-touch types (encouragement, resource) feel like real participation, not a lesser tier.
- **Data:** a lightweight `projectSupport` record (`projectId`, `supporterUserId?`, `supporterName`, `type: "financial_one_time" | "financial_recurring" | "encouragement" | "resource"`, `amountCents?`, `message?`, `resourceDescription?`, `visible: boolean`, `createdAt`) — deliberately not reusing `allocations`, since that table assumes a `hostOrgId`.

This is the canonical widget the user asked for — one component, dropped into both the project page and (optionally) a Creative's profile, so a Patron can back a person's overall body of work, not just one project. See §15 for how a member's base $10/mo relates to this widget (they're linked but distinct: membership is a subscription to the platform, this widget is a one-off or recurring act aimed at a specific project or person).

---

## 10. Organizations page — recommendation

Current `/organizations` (linked from the homepage CTA, not in nav) is a lead-gen pricing page: "Hire Kingdom-Minded Creatives," four Host-style pricing tiers, Medici framing, a `ffOrgSales` flag. It is **not** wired to the real Host/Table data model — it's a standalone pitch page for a persona V1 doesn't build (an org that sponsors seats through a Host tier).

Your instinct is right: it's not just about hiring, and it doesn't fit here anymore. **Recommendation: drop it from V1 nav/CTAs entirely** (it already has no nav entry, so this is just removing the homepage CTA link and un-publishing the route). An organization that wants to support creatives in V1 *is* a Patron — they sign up, build a Patron profile, and back Projects, same as an individual. No separate org tier needed until Hosts come back post-V1.

---

## 11. Homepage

Keep: the invite-code / waitlist flow (`home.tsx:257-495`) — per your note, this stays.

Remove: "TheCrossBoard" branding (title, header, footer line), the "New — The Garden" banner (`home.tsx:223-237`), the "Kingdom-minded employers, sponsors, and creatives" manifesto language, the Organizations CTA (§10).

Rewrite around: The Exchange framing, and the four things in §3 — sign up, build a profile (Creative or Patron), post a project, get credited and supported.

---

## 12. Explicitly out of scope for V1

- Host organizations / multi-tenant provisioning (`hostOrgs`) — see §16 for the reattachment path
- Tables — all modes (`gardenTables`, `tableMemberships`, `tableSessions`)
- Fellowships (as a distinct sponsored-relationship entity — the support widget in §9 covers the "visible patron credit" need without it)
- Offers as a *standalone* feature (folded into the Support widget as a type instead — §9)
- The multi-tier capability/entitlement matrix (`can(user, capability, hostOrgId)`) and the old Seat/Five/Host pricing ladder — V1 ships one flat membership tier instead, see §15
- Per-host revenue split (40% host / 50% pool / 10% platform) as a *routed* split — V1 approximates it with a flat 50/50 (grant fund / platform) since there's no Host to receive a share yet, see §15
- In-platform payment processing (V1 support widget and membership both link out, like `/fund` does today)
- Grant-fund allocation mechanics — jury, voting, application review (open question in §13)

None of this is deleted from the codebase or the canonical plan — it's real, partially-built infrastructure for the next phase. V1 just doesn't route users into most of it yet.

---

## 13a. Flagged on review — needs you, not engineering

Two things a plan-validation pass surfaced that no doc or code change resolves:

- **Stakeholder communication.** `docs/phase-1b/spec.md` D4 froze "The Garden" through October specifically pending a rename conversation with Haley, and its build items name AP and TAS concretely (an AP Fund page, AP's Pathfinding cohort, a named September event). This PRD supersedes all of that (§1, confirmed by you) but doesn't say how or whether Haley, AP, and TAS hear about it. Not a doc problem — flagging it so it doesn't fall through.
- **No target date.** Phase 1B had a hard October deadline; this PRD has none. Worth setting one, if only to keep "fast, narrow validation" from drifting.

## 13. Open questions for you

1. **Role model:** primary role at signup (Creative *or* Patron, additive later) vs. always-Creative-plus-optional-Patron-flag (closer to the existing `patronRole` boolean already in schema). §6 assumes the former since you described them as parallel signup paths — confirm.
2. **Existing `/works` (Portfolio) content and legacy `/jobs` postings:** migrate into `projects` automatically, or archive and let users re-post? Affects whether current users see empty profiles on launch.
3. **Support widget payment mechanism for V1:** off-platform link (fastest, matches `/fund` precedent) or worth the Stripe integration now? §9 assumes off-platform.
4. **Un-publish vs. delete `/organizations`:** un-publish (route stays, just unlinked, easy to revive) recommended over deleting — confirm that's fine.
5. **Does the $10/mo membership gate anything?** The old Seat model gated project creation behind paid membership. §15 assumes V1 keeps it voluntary — free accounts can still post and apply — because "money is never the only door" (§2) was a real principle, not just Table-era decoration. Confirm, or say which capability (if any) should require membership.
6. **Who allocates the grant fund, and how often?** Not specced in §15 on purpose — the old model's jury/voting is Table-tier complexity. Simplest V1 answer is probably the same "manual operator call" pattern already used for Fellowships (docs/the-exchange-mvp.md) — David/Rick/AP call it monthly — but confirm.
7. **Confirm the 50/50 membership split** (grant fund / Exchange share) in §15, and that "Exchange share" is deliberately standing in for the still-absent Host+platform combination until Hosts return.

---

## 14. Feature-modification checklist (build-facing)

| Feature | Current state | V1 change | Primary files |
|---|---|---|---|
| Brand/copy | "TheCrossBoard" + "The Garden" both live | Purge to "The Exchange" everywhere | See §4 table |
| Nav | Two unrelated navs, 7+ items combined | One nav: Projects, People, Events | `_app.tsx`, `garden/ui.tsx` |
| Signup | No role question | Add Creative/Patron role step | `signup.tsx`, `onboarding.tsx` |
| Onboarding | 3 steps, no branching | Role → branch (Creative: skills+first project / Patron: interest tags) | `onboarding.tsx` |
| Portfolio (`artifacts`) | Standalone entity, own nav item `/works` | Becomes media attached to a `project` | `schema.ts:53-63`, `works.tsx` route |
| Jobs (`jobs` table) | Legacy job board at `/jobs` | Retires into `projects.kind="paid"` via existing `legacyJobId` link | `schema.ts:218-264`, `schema.ts:626-645` |
| Projects | Two disconnected "Projects" concepts (`/jobs` and Garden `/projects`) | One `projects` entity, passion/paid, drives the Projects nav item | `schema.ts:626-645`, `projects.$id.tsx` |
| Team credits | "Credits" section only lists funders | New team/collaborator tagging, invite-to-claim | New table (`projectCredits`); `projects.$id.tsx` |
| Support widget | Stubbed `ActionButton`, unrelated `/fund` pattern tied to Host | New canonical `<SupportProject>` component: financial one-time/recurring, encouragement, resource — off-platform link for money, public credit for all types | `projects.$id.tsx`, new `projectSupport` table |
| Paid membership + grant fund | Doesn't exist for V1 (old Seat/tier system deferred with Hosts) | Flat $10/mo membership, voluntary (not gating in V1); 50% into a platform-wide grant fund for passion projects, 50% Exchange share; members (or anyone) can pledge more via the Support widget | New `memberships`-style table (V1-scoped, no `hostOrgId`); see §15 |
| Organizations page | Live Host-pricing lead-gen page, unlinked from real data | Un-publish; org support flows through Patron profile | `organizations.tsx` |
| Homepage | Crossboard + Garden branding coexist; invite flow works | Re-brand only; keep invite flow as-is | `home.tsx` |
| Tables / Hosts / Fellowships | Partially built, real schema | Deferred, not cut — reattaches post-V1, see §16 | `convex/garden/*`, `schema.ts:560-718` |

---

## 15. Paid membership and the grant fund

This was the one piece of real revenue infrastructure missing from the first draft of this PRD — added after review. It is *not* the old Seat/Five/Host ladder; it's the single-tier version that fits a platform with no Hosts yet.

**The membership:**
- $10/mo, one flat tier. No Five, no Host tier — those were priced for capabilities (more active projects, table creation) that don't exist in V1.
- Voluntary in V1, not a gate — per the "money is never the only door" principle in §2. A free account can still post a passion project, apply to a paid one, and get discovered. Membership is how someone who wants to put recurring money behind the platform does it, not a paywall on participation. (Open question in §13 if this should change.)

**Where the money goes:**
- **50% into a general, platform-wide grant fund** that funds passion projects — not per-Host, since there's no Host to route it through yet. This is the number the user asked to make sure was in here.
- **50% is the Exchange's own share.** In the deferred canonical plan (`the-garden-product-plan.md` §2.2), the equivalent dues split was 40% host org / 50% pool / 10% platform, with the note that "while The Garden itself is the default host org, the 40% operator share accrues to the platform." V1 has no Host at all, so that 40%+10% simply collapses into one 50% Exchange share under the same logic — no new number invented, just the existing rule applied literally. When Hosts return, this share is expected to re-split back into Host + platform, restoring the original three-way division (§16).

**Pledging beyond the base $10:**
- Anyone — a member or not, Creative or Patron — can give more through the Support widget (§9): a one-time or recurring pledge, aimed either at the general grant fund or at a specific project.
- These direct pledges are a different flow than membership dues, and should probably follow the canonical plan's *patronage* split rather than its *dues* split: **90% to the work, 10% platform** — dues fund the pool because they're not directed at anyone in particular; a pledge is directed, so more of it should reach its target.

**What's deliberately not specced here:** who decides which passion projects the grant fund pays out to, and how often. The old model's jury/voting apparatus is exactly the kind of Table-tier complexity this PRD argues against building before the core loop is proven (§13, open question 6). The simplest honest answer for V1 is almost certainly a manual call — the same "we feel the operator pain by being the operator" posture already used for the Fellowship pilot (`the-exchange-mvp.md`) — but that's a decision for whoever ends up running the fund, not something to lock in this doc.

---

## 16. Host communities — the post-V1 path

> **Reattachment started 2026-09-03.** The community layer is being built now, starting with The Garden (Kingdom Creatives) as the first community and pay-what-you-want seats. See [features/community-groups.md](features/community-groups.md); where it and this section disagree, that doc wins.

Deferred, not cut. Every table this depends on — `hostOrgs`, `gardenTables`, `tableMemberships`, `tableSessions`, `memberships`, `coverageCodes`, `allocations` — stays in schema untouched; V1 simply doesn't build new surfaces on top of it yet. The most likely way it comes back, once the core Exchange loop (sign up → profile → post a project → get tagged → get supported) is validated:

1. **A Host becomes something you affiliate with, not something that gates you.** A Creative or Patron profile gets an optional "affiliated with [Host]" field — AP, TAS, a church — the same way the current `hostOrgs` table already models a named organization. No re-signup, no separate account tier.
2. **Tables layer on as a Host's recurring-gathering feature.** The `gardenTables`/`tableMemberships`/`tableSessions` schema is already built for exactly this; it just needs a UI surface once a Host exists to own a Table.
3. **Sponsored/covered seats route a Patron's support through a specific Host.** `coverageCodes` already models "an org buys N seats, issues a code, someone redeems it" — this is the most fully-built piece of the deferred system and the most likely to come back first, since a church or org wanting to sponsor creatives by name is a real, validated demand (per the existing Organizations-page interest, even if that page itself is unpublished for V1).
4. **The 50/50 membership split (§15) regains its third leg.** Once a Host exists, the Exchange's 50% share subdivides again into a Host share and a platform share — restoring the original 40/50/10 shape from the canonical plan, just arrived at by re-splitting an existing number instead of re-deriving one.
5. **A Host's own public Fund/allocations ledger reactivates.** The `/fund` pattern and `allocations` table are fully built and tested; they sit alongside the general grant fund (§15) rather than replacing it — a Patron could support the general fund, a specific project, or a specific Host's fund, depending on how directed they want their giving to be.

None of this needs to be decided now — it's here so "deferred" reads as a real bridge, not a euphemism for "shelved."

---

## 17. Timeline and entity — set 2026-08-30

**Two-stage launch, resolving the "no target date" gap from review:**
- **Soft launch, ~1 week out (~2026-09-06):** ~30 invited, close friends. Sign up, pick Creative or Patron, post a project (or state interest), get tagged, encouragement/resource support types live. **No money changes hands.** This is the `week1`-labeled slice of the beads epic.
- **Public launch, October 2026.** Notably the same month Phase 1B was building toward — the date survived the scope cut even though the Table/Fund feature set didn't.
- **Payments, Week 2 (after soft launch, before public launch):** financial support types and the $10/mo membership turn on — `week2-payments` label — but explicitly gated on the entity decision below. Don't wire a payment link to an entity that doesn't exist yet.

**Entity structure — escalated, not decided here.** wonderwall-sxi (a hybrid Foundation 501(c)(3) + LLC idea, on record since 2026-01-28, previously slotted for "Year 2") is now a Week-2 blocker, not backlog — founder equity for Haley and David changes what's at stake, and the AP-lane/direct-lane receipt distinction already in `docs/phase-1b/spec.md` D3 shows this line has been drawn before. **This PRD does not decide entity structure — that needs an attorney and a CPA, especially with equity in the mix.** What's appropriate here is background research to bring to that conversation, not a substitute for it.

**Haley, for the record:** founder of TAS, one of the parties Phase 1B's D4 named in the deferred rename conversation — and now someone being considered for a co-founder stake. That reframes the "stakeholder comms" gap from the review: this isn't messaging to an outside party, it's a conversation with someone who has a growing stake in the outcome.
