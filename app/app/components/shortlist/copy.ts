// The Shortlist's words (docs/handoff/favorites-redesign/README.md, "Empty and
// sparse"), for the phone page, the desk's page (desk/ShortlistView.tsx) and
// the palette: one copy of each, so the surfaces can't drift apart.

import type { ProjectKind } from "../../lib/shortlist/types";
import type { ShortlistArea } from "../../lib/shortlist/url";
import { KIND_LABEL } from "./rowModel";

/** What an empty area says. */
export const EMPTY_AREA: Record<ShortlistArea, string> = {
  projects: "No projects on your shortlist yet.",
  events: "No events saved yet.",
  people: "You're not following anyone yet.",
};

/** Projects narrowed to a kind with nothing in it. */
export function emptyKind(kind: ProjectKind): string {
  return `No ${KIND_LABEL[kind].toLowerCase()} projects on your shortlist.`;
}

/** Where an area sends someone who has nothing in it yet. */
export const BROWSE_LABEL: Record<ShortlistArea, string> = {
  projects: "Browse projects →",
  events: "Browse events →",
  people: "Find people →",
};

/** A brand-new member's one note. */
export const WELCOME = {
  title: "Nothing on your shortlist yet.",
  body: "Save projects, roles and events you want to come back to, and follow people whose work you like. They all collect here.",
} as const;

/** What a folded group is called in "Show 3 closed". */
export const FOLD_NOUN: Record<string, string> = { closed: "closed", past: "past events" };

/** "1 needs you", "4 need you". */
export function needYouText(n: number): string {
  return `${n} ${n === 1 ? "needs" : "need"} you`;
}

/** "and 12 more →": what a tile's preview says after the items it names. */
export function moreText(n: number): string {
  return `and ${n} more →`;
}
