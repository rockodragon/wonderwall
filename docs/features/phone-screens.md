# Phone screens

**Status:** shipped 2026-10-12 (branch `claude/mobile-screens-redesign-3bc8f6`).
**Decision:** Rick, 2026-10-12: the phone screens read as reflowed web pages.
They should have a native app's hierarchy, closer to Instagram: less text,
direct statements, the one action where a thumb finds it, controls on one
row, content as a feed. Later that day: the bar goes to five places, and
the place you're on is the filled icon.

## What a phone screen is

Every list screen inside the app shell is built from the same three parts,
in `app/app/components/phone/`:

- **The bar** (`PageTop`). The page's name on the left, one action on the
  right (`TopButton`: a citron pill with a glyph and a short word: Host,
  Post, New), and an arrow when the screen is a level inside another. It
  sticks to the top while the page scrolls. From md up it sits still, and
  the pages that have a desktop heading of their own (Events, Projects)
  hide it there.
- **Tabs** (`TabStrip`). Equal columns across the screen, the open one
  underlined in the accent, a count after a label where there is one, a
  dot where something needs you. Links when the tabs are places (the
  Shortlist's areas), buttons when they are views of one page (Events'
  Upcoming · Saved · Past). Not `components/project/Tabs.tsx`, which is the
  WAI-ARIA tabs-over-panels pattern for one page.
- **The feed.** One column, each item edge to edge: the cover across the
  screen, the words under it, no frame. `EventCard` and `ProjectCard` take
  `feed`; only their own browse pages pass it. From sm up the framed grid
  card is unchanged, and the dashed "make one" tile is back in first place
  (a phone has the action in the bar instead).

The bar and the tabs bleed out of the page's `p-4 sm:p-6` gutter
(`PHONE_BLEED`) and put the gutter back inside themselves, so they span the
screen and their text still lines up with the page.

## Screen by screen

- **Events.** Bar with Host. Tabs: Upcoming · Saved (n) · Past. One row:
  search, Near me, Filter. The feed. The line "Discover and join community
  gatherings." is desktop's only.
- **Projects.** Bar with Post, which opens the same two choices as the
  desktop split button (Start a project / Hire someone). The four lenses
  are one row that scrolls sideways; Stage and Filter share the row under
  it. The feed.
- **Today.** The same page, closer together: the Garden's lockup and the
  date, Needs you, Updates, then "Start a project" as a prompt (30px, one
  line, a full-width button) rather than a 44px hero; the featured project
  with its facts as one line; sections 48px apart instead of 128px; the
  patrons card's claims hidden under md.
- **Shortlist.** Bar with the count. The three areas as a row of figures,
  the way a profile counts its posts and followers: the count, the area,
  and what needs you. An empty area's figure goes to its browse page. Needs
  you and "Everything" follow as before. An area is a bar with the arrow
  back, tabs All · Projects · Events · People, then the grouped rows.
- **Messages.** The bar at every width (it was a heading and a button
  already), New in the corner.
- **People.** The phone's gutter; otherwise unchanged (its two tabs were
  already the title).

## The bar

Five places, like a native tab bar: Today, Projects, Events, People, you
(`routes/_app.tsx`, `BAR_ORDER`). Signed out on a public path: Projects,
Events, People at their public addresses. The place you're on is the
filled Phosphor icon in the accent and carries `aria-current`.

The Shortlist and Messages left the bar for the top corner of Today
(`components/phone/TodayActions.tsx`): the bookmark with the accent dot
while something needs you, the envelope with the red count of unread
messages and notifications. The Shortlist is also a button on your own
profile and on the settings page's Profile tab (`ShortlistLink`), the two
places the bar's Profile tab leads.

## Not done, on purpose

- Home-indicator padding under the bar: the site has no web manifest, so
  it can't be installed to a home screen, and Safari's own toolbar keeps
  the bar clear of the indicator.
- Profile and Settings beyond the Shortlist button: the action row on a
  profile already fits; Settings is forms.
