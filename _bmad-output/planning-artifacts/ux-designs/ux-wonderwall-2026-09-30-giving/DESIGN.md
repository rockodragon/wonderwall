---
name: Member-directed giving
description: The giving surfaces (/give, the notices, Settings › Money "Get paid", the operator report) on TheCreative.exchange. Inherits the garden.css credit-sheet system; this file lists only the deltas.
status: final
updated: 2026-09-30
colors:
  # Every value below IS a garden.css token (tokens.css --garden-*). Listed so
  # {colors.*} references resolve; never restated as a new palette.
  ink: '#121212'            # --g-ink, page background
  ink-raised: '#1c1c19'     # --garden-ink-raised, g-cell-hot background
  paper: '#f7f7f4'          # --g-paper, headings and emphasized text
  body: '#c6c6be'           # --g-body, paragraphs (~11:1 on ink)
  muted: '#acaca4'          # --g-muted, secondary (~8:1 on ink, ~7.5:1 on ink-raised)
  dim: '#94948c'            # --g-dim, metadata and mono labels (~6.1:1 on ink; NOT on ink-raised)
  hairline: '#2a2a28'       # --g-hairline, rules and borders
  hairline-raised: '#3a3a36'
  citron: '#fee268'         # --g-citron, actions and the "given" chip (14.5:1 against ink)
  # Email (email/template.ts), unchanged
  email-page: '#f4f4f2'
  email-card: '#ffffff'
  email-text: '#111111'
  email-secondary: '#444444'
typography:
  # Roles inherit garden.css classes. Sizes are the type-scale floor, restated.
  display:
    fontFamily: '"Bricolage Grotesque", sans-serif'
    fontSize: 'clamp(28px, 5vw, 40px)'
    fontWeight: '600'
    letterSpacing: '-0.02em'
    lineHeight: '1.05'
  heading-2:
    fontFamily: '"Bricolage Grotesque", sans-serif'
    fontSize: '22px'
    fontWeight: '600'
    letterSpacing: '-0.02em'
    lineHeight: '1.15'
  body:
    fontFamily: '"Archivo", -apple-system, sans-serif'
    fontSize: '17px'
    lineHeight: '1.6'
  row:
    fontFamily: '"Archivo", -apple-system, sans-serif'
    fontSize: '15px'
    lineHeight: '1.45'
  hint:
    fontFamily: '"Archivo", -apple-system, sans-serif'
    fontSize: '14.5px'
    lineHeight: '1.55'
  nav:
    fontFamily: '"JetBrains Mono", monospace'
    fontSize: '15px'
    letterSpacing: '0.08em'
  button:
    fontFamily: '"JetBrains Mono", monospace'
    fontSize: '13.5px'
    letterSpacing: '0.08em'
  label:
    fontFamily: '"JetBrains Mono", monospace'
    fontSize: '12.5px'
    letterSpacing: '0.12em'
  badge:
    fontFamily: '"JetBrains Mono", monospace'
    fontSize: '12px'
    letterSpacing: '0.08em'
  amount:
    fontFamily: '"Bricolage Grotesque", sans-serif'
    fontSize: '22px'
    fontWeight: '600'
rounded:
  tight: 3px      # --garden-radius-tight: buttons, inputs, cells, badges
  card: 10px      # --garden-radius-card: g-card, choice cards
  full: 9999px    # initials avatar only
spacing:
  '1': 4px
  '2': 8px
  '3': 12px
  '4': 16px
  '5': 20px
  '6': 24px
  '8': 32px
  '10': 40px
  section: 36px
  column: 680px
  column-wide: 980px
  gutter-mobile: 20px
components:
  choice-card:
    background: 'transparent'
    border: '1px solid {colors.hairline}'
    border-selected: '1px solid {colors.citron}'
    radius: '{rounded.card}'
    padding: '16px 18px'
    title: '{colors.paper} 17px 600'
    description: '{colors.body} {typography.hint.fontSize}'
    min-height: '44px'
  picker-row:
    border-bottom: '1px solid {colors.hairline}'
    border-selected: '1px solid {colors.citron}'
    radius-selected: '{rounded.tight}'
    padding: '12px 10px'
    name: '{colors.paper} {typography.row.fontSize} 600'
    meta: '{colors.dim} {typography.hint.fontSize}'
    avatar: '36px {rounded.full} {colors.hairline-raised} bg, {colors.paper} initials 13.5px mono'
    min-height: '44px'
  amount-button:
    base: 'g-btn g-btn-ghost'
    selected: 'border {colors.citron}, text {colors.citron}'
    min-width: '72px'
  frequency-toggle:
    container: '1px solid {colors.hairline}, padding 3px, {rounded.card}'
    option: '{typography.button} padding 8px 16px'
    selected: 'background {colors.paper}, text {colors.ink}'
  given-chip:
    base: 'g-badge g-badge-citron'
    text: 'GIVEN · $5'
  default-line:
    color: '{colors.body}'
    size: '{typography.body.fontSize}'
    position: 'second line under the heading, never below the fold'
  done-block:
    border-left: '2px solid {colors.citron}'
    padding-left: '16px'
    heading: '{typography.heading-2}'
  history-row:
    border-bottom: '1px solid {colors.hairline}'
    padding: '14px 0'
    period: '{colors.dim} 12.5px mono uppercase, min-width 72px'
    did: '{colors.paper} {typography.row.fontSize}'
    added: '{colors.muted} {typography.hint.fontSize}'
  connect-badge:
    connected: 'g-badge g-badge-citron "Connected · Payouts on"'
    paused: 'g-badge g-badge-line "Payouts paused"'
  owed-line:
    amount: '{typography.amount} {colors.paper}'
    label: '{typography.hint} {colors.dim}'
  received-row:
    same-as: '{components.history-row}'
    did: 'who gave what, e.g. "Priya Natarajan gave you $5" / "Someone backed you with $10 a month"'
    added: 'the note in quotes, or —'
  report-table:
    header: '{typography.label} {colors.dim}, border-bottom 2px {colors.paper}'
    cell: '{typography.row} {colors.body}, tabular-nums, padding 10px 12px'
    month: '{colors.paper} mono 12.5px, sticky left'
    hot-columns: 'opened, distinct recipients, plus-up rate in {colors.paper} 600'
    row-border: '1px solid {colors.hairline}'
    columns: '16 — the spec''s 14 plus still open and directed $'
  email-button:
    background: '{colors.email-text}'
    color: '{colors.email-card}'
    radius: '8px'
    padding: '12px 24px'
    size: '15px 600'
---

## Brand & Style

This feature is a page inside the credit-sheet: dark ink, one paper voice, one citron accent that means "act here", mono labels that read like the back of a record sleeve. It inherits `garden.css` whole. Nothing here invents a look; it adds the six pieces the credit-sheet did not have yet (a choice card, a picker row, an amount row, a frequency toggle, a "given" chip, a connect badge) and reuses `g-card`, `g-cell`, `g-btn`, `g-badge`, `g-input`, `g-hint`, `g-label` for the rest.

The posture is a receipt, not a campaign. The amount is stated once, large, with its source. The default is stated in the second line. The three choices sit as equals; citron appears only on the one thing to press next.

Money copy is not designed here. It is `CLAIMS.*`, set in `{typography.hint}` in `{colors.body}` where it appears, never in citron and never as a heading.

## Colors

All colors are garden tokens. Rules that matter for this feature:

- **Ink `{colors.ink}`** is every page background. Email is the exception and keeps `template.ts`'s light card.
- **Paper `{colors.paper}`** for the heading, the chosen name, the amount, table month labels, and the selected option in the frequency toggle (as a fill, with ink text).
- **Body `{colors.body}`** for every paragraph and every `CLAIMS` sentence. ~11:1 on ink, past the 9:1 body floor.
- **Muted `{colors.muted}`** for secondary row text ("Added $25 once") and for metadata that sits on `{colors.ink-raised}`. ~8:1 on ink and ~7.5:1 on ink-raised, past the 6:1 metadata floor on both.
- **Dim `{colors.dim}`** is the darkest text allowed, metadata only, 12.5px and up, **only on `{colors.ink}`**. On `{colors.ink-raised}` it drops to ~5.6:1, so raised cells use muted for their labels. (The existing `StatCell` puts `g-label` on `g-cell-hot`; this feature does not add any and flags it in the memlog.)
- **Citron `{colors.citron}`** for: the confirm button, the plus-up button, the selected border on a choice card, picker row or amount button, the "given" chip, the connected badge, the citron left rule on the Done block, and success lines. Never for body text, never for a heading, never decorative. Ink on citron is 14.5:1.
- **Hairline `{colors.hairline}`** for every rule and unselected border. `{colors.hairline-raised}` only for the initials avatar fill.
- **Nothing red.** Errors are one plain sentence in `{colors.body}` under the control that failed, the way `/fund/:slug` does it.

## Typography

Inherited ramp; the floor is restated because it has been broken before.

| Role | Class / token | Size | Use |
|---|---|---|---|
| Display | `h1.g-h`, `{typography.display}` | 28–40px | "You have $5 to give this month." once per page |
| Heading 2 | `.g-h`, `{typography.heading-2}` | 22px | "Add more for Marcus?", Done block, Get paid |
| Amount | `{typography.amount}` | 22px | "$5 owed to you", history totals |
| Body | root, `{typography.body}` | 17px | Paragraphs, the default line, `CLAIMS` sentences in prose position |
| Row | `{typography.row}` | 15px | Picker names, history "what you did", table cells, notification title |
| Hint | `.g-hint`, `{typography.hint}` | 14.5px | Under-control notes, `CLAIMS` under buttons, picker metadata |
| Nav | `.g-nav` | 15px | Header links (unchanged) |
| Button | `.g-btn` | 13.5px mono uppercase | Every button, including amount buttons and the frequency toggle |
| Label | `.g-label` | 12.5px mono uppercase | Section labels ("Your half", "Past months", "Get paid") and table headers only. **Never a control.** |
| Badge | `.g-badge` | 12px | "Given · $5", "Connected · Payouts on", "Payouts paused" |

Nothing under 12px anywhere, including the mock annotations. The note counter is 14.5px. The email keeps `template.ts` sizes (19 / 15 / 13 on white).

## Layout & Spacing

- `/give`, the notices and Settings live in the 680px `g-wrap` column (`{spacing.column}`); `/admin/ledger` uses `g-wrap-wide` (`{spacing.column-wide}`).
- Section rhythm: `{spacing.section}` (36px) between the heading block, the choices, the plus-up panel and the history, matching `/fund/:slug`.
- Inside a card: 16–20px padding; 12px between a label and its content; 8px between wrapped buttons.
- Mobile gutter `{spacing.gutter-mobile}` (20px); the `g-wrap` clamp already does this.
- The default line never sits below the fold on a 375×667 viewport: heading, default line, then the source sentence, then the choices.
- The picker is a plain list, not a scroll box: fifteen rows, then "Show more". A scroll box inside a page is one of the things the credit-sheet does not do.
- The report table is the one horizontal-scroll element in the product; it scrolls inside its section with the month column pinned.

## Elevation & Depth

None. The credit-sheet is flat: hairlines and one raised fill (`{colors.ink-raised}`) for emphasized cells. The Done block uses a 2px citron left rule, not a card. The Sophia Fund page's glow and shadow stay on that page; the fund plus-up on `/give` is two ghost links with a citron primary, no glow.

## Shapes

`{rounded.tight}` (3px) for buttons, inputs, badges, cells and selected picker rows. `{rounded.card}` (10px) for choice cards and the `/today` card. `{rounded.full}` for the initials avatar only. Email keeps its 8px button and 12px card from `template.ts`.

## Components

Anatomy and state appearance. Behavior is in `EXPERIENCE.md`.

- **Choice card** `{components.choice-card}` — a `g-card`-shaped radio. Title in paper 17px, one-line description in body 14.5px. Selected: citron 1px border and a citron check glyph at the right edge (so the state is not carried by color alone). Hover: `{colors.hairline-raised}` border. Three cards stack at 12px gaps on every width.
- **Picker row** `{components.picker-row}` — 36px initials avatar (hairline-raised fill, paper initials), name in paper 15px 600, then "Musician · The Garden" in dim 14.5px. Rows separated by hairlines. Selected: citron border and 3px radius on the row, check glyph right. After selection the list collapses to the chosen row plus a ghost "Change" link.
- **Project picker row** — same anatomy without the avatar: title, lead, then "$340 of $1,200" in dim.
- **Search input** — `g-input`, placeholder "Search by name" in dim (6.1:1), full width, 16px text.
- **Note field** — `g-input` textarea, 3 rows, counter right-aligned in hint size, dim until 180, paper from 180 to 200.
- **Anonymous checkbox** — native checkbox, `accent-color: citron`, 18px, label in body 15px, hint under it.
- **Confirm button** — `g-btn g-btn-citron`, full width under 480px, inline above. Disabled: 50% opacity, still citron so it reads as the eventual action.
- **Given chip** `{components.given-chip}` — `g-badge g-badge-citron` reading "Given · $5", placed beside the Done heading and in the `/today` card once the gift is decided (the card itself disappears; the chip survives on `/give`'s history row for this month).
- **Done block** `{components.done-block}` — 2px citron left rule, 16px left padding; heading-2 in paper, one body line.
- **Frequency toggle** `{components.frequency-toggle}` — the `/fund/:slug` radiogroup: hairline container, 3px padding, options in button type; selected option paper fill with ink text.
- **Amount row** `{components.amount-button}` — four `g-btn g-btn-ghost` (three amounts and Custom); selected: citron border and text. Custom reveals a 160px `g-input` with `inputMode="decimal"`, placeholder "Dollars".
- **Plus-up button** — `g-btn g-btn-citron`, label states amount and frequency ("Add $25 once"). Under it, `CLAIMS.patron` and `CLAIMS.processingFee` in hint size, body color.
- **Fund plus-up** — two buttons: citron "Give once to the Sophia Fund", ghost "Give monthly to the Sophia Fund". Under them `CLAIMS.grantFundDeductible` and the receipt sentence, hint size.
- **History row** `{components.history-row}` — period in dim mono 12.5px (min-width 72px), what you did in paper 15px, what you added in muted 14.5px; wraps to three lines under 480px. A defaulted month has no chip and no citron.
- **Given to you** `{components.received-row}` — the same row under a "Given to you" label at the bottom of `/give`, preceded by the owed amount in `{typography.amount}` and, while unconnected, a ghost "Get paid in Settings" button and the built connect sentence in hint size.
- **Connect badges** `{components.connect-badge}` — "Connected · Payouts on" is the only citron badge on Settings; "Payouts paused" and "Not finished" are line badges.
- **`/today` card** — the existing `rounded-xl border` card from `today.tsx` (`--app-surface-raised`, `--app-hairline`) with a `MonoLabel` "Your half", a display heading, one body paragraph, and `PrimaryLink` "Pick who gets it". Sits above Creator Notes. Labels on this raised surface use `--app-text-muted` (muted), not dim.
- **Notification row** — unchanged anatomy from `messages._index.tsx`: unread bar in `--app-accent`, title 15px, message 14.5px muted, time 12.5px. No avatar for this notice (no related user), so the empty 40px circle is omitted rather than shown blank.
- **Get paid panel** `{components.owed-line}` `{components.connect-badge}` — Settings › Money section heading "Get paid" (same `h2` style as Billing), owed line as amount + hint, one body paragraph, one button. Connected: citron badge, dashboard link as `g-btn g-btn-ghost` with an external glyph.
- **Report table** `{components.report-table}` — real `<table>`: header row in `g-label` style with a 2px paper rule beneath (the `g-rule-heavy`), cells in row size with tabular numerals, right-aligned numbers, month column in paper mono. Per-member list beneath as `LedgerRow`s: name in paper, "3 months in a row" hint, total in paper right.
- **Email** — `template.ts` unchanged: white card, 19px heading, 15px body, ink button with white text, 13px #444 footer. The note, when present, is a `<blockquote>`-free paragraph in quotes.

## Do's and Don'ts

| Do | Don't |
|---|---|
| Inherit every token from garden.css; reference by name | Add a grey, a second accent, or a gradient |
| Put the default line second, under the heading | Bury the default in a footnote or a tooltip |
| Use citron for the next action and the selected state only | Set the amount, a heading or a `CLAIMS` sentence in citron |
| Dim only on ink, only at 12.5px+ | Dim on `ink-raised`; anything under 12px |
| `g-label` for section labels and table headers | `g-label` for a button, a tab, a link or a chip |
| State the amount as the member's own computed number | Hard-code "$5" anywhere in copy or code |
| Say "give", "back", "your half", "the grant fund" | "gift", "donate", "donation" on our checkout; "tax-deductible" anywhere but the fund plus-up |
| Buttons say what they do: "Give $5 to Marcus", "Add $25 once", "Connect your bank" | "Submit", "Continue", "Boost", "Unlock" |
| One page, two steps, full redirects for checkout and Stripe | Modals, confirm dialogs, toasts for the decision |
| Errors as one plain sentence in body color under the control | Red text, icons, banners |
