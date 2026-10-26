// Where a phone page sends a signed-in member on a computer: the same list on
// the desk (routes/_app.tsx does the sending; FF_DESK, md and up, signed in).
// /today and /favorites already hand over in their own routes; these are the
// three browse pages, which links all over the app still point at.
//
//   /people?tab=orgs&q=abiding    → /today?view=people&tab=orgs&q=abiding
//   /search?interests=Music&near=1 → /today?view=people&interests=Music&near=1
//   /projects?view=work           → /today?view=projects&show=work
//   /projects?new=project         → /today?view=projects&create=project
//   /events?tab=past&q=open+mic   → /today?view=events&tab=past&q=open+mic
//   /events?new=event             → /today?view=events&create=event
//
// Only what the desk reads comes along (desk/deskBrowse.tsx, DeskCreate.tsx).
// The rest is dropped: ?community= (the desk's community is not in the URL),
// /events' ?tags=, /projects' ?interests= and ?location= (a soft sort the desk
// doesn't have) and ?title= (the desk's start form opens empty).

import { parseEventsTab } from "../lib/browse/eventsFilter";
import { readProjectsView, writeProjectsView } from "../lib/browse/projectsFilter";
import { readStartStage } from "../lib/shareProject";
import { deskHref, type DeskCreateKind, type DeskView } from "./deskState";

/** The phone pages that have a desk view, by path. /search is People's old address. */
const PAGE_VIEW: Readonly<Record<string, Extract<DeskView, "people" | "projects" | "events">>> = {
  "/people": "people",
  "/search": "people",
  "/projects": "projects",
  "/events": "events",
};

/** The desk URL for a phone page, or null when the page has no desk view. */
export function deskHrefForPage(pathname: string, search: string): string | null {
  const view = PAGE_VIEW[pathname.replace(/\/+$/, "")];
  if (!view) return null;
  const from = new URLSearchParams(search);
  const to = new URLSearchParams();
  let create: DeskCreateKind | null = null;

  const q = from.get("q")?.trim();
  if (q) to.set("q", q);

  if (view === "people") {
    if (from.get("tab") === "orgs") {
      // Discipline and Near me are about people: an organization has neither.
      to.set("tab", "orgs");
    } else {
      const interests = from.get("interests");
      if (interests) to.set("interests", interests);
      if (from.get("near") === "1") to.set("near", "1");
    }
  }

  if (view === "projects") {
    // The chip and Stage, old links included, written the way the desk reads them.
    const shown = readProjectsView({
      view: from.get("view"),
      kind: from.get("kind"),
      show: from.get("show"),
      stage: from.get("stage"),
      seek: from.get("seek"),
    });
    writeProjectsView(to, shown, []);
    if (from.get("new") === "project") {
      create = "project";
      // The start form's stage rides on the same ?stage= (lib/shareProject.ts).
      const start = readStartStage(from);
      if (start) to.set("stage", start);
    }
  }

  if (view === "events") {
    const tab = parseEventsTab(from.get("tab"));
    if (tab !== "all") to.set("tab", tab);
    if (from.get("new") === "event") create = "event";
  }

  const base = deskHref(view, null, create);
  const extra = to.toString();
  return extra ? `${base}&${extra}` : base;
}
