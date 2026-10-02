// The Shortlist's URL params, shared by the desk (/today?view=shortlist) and
// the phone page (/favorites): ?area= picks an area, ?kind= narrows Projects
// to Paid or Passion. Pure, so neither surface depends on the other.

import type { ProjectKind } from "./types";

/** The Shortlist's three areas, in their fixed order. */
export const SHORTLIST_AREAS = ["projects", "events", "people"] as const;
export type ShortlistArea = (typeof SHORTLIST_AREAS)[number];

const PROJECT_KINDS: readonly ProjectKind[] = ["paid", "passion"];

/** ?area=, or null for the overview. */
export function parseShortlistArea(raw: string | null | undefined): ShortlistArea | null {
  return (SHORTLIST_AREAS as readonly string[]).includes(raw ?? "") ? (raw as ShortlistArea) : null;
}

/** ?kind=, which only Projects has; anywhere else it's ignored. */
export function parseShortlistKind(raw: string | null | undefined, area: ShortlistArea | null): ProjectKind | null {
  if (area !== "projects") return null;
  return (PROJECT_KINDS as readonly string[]).includes(raw ?? "") ? (raw as ProjectKind) : null;
}

/** The phone Shortlist (/favorites), or one of its areas. On desktop
 *  /favorites redirects to the desk, so this link works on both. */
export function favoritesHref(area?: ShortlistArea | null, kind?: ProjectKind | null): string {
  const params = new URLSearchParams();
  if (area) params.set("area", area);
  if (area === "projects" && kind) params.set("kind", kind);
  const qs = params.toString();
  return qs ? `/favorites?${qs}` : "/favorites";
}
