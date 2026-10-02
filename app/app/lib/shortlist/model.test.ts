import { describe, expect, it } from "vitest";
import {
  DAY,
  NOW,
  PROPOSALS,
  VOLUNTEER,
  amount,
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
  eventGroups,
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
      needs: ["Sound Mixer"],
      leading: ["Photographer for the Advent Catalog"],
      team: ["Photographer"],
      waiting: ["Poster Illustrator", "Motion Designer"],
      saved: ["Brand Designer", "Set Builder"],
      closed: ["Wedding Videographer", "Album Cover Artist"],
    });
  });

  it("Passion keeps passion projects, requests on them included", () => {
    expect(projectTitles(projectGroups(sampleShortlist(), NOW, "passion"))).toEqual({
      needs: ["Hana Cho's request", "Copy Editor"],
      leading: ["Hymns for the Commons"],
      team: ["Painter"],
      waiting: ["Alto"],
      backing: ["The Long Table podcast", "Street Choir Recordings"],
      saved: ["Quiet Hours Zine", "Icons for the Everyday"],
      closed: ["Easter Sunrise Installation"],
    });
  });

  it("keeps a paid role on a passion project under Passion", () => {
    const copyEditor = (kind: "paid" | "passion") =>
      projectGroups(sampleShortlist(), NOW, kind)
        .flatMap((g) => g.items)
        .some((i) => title(i) === "Copy Editor");
    expect(copyEditor("passion")).toBe(true);
    expect(copyEditor("paid")).toBe(false);
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

  it("Projects: 15 live, 7 paid · 8 passion", () => {
    expect(s.projects.count).toBe(15);
    expect(s.projects.kinds).toEqual({ paid: 7, passion: 8 });
    expect(s.projects.parts).toEqual(["1 invite", "2 leading", "2 on the team", "3 waiting", "2 backing", "5 saved"]);
    expect(s.projects.needsYou).toBe(3);
    expect(s.projects.next).toBe("Reply to Mara · Sound Mixer");
  });

  it("Events: 10 live", () => {
    expect(s.events.count).toBe(10);
    expect(s.events.parts).toEqual(["1 hosting", "3 going", "1 requested", "5 saved"]);
    expect(s.events.needsYou).toBe(2);
    expect(s.events.next).toBe("Next: Open Studio Night, Oct 3");
  });

  it("People: 14 follows", () => {
    expect(s.people).toEqual({
      count: 14,
      needsYou: 0,
      parts: ["Across 8 interests"],
      next: "Latest: Kofi Mensah, Sep 30",
    });
  });

  it("totals the three areas", () => {
    expect(s.total).toBe(39);
  });
});

describe("summary — counts", () => {
  const partsTotal = (parts: string[]) => parts.reduce((n, part) => n + Number.parseInt(part, 10), 0);

  it("counts each live row once, wherever it sits", () => {
    const data = sampleShortlist();
    const s = summary(data, NOW);
    // The breakdown, the tile count and the groups agree, though the invite,
    // Copy Editor and this week's events sit in Needs you / This week.
    expect(partsTotal(s.projects.parts)).toBe(s.projects.count);
    expect(partsTotal(s.events.parts)).toBe(s.events.count);
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
    expect(s.projects.parts).toEqual(["1 on the team"]);
    expect(s.events.count).toBe(1);
    expect(s.events.parts).toEqual(["1 going"]);
    expect(s.total).toBe(2);
  });

  it("pluralizes", () => {
    const data = shortlist({
      projects: [project("invited", "A"), project("invited", "B")],
      people: [follow("Mara Lin", ["Audio"], on(9, 10))],
    });
    const s = summary(data, NOW);
    expect(s.projects.parts).toEqual(["2 invites"]);
    expect(s.people.parts).toEqual(["Across 1 interest"]);
  });

  it("is all zeros for an empty shortlist", () => {
    const empty = { count: 0, needsYou: 0, parts: [], next: null };
    expect(summary(shortlist(), NOW)).toEqual({
      total: 0,
      projects: { ...empty, kinds: { paid: 0, passion: 0 } },
      events: empty,
      people: empty,
    });
  });
});

describe("summary — next steps", () => {
  it("Projects: a paid invite leads even when a passion invite is older", () => {
    const data = shortlist({
      projects: [
        project("invited", "Choir", { lead: { name: "Grace Mun", profileId: "g" }, since: NOW - 9 * DAY }),
        project("invited", "Film", {
          kind: "paid",
          role: role("Editor"),
          lead: { name: "Theo Okafor", profileId: "t" },
          since: NOW - DAY,
        }),
      ],
    });
    expect(summary(data, NOW).projects.next).toBe("Reply to Theo · Editor");
  });

  it("Projects: with no invite, review the oldest request", () => {
    const data = without(sampleShortlist(), "invited");
    data.requests.push(projectRequest("Ike Obi", "Hymns for the Commons", { at: on(10, 1) }));
    expect(summary(data, NOW).projects.next).toBe("Review Hana's request · Hymns for the Commons");
  });

  it("Projects: with no reply owed, apply to the soonest saved role closing", () => {
    const data = { ...without(sampleShortlist(), "invited"), requests: [] };
    expect(summary(data, NOW).projects.next).toBe("Apply by Oct 7 · Copy Editor");
  });

  it("Projects: looks past the week, and skips a role that already closed", () => {
    const data = shortlist({
      projects: [
        project("saved", "Gone", { role: role("Closed yesterday", NOW - DAY) }),
        project("saved", "Later", { role: role("Brand Designer", on(11, 1)) }),
      ],
    });
    expect(summary(data, NOW).projects.next).toBe("Apply by Nov 1 · Brand Designer");
  });

  it("Projects: an event request doesn't make a project step", () => {
    const data = shortlist({ requests: [eventRequest("Ike Obi", "Zine Workshop", NOW + DAY)] });
    expect(summary(data, NOW).projects.next).toBeNull();
  });

  it("Events: the next going or hosting event, skipping past, cancelled and saved", () => {
    const data = shortlist({
      events: [
        event("going", "Yesterday", NOW - DAY),
        event("going", "Cancelled", NOW + DAY, { cancelled: true }),
        event("saved", "Saved", NOW + DAY),
        event("hosting", "Zine Workshop", on(10, 15, 18)),
        event("going", "Harvest Supper", on(10, 17, 17)),
      ],
    });
    expect(summary(data, NOW).events.next).toBe("Hosting: Zine Workshop, Oct 15");
  });

  it("Events: nothing to go to", () => {
    const data = shortlist({ events: [event("saved", "Saved", NOW + DAY)] });
    expect(summary(data, NOW).events.next).toBeNull();
  });

  it("People: the latest follow", () => {
    const data = shortlist({
      people: [follow("Mara Lin", ["Audio"], on(9, 10)), follow("Grace Mun", ["Music"], on(9, 28))],
    });
    expect(summary(data, NOW).people.next).toBe("Latest: Grace Mun, Sep 28");
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
