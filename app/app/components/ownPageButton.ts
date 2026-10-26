// The look of the buttons for your own page: Share your profile, Show my
// code, Your shortlist. A pill on the profile page, a tile there on a phone
// that turns into the pill from `sm` up (so one set of buttons serves both
// widths), and a small round icon in the Settings header beside Edit.

import type { CSSProperties } from "react";

/** How a button looks. `phoneTile` is a tile below `sm` and the pill from
 *  there up; `icon` is a 44px circle with its name for screen readers. */
export type OwnPageLook = "pill" | "icon" | "phoneTile";

export const OWN_PAGE_PILL =
  "inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium no-underline transition-colors hover:border-[var(--app-accent)]";

const OWN_PAGE_TILE =
  "flex min-h-[68px] min-w-0 flex-col items-center justify-center gap-1.5 rounded-xl border px-2 py-2 text-[13.5px] font-medium no-underline transition-colors hover:border-[var(--app-accent)]";

// The tile, with each of its differences from the pill put back from `sm`.
const OWN_PAGE_PHONE_TILE = `${OWN_PAGE_TILE} sm:inline-flex sm:min-h-0 sm:flex-row sm:justify-start sm:gap-2 sm:px-4 sm:py-2 sm:text-sm`;

/** The round icon button, Edit's twin in the Settings header. */
export const OWN_PAGE_ICON =
  "flex h-11 w-11 shrink-0 items-center justify-center rounded-full border no-underline transition-colors hover:border-[var(--app-accent)]";

export const OWN_PAGE_LOOK: Record<OwnPageLook, string> = {
  pill: OWN_PAGE_PILL,
  icon: OWN_PAGE_ICON,
  phoneTile: OWN_PAGE_PHONE_TILE,
};

export const OWN_PAGE_BUTTON_STYLE: CSSProperties = {
  backgroundColor: "var(--app-surface-raised)",
  color: "var(--app-text)",
  borderColor: "var(--app-hairline)",
};

/** What a button says as a tile and as a pill, and its plain name (an
 *  icon's tooltip and what a screen reader says). */
export type OwnPageName = { readonly tile: string; readonly pill: string; readonly plain: string };

/** What each button says. The note about them (ShareHint) reads these too,
 *  so it names what's on screen. */
export const OWN_PAGE_LABELS = {
  share: { tile: "Share profile", pill: "Share your profile", plain: "Share your profile" },
  code: { tile: "My code", pill: "Show my code", plain: "Show my code" },
  shortlist: { tile: "Shortlist", pill: "Your shortlist →", plain: "Your shortlist" },
} satisfies Record<string, OwnPageName>;

/** Where the three sit (components/MyShareActions.tsx). Icons sit in a row.
 *  On the profile page a phone gets a row of three equal tiles with the note
 *  under it; from `sm` up, a column as it always was: Share and code side by
 *  side, the note, then Shortlist. The note comes before Shortlist in the
 *  markup, so on a phone Shortlist is placed in the first row's third
 *  column. */
export const OWN_PAGE_ROW: Record<Exclude<OwnPageLook, "pill">, { row: string; pair: string; note: string; shortlist: string }> = {
  icon: { row: "flex items-center gap-1", pair: "contents", note: "", shortlist: "" },
  phoneTile: {
    row: "grid w-full max-w-md grid-cols-3 gap-2 sm:flex sm:w-auto sm:max-w-none sm:flex-col sm:items-end",
    pair: "contents sm:flex sm:flex-wrap sm:items-center sm:justify-end sm:gap-2",
    note: "col-span-3 sm:contents",
    shortlist: "col-start-3 row-start-1 sm:col-auto sm:row-auto",
  },
};
