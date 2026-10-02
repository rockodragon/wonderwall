import { describe, expect, it } from "vitest";
import { NOW, event, eventRequest, follow, on, project, projectRequest, role, sampleShortlist } from "../../lib/shortlist/fixtures";
import { itemHref } from "./href";
import { areaGroups, everything } from "./items";

const asProject = (row: ReturnType<typeof project>) => itemHref({ type: "project", row });

describe("itemHref: projects", () => {
  it("sends a role to the project's Team tab", () => {
    expect(asProject(project("invited", "Hollow Creek", { role: role("Sound Mixer") }))).toBe("/projects/hollow-creek?tab=team");
    expect(asProject(project("saved", "Zine", { role: role("Copy Editor") }))).toBe("/projects/zine?tab=team");
    expect(asProject(project("closed", "Wedding", { role: role("Videographer") }))).toBe("/projects/wedding?tab=team");
  });

  it("sends a free-text role there too: the member's own place on the team", () => {
    expect(asProject(project("team", "Choir", { role: { id: null, title: "Alto", neededBy: null } }))).toBe("/projects/choir?tab=team");
  });

  it("sends a gig's role to Dates, the tab a gig has in Team's place", () => {
    expect(asProject(project("waiting", "Gigs", { isGig: true, role: role("Barista") }))).toBe("/projects/gigs?tab=dates");
  });

  it("sends the project itself to its page", () => {
    for (const relation of ["leading", "backing", "saved", "closed"] as const) {
      expect(asProject(project(relation, "Hymns"))).toBe("/projects/hymns");
    }
  });

  it("sends a project you lead to Team when requests wait on it", () => {
    expect(asProject(project("leading", "Hymns", { pendingRequests: 2 }))).toBe("/projects/hymns?tab=team");
    expect(asProject(project("leading", "Hymns", { pendingRequests: 0 }))).toBe("/projects/hymns");
    expect(asProject(project("leading", "Gigs", { isGig: true, pendingRequests: 1 }))).toBe("/projects/gigs?tab=dates");
  });

  it("keeps the project's id as the page's, not the role's", () => {
    expect(asProject(project("invited", "Hollow Creek", { projectId: "p42", role: role("Sound Mixer") }))).toBe("/projects/p42?tab=team");
  });
});

describe("itemHref: requests, events and people", () => {
  it("sends a join request to the Team tab of the project it's on", () => {
    expect(itemHref({ type: "request", request: projectRequest("Hana Cho", "Hymns for the Commons") })).toBe("/projects/hymns-for-the-commons?tab=team");
  });

  it("sends a request to attend to the Guests tab of your event", () => {
    expect(itemHref({ type: "request", request: eventRequest("Sam Ito", "Zine Workshop", NOW) })).toBe("/events/zine-workshop?tab=guests");
  });

  it("sends an event to its page, a hosted one with requests to Guests", () => {
    expect(itemHref({ type: "event", event: event("going", "Open Studio", NOW) })).toBe("/events/open-studio");
    expect(itemHref({ type: "event", event: event("saved", "Market", NOW) })).toBe("/events/market");
    expect(itemHref({ type: "event", event: event("hosting", "Zine Workshop", NOW) })).toBe("/events/zine-workshop");
    expect(itemHref({ type: "event", event: event("hosting", "Zine Workshop", NOW, { pendingRequests: 3 }) })).toBe("/events/zine-workshop?tab=guests");
  });

  it("sends a person to their profile", () => {
    expect(itemHref({ type: "person", person: follow("Kofi Mensah", [], on(9, 30)) })).toBe("/profile/kofi-mensah");
  });

  it("gives every item on the sample Shortlist one of the three pages, never an opened card", () => {
    const data = sampleShortlist();
    const items = (["projects", "events", "people"] as const).flatMap((area) => areaGroups(data, NOW, area).flatMap((g) => g.items));
    expect(items.length).toBeGreaterThan(30);
    for (const item of [...items, ...everything(data, NOW)]) {
      expect(itemHref(item)).toMatch(/^\/(projects|events|profile)\/[^/?]+(\?tab=(team|dates|guests))?$/);
    }
  });
});
