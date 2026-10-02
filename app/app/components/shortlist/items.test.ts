import { describe, expect, it } from "vitest";
import { NOW, event, follow, on, project, projectRequest, role, sampleShortlist, shortlist } from "../../lib/shortlist/fixtures";
import { needsYou } from "../../lib/shortlist/needsYou";
import { summary } from "../../lib/shortlist/model";
import { LIST_ALL_UNDER, areaGroups, cardIdOf, everything, findItem, openInScope, stepIds, type ShortlistItem } from "./items";

const data = sampleShortlist();

function titleOf(item: ShortlistItem): string {
  switch (item.type) {
    case "project":
      return item.row.role?.title ?? item.row.title;
    case "request":
      return `${item.request.person.name}'s request`;
    case "event":
      return item.event.title;
    case "person":
      return item.person.name;
  }
}

describe("cardIdOf", () => {
  it("names a role row by its role, any other project row by its project", () => {
    const roleRow = project("invited", "Hollow Creek", { role: role("Sound Mixer") });
    expect(cardIdOf({ type: "project", row: roleRow })).toBe("role:sound-mixer");
    expect(cardIdOf({ type: "project", row: project("leading", "Hymns") })).toBe("project:hymns");
    // A free-text role (no posting) has no id of its own: the project's row.
    const freeText = project("team", "Choir", { role: { id: null, title: "Alto", neededBy: null } });
    expect(cardIdOf({ type: "project", row: freeText })).toBe("project:choir");
  });

  it("names requests, events and people by their own ids", () => {
    expect(cardIdOf({ type: "request", request: projectRequest("Hana Cho", "Hymns") })).toBe("request:hana-cho-hymns");
    expect(cardIdOf({ type: "event", event: event("going", "Open Studio", NOW) })).toBe("event:open-studio");
    expect(cardIdOf({ type: "person", person: follow("Kofi Mensah", [], NOW) })).toBe("person:kofi-mensah");
  });

  it("gives every row on the Shortlist its own id", () => {
    const ids = [
      ...data.projects.map((row) => cardIdOf({ type: "project", row })),
      ...data.requests.map((request) => cardIdOf({ type: "request", request })),
      ...data.events.map((e) => cardIdOf({ type: "event", event: e })),
      ...data.people.map((person) => cardIdOf({ type: "person", person })),
    ];
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("findItem", () => {
  it("finds every row by the id it opens as", () => {
    // (A Needs you item also says which rule put it there.)
    for (const item of everything(data, NOW)) expect(item).toMatchObject(findItem(data, cardIdOf(item))!);
    const request = data.requests[0];
    expect(findItem(data, `request:${request.requestId}`)).toEqual({ type: "request", request });
  });

  it("keeps a role's id when the relation changes: an accepted invite is the same card", () => {
    const invited = project("invited", "Hollow Creek", { role: role("Sound Mixer") });
    const joined = { ...invited, relation: "team" as const, key: "team:hollow-creek:sound-mixer" };
    expect(findItem(shortlist({ projects: [joined] }), cardIdOf({ type: "project", row: invited }))).toEqual({ type: "project", row: joined });
  });

  it("doesn't take a role's project for the project's own row", () => {
    const only = shortlist({ projects: [project("saved", "Psalms Zine", { role: role("Copy Editor") })] });
    expect(findItem(only, "project:psalms-zine")).toBeNull();
  });

  it("finds nothing for an id that isn't on the Shortlist, or isn't an id", () => {
    expect(findItem(data, "request:gone")).toBeNull();
    expect(findItem(data, "event:")).toBeNull();
    expect(findItem(data, "fund")).toBeNull();
    expect(findItem(data, "update:u1")).toBeNull();
    expect(findItem(data, "")).toBeNull();
  });
});

describe("areaGroups", () => {
  it("lists Projects in the model's groups, Needs you hot and Closed folded", () => {
    const groups = areaGroups(data, NOW, "projects");
    expect(groups.map((g) => g.key)).toEqual(["needs", "leading", "team", "waiting", "backing", "saved", "closed"]);
    expect(groups.filter((g) => g.hot).map((g) => g.key)).toEqual(["needs"]);
    expect(groups.filter((g) => g.folded).map((g) => g.key)).toEqual(["closed"]);
    expect(groups[0].items.map(titleOf)).toEqual(["Sound Mixer", "Hana Cho's request", "Copy Editor"]);
  });

  it("narrows Projects to a kind", () => {
    const paid = areaGroups(data, NOW, "projects", "paid");
    expect(paid.flatMap((g) => g.items).every((item) => item.type === "project" && item.row.kind === "paid")).toBe(true);
    expect(paid[0].items.map(titleOf)).toEqual(["Sound Mixer"]);
  });

  it("lists Events with This week hot and Past folded", () => {
    const groups = areaGroups(data, NOW, "events");
    expect(groups.map((g) => g.key)).toEqual(["week", "hosting", "going", "requested", "saved", "past"]);
    expect(groups[0]).toMatchObject({ hot: true, folded: false });
    expect(groups[0].items.map(titleOf)).toEqual(["Open Studio Night", "Printmaking Workshop"]);
    expect(groups.at(-1)).toMatchObject({ key: "past", folded: true });
  });

  it("splits saved events into months past six", () => {
    const saved = Array.from({ length: 7 }, (_, i) => event("saved", `Saved ${i}`, on(10 + Math.floor(i / 4), 10 + i)));
    const [group] = areaGroups(shortlist({ events: saved }), NOW, "events");
    expect(group.key).toBe("saved");
    expect(group.months?.map((m) => [m.label, m.items.length])).toEqual([
      ["October", 4],
      ["November", 3],
    ]);
    expect(group.months?.[0].items[0]).toEqual({ type: "event", event: saved[0] });
  });

  it("groups People by first interest at six or more, and lists fewer flat", () => {
    const groups = areaGroups(data, NOW, "people");
    expect(groups.every((g) => g.label !== "" && !g.hot && !g.folded)).toBe(true);
    expect(groups.flatMap((g) => g.items)).toHaveLength(14);
    const few = areaGroups(shortlist({ people: [follow("Mara Lin", ["Audio"], NOW)] }), NOW, "people");
    expect(few).toEqual([{ key: "all", label: "", hot: false, folded: false, items: [{ type: "person", person: expect.objectContaining({ name: "Mara Lin" }) }], months: null }]);
  });

  it("leaves out an empty area's groups", () => {
    for (const area of ["projects", "events", "people"] as const) expect(areaGroups(shortlist(), NOW, area)).toEqual([]);
  });
});

describe("everything", () => {
  it("is every live item, as many as the header counts, and no requests", () => {
    const listed = everything(data, NOW);
    expect(listed).toHaveLength(summary(data, NOW).total);
    expect(listed.some((item) => item.type === "request")).toBe(false);
  });

  it("leaves out what's closed or past", () => {
    const titles = everything(data, NOW).map(titleOf);
    for (const gone of ["Wedding Videographer", "Easter Sunrise Installation", "Late Summer Potluck", "Plein Air Morning"]) {
      expect(titles).not.toContain(gone);
    }
  });

  it("runs Projects, then Events, then People", () => {
    const types = everything(data, NOW).map((item) => item.type);
    expect(types.indexOf("event")).toBeGreaterThan(types.lastIndexOf("project"));
    expect(types.indexOf("person")).toBeGreaterThan(types.lastIndexOf("event"));
  });

  it("is short enough to list under the tiles at eight or fewer", () => {
    expect(LIST_ALL_UNDER).toBe(8);
  });
});

describe("stepIds", () => {
  const needs = needsYou(data, NOW).map(cardIdOf);
  const sparse = shortlist({
    projects: [project("saved", "Quiet Hours")],
    people: [follow("Mara Lin", ["Audio"], NOW), follow("Theo Okafor", ["Film"], NOW - 1)],
  });

  it("steps through Needs you on Today, and nothing else", () => {
    expect(stepIds(data, NOW, { view: "today" }, needs[1])).toEqual(needs);
    expect(stepIds(data, NOW, { view: "today" }, "person:kofi-mensah")).toEqual([]);
  });

  it("steps through Needs you from a Needs you row on the overview", () => {
    expect(stepIds(data, NOW, { view: "shortlist", area: null, kind: null }, "request:hana-cho-hymns-for-the-commons")).toEqual(needs);
  });

  it("steps through the overview's short list when it has one", () => {
    const ids = stepIds(sparse, NOW, { view: "shortlist", area: null, kind: null }, "person:mara-lin");
    expect(ids).toEqual(["project:quiet-hours", "person:mara-lin", "person:theo-okafor"]);
  });

  it("falls back to the item's group when the overview lists too much to show it", () => {
    expect(stepIds(data, NOW, { view: "shortlist", area: null, kind: null }, "role:photographer")).toEqual(["role:photographer", "role:painter"]);
  });

  it("steps through the group the item sits in, inside an area", () => {
    const scope = { view: "shortlist", area: "events", kind: null } as const;
    expect(stepIds(data, NOW, scope, "event:makers-market")).toEqual([
      "event:film-night-babette-s-feast",
      "event:makers-market",
      "event:songwriters-in-the-round",
      "event:icon-writing-retreat",
      "event:advent-lessons-carols",
    ]);
  });

  it("keeps to the kind filter", () => {
    const paid = stepIds(data, NOW, { view: "shortlist", area: "projects", kind: "paid" }, "role:brand-designer");
    expect(paid).toEqual(["role:brand-designer", "role:set-builder"]);
    expect(stepIds(data, NOW, { view: "shortlist", area: "projects", kind: "paid" }, "project:quiet-hours-zine")).toEqual([]);
  });
});

describe("openInScope", () => {
  it("opens any Shortlist item on the Shortlist, with its list", () => {
    const opened = openInScope(data, NOW, { view: "shortlist", area: "people", kind: null }, "person:kofi-mensah");
    expect(opened?.item).toEqual({ type: "person", person: expect.objectContaining({ name: "Kofi Mensah" }) });
    expect(opened?.ids).toContain("person:kofi-mensah");
  });

  it("opens only Needs you's items on Today: the rest of Today is the desk's own", () => {
    expect(openInScope(data, NOW, { view: "today" }, "event:open-studio-night")?.ids).toHaveLength(5);
    expect(openInScope(data, NOW, { view: "today" }, "event:harvest-supper")).toBeNull();
    expect(openInScope(data, NOW, { view: "today" }, "fund")).toBeNull();
  });

  it("opens nothing for an item that has left the Shortlist", () => {
    expect(openInScope(data, NOW, { view: "shortlist", area: null, kind: null }, "request:answered")).toBeNull();
  });
});
