# Today page — UX review

**Surface:** `/today`, the signed-in home of The Garden (`app/app/routes/today.tsx`)
**Reviewer:** Sally (UX Designer, BMad Method)
**Date:** 2026-09-26
**Status:** review, not a spec. Decisions below are Rick's to make; the EXPERIENCE.md spine follows once they're made.

## The job this page does

A member opens Today to see what's new and decide where to go next. That is browsing. Every control on the page is judged against one question: does it help someone look, then choose?

## Two people, two sessions

**Maya, 29, wedding photographer, on her phone at 11pm.** She joined last week. She wants to know if anything here is for her before she puts effort into a profile. She thumbs down the page. She sees "Back this project →" on a row about a documentary she hasn't opened. She is not going to pay for something she hasn't read; the row has asked her the wrong question, and she scrolls past it as not-for-her. She sees "Paid gigs," taps "All gigs →" expecting more gigs, and lands on a page of every project with no gigs selected. She assumes the site is broken, closes it, and doesn't come back until someone mentions it in person.

**Dan, 52, runs a small business, has twenty minutes on a laptop.** He wants to back someone specific. He sees three filter chips, "All / Design / Worship," above a list of one project. He taps "Design" and the one project stays. He can't tell if the chip worked. The featured project has one button, "See the project," and that's the one thing on the page that reads the way he expects: look first, decide on the next page.

The featured card is the model. The lists below it break the model.

## Findings

### 1. List, not carousel — Likely

A carousel shows one item and hides the rest behind controls; on a phone its horizontal swipe fights the page's vertical scroll. With one or two projects, which is what production holds today, a carousel is an empty stage with arrows. A short list shows everything at once and scales by cutting off.

**Recommend:** up to 5 per section, newest first, then "All 12 projects →" with the real count. Five is the largest number people scan without counting.

### 2. Empty sections vanish — Certain

Open projects and Paid gigs disappear when there is nothing in them. A new member never learns gigs exist.

**Recommend:** keep the heading; show one line — "No paid gigs yet. Post one →". An empty section is information; a missing one is silence.

### 3. Rows don't say they are links — Certain

Project rows are whole-card links, but the only signifier is a small citron arrow at bottom right. The title doesn't look clickable; the card doesn't change on hover. Gig rows are not links at all — only the title and the Apply button are. Two sections, two behaviors, no visible reason.

Projects and gigs looking different is fine if it's deliberate: projects are browsed (image, blurb), gigs are scanned (role, when, pay). Keep the two shapes, but one rule: the whole row is a link, hover lifts the border, and each row ends with the same "See →".

### 4. "All gigs →" doesn't go to gigs — Certain (bug)

`/projects` keeps its kind filter in component state (`useState`), not in the URL, so no link can select "Paid gigs." The link lands on the unfiltered grid. This is a defect on `/projects`, not only on Today.

**Recommend:** `/projects` reads `?kind=gigs` and `?interests=…` from the URL; Today links to `?kind=gigs`. Same fix lets discipline chips, wherever they live, link into a filtered grid.

### 5. The discipline chips filter five rows — Likely

"All / Design / Worship" filter only the rows on Today. With two projects they filter nothing worth filtering, and as the only chips on the page they look more important than they are.

**Recommend:** remove them from Today. Filtering belongs on `/projects`, where there is something to filter. If they stay, they become links to `/projects?interests=Design`, not local state.

### 6. The rows ask before the user has looked — Certain

- "Back this project →" on a row asks for money from someone who hasn't opened the project. The row says "See project →"; backing lives on the project page, next to the funding bar and the team.
- "Apply" on a gig row has the same problem plus a gate: responding to a gig takes membership, so a non-member taps Apply in a list and hits a wall. The row opens the gig; "Respond" stays on the detail page where the gate can be explained.
- One verb across the page: See.

### 7. What already works

- Creator Notes as the headline, with one primary action.
- The featured card: badges top-right, facts (stage, team, lead), one button.
- Muted covers for projects with no photo.
- The patron card at the foot, with claims copy.

## Decisions for Rick

1. List over carousel — recommend list.
2. Count per section — recommend 5, with real counts on "All →".
3. Chips: remove from Today, or make them links into `/projects`.
4. Rows are browse-first ("See →"); Back and Respond move to detail pages.
5. Empty sections stay visible with a one-line prompt.

## Build notes

- Item 4 (URL-driven filters) touches `app/app/routes/projects.tsx`, which every project link on the site goes through. Run impact analysis before editing.
- Nothing here needs a backend change.

## Next

Once the decisions land, `bmad-ux` (Update mode, EXPERIENCE.md) records the browse-first rule, the list caps, and the row/hover contract so the next page doesn't have to rediscover them.
