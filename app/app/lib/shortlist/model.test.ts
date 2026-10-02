import { describe, expect, it } from "vitest";
import {
  DAY,
  NOW,
  PROPOSALS,
  VOLUNTEER,
  amount,
  day,
  event,
  eventRequest,
  follow,
  on,
  project,
  projectRequest,
  range,
  role,
  sampleShortlist,
  shortlist,
} from "./fixtures";
import {
  MONTHS_AFTER,
  SHORTLIST_GROUPS,
  areaCount,
  eventGroups,
  isPast,
  payText,
  peopleGroups,
  projectGroups,
  summary,
  type EventGroup,
  type ProjectGroup,
  type ProjectItem,
} from "./model";
import type { EventRelation, ProjectRelation, ShortlistData } from "./types";

function title(item: ProjectItem): string {
  return item.type === "project" ? (item.row.role?.title ?? item.row.title) : `${item.request.person.name}'s request`;
}

/** group key → row titles, so a whole area reads at a glance. */
function projectTitles(groups: ProjectGroup[]): Record<string, string[]> {
  return Object.fromEntries(groups.map((g) => [g.key, g.items.map(title)]));
}

function eventTitles(groups: EventGroup[]): Record<string, string[]> {
  return Object.fromEntries(groups.map((g) => [g.key, g.items.map((e) => e.title)]));
}

function without(data: ShortlistData, relation: ProjectRelation): ShortlistData {
  return { ...data, projects: data.projects.filter((row) => row.relation !== relation) };
}

describe("SHORTLIST_GROUPS — the relationships config", () => {
  it("uses the spec's labels, in the spec's order", () => {
    expect(SHORTLIST_GROUPS.projects.map((g) => g.label)).toEqual([
      "Needs you",
      "Leading",
      "On the team",
      "Waiting to hear",
      "Backing",
      "Saved",
      "Closed",
    ]);
    expect(SHORTLIST_GROUPS.events.map((g) => g.label)).toEqual([
      "This week",
      "Hosting",
      "Going",
      "Requested",
      "Saved",
      "Past",
    ]);
  });

  it("folds only Closed and Past", () => {
    const folded = [...SHORTLIST_GROUPS.projects, ...SHORTLIST_GROUPS.events].filter((g) => g.folded);
    expect(folded.map((g) => g.label)).toEqual(["Closed", "Past"]);
  });

  it("gives every relation exactly one home group", () => {
    const projectRelations: ProjectRelation[] = ["invited", "leading", "team", "waiting", "backing", "saved", "closed"];
    const eventRelations: EventRelation[] = ["hosting", "going", "requested", "saved"];
    for (const relation of projectRelations) {
      expect(SHORTLIST_GROUPS.projects.filter((g) => g.relation === relation)).toHaveLength(1);
    }
    for (const relation of eventRelations) {
      expect(SHORTLIST_GROUPS.events.filter((g) => g.relation === relation)).toHaveLength(1);
    }
  });

  it("has one Needs you group per area, first", () => {
    expect(SHORTLIST_GROUPS.projects.findIndex((g) => "needsYou" in g)).toBe(0);
    expect(SHORTLIST_GROUPS.events.findIndex((g) => "needsYou" in g)).toBe(0);
  });
});

describe("projectGroups", () => {
  it("groups the sample by relationship, in config order", () => {
    expect(projectTitles(projectGroups(sampleShortlist(), NOW))).toEqual({
      needs: ["Sound Mixer", "Hana Cho's request", "Copy Editor"],
      leading: ["Photographer for the Advent Catalog", "Hymns for the Commons"],
      team: ["Photographer", "Painter"],
      waiting: ["Poster Illustrator", "Alto", "Motion Designer"],
      backing: ["The Long Table podcast", "Street Choir Recordings"],
      saved: ["Brand Designer", "Set Builder", "Quiet Hours Zine", "Icons for the Everyday"],
      closed: ["Wedding Videographer", "Album Cover Artist", "Easter Sunrise Installation"],
    });
  });

  it("puts a row that needs you in Needs you and nowhere else", () => {
    const groups = projectGroups(sampleShortlist(), NOW);
    const keys = groups.flatMap((g) => g.items.map((i) => (i.type === "project" ? i.row.key : i.request.key)));
    expect(new Set(keys).size).toBe(keys.length);
    expect(projectTitles(groups).saved).not.toContain("Copy Editor");
  });

  it("orders Saved by soonest to close, then newest saved", () => {
    const data = shortlist({
      projects: [
        project("saved", "Old, no date", { since: NOW - 9 * DAY }),
        project("saved", "Later", { role: role("Later", NOW + 30 * DAY) }),
        project("saved", "New, no date", { since: NOW - DAY }),
        project("saved", "Sooner, older", { role: role("Sooner, older", NOW + 20 * DAY), since: NOW - 5 * DAY }),
        project("saved", "Sooner, newer", { role: role("Sooner, newer", NOW + 20 * DAY), since: NOW - 2 * DAY }),
      ],
    });
    expect(projectTitles(projectGroups(data, NOW)).saved).toEqual([
      "Sooner, newer",
      "Sooner, older",
      "Later",
      "New, no date",
      "Old, no date",
    ]);
  });

  it("leaves out empty groups", () => {
    const data = shortlist({ projects: [project("leading", "Mine")] });
    expect(projectGroups(data, NOW).map((g) => g.key)).toEqual(["leading"]);
  });

  it("marks only Closed as folded", () => {
    const folded = projectGroups(sampleShortlist(), NOW).filter((g) => g.folded);
    expect(folded.map((g) => g.key)).toEqual(["closed"]);
  });

  it("returns nothing for an empty shortlist", () => {
    expect(projectGroups(shortlist(), NOW)).toEqual([]);
  });
});

describe("projectGroups — the Paid · Passion filter", () => {
  it("Paid keeps paid projects only", () => {
    expect(projectTitles(projectGroups(sampleShortlist(), NOW, "paid"))).toEqual({
      needs: ["Sound Mixer", "Copy Editor"],
      leading: ["Photographer for the Advent Catalog"],
      team: ["Photographer"],
      waiting: ["Poster Illustrator", "Motion Designer"],
      saved: ["Brand Designer", "Set Builder"],
      closed: ["Wedding Videographer", "Album Cover Artist"],
    });
  });

  it("Passion keeps passion projects, requests on them included", () => {
    expect(projectTitles(projectGroups(sampleShortlist(), NOW, "passion"))).toEqual({
      needs: ["Hana Cho's request"],
      leading: ["Hymns for the Commons"],
      team: ["Painter"],
      waiting: ["Alto"],
      backing: ["The Long Table podcast", "Street Choir Recordings"],
      saved: ["Quiet Hours Zine", "Icons for the Everyday"],
      closed: ["Easter Sunrise Installation"],
    });
  });

  it("puts a paid role on a passion project under Paid", () => {
    const copyEditor = (kind: "paid" | "passion") =>
      projectGroups(sampleShortlist(), NOW, kind)
        .flatMap((g) => g.items)
        .find((i) => title(i) === "Copy Editor");
    expect(copyEditor("paid")).toMatchObject({ type: "project", row: { kind: "passion" } });
    expect(copyEditor("passion")).toBeUndefined();
  });

  it("no filter (undefined or null) shows both", () => {
    const all = projectGroups(sampleShortlist(), NOW);
    expect(projectGroups(sampleShortlist(), NOW, null)).toEqual(all);
    const count = (groups: ProjectGroup[]) => groups.reduce((n, g) => n + g.items.length, 0);
    expect(count(projectGroups(sampleShortlist(), NOW, "paid")) + count(projectGroups(sampleShortlist(), NOW, "passion"))).toBe(
      count(all),
    );
  });
});

describe("eventGroups", () => {
  it("groups the sample: this week, by relation, then past", () => {
    expect(eventTitles(eventGroups(sampleShortlist(), NOW))).toEqual({
      week: ["Open Studio Night", "Printmaking Workshop"],
      hosting: ["Zine Workshop"],
      going: ["Harvest Supper"],
      requested: ["Poetry & Prayer Salon"],
      saved: [
        "Film Night: Babette's Feast",
        "Makers Market",
        "Songwriters in the Round",
        "Icon Writing Retreat",
        "Advent Lessons & Carols",
      ],
      past: ["Plein Air Morning", "Late Summer Potluck", "Darkroom Basics"],
    });
  });

  it("This week holds going and hosting in the rule-2 window, and only those", () => {
    const data = shortlist({
      events: [
        event("hosting", "Hosting soon", NOW + 2 * DAY),
        event("going", "Going now", NOW),
        event("saved", "Saved soon", NOW + DAY),
        event("requested", "Requested soon", NOW + DAY),
        event("going", "Going later", NOW + 8 * DAY),
      ],
    });
    expect(eventTitles(eventGroups(data, NOW))).toEqual({
      week: ["Going now", "Hosting soon"],
      going: ["Going later"],
      requested: ["Requested soon"],
      saved: ["Saved soon"],
    });
  });

  it("Past holds what started before now and anything cancelled, newest first, folded", () => {
    const data = shortlist({
      events: [
        event("going", "A minute ago", NOW - 60_000),
        event("saved", "Last month", NOW - 30 * DAY),
        event("hosting", "Cancelled, next week", NOW + 5 * DAY, { cancelled: true }),
        event("saved", "Cancelled, next month", NOW + 30 * DAY, { cancelled: true }),
      ],
    });
    const [past] = eventGroups(data, NOW);
    expect(past.key).toBe("past");
    expect(past.folded).toBe(true);
    expect(past.items.map((e) => e.title)).toEqual([
      "Cancelled, next month",
      "Cancelled, next week",
      "A minute ago",
      "Last month",
    ]);
  });

  it("an event that's on now isn't Past until it ends: going sits in This week, saved in Saved", () => {
    const HOUR = 60 * 60 * 1000;
    const data = shortlist({
      events: [
        event("going", "Workshop, on now", NOW - HOUR, { endTime: NOW + HOUR }),
        event("saved", "Market, on now", NOW - 2 * HOUR, { endTime: NOW + 2 * HOUR }),
        event("going", "Ends this moment", NOW - HOUR, { endTime: NOW }),
        event("going", "Ended a minute ago", NOW - HOUR, { endTime: NOW - 60_000 }),
      ],
    });
    expect(eventTitles(eventGroups(data, NOW))).toEqual({
      week: ["Workshop, on now", "Ends this moment"],
      saved: ["Market, on now"],
      past: ["Ended a minute ago"],
    });
    const s = summary(data, NOW);
    expect(s.events.count).toBe(3);
  });

  it("isPast: cancelled, or ended by its end time, else its start", () => {
    expect(isPast(event("going", "A", NOW - 1), NOW)).toBe(true);
    expect(isPast(event("going", "A", NOW), NOW)).toBe(false);
    expect(isPast(event("going", "A", NOW - 1, { endTime: NOW }), NOW)).toBe(false);
    expect(isPast(event("going", "A", NOW - 2, { endTime: NOW - 1 }), NOW)).toBe(true);
    expect(isPast(event("going", "A", NOW + DAY, { cancelled: true }), NOW)).toBe(true);
  });

  it("leaves event requests out: they show on the Hosting row's count", () => {
    const data = shortlist({
      events: [event("hosting", "Zine Workshop", NOW + 20 * DAY, { pendingRequests: 1 })],
      requests: [eventRequest("Ike Obi", "Zine Workshop", NOW + 20 * DAY)],
    });
    expect(eventTitles(eventGroups(data, NOW))).toEqual({ hosting: ["Zine Workshop"] });
  });

  it("returns nothing for an empty shortlist", () => {
    expect(eventGroups(shortlist(), NOW)).toEqual([]);
  });
});

describe("eventGroups — Saved by month", () => {
  const saved = [
    event("saved", "Jan B", on(1, 15, 19, 2027)),
    event("saved", "Oct A", on(10, 24, 19)),
    event("saved", "Nov A", on(11, 8, 20)),
    event("saved", "Oct B", on(10, 31, 10)),
    event("saved", "Dec A", on(12, 6, 17)),
    event("saved", "Nov B", on(11, 14, 9)),
    event("saved", "Jan A", on(1, 6, 18, 2027)),
  ];
  const savedGroup = (count: number) =>
    eventGroups(shortlist({ events: saved.slice(0, count) }), NOW).find((g) => g.key === "saved");

  it(`stays one list at ${MONTHS_AFTER} or fewer`, () => {
    expect(MONTHS_AFTER).toBe(6);
    expect(savedGroup(6)?.months).toBeNull();
    expect(savedGroup(1)?.months).toBeNull();
  });

  it(`splits by month past ${MONTHS_AFTER}, soonest first, the year only outside this one`, () => {
    const months = savedGroup(7)?.months;
    expect(months?.map((m) => [m.key, m.label, m.items.map((e) => e.title)])).toEqual([
      ["2026-10", "October", ["Oct A", "Oct B"]],
      ["2026-11", "November", ["Nov A", "Nov B"]],
      ["2026-12", "December", ["Dec A"]],
      ["2027-01", "January 2027", ["Jan A", "Jan B"]],
    ]);
  });

  it("keeps the whole list beside the buckets", () => {
    const group = savedGroup(7);
    expect(group?.items).toHaveLength(7);
    expect(group?.months?.flatMap((m) => m.items)).toEqual(group?.items);
  });

  it("only Saved splits", () => {
    const going = saved.map((e) => ({ ...e, relation: "going" as const, key: `going:${e.eventId}` }));
    const groups = eventGroups(shortlist({ events: going }), NOW);
    expect(groups.every((g) => g.months === null)).toBe(true);
  });
});

describe("peopleGroups", () => {
  it("reuses groupFollows: by first interest at 6+, most recent first", () => {
    const { grouped, groups } = peopleGroups(sampleShortlist());
    expect(grouped).toBe(true);
    expect(groups.map((g) => g.label)).toEqual([
      "Design",
      "Photography",
      "Filmmaking",
      "Writing",
      "Art",
      "Music",
      "Worship",
      "Audio",
    ]);
    expect(groups.find((g) => g.label === "Writing")?.items.map((p) => p.name)).toEqual([
      "Jo Alvarez",
      "Esther Park",
      "Miriam Cole",
    ]);
  });

  it("stays flat under 6", () => {
    const data = shortlist({
      people: [follow("Mara Lin", ["Audio"], on(9, 10)), follow("Theo Okafor", ["Filmmaking"], on(5, 20))],
    });
    expect(peopleGroups(data)).toEqual({ grouped: false, groups: [{ label: "", items: data.people }] });
  });

  it("hands back the Shortlist's own follow rows", () => {
    const data = sampleShortlist();
    const items = peopleGroups(data).groups.flatMap((g) => g.items);
    expect(items).toHaveLength(data.people.length);
    for (const item of items) expect(data.people).toContain(item);
  });

  it("an empty list is flat", () => {
    expect(peopleGroups(shortlist())).toEqual({ grouped: false, groups: [{ label: "", items: [] }] });
  });
});

describe("summary — the spec's sample member", () => {
  const s = summary(sampleShortlist(), NOW);

  it("Projects: 15 live, 8 paid · 7 passion", () => {
    expect(s.projects.count).toBe(15);
    expect(s.projects.kinds).toEqual({ paid: 8, passion: 7 });
    expect(s.projects.needsYou).toBe(3);
  });

  it("Events: 10 live", () => {
    expect(s.events.count).toBe(10);
    expect(s.events.needsYou).toBe(2);
  });

  it("People: 14 follows", () => {
    expect(s.people).toMatchObject({ count: 14, needsYou: 0 });
  });

  it("has no breakdown: the tiles say what's in each area, not how it divides", () => {
    for (const area of [s.projects, s.events, s.people]) expect(area).not.toHaveProperty("parts");
  });

  it("totals the three areas", () => {
    expect(s.total).toBe(39);
  });
});

describe("areaCount", () => {
  const s = summary(sampleShortlist(), NOW);

  it("is the area's live count", () => {
    expect(areaCount(s, "projects", null)).toBe(s.projects.count);
    expect(areaCount(s, "events", null)).toBe(s.events.count);
    expect(areaCount(s, "people", null)).toBe(s.people.count);
  });

  it("narrows Projects to the kind that is on", () => {
    expect(areaCount(s, "projects", "paid")).toBe(s.projects.kinds.paid);
    expect(areaCount(s, "projects", "passion")).toBe(s.projects.kinds.passion);
    expect(areaCount(s, "projects", "paid") + areaCount(s, "projects", "passion")).toBe(areaCount(s, "projects", null));
  });

  it("ignores a kind anywhere but Projects", () => {
    expect(areaCount(s, "events", "paid")).toBe(s.events.count);
    expect(areaCount(s, "people", "passion")).toBe(s.people.count);
  });
});

describe("summary — counts", () => {
  it("counts each live row once, wherever it sits", () => {
    const data = sampleShortlist();
    const s = summary(data, NOW);
    // The tile count and the groups agree, though the invite, Copy Editor and
    // this week's events sit in Needs you / This week.
    const liveProjectRows = projectGroups(data, NOW)
      .filter((g) => !g.folded)
      .flatMap((g) => g.items)
      .filter((i) => i.type === "project");
    expect(liveProjectRows).toHaveLength(s.projects.count);
    const liveEvents = eventGroups(data, NOW)
      .filter((g) => !g.folded)
      .flatMap((g) => g.items);
    expect(liveEvents).toHaveLength(s.events.count);
    expect(s.projects.kinds.paid + s.projects.kinds.passion).toBe(s.projects.count);
    expect(s.total).toBe(s.projects.count + s.events.count + s.people.count);
  });

  it("never counts requests, though they need you", () => {
    const base = sampleShortlist();
    const more = {
      ...base,
      requests: [
        ...base.requests,
        projectRequest("Ike Obi", "Hymns for the Commons", { at: on(10, 1) }),
        eventRequest("Lu Chen", "Zine Workshop", on(10, 15, 18)),
      ],
    };
    const before = summary(base, NOW);
    const after = summary(more, NOW);
    expect(after.total).toBe(before.total);
    expect(after.projects.count).toBe(before.projects.count);
    expect(after.events.count).toBe(before.events.count);
    expect(after.projects.needsYou).toBe(before.projects.needsYou + 1);
    expect(after.events.needsYou).toBe(before.events.needsYou + 1);
  });

  it("never counts closed or past", () => {
    const data = shortlist({
      projects: [project("closed", "Done"), project("team", "Live")],
      events: [
        event("going", "Yesterday", NOW - DAY),
        event("going", "Cancelled", NOW + DAY, { cancelled: true }),
        event("going", "Tomorrow", NOW + DAY),
      ],
    });
    const s = summary(data, NOW);
    expect(s.projects.count).toBe(1);
    expect(s.projects.preview.items.map((l) => l.name)).toEqual(["Live"]);
    expect(s.events.count).toBe(1);
    expect(s.events.preview.items.map((l) => l.name)).toEqual(["Tomorrow"]);
    expect(s.total).toBe(2);
  });

  it("is all zeros, and says nothing, for an empty shortlist", () => {
    const empty = { count: 0, needsYou: 0 };
    const none = { items: [], more: 0 };
    expect(summary(shortlist(), NOW)).toEqual({
      total: 0,
      projects: { ...empty, kinds: { paid: 0, passion: 0 }, preview: none },
      events: { ...empty, preview: none },
      people: { ...empty, preview: { items: [], line: "" } },
    });
  });
});

describe("summary — tile previews", () => {
  const s = summary(sampleShortlist(), NOW);
  const lines = (preview: { items: { name: string; note: string }[] }) => preview.items.map((l) => `${l.name} · ${l.note}`);

  it("Projects: three by name with their relation, then how many more", () => {
    expect(lines(s.projects.preview)).toEqual([
      "Hollow Creek Field Recordings · Invited",
      "Psalms Zine, Vol. 3 · Saved",
      "Photographer for the Advent Catalog · Leading",
    ]);
    // 15 live, three named.
    expect(s.projects.preview.more).toBe(12);
  });

  it("Projects: Needs you's rows come first, then Leading, On the team, Waiting, Backing, Saved", () => {
    const data = shortlist({
      projects: [
        project("saved", "Saved one", { since: on(9, 1) }),
        project("backing", "Backed one"),
        project("waiting", "Waited on"),
        project("team", "Teamed"),
        project("leading", "Led"),
        project("invited", "Invited to", { role: role("Editor") }),
        project("saved", "Closing role", { role: role("Copy Editor", day(10, 7)) }),
      ],
      requests: [projectRequest("Hana Cho", "Led", { at: on(9, 30) })],
    });
    const all = summary(data, NOW).projects.preview;
    expect(lines(all)).toEqual(["Invited to · Invited", "Closing role · Saved", "Led · Leading"]);
    expect(all.more).toBe(4);
    // Past Needs you, the rest follow the groups' order.
    const rest = summary({ ...data, projects: data.projects.filter((r) => r.relation !== "invited" && r.title !== "Closing role") }, NOW);
    expect(rest.projects.preview.items.map((l) => l.name)).toEqual(["Led", "Teamed", "Waited on"]);
    expect(rest.projects.preview.more).toBe(2);
  });

  it("Projects: names the project, not the role, and never lists a request as a row", () => {
    const data = shortlist({
      projects: [project("team", "Neighborhood Portraits", { role: role("Photographer") })],
      requests: [projectRequest("Hana Cho", "Hymns for the Commons")],
    });
    expect(lines(summary(data, NOW).projects.preview)).toEqual(["Neighborhood Portraits · On the team"]);
  });

  it("Events: three soonest first, with what you are to them and the day and time, then how many more", () => {
    expect(lines(s.events.preview)).toEqual([
      "Open Studio Night · Going · Tomorrow 7PM",
      "Printmaking Workshop · Going · Thu 6PM",
      "Zine Workshop · Hosting · Oct 15 6PM",
    ]);
    // 10 live, three named.
    expect(s.events.preview.more).toBe(7);
  });

  it("Events: Today for one tonight, a date for one a week or more out; past and cancelled never show", () => {
    const data = shortlist({
      events: [
        event("saved", "Later", on(11, 8, 20)),
        event("requested", "Salon", on(10, 22, 19)),
        event("hosting", "Tonight", on(10, 2, 19)),
        event("going", "Over", on(9, 19, 18)),
        event("going", "Called off", on(10, 3, 19), { cancelled: true }),
      ],
    });
    const preview = summary(data, NOW).events.preview;
    expect(lines(preview)).toEqual(["Tonight · Hosting · Today 7PM", "Salon · Requested · Oct 22 7PM", "Later · Saved · Nov 8 8PM"]);
    expect(preview.more).toBe(0);
  });

  it("names every item and says nothing more when there are three or fewer", () => {
    const data = shortlist({ projects: [project("leading", "A"), project("team", "B")] });
    expect(summary(data, NOW).projects.preview).toEqual({
      items: [
        { key: "leading:a", name: "A", note: "Leading" },
        { key: "team:b", name: "B", note: "On the team" },
      ],
      more: 0,
    });
  });

  it("People: the five followed most recently, with their photos, and three first names", () => {
    const { items, line } = s.people.preview;
    expect(items.map((p) => p.name)).toEqual(["Kofi Mensah", "Grace Mun", "Mara Lin", "Jo Alvarez", "Esther Park"]);
    expect(line).toBe("Kofi, Grace, Mara and 11 more");
  });

  it("People: carries each photo, or null where there's none, for the tile to fall back to initials", () => {
    const data = shortlist({ people: [{ ...follow("Kofi Mensah", [], on(9, 30)), imageUrl: "https://img/kofi.jpg" }, follow("Grace Mun", [], on(9, 28))] });
    expect(summary(data, NOW).people.preview.items).toEqual([
      { profileId: "kofi-mensah", name: "Kofi Mensah", imageUrl: "https://img/kofi.jpg" },
      { profileId: "grace-mun", name: "Grace Mun", imageUrl: null },
    ]);
  });

  it("People: reads the names as a sentence, down to one", () => {
    const line = (n: number) =>
      summary(shortlist({ people: ["Kofi Mensah", "Grace Mun", "Mara Lin", "Jo Alvarez", "Esther Park"].slice(0, n).map((name, i) => follow(name, [], on(9, 30 - i))) }), NOW).people
        .preview.line;
    expect([1, 2, 3, 4, 5].map(line)).toEqual([
      "Kofi",
      "Kofi and Grace",
      "Kofi, Grace and Mara",
      "Kofi, Grace, Mara and 1 more",
      "Kofi, Grace, Mara and 2 more",
    ]);
  });

  it("People: a name that isn't set yet is said whole", () => {
    expect(summary(shortlist({ people: [follow("New User", [], on(9, 30))] }), NOW).people.preview.line).toBe("New User");
  });
});

describe("payText", () => {
  it("says pay the way budgetLabel does, without the kind word", () => {
    expect(payText({ pay: amount(1200) })).toBe("$1,200");
    expect(payText({ pay: range(300, 600) })).toBe("$300–600");
    expect(payText({ pay: PROPOSALS })).toBe("Open to proposals");
    expect(payText({ pay: { budgetType: "confidential" } })).toBe("Confidential");
    expect(payText({ pay: VOLUNTEER })).toBe("Volunteer");
  });

  it("is null with no pay", () => {
    expect(payText({ pay: null })).toBeNull();
  });

  it("reads a role row and a request alike", () => {
    const [copyEditor] = sampleShortlist().projects.filter((r) => r.role?.title === "Copy Editor");
    expect(payText(copyEditor)).toBe("$300");
    const request = projectRequest("Hana Cho", "Hymns", { pay: VOLUNTEER });
    expect(request.on.type === "project" && payText(request.on)).toBe("Volunteer");
  });
});
