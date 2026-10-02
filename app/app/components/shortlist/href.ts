// Where a Shortlist row goes on the phone: its item's own page, not an opened
// card (the desk's way, cardIdOf). Pure, so each relation's destination is
// tested in one place.
//
//   a role, or a project you lead that has requests   /projects/:id?tab=team
//                                                     (a gig has Dates there, lib/projectTabs)
//   any other project                                 /projects/:id
//   a request on a project you lead                   /projects/:id?tab=team
//   a request to attend, or an event with requests    /events/:id?tab=guests
//   any other event                                   /events/:id
//   a person                                          /profile/:id

import { withProjectTab } from "../../lib/projectTabs";
import type { ShortlistProject } from "../../lib/shortlist/types";
import type { ShortlistItem } from "./items";

function projectPage(projectId: string, tab: "team" | "dates" | null): string {
  const qs = tab ? withProjectTab(new URLSearchParams(), tab).toString() : "";
  return qs ? `/projects/${projectId}?${qs}` : `/projects/${projectId}`;
}

/** The tab of a project's page a row is about: where a role is staffed, or
 *  the requests on yours are answered; null for the project itself. */
function projectTab(row: ShortlistProject): "team" | "dates" | null {
  if (!row.role && !row.pendingRequests) return null;
  return row.isGig ? "dates" : "team";
}

// The event page's Guests tab is the host's; for anyone else the page falls
// back to its first tab, so a stale link never lands on nothing.
function eventPage(eventId: string, guests = false): string {
  return guests ? `/events/${eventId}?tab=guests` : `/events/${eventId}`;
}

/** The page a row opens. */
export function itemHref(item: ShortlistItem): string {
  switch (item.type) {
    case "project":
      return projectPage(item.row.projectId, projectTab(item.row));
    case "request": {
      const { on } = item.request;
      return on.type === "project" ? projectPage(on.id, "team") : eventPage(on.id, true);
    }
    case "event":
      return eventPage(item.event.eventId, !!item.event.pendingRequests);
    case "person":
      return `/profile/${item.person.profileId}`;
  }
}
