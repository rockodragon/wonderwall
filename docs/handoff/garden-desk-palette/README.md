# Handoff: The Garden — Desk + Palette (option 3a)

Source: Claude Design project a71c7e24-9060-4a4d-82da-6dfa370efea6, `design_handoff_garden_desk/README.md`, copied 2026-10-01. The prototype is `Garden Studio.dc.html` in that project (section 3a). The build spec that adapts this to the app is `docs/features/desktop-desk-palette.md`.

## Overview
This replaces the sidebar SaaS layout of TheCreative.exchange (The Garden) with a quiet "artist's desk". The page is a dotted dark surface. Content (event posters, project/fund cards) rests on it as slightly rotated paper. All navigation lives in one palette button in the lower-left corner. Hovering it fans out six tools on an arc. Hovering a tool opens a stack of action verbs. Clicking a card lifts it and expands it to fill the page.

## About the design files
`Garden Studio.dc.html` is a **design reference built in HTML**: a prototype of the intended look and behavior, not production code. Recreate it in the target codebase using its existing framework, components and patterns. Implement **option 3a only** (the top section of the file). Sections 2a, 1a, 1b and 1c are earlier explorations kept for context.

## Fidelity
High fidelity for layout, motion, color and copy. Event data is real (taken from the live site). Card images are drop-in placeholders, so wire them to each event's/project's real cover image.

## Screen: Desk (single screen, full viewport)
Prototype artboard: 1200×760. In production it fills the viewport, and card positions should scale and be computed relative to it.

**Surface**
- Background `#151515`, with a dot grid `radial-gradient(#262626 1px, transparent 1px)` at 24×24px.
- No header, no sidebar.

**Greeting** (top-left, 48px from left, 44px from top, 10px gap)
- Line 1: mono 12px, letter-spacing 0.24em, uppercase, `#8F8F8F`. Format `{COMMUNITY} · {CURRENT VIEW}`, e.g. `THE GARDEN · YOUR DESK`.
- Line 2: "Good morning, {firstName}." Inter 30px, weight 500, letter-spacing −0.02em, `#F4F4F2`. The greeting word should follow the time of day.

**Cards** (absolutely positioned on the desk)
- Resting layout from the prototype (x, y, w, h, rotation):
  - Event 1: 330, 170, 230×310, −5°
  - Event 2: 640, 215, 220×295, 3°
  - Event 3: 925, 150, 240×320, −2°
  - Grant Fund note: 560, 520, 240×170, 4°
- Generalize this as a scatter with ±5° rotation that keeps clear of the greeting and the palette corner (bottom-left ~280×280).
- Card: radius 4, shadow `0 10px 30px rgba(0,0,0,.45)`, overflow hidden.
- Face: the cover image fills the card (object-fit: cover). Above it, a scrim `linear-gradient(to top, rgba(18,18,18,.85), transparent 55%)`. Face padding 22px, content laid out top-to-bottom with space-between:
  - Kicker (top): mono 11px, letter-spacing 0.2em, opacity .85. The event date, e.g. `OCT 2`, or `THE SOPHIA FUND`.
  - Bottom: title (Inter 26px, weight 500, line-height 1.02, letter-spacing −0.02em), then a foot line 13px at opacity .8 (venue, or "available to grant. First grants in November.").
- The Grant Fund card without an image uses paper `#EDE3B4` with ink `#1d1b12`, title "$10,025" at 40px.
- Hover: rotate to 0°, translateY(−8px), shadow `0 40px 80px rgba(0,0,0,.6)`, z-index raised.

**Opened card** (click a card)
- It animates to inset 24px on all sides, rotation 0, radius 12, z-index above everything except the palette.
- A dim layer `rgba(10,10,10,.6)` covers the desk behind it.
- Left 46% is the face (image, padding 56px, title grows to 72px). Right side is a detail panel, background `#181818`, padding 56px, gap 20px. It fades in at 400ms with a 260ms delay. It contains:
  - Meta: mono 12px, 0.2em, `#FFE066`, e.g. `NOV 8 · LIGHT CHURCH`, with a 40px round close button (1px `#333` border, hover border and icon turn `#FFE066`) on the right.
  - Title: 44px, weight 500.
  - Host: 15px, `#8F8F8F`.
  - Description: 18px, line-height 1.65, `#D6D6D6`, max 46ch.
  - Action row: solid accent button 52px tall, padding 0 28px, radius 10, background `#FFE066`, text `#121212` 16px weight 600, hover `#FFEA94`. The label is "I'm going" for events and "Give" for the fund. Beside it, an aside in 14px `#8F8F8F` ("3 going" / "Tax-deductible").
- Close by clicking the close button, clicking the dim layer, or pressing Escape.

**Palette** (lower-left)
- Main button: 56px circle at left 28, bottom 28. 1px `#FFE066` border, fill `rgba(255,224,102,.08)`, ring `0 0 0 6px rgba(255,224,102,.05)`, Phosphor `palette` icon 24px in `#FFE066`. Clicking it resets the desk to everything.
- Hover zone: a 280×280 box in the corner. Entering it fans the tools out; leaving it collapses them.
- Tools: 6 circles, each 44px, placed on a quarter arc of radius 150 around the main button's center. Angles run from 90° down in 18° steps (90, 72, 54, 36, 18, 0). Order:
  1. Desk (`squares-four`)
  2. Today (`sun`)
  3. People (`person-simple`)
  4. Projects (`paint-brush`)
  5. Events (`calendar-blank`)
  6. Profile (user initials, mono 13px)
- Tool style: border 1px `#333`, background `rgba(24,24,24,.92)`, icon 19px `#F4F4F2`. When the tool's view is active, border and icon turn `#FFE066`. On hover: background `#2a2a2a`, scale 1.12.
- Fan-out animation: 340ms `cubic-bezier(.2,.8,.2,1)`, staggered 35ms per tool. Closed state sits at the main button with scale .4 and opacity 0.
- Action stack: hovering a tool opens a panel to its right, with a 14px hover bridge so the cursor can travel into it. The panel:
  - Min width 220, padding 8, radius 14, background `rgba(26,26,26,.94)`, backdrop-blur 14px, 1px `#2e2e2e` border, shadow `0 24px 60px rgba(0,0,0,.55)`.
  - Header: tool name, mono 11px, letter-spacing 0.22em, `#8F8F8F`.
  - Items: 15px, padding 10px 12px, radius 8. Hover: background `#2a2a2a`, text `#FFE066`.
  - Enters at 240ms, sliding in 8px from the left.

**Action stacks (exact copy, in order)**
- Desk: Show everything
- Today: Today
- People: Find people · Meet people near me · Invite someone
- Projects: Browse projects · Start a project · Grant Fund
- Events: Browse events · Host an event · See my favorites
- Profile ({full name}): Edit my profile · Read messages · About {current community} · Switch to {other community} · Sign out

## Interactions & behavior
- **Browsing sorts the desk.** Desk, Today, People, Projects, Events, "Browse …" and "See my favorites" don't navigate away. They filter the desk:
  - Cards that don't match fall off the bottom: translateY to offscreen, opacity 0.
  - Matching cards straighten (0°) into a centered row: 230×310, 44px gap, top 230.
  - All card motion is 620ms `cubic-bezier(.2,.8,.2,1)`.
  - If nothing matches, centered text appears: "Nothing from {View} on the desk yet." (20px, `#8F8F8F`, fades in after 300ms).
- **Filter membership:** events → Events (the next event also → Today). Grant Fund → Projects and Today. Favorites → events the user has hearted.
- **Create and flow actions** (Invite someone, Start a project, Host an event, Edit my profile, Read messages, About, Sign out) are not designed yet. Route them to their existing app flows, ideally opening as an expanded card on the desk rather than a new page.
- **Grant Fund** opens the fund card, expanded.
- **Switch community** toggles between The Garden and The Exchange, updates the greeting label, and reloads desk content for that community.
- **Escape** closes any open card.
- **Accessibility:** the palette must be keyboard reachable. Focusing the main button opens the fan, arrow keys move between tools, Enter opens a tool's stack, Escape collapses it. Use a 2px `#FFE066` focus ring with 2px offset. On touch, a tap opens the fan and the first tap on a tool opens its stack.

## State
- `mode`: `all | today | people | projects | events | fav`
- `openCardId`: `null | id`
- `fanOpen`: boolean
- `hoveredTool`: `null | index`
- `community`: `The Garden | The Exchange`
- Data needed: events (title, date, venue, host, description, attendee count, favorited, cover image), projects (including the fund: available amount, status), and the current user (name, initials).

## Design tokens
- Colors:
  - Surface `#151515`, page `#121212`, panel `#181818` / `#171717`
  - Lines `#262626` / `#2e2e2e` / `#333`
  - Text `#F4F4F2`, secondary `#D6D6D6` / `#B3B3B3`, muted `#8F8F8F`
  - Accent `#FFE066`, accent hover `#FFEA94`
  - Note paper `#EDE3B4` / ink `#1d1b12`
- Type: Inter (headings and body, weights 500/600). Labels use a monospace face at 11–13px with wide tracking (0.2–0.24em), matching the existing "THE GARDEN" wordmark.
- Easing: `cubic-bezier(.2,.8,.2,1)` throughout.
- Icons: Phosphor, regular weight.

## Assets
- Event and project cover images come from the app's existing uploads; none are bundled.
- Icons: Phosphor Icons.
