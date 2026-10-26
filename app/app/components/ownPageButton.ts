// The look of the buttons for your own page: Share your profile, Show my
// code, Your shortlist. A pill on the profile page; a tile at the top of
// Settings, three to a row so a phone doesn't squeeze them; and on the
// profile page a tile on a phone that turns into the pill from `sm` up, so
// one set of buttons serves both widths.

import type { CSSProperties } from "react";

/** How a button looks. `phoneTile` is a tile below `sm` and the pill from there up. */
export type OwnPageLook = "pill" | "tile" | "phoneTile";

export const OWN_PAGE_PILL =
  "inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium no-underline transition-colors hover:border-[var(--app-accent)]";

export const OWN_PAGE_TILE =
  "flex min-h-[68px] min-w-0 flex-col items-center justify-center gap-1.5 rounded-xl border px-2 py-2 text-[13.5px] font-medium no-underline transition-colors hover:border-[var(--app-accent)]";

// The tile, with each of its differences from the pill put back from `sm`.
const OWN_PAGE_PHONE_TILE = `${OWN_PAGE_TILE} sm:inline-flex sm:min-h-0 sm:flex-row sm:justify-start sm:gap-2 sm:px-4 sm:py-2 sm:text-sm`;

export const OWN_PAGE_LOOK: Record<OwnPageLook, string> = {
  pill: OWN_PAGE_PILL,
  tile: OWN_PAGE_TILE,
  phoneTile: OWN_PAGE_PHONE_TILE,
};

export const OWN_PAGE_BUTTON_STYLE: CSSProperties = {
  backgroundColor: "var(--app-surface-raised)",
  color: "var(--app-text)",
  borderColor: "var(--app-hairline)",
};

/** What a button says as a tile and as a pill. */
export type OwnPageName = { readonly tile: string; readonly pill: string };

/** What each button says. The note about them (ShareHint) reads these too,
 *  so it names what's on screen. */
export const OWN_PAGE_LABELS = {
  share: { tile: "Share profile", pill: "Share your profile" },
  code: { tile: "My code", pill: "Show my code" },
  shortlist: { tile: "Shortlist", pill: "Your shortlist →" },
} satisfies Record<string, OwnPageName>;

/** Where the three sit (components/MyShareActions.tsx). A tile row is three
 *  equal columns. On the profile page a phone gets that row with the note
 *  under it; from `sm` up, a column as it always was: Share and code side by
 *  side, the note, then Shortlist. The note comes before Shortlist in the
 *  markup, so on a phone Shortlist is placed in the first row's third
 *  column. */
export const OWN_PAGE_ROW: Record<Exclude<OwnPageLook, "pill">, { row: string; pair: string; note: string; shortlist: string }> = {
  tile: { row: "grid grid-cols-3 gap-2", pair: "contents", note: "col-span-3", shortlist: "" },
  phoneTile: {
    row: "grid w-full max-w-md grid-cols-3 gap-2 sm:flex sm:w-auto sm:max-w-none sm:flex-col sm:items-end",
    pair: "contents sm:flex sm:flex-wrap sm:items-center sm:justify-end sm:gap-2",
    note: "col-span-3 sm:contents",
    shortlist: "col-start-3 row-start-1 sm:col-auto sm:row-auto",
  },
};
