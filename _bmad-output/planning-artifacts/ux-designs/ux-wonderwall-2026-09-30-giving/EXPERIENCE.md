---
name: Member-directed giving
status: final
sources:
  - docs/features/member-directed-giving.md
  - app/app/constants/claims.ts
  - app/app/garden/garden.css
  - app/app/routes/fund.$slug.tsx
  - app/app/routes/join.success.tsx
  - app/app/routes/today.tsx
  - app/app/routes/settings.tsx
  - app/app/routes/admin.ledger.tsx
  - app/convex/garden/memberships.ts
  - app/convex/email/template.ts
  - app/convex/garden/giving.ts (built in parallel; strings and query shapes mirrored)
  - app/convex/garden/connect.ts, connectState.ts (built in parallel; Connect states mirrored)
updated: 2026-09-30
---

# Member-directed giving — Experience Spine

> How the feature behaves. `DESIGN.md` beside this file owns how it looks. The spec (`docs/features/member-directed-giving.md`) owns the rules and the numbers; this spine only turns them into screens, states and words. Spines win over any mock in `mockups/`.

## Foundation

Responsive web, mobile first. Every surface renders inside the existing product:

- **UI system: garden.css credit-sheet.** `/give` is a `GardenPage` route (`g-wrap`, 680px column) like `/fund/:slug` and `/join/success`. `DESIGN.md` names the handful of visual deltas this feature adds; everything else inherits.
- **App shell surfaces** (`/today`, Settings › Money, the Notifications list on `/messages`) use the same tokens through their `--app-*` aliases (`tokens.css`). No new palette, no new type scale.
- **Email** renders through `email/template.ts` exactly as backing emails do: light card, one heading, one body, one button.
- **Stripe Express** and the Stripe dashboard are hosted pages. We never render identity or bank fields.
- **Data the pages read** (as built): `getMyGiving` → `open[]`, `history[]`, `received[]`, `owedCents`, `connect { started, detailsSubmitted, payoutsEnabled }`; `searchRecipients`, `listProjectsForGift`, `decideGift`; `getGivingReport` → `byPeriod[]`, `members[]`, `totals`; `createConnectOnboardingLink`, `refreshConnectStatus`, `createConnectDashboardLink`.

`[ASSUMPTION]` A member of two communities picks inside the community that billed the membership (`open[].communityName`); the page never mixes two.

## Information Architecture

| Surface | Where | Reached from | Job |
|---|---|---|---|
| In-app notice | Notifications list on `/messages`, sidebar unread badge | Written by the paid-invoice webhook (`type: gift_opened`) | Say the amount and the default; link to `/give` |
| Email notice | Inbox (category `activity`, respects email settings) | Same trigger, one per opened gift | Same message, one button |
| Open-amount card | Top of `/today`, above Creator Notes; a line on `/join/success` | Shown only while a gift is `open` | Keep the amount in view; link to `/give` |
| Give | `/give` | Notice, email, card, Settings › Money link, recipient notice when connected | Choose a creative, a project, or the grant fund; then plus-up; then history; then "Given to you" |
| Recipient notice | Notification (`gift_received` / `backing_received`) + email to the creative or project lead | On a decision or plus-up that names them | "Dana gave you $5"; connect prompt when not connected |
| Get paid | `/settings?tab=money`, new panel above Billing | Recipient notice ("Get paid"), Settings nav, the "Given to you" link on `/give` | Connect once (Stripe Express); show owed and paid; Stripe dashboard link |
| Report | `/admin/ledger`, new section "Member-directed giving" after Grant pools | Operator only (`profile.isAdmin`) | Totals, the per-month table, the per-member list |

Entry points into `/give`, most frequent first: the email button, the in-app notice row, the `/today` card, the `/join/success` line, a "Your half" link in Settings › Money, and a connected recipient's "See what you've been given". `[ASSUMPTION]` `/give` is not a nav item.

`/give` with no membership or no community pool share renders the empty state (see State Patterns) rather than a 404.

→ Composition reference: `mockups/notice-in-app.html`, `mockups/email-notice.html`, `mockups/give-choose.html`, `mockups/give-done-plusup.html`, `mockups/recipient-notice.html`, `mockups/settings-get-paid.html`, `mockups/admin-report.html` (also under `docs/features/mocks/member-directed-giving/`). Spine wins on conflict.

## Voice and Tone

Plain 8th-grade English. Short sentences. Say what the button does. No garden metaphor, no "platform", no "marketplace".

**Money words.** Member-facing: *give*, *back*, *your half*, *the grant fund*. Never *gift*, *donate*, *donation*, or *tax-deductible* for money that moves through our checkout. The one exception is the fund plus-up, which links out to Abiding Practice and carries `CLAIMS.grantFundDeductible` verbatim. The dollar amount is always the member's own computed amount; copy never types "$5" as a constant.

**Money sentences.** Only `CLAIMS.*`, verbatim. This feature uses: `CLAIMS.dues` (where the half comes from), `CLAIMS.memberDirected` (what happens each month), `CLAIMS.memberDirectedDefault` (the default rule), `CLAIMS.memberDirectedFull` (the recipient gets all of it), `CLAIMS.pool` (what the fund does), `CLAIMS.patron` and `CLAIMS.processingFee` (the creative and project plus-up), `CLAIMS.grantFundDeductible` (the fund plus-up only). The three `memberDirected*` sentences have a server twin, `GIVING_SENTENCES` in `convex/garden/giving.ts`, checked by `claims.test.ts`. Nothing else about splits, speed or deductibility appears anywhere; in particular `CLAIMS.payout` (hand payouts) is not used on any Connect surface, and the $50 transfer minimum is not stated (see Open items).

### Microcopy, every string

| Where | String |
|---|---|
| Notice title (in-app), email subject and heading, `/give` and `/today` heading | You have $5 to give this month. |
| Notice message (in-app, as built) | Pick a creative, pick a project, or leave it in the grant fund. `CLAIMS.memberDirectedDefault` |
| Email preview (as built) | `CLAIMS.dues` This month you pick who. |
| Email body, line 1 | `CLAIMS.memberDirectedDefault` |
| Email body, line 2 | `CLAIMS.dues` This month, $5 of your membership in The Garden is yours to give. Pick a creative, pick a project, or leave it in the grant fund. |
| Email button | Pick who gets it |
| `/today` card label / body / hint / button | Your half / `CLAIMS.memberDirected` `CLAIMS.memberDirectedDefault` / Your next payment is Oct 3. / Pick who gets it |
| `/join/success` line | You also have $5 to give this month. [Pick who gets it →] |
| `/give` label | Your half |
| `/give` line 2 / hint | `CLAIMS.memberDirectedDefault` / Your next payment is Oct 3. |
| `/give` where-from | `CLAIMS.dues` `CLAIMS.memberDirected` |
| Choice: creative | A creative — Anyone in The Garden except you. `CLAIMS.memberDirectedFull` |
| Choice: project | A project — An open project in The Garden. It shows on the project as a backing. |
| Choice: fund | The grant fund — `CLAIMS.pool` |
| Creative search placeholder / count / empty | Search by name / 2 people / No one by that name in The Garden. |
| Project list hint / empty | 4 open projects. Yours aren't listed. / No open projects in The Garden right now. |
| Note label / placeholder / counter | A note (optional) / Say why, if you like. / 0/200 |
| Anonymous checkbox / hint | Give anonymously / They'll see "Someone gave you $5." |
| Confirm, creative / project / fund | Give $5 to Marcus / Give $5 to Small Acts: Neighbors / Leave it in the grant fund |
| Confirm, busy | Giving… (creative, project) / Saving… (fund) |
| Bottom default line | `CLAIMS.memberDirectedDefault` Your next payment is Oct 3. |
| Done, creative | You gave $5 to Marcus Reyes. `CLAIMS.memberDirectedFull` They'll get a note that it came from you. (anonymous: They'll see "Someone gave you $5.") |
| Done, project | You gave $5 to Small Acts: Neighbors. It shows on the project as a backing. |
| Done, fund | Your $5 stays in the grant fund. Members propose projects, and a review team decides. (second sentence of `CLAIMS.pool`) |
| Plus-up label | Add your own |
| Plus-up heading, creative / project / fund | Add more for Marcus? / Add more to Small Acts: Neighbors? / Add more to the Sophia Fund? |
| Frequency control | One time · Monthly |
| Amounts | $10 · $25 · $50 · Custom (input placeholder: Dollars) |
| Plus-up button, one time / monthly | Add $25 once / Add $25 a month |
| Plus-up hint, creative and project | `CLAIMS.patron` `CLAIMS.processingFee` |
| Plus-up buttons, fund | Give once to the Sophia Fund / Give monthly to the Sophia Fund |
| Plus-up hint, fund | `CLAIMS.grantFundDeductible` Secure checkout on Abiding Practice's Stripe page. Your receipt comes from them, then you return here. |
| Plus-up skip | Not this month |
| Plus-up returned (`?added=1`) | Added. Thank you. |
| History label / empty | Past months / Your first month shows here after you pick. |
| History row, creative / project / fund / defaulted | Sep 2026 · Gave $5 to Marcus Reyes · Added $25 once / Aug 2026 · Gave $5 to Small Acts: Neighbors · Added $10 a month / Jul 2026 · Left it in the grant fund · — / Jun 2026 · Stayed in the grant fund. You didn't pick. · — |
| Defaulted banner (next visit) | Last month's $5 stayed in the grant fund. You didn't pick by Oct 3. |
| Given to you label / owed / link / hint (not connected) | Given to you / $15 owed to you / Get paid in Settings / Connect your bank in Settings to get it. It waits for you until you do. |
| Given to you row, allowance / plus-up | Sep 2026 · Priya Natarajan gave you $5 · "note" / Sep 2026 · Someone backed you with $10 a month · — |
| Recipient notice title, named / anonymous / plus-up (as built) | Dana gave you $5 / Someone gave you $5 / Dana backed you with $25 (a month) |
| Recipient notice message, not connected / connected (as built) | Connect your bank in Settings to get it. / the giver's note, or nothing |
| Recipient email body (as built) | **Dana** gave you $5 from their membership. They wrote: "Loved your set at the Grove." Connect your bank in Settings to get it. It waits for you until you do. |
| Recipient email button, not connected → `/settings?tab=money` / connected → `/give` (as built) | Get paid / See what you've been given |
| Get paid heading | Get paid |
| Get paid, owed line / none | $5 owed to you · $0 paid out / Nothing owed to you yet. |
| Get paid, not connected body / button | Connect your bank to get what you're owed. Stripe asks for your identity and your bank, then sends you back here. / Connect your bank |
| Get paid, not finished badge / body / button | Not finished / You started with Stripe but didn't finish. Pick up where you left off. / Finish connecting your bank |
| Get paid, checking | Checking with Stripe… You're back from Stripe. This takes a moment. (button: Checking…) |
| Get paid, connected badge / body / link | Connected · Payouts on / Stripe pays your bank. Payouts and history are in your Stripe dashboard. / See your Stripe dashboard |
| Get paid, paused badge / body / button | Payouts paused / Stripe needs something from you before it can pay you. / Finish in Stripe |
| Errors | Couldn't open Stripe. Try again. · Couldn't save that. Try again. · Couldn't start checkout. Try again. |
| Give, already decided (stale tab) | This month is done. Here's what you did. |
| Give, nothing open | Nothing to give right now. Your next amount opens when your membership is billed. |
| Give, no membership | Members get half of their dues to give each month. [Become a member] |
| Report label / empty | Member-directed giving / Nothing opened yet. |
| Report totals labels | Opened · Directed · Directed $ · Plus-up $ · Plussed up |

Do / don't:

| Do | Don't |
|---|---|
| "You have $5 to give this month." | "Your $5 gift is ready!" |
| "It stays in the grant fund." | "Your gift will be automatically donated." |
| "Give $5 to Marcus" | "Confirm" / "Submit" |
| "Add $25 once" | "Boost your impact" |
| "Stayed in the grant fund. You didn't pick." | "Expired" / "Missed" |
| "Connect your bank in Settings to get it." | "Set up payouts to unlock your earnings" |

## Component Patterns

Behavioral. Visual specs in `DESIGN.md.Components`.

| Component | Where | Behavior |
|---|---|---|
| Notice row | Notifications list | Existing row anatomy: title, message, relative time, unread bar. Whole row links to `/give`. Marked read when `/give` is visited (`useMarkNotificationsReadForPath`). No avatar (no related user). |
| Open-amount card | `/today`, `/join/success` | Renders only while `open.length > 0`. One button. Disappears the moment the gift is decided or defaulted; no dismiss control (the default line already says what happens if they ignore it). |
| Choice card | `/give` | Three cards in a `radiogroup`. Tap selects; the matching picker or the confirm button appears below. Arrow keys move selection. Selecting the fund shows the confirm button directly. |
| Creative picker | `/give`, choice = creative | Search input (`searchRecipients`), 250ms debounce, then rows: initials avatar, name, discipline · community. Excludes the member. Rows are `radio` options. Selecting collapses the list to the chosen row with "Change". Fifteen rows, then "Show more". |
| Project picker | `/give`, choice = project | `listProjectsForGift`: title, lead, raised of goal. Own projects excluded. Same selection behavior. |
| Note field | `/give`, creative or project | Textarea, 200 max, live counter. Optional. Counter turns paper at 180+. |
| Anonymous checkbox | `/give`, creative or project | Same control as the backing form; here labeled "Give anonymously" with a hint that states what the recipient sees (`visible: false`). |
| Confirm button | `/give` | Citron. Disabled until a target is chosen. One tap calls `decideGift`; no confirm dialog. |
| Plus-up panel | `/give`, after a decision | Frequency control then amount buttons then one citron button (`createGiftCheckout` for a creative; the project's backing checkout for a project, tagged with the gift). For the fund, the two Sophia Fund links built by `buildFundPlusUpLink` (client reference carries the gift). "Not this month" collapses the panel. |
| History list | `/give` | One row per past month (`history[]`), newest first: period · what you did · what you added (`plusUpCents`). Defaulted months say so (`decidedBy: "default"`). |
| Given to you | `/give`, bottom, when `received.length > 0` or `owedCents > 0` | Owed amount, a Settings link while not connected, then rows: period · who gave what · note. Plus-ups read "backed you with". |
| Get paid panel | Settings › Money | Five states (below). Owed and paid-out amounts always visible once anything is owed. |
| Report table | `/admin/ledger` | Totals cells, then one row per month (`byPeriod[]`, newest first) with the spec's columns plus still open and directed $. Horizontal scroll under 980px, month column pinned. Per-member list (`members[]`, sorted by plus-up total then streak). |

## State Patterns

### The gift

| State | `/give` shows | Card on `/today` |
|---|---|---|
| `open` | Heading, default line, next-payment hint, where-from, three choices, confirm, bottom default line | Shown |
| `decided` (creative / project / fund), same visit | Done block with "Given · $5" chip, plus-up panel, history | Hidden |
| `decided`, later visit | Done block collapsed to its history row, "Nothing to give right now" line, history | Hidden |
| `defaulted` (sweep ran, `decidedBy: "default"`) | Banner "Last month's $5 stayed in the grant fund. You didn't pick by Oct 3." then this month's open state if one exists, else "Nothing to give right now." | Hidden |
| No open gift, has history | "Nothing to give right now. Your next amount opens when your membership is billed." then history | Hidden |
| No membership / no pool share | Members-get-half line and Become a member | Hidden |
| Loading | `GardenLoading` label | Skeleton row, card height |
| Stale tab (decided elsewhere) | `decideGift` refuses; page re-renders to the decided state with "This month is done. Here's what you did." | — |

`Given to you` is independent of the gift state and shows whenever there is something received or owed.

### Get paid (Stripe Connect, from `getMyGiving.connect`)

| State | Condition | Badge | Body | Action |
|---|---|---|---|---|
| Not connected | `!started` | none | Owed line; "Connect your bank to get what you're owed…" | Connect your bank → `createConnectOnboardingLink`, redirect |
| Not finished | `started && !detailsSubmitted`, or `?connect=refresh` | Not finished (line) | "You started with Stripe but didn't finish. Pick up where you left off." | Finish connecting your bank → new onboarding link |
| Checking | `?connect=return` just landed | none | "Checking with Stripe…" | Button disabled "Checking…"; `refreshConnectStatus` runs once, panel settles |
| Connected | `payoutsEnabled` | Connected · Payouts on (citron) | Owed line; "Stripe pays your bank. Payouts and history are in your Stripe dashboard." | See your Stripe dashboard → `createConnectDashboardLink`, new tab |
| Payouts paused | `detailsSubmitted && !payoutsEnabled` | Payouts paused (line) | "Stripe needs something from you before it can pay you." | Finish in Stripe → onboarding link |
| Error | any action throws | — | "Couldn't open Stripe. Try again." under the button | Same button |

Nothing owed and not connected: the panel still shows with "Nothing owed to you yet." so a creative can connect before the first $5 arrives.

### Report

Loading: `GardenLoading`. Empty: "Nothing opened yet." Months with zero opened still render as a row so a gap is visible. The word "gift" stays the database row's name (`memberGifts`, `giftPayments`); no surface, including the operator's, prints it.

## Interaction Primitives

- **Tap and click only.** No drag, no swipe, no long-press.
- **Two steps, one page.** Choose, then confirm; the page never opens a modal or leaves for the choice. Checkout (plus-up) and Stripe Express are full redirects that return with a query flag (`?added=1`, `?connect=return`, `?connect=refresh`), the pattern `/fund/:slug` already uses.
- **Keyboard.** Choice cards and picker rows are radios: arrow keys move, Space selects, Tab leaves the group. Search input is first in tab order inside the picker. Enter in the note field inserts a newline; it never submits.
- **Search.** Substring on name, case-insensitive, 250ms debounce; empty query lists the first fifteen active members alphabetically so the picker is never blank.
- **One write per decision.** `decideGift` is idempotent (one gift per invoice); double-tap cannot give twice.
- **Banned here:** confirm dialogs, toasts for the decision (the page itself changes), countdown timers, urgency language beyond the one dated hint.

## Accessibility Floor

Behavioral; contrast lives in `DESIGN.md`.

- WCAG 2.2 AA. Every string in the microcopy table is real text, not an image.
- Choice cards: `role="radiogroup"` with `aria-label="Where your $5 goes"`; each card `role="radio"` with `aria-checked`. Picker rows the same, `aria-label="Pick a creative"` / `"Pick a project"`.
- Search results announce via `aria-live="polite"`: "2 people" / "No one by that name in The Garden."
- The confirm button's accessible name includes the target: "Give $5 to Marcus Reyes".
- Amount buttons are a `radiogroup` named "How much"; the frequency control is a `radiogroup` named "How often" (same as `/fund/:slug`).
- Note counter is `aria-live="polite"` and only announces at 180 and 200.
- Focus ring: 2px citron outline, offset 2px, on every control (garden default).
- Touch targets ≥ 44px tall for choice cards, picker rows, amount buttons and the confirm button.
- Email: heading is an `<h1>`; the button is a real link whose destination is repeated in the text version.
- No information carried by citron alone: a selected card also gets a check glyph and `aria-checked`; the "given" chip and connect badges have text.

## Responsive & Platform

Mobile first; `/give` must work at 375px.

| Width | Behavior |
|---|---|
| < 480px | Single column. Choice cards stack full width. Amount buttons wrap two per row. Confirm and plus-up buttons full width. History and Given-to-you rows wrap: period on its own line, then what happened, then the amount or note. Report table scrolls horizontally inside its section, month column pinned. |
| 480–980px | Same single column inside `g-wrap` (680px max). Amount buttons in one row. |
| ≥ 980px | `/give` stays at 680px. `/admin/ledger` uses `g-wrap-wide` (980px); the 16-column table fits without scroll. |

No native app. Email renders in the 520px card `template.ts` already emits; on phones it is full width.

## Analytics (product-specific)

PostHog funnel, target type only, never an amount or a name:

| Event | Fires | Property |
|---|---|---|
| `giving_notice_opened` | `/give` loads with an open gift, from any entry point | `entry`: email · notice · today · join · settings |
| `giving_decided` | `decideGift` succeeds | `target`: creative · project · fund |
| `giving_plus_up_started` | Plus-up checkout or fund link is clicked | `target`, `frequency`: once · monthly |

## Key Flows

### Flow 1 — Dana picks a creative, adds once (Dana, Garden member, billed on the 3rd)

1. Sep 3, 7:10am. Dana's membership renews. The webhook writes the dues share and opens her $5. She gets one email, subject "You have $5 to give this month."
2. She opens it on her phone. Heading, then line one of the body: "If you don't pick by your next payment, it stays in the grant fund." One button: "Pick who gets it."
3. `/give` at 375px. Label "Your half". Heading repeats the amount. The default line is the second line on the page; under it, "Your next payment is Oct 3." Then `CLAIMS.dues` and `CLAIMS.memberDirected`.
4. Three choice cards. She taps "A creative". The search box and the first fifteen names appear.
5. She types "mar". Two rows: Marcus Reyes · Musician · The Garden, and Mara Lind · Poet · The Garden. She taps Marcus. The list collapses to his row with "Change".
6. She writes a note: "Loved your set at the Grove." (28/200). Leaves "Give anonymously" off.
7. **Climax:** she taps "Give $5 to Marcus". The page changes in place: "You gave $5 to Marcus Reyes. What you give this way goes to them in full. They'll get a note that it came from you." Right under it, "Add more for Marcus?" with One time selected and $10 · $25 · $50 · Custom. She taps $25 and "Add $25 once". Stripe Checkout, card, back to `/give?added=1`: "Added. Thank you." History now has its first row: "Sep 2026 · Gave $5 to Marcus Reyes · Added $25 once".

Failure: checkout abandoned. She returns to `/give` with no flag; the Done block and the plus-up panel are still there; nothing was recorded against the plus-up. Confirm error (network): "Couldn't save that. Try again." under the button; her selection and note are kept.

### Flow 2 — Theo picks a project, adds monthly (Theo, Garden member, billed on the 15th)

1. Sep 15. In-app notice on `/messages`: "You have $5 to give this month." / "Pick a creative, pick a project, or leave it in the grant fund. If you don't pick by your next payment, it stays in the grant fund." He also sees the card at the top of `/today`.
2. He taps the card's "Pick who gets it". `/give` on a laptop, 680px column.
3. He picks "A project". The list shows open passion projects in The Garden, minus his own: "Small Acts: Neighbors · Jo Alvarez · $340 of $1,200".
4. He selects it, skips the note, ticks "Give anonymously" (hint: They'll see "Someone gave you $5.").
5. **Climax:** "Give $5 to Small Acts: Neighbors" → "You gave $5 to Small Acts: Neighbors. It shows on the project as a backing." The project's raised total is now $345. Plus-up: he switches to Monthly, taps $10, "Add $10 a month". The hint under the button is `CLAIMS.patron` then `CLAIMS.processingFee`, verbatim. Back from checkout: "Added. Thank you." History: "Sep 2026 · Gave $5 to Small Acts: Neighbors · Added $10 a month".
6. Jo, the project lead, gets "Someone gave you $5" (toward Small Acts: Neighbors) and, for the plus-up, "Someone backed you with $10 a month".

### Flow 3 — Ines leaves it in the fund on purpose (Ines, Garden member, billed on the 1st)

1. Notice → `/give`. She reads the three cards and taps "The grant fund". Its description is `CLAIMS.pool`.
2. No picker appears. The confirm button reads "Leave it in the grant fund".
3. **Climax:** she taps it. "Your $5 stays in the grant fund. Members propose projects, and a review team decides." Under it: "Add more to the Sophia Fund?" with two links, "Give once to the Sophia Fund" and "Give monthly to the Sophia Fund", and the hint `CLAIMS.grantFundDeductible` plus the receipt sentence from `/fund/sophia`. She taps "Not this month". History: "Sep 2026 · Left it in the grant fund · —". The report counts this as *left in fund*, not *defaulted*.

### Flow 4 — Owen does nothing (Owen, Garden member, billed on the 3rd)

1. Sep 3: notice and email. He reads neither. The `/today` card sits at the top all month; he scrolls past it.
2. Oct 3: his next invoice pays. The new gift opens; the daily sweep (`defaultOpenGifts`) sends September's $5 to the fund with `decidedBy: "default"`.
3. **Climax:** Oct 4 he opens `/today`. The card is there again for October. He taps through. `/give` opens with a banner first: "Last month's $5 stayed in the grant fund. You didn't pick by Oct 3." Below it, October's heading and the three choices. History already has: "Sep 2026 · Stayed in the grant fund. You didn't pick. · —". Nothing shames him; the line is a fact, and the page is ready for this month.

Edge: 35 days pass before a next invoice (annual or canceled membership). The sweep defaults on day 35 (`defaultAt`); the banner reads the same, with the date it happened.

### Flow 5 — Marcus gets paid (Marcus, Garden creative, no paid membership, never connected)

1. Sep 3, 7:12am. Notification: "Dana gave you $5" / "Connect your bank in Settings to get it." Email, same heading; body: "**Dana** gave you $5 from their membership. They wrote: "Loved your set at the Grove." Connect your bank in Settings to get it. It waits for you until you do." Button: "Get paid".
2. Settings › Money. New panel above Billing: "Get paid". Owed line: "$5 owed to you · $0 paid out". Body: "Connect your bank to get what you're owed. Stripe asks for your identity and your bank, then sends you back here." Button "Connect your bank".
3. He taps it. `createConnectOnboardingLink`. Stripe Express, hosted. Identity, bank. Done.
4. Back on `/settings?tab=money&connect=return`: "Checking with Stripe…" while `refreshConnectStatus` runs.
5. **Climax:** the panel settles: badge "Connected · Payouts on". Owed line unchanged. "Stripe pays your bank. Payouts and history are in your Stripe dashboard." Link "See your Stripe dashboard". The transfer sweep runs on connect; owed rows move on the spec's schedule and minimum, and the dashboard is where he watches that. Nothing on this panel promises a date. The next gift he receives says "See what you've been given" and lands him on `/give`, "Given to you".

Failure: Stripe returns with payouts disabled (missing document). Badge "Payouts paused", body "Stripe needs something from you before it can pay you.", button "Finish in Stripe". Owed is still $5; nothing is lost. He abandons the Stripe form halfway: next visit shows "Not finished" and "Finish connecting your bank".

### Flow 6 — Sam reads the report (Sam, operator, first Monday of October)

1. `/admin/ledger`. After Grant pools, a new section: "Member-directed giving". Totals first: 85 opened, 51 directed, $255 directed, $540 in plus-ups, 20 plussed up.
2. One row per month. September: Opened 42 · Still open 0 · To a creative 18 · To a project 9 · Left in fund 6 · Defaulted 9 · Directed $135 · Decided within 7 days 25 · Distinct recipients 21 · Plus-ups 11 · Plus-up $310 · Monthly started 4 · Plus-up rate 41% · Repeat givers 13 · Repeat plus-ups 4.
3. **Climax:** Sam reads *Distinct recipients 21* against *27 directed*: money spread, not piled. Then the per-member list: "Dana Whitfield · 3 months in a row · 3 of 3 directed · 3 plus-ups · $85", "Theo Park · 2 months in a row · … · $50", largest first. Sam knows what to say at the Nov 6 event, and whether spec open question 2 (nudge toward the unbacked) is worth building.

## Open items

Logged to `.memlog.md`; none blocks building the screens.

- **Trailing period.** The brief fixes the headline as "You have $5 to give this month." `buildGiftOpenedEmail` and the in-app title omit the period. Subject lines can drop it; the in-app title and the page heading should carry it. Decide and align.
- **Email order.** The brief wants the default rule in the first two lines. `buildGiftOpenedEmail` puts `memberDirectedDefault` last. The mock and this spine put it first in the body; reorder in code.
- **Grammar.** The built email says "$5 of your The Garden membership". The mock renders "$5 of your membership in The Garden". Fix the builder.
- **`CLAIMS.payout`** describes hand payouts and is now wrong for a connected creative; the Get paid panel does not use it. A Connect-era sentence, and one for the $50 transfer minimum, need `claims.md` entries before either is shown. Until then the panel states only owed, paid out, and the Stripe dashboard link.
- **Connected recipient CTA** goes to `/give` ("See what you've been given"), so `/give` needs the "Given to you" section for creatives who have never had a gift to give. Mocked; confirm this is the intended home rather than Settings › Money.
- `[ASSUMPTION]` `/give` is not in the nav. `[ASSUMPTION]` Members of two communities give inside the community that billed them.
- Spec open question 2 (nudge toward people nobody has backed this month): the picker's default list is alphabetical on purpose; a "not backed yet this month" sort is one line to add later.
