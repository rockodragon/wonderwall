// Tests for the People directory (profiles.directory, and profiles.search,
// which runs the same rules for the organization page's name picker).
//
// First the pure rules (directoryRules.ts): who comes first, and how many a
// caller gets. Then the queries on an in-memory ctx, because the cap is only
// a cap if the server keeps it: a visitor must get one page however they
// call, and every read must go through a real index unless it is one of the
// whole-table reads the query means to make.

import { describe, expect, it } from "vitest";
import { makeCtx, run, type Row } from "../test-support/convexContext";
import { checkIndexes } from "../test-support/indexChecks";
import {
  DIRECTORY_MAX,
  DIRECTORY_PAGE,
  VISITOR_MIN_QUERY,
  byLatestActivity,
  directoryLimit,
  latestPostAt,
  listedFor,
  searchedText,
} from "./directoryRules";
import { directory, search } from "./profiles";

// ——————————————————————————————————————————————————————————————
// Pure rules
// ——————————————————————————————————————————————————————————————

describe("latestPostAt — each person's newest post", () => {
  it("takes the newer of a project they lead and an event they organize", () => {
    const latest = latestPostAt(
      [
        { userId: "u1", status: "active", createdAt: 10 },
        { userId: "u1", status: "completed", createdAt: 30 },
        { userId: "u2", status: "in_progress", createdAt: 5 },
      ],
      [
        { organizerId: "u2", status: "published", createdAt: 40 },
        { organizerId: "u3", status: "published", createdAt: 7 },
      ],
    );
    expect(Object.fromEntries(latest)).toEqual({ u1: 30, u2: 40, u3: 7 });
  });

  it("counts only what their profile shows: no archived or hidden project, no unpublished event", () => {
    const latest = latestPostAt(
      [
        { userId: "u1", status: "archived", createdAt: 50 },
        { userId: "u1", status: "hidden", createdAt: 60 },
        { userId: "u1", status: "active", createdAt: 20 },
      ],
      [
        { organizerId: "u1", status: "draft", createdAt: 70 },
        { organizerId: "u1", status: "cancelled", createdAt: 80 },
        { organizerId: "u2", status: "hidden", createdAt: 90 },
      ],
    );
    expect(Object.fromEntries(latest)).toEqual({ u1: 20 });
  });
});

describe("byLatestActivity — newest activity first", () => {
  const people = [
    { userId: "quiet-old", createdAt: 1 },
    { userId: "posted-long-ago", createdAt: 2 },
    { userId: "quiet-new", createdAt: 9 },
    { userId: "posted-today", createdAt: 3 },
  ];
  const latest = new Map([
    ["posted-long-ago", 5],
    ["posted-today", 50],
  ]);

  it("puts everyone who posted first, newest post first; then everyone else, newest member first", () => {
    expect(byLatestActivity(people, latest).map((p) => p.userId)).toEqual([
      "posted-today",
      "posted-long-ago",
      "quiet-new",
      "quiet-old",
    ]);
  });

  it("someone who joined today but posted nothing still comes after an old post", () => {
    const ordered = byLatestActivity([{ userId: "new", createdAt: 1000 }, { userId: "old", createdAt: 1 }], new Map([["old", 2]]));
    expect(ordered.map((p) => p.userId)).toEqual(["old", "new"]);
  });

  it("breaks a tie between two posts by the newer member", () => {
    const ordered = byLatestActivity(
      [{ userId: "a", createdAt: 1 }, { userId: "b", createdAt: 2 }],
      new Map([["a", 9], ["b", 9]]),
    );
    expect(ordered.map((p) => p.userId)).toEqual(["b", "a"]);
  });

  it("leaves the list it was given alone", () => {
    const before = people.map((p) => p.userId);
    byLatestActivity(people, latest);
    expect(people.map((p) => p.userId)).toEqual(before);
  });
});

describe("listedFor and directoryLimit — what a visitor may see", () => {
  it("a profile hidden from search is listed for members only", () => {
    expect(listedFor({ name: "Ada", hideFromSearch: true }, true)).toBe(true);
    expect(listedFor({ name: "Ada", hideFromSearch: true }, false)).toBe(false);
    expect(listedFor({ name: "Ada" }, false)).toBe(true);
    expect(listedFor({ name: "Ada", hideFromSearch: false }, false)).toBe(true);
  });

  it("nobody who hasn't named themselves yet is listed, for anyone", () => {
    for (const name of ["New User", "  new user ", "", undefined]) {
      expect(listedFor({ name }, true)).toBe(false);
      expect(listedFor({ name }, false)).toBe(false);
    }
  });

  it("a member gets what they asked for, one page when they didn't say", () => {
    expect(directoryLimit(undefined, true)).toBe(DIRECTORY_PAGE);
    expect(directoryLimit(48, true)).toBe(48);
    expect(directoryLimit(500, true)).toBe(500);
  });

  it("a member never gets more than DIRECTORY_MAX, however much they ask for", () => {
    expect(DIRECTORY_MAX).toBe(1000);
    expect(directoryLimit(1000, true)).toBe(1000);
    expect(directoryLimit(1001, true)).toBe(1000);
    expect(directoryLimit(1e9, true)).toBe(1000);
    expect(directoryLimit(Number.MAX_SAFE_INTEGER, true)).toBe(1000);
    expect(directoryLimit(Number.MAX_VALUE, true)).toBe(1000);
  });

  it("a visitor never gets more than one page", () => {
    expect(DIRECTORY_PAGE).toBe(24);
    expect(directoryLimit(undefined, false)).toBe(24);
    expect(directoryLimit(48, false)).toBe(24);
    expect(directoryLimit(1e9, false)).toBe(24);
    expect(directoryLimit(Infinity, false)).toBe(24);
    expect(directoryLimit(10, false)).toBe(10);
  });

  it("a nonsense limit reads as one page, and never as nothing", () => {
    expect(directoryLimit(NaN, true)).toBe(24);
    expect(directoryLimit(NaN, false)).toBe(24);
    expect(directoryLimit(Infinity, true)).toBe(24);
    expect(directoryLimit(-Infinity, true)).toBe(24);
    expect(directoryLimit(0, true)).toBe(1);
    expect(directoryLimit(-5, false)).toBe(1);
    expect(directoryLimit(30.7, true)).toBe(30);
  });
});

describe("searchedText — a visitor's one-letter search is no search", () => {
  it("a visitor's search runs from two characters, trimmed", () => {
    expect(VISITOR_MIN_QUERY).toBe(2);
    expect(searchedText("a", false)).toBeUndefined();
    expect(searchedText("  a  ", false)).toBeUndefined();
    expect(searchedText(" ", false)).toBeUndefined();
    expect(searchedText("an", false)).toBe("an");
    expect(searchedText(" an ", false)).toBe(" an ");
  });

  it("a member's runs as typed, however short", () => {
    expect(searchedText("a", true)).toBe("a");
    expect(searchedText(" ", true)).toBe(" ");
  });

  it("no search is no search for anyone", () => {
    expect(searchedText(undefined, true)).toBeUndefined();
    expect(searchedText("", false)).toBeUndefined();
  });
});

// ——————————————————————————————————————————————————————————————
// The queries, on an in-memory ctx
// ——————————————————————————————————————————————————————————————

const MEMBER = "users:member";
const PUB = "hostOrgs:pub";
const HID = "hostOrgs:hid";

/** Profile `n` (user users:u<n>), who joined at `n`: higher is newer. */
const profile = (n: number, over: Partial<Row> = {}): Row => ({
  _id: `profiles:p${n}`,
  _creationTime: n,
  userId: `users:u${n}`,
  name: `Person ${n}`,
  interests: ["Music"],
  adminCode: `SECRET${n}`,
  createdAt: n,
  updatedAt: n,
  ...over,
});
const project = (id: string, userId: string, createdAt: number, over: Partial<Row> = {}): Row => ({
  _id: `projects:${id}`,
  userId,
  kind: "passion",
  title: id,
  status: "active",
  createdAt,
  updatedAt: createdAt,
  ...over,
});
const event = (id: string, organizerId: string, createdAt: number, over: Partial<Row> = {}): Row => ({
  _id: `events:${id}`,
  organizerId,
  title: id,
  status: "published",
  datetime: createdAt + 1000,
  createdAt,
  updatedAt: createdAt,
  ...over,
});

/** `count` people, u1 oldest. The member reading is one more, oldest of all. */
function world(count: number, extra: Record<string, Row[]> = {}): Record<string, Row[]> {
  const people = Array.from({ length: count }, (_, i) => profile(i + 1));
  return {
    profiles: [profile(0, { _id: "profiles:me", userId: MEMBER, name: "The Member" }), ...people, ...(extra.profiles ?? [])],
    projects: extra.projects ?? [],
    events: extra.events ?? [],
    wonderings: extra.wonderings ?? [],
    hostOrgs: extra.hostOrgs ?? [],
    communityMembers: extra.communityMembers ?? [],
  };
}

/** Runs `fn` as `viewer` (null: signed out), every read checked. */
async function call(fn: unknown, tables: Record<string, Row[]>, viewer: string | null, args: Record<string, unknown> = {}) {
  const ctx = makeCtx(tables, viewer);
  const { scans } = checkIndexes(ctx);
  const out = await run(fn, ctx, args);
  return { out, scans };
}
const names = (people: { name: string }[]) => people.map((p) => p.name);

describe("profiles.directory — order", () => {
  it("lists people by latest activity, not by who joined first (the oldest-30 bug)", async () => {
    const { out } = await call(directory, world(40), MEMBER);
    // Nobody has posted: newest member first, so Person 40 leads and the
    // first page is the 24 newest, not the 24 (or 30) oldest.
    expect(out.people).toHaveLength(24);
    expect(out.people[0].name).toBe("Person 40");
    expect(out.people[23].name).toBe("Person 17");
    expect(out.total).toBe(41);
  });

  it("puts people who posted first, newest post first, whichever kind it was", async () => {
    const tables = world(5, {
      projects: [project("old-work", "users:u1", 100), project("taken-down", "users:u2", 900, { status: "archived" })],
      events: [event("show", "users:u3", 500), event("draft", "users:u4", 999, { status: "draft" })],
    });
    const { out } = await call(directory, tables, MEMBER);
    expect(names(out.people)).toEqual(["Person 3", "Person 1", "Person 5", "Person 4", "Person 2", "The Member"]);
  });

  it("a project in a hidden (test) community doesn't move anyone up for someone who can't see it", async () => {
    const tables = world(3, {
      hostOrgs: [{ _id: HID, name: "_TeamTest", slug: "teamtest", kind: "community", status: "active" }],
      projects: [project("secret", "users:u1", 100, { hostOrgId: HID })],
    });
    const { out } = await call(directory, tables, MEMBER);
    expect(names(out.people).slice(0, 3)).toEqual(["Person 3", "Person 2", "Person 1"]);
    // One of its members sees it, so for them it counts.
    tables.communityMembers = [{ _id: "communityMembers:m", hostOrgId: HID, userId: MEMBER, role: "member", status: "active" }];
    const insider = (await call(directory, tables, MEMBER)).out;
    expect(names(insider.people).slice(0, 3)).toEqual(["Person 1", "Person 3", "Person 2"]);
  });

  it("an event in a hidden (test) community doesn't move its organizer up for someone who can't see it", async () => {
    const tables = world(3, {
      hostOrgs: [{ _id: HID, name: "_TeamTest", slug: "teamtest", kind: "community", status: "active" }],
      events: [event("secret-show", "users:u1", 100, { hostOrgId: HID })],
    });
    for (const outsider of [MEMBER, null]) {
      const { out } = await call(directory, tables, outsider);
      expect(names(out.people).slice(0, 3)).toEqual(["Person 3", "Person 2", "Person 1"]);
    }
    tables.communityMembers = [{ _id: "communityMembers:m", hostOrgId: HID, userId: MEMBER, role: "member", status: "active" }];
    const insider = (await call(directory, tables, MEMBER)).out;
    expect(names(insider.people).slice(0, 3)).toEqual(["Person 1", "Person 3", "Person 2"]);
  });
});

describe("profiles.directory — members load more", () => {
  const tables = world(60);

  it("a page at a time, each continuing the last, with the same total", async () => {
    const one = (await call(directory, tables, MEMBER, { limit: 24 })).out;
    const two = (await call(directory, tables, MEMBER, { limit: 48 })).out;
    const three = (await call(directory, tables, MEMBER, { limit: 72 })).out;
    expect(one.people).toHaveLength(24);
    expect(two.people).toHaveLength(48);
    expect(three.people).toHaveLength(61);
    expect(names(two.people).slice(0, 24)).toEqual(names(one.people));
    expect(names(three.people).slice(0, 48)).toEqual(names(two.people));
    expect([one.total, two.total, three.total]).toEqual([61, 61, 61]);
    expect([one.visitor, two.visitor, three.visitor]).toEqual([false, false, false]);
  });

  it("one page when the page doesn't say", async () => {
    expect((await call(directory, tables, MEMBER)).out.people).toHaveLength(24);
  });

  it("never more than DIRECTORY_MAX in one call, however far they page", async () => {
    const crowd = world(1100);
    for (const limit of [1e9, Number.MAX_VALUE, 5000]) {
      const { out } = await call(directory, crowd, MEMBER, { limit });
      expect(out.people).toHaveLength(1000);
      expect(out.total).toBe(1101);
    }
    expect((await call(directory, crowd, MEMBER, { limit: NaN })).out.people).toHaveLength(24);
  });
});

describe("profiles.directory — visitors see one page", () => {
  const tables = world(60);

  it("24 at most, however far they page, with the total for the join line", async () => {
    for (const limit of [undefined, 24, 48, 1000]) {
      const { out } = await call(directory, tables, null, limit === undefined ? {} : { limit });
      expect(out.people).toHaveLength(24);
      expect(out.total).toBe(61);
      expect(out.visitor).toBe(true);
    }
  });

  it("24 at most under Discipline, Near me or a community too, each with its own total", async () => {
    // 60 people who play music, live in Nashville and belong to Public
    // Circle; the member reading plays music too, but lives nowhere and
    // belongs to nothing.
    const crowd = world(60);
    crowd.profiles = crowd.profiles.map((p) =>
      p.userId === MEMBER ? p : { ...p, coordinates: { lat: 36.16, lng: -86.78 } },
    );
    crowd.hostOrgs = [{ _id: PUB, name: "Public Circle", slug: "public-circle", kind: "community", status: "active" }];
    crowd.communityMembers = crowd.profiles
      .filter((p) => p.userId !== MEMBER)
      .map((p, i) => ({ _id: `communityMembers:${i}`, hostOrgId: PUB, userId: p.userId, role: "member", status: "active" }));
    const cases: [string, Record<string, unknown>, number][] = [
      ["Discipline", { interests: ["Music"] }, 61],
      ["Near me", { near: { lat: 36.17, lng: -86.79, radius: 25 } }, 60],
      ["a community", { communitySlug: "public-circle" }, 60],
    ];
    for (const [label, args, total] of cases) {
      for (const limit of [undefined, 48, 1000]) {
        const { out } = await call(directory, crowd, null, limit === undefined ? args : { ...args, limit });
        expect(out.people, `${label}, limit ${limit}`).toHaveLength(24);
        expect(out.total, `${label}, limit ${limit}`).toBe(total);
        expect(out.visitor).toBe(true);
      }
    }
  });

  it("a one-letter search is no search for a visitor; a member's still runs", async () => {
    // Nobody's name, bio or anything else has an "x" in it.
    for (const query of ["x", " x ", "X"]) {
      const visitor = (await call(directory, tables, null, { query })).out;
      expect(visitor.people, query).toHaveLength(24);
      expect(visitor.total, query).toBe(61);
      expect((await call(directory, tables, MEMBER, { query })).out.total, query).toBe(0);
    }
    // Two letters is a search, for anyone.
    expect((await call(directory, tables, null, { query: "xq" })).out.total).toBe(0);
    // The name picker follows the same rule.
    expect(await call(search, tables, null, { query: "x" }).then((r) => r.out)).toHaveLength(24);
  });

  it("the same first page a member gets", async () => {
    const visitor = (await call(directory, tables, null, { limit: 1000 })).out;
    const member = (await call(directory, tables, MEMBER)).out;
    expect(names(visitor.people)).toEqual(names(member.people));
  });

  it("24 at most with a search too, counting everyone it matched", async () => {
    // "person" matches all 60 people, not The Member.
    const { out } = await call(directory, tables, null, { query: "person", limit: 100 });
    expect(out.people).toHaveLength(24);
    expect(out.total).toBe(60);
    // "Person 1" matches Person 1 and 10–19.
    const narrow = (await call(directory, tables, null, { query: "person 1", limit: 100 })).out;
    expect(narrow.total).toBe(11);
    expect(narrow.people).toHaveLength(11);
  });

  it("leaves out a profile hidden from search, for visitors only", async () => {
    const hiding = world(3, { profiles: [profile(9, { name: "Hidden Hana", hideFromSearch: true })] });
    const visitor = (await call(directory, hiding, null)).out;
    const member = (await call(directory, hiding, MEMBER)).out;
    expect(names(visitor.people)).not.toContain("Hidden Hana");
    expect(visitor.total).toBe(4);
    expect(names(member.people)[0]).toBe("Hidden Hana");
    expect(member.total).toBe(5);
  });

  it("search leaves them out for visitors too", async () => {
    const hiding = world(3, { profiles: [profile(9, { name: "Hidden Hana", hideFromSearch: true })] });
    expect(names((await call(search, hiding, null, { query: "hana" })).out)).toEqual([]);
    expect(names((await call(search, hiding, MEMBER, { query: "hana" })).out)).toEqual(["Hidden Hana"]);
  });
});

describe("profiles.directory — unnamed accounts", () => {
  // A sign-in creates a profile named with the placeholder; someone who
  // closes the tab before onboarding's name field stays that way.
  const withUnnamed = () =>
    world(3, {
      profiles: [profile(8, { name: "New User" }), profile(9, { name: "  new user " }), profile(10, { name: "" })],
    });

  it("leaves them out for members and visitors, and out of the total", async () => {
    const member = (await call(directory, withUnnamed(), MEMBER)).out;
    const visitor = (await call(directory, withUnnamed(), null)).out;
    expect(names(member.people)).toEqual(["Person 3", "Person 2", "Person 1", "The Member"]);
    expect(member.total).toBe(4);
    expect(names(visitor.people)).toEqual(names(member.people));
    expect(visitor.total).toBe(4);
  });

  it("search doesn't find them either", async () => {
    expect((await call(search, withUnnamed(), MEMBER, { query: "new" })).out).toEqual([]);
    expect((await call(directory, withUnnamed(), MEMBER, { query: "user" })).out.total).toBe(0);
  });
});

describe("profiles.directory — filters", () => {
  it("searches name, bio, place, organization and what they're wondering", async () => {
    const tables = world(4, {
      profiles: [
        profile(11, { name: "Ana", bio: "Paints harbors" }),
        profile(12, { name: "Bo", orgName: "Harbor Collective" }),
        profile(13, { name: "Cy", location: "Harbor City" }),
        profile(14, { name: "Di" }),
      ],
      wonderings: [{ _id: "wonderings:w", profileId: "profiles:p14", prompt: "Who films harbors?", isActive: true, isPermanent: false, createdAt: 1 }],
    });
    const { out } = await call(directory, tables, MEMBER, { query: "harbor" });
    expect(names(out.people).sort()).toEqual(["Ana", "Bo", "Cy", "Di"]);
    expect(out.total).toBe(4);
  });

  it("keeps people with any of the chosen interests, and counts only them", async () => {
    const tables = world(30, {
      profiles: [profile(101, { name: "Fay", interests: ["Film"] }), profile(102, { name: "Gil", interests: ["Poetry", "Film"] })],
    });
    const { out } = await call(directory, tables, null, { interests: ["Film", "Dance"] });
    expect(names(out.people)).toEqual(["Gil", "Fay"]);
    expect(out.total).toBe(2);
  });

  it("Near me: within the radius, nearest first (not newest), measured on the rounded coordinates", async () => {
    const tables = world(2, {
      profiles: [
        profile(201, { name: "Nearer", coordinates: { lat: 36.1712, lng: -86.7888 } }),
        profile(202, { name: "Near", coordinates: { lat: 36.1, lng: -86.7 } }),
        profile(203, { name: "Far", coordinates: { lat: 40.7, lng: -74 } }),
      ],
    });
    const { out } = await call(directory, tables, MEMBER, { near: { lat: 36.17, lng: -86.79, radius: 25 } });
    expect(names(out.people)).toEqual(["Nearer", "Near"]);
    // Nearer's exact spot rounds onto the one asked about: distance 0.
    expect(out.people[0]._distance).toBe(0);
    expect(out.people[0].coordinates).toEqual({ lat: 36.17, lng: -86.79 });
    expect(out.people[1]._distance).toBeGreaterThan(5);
    expect(out.people[1]._distance).toBeLessThan(25);
    expect(out.total).toBe(2);
  });

  it("a community scopes it to that community's active members", async () => {
    const tables = world(3, {
      hostOrgs: [{ _id: PUB, name: "Public Circle", slug: "public-circle", kind: "community", status: "active" }],
      communityMembers: [
        { _id: "communityMembers:a", hostOrgId: PUB, userId: "users:u1", role: "member", status: "active" },
        { _id: "communityMembers:b", hostOrgId: PUB, userId: "users:u2", role: "member", status: "pending" },
        { _id: "communityMembers:c", hostOrgId: PUB, userId: "users:u3", role: "member", status: "active" },
      ],
    });
    for (const viewer of [MEMBER, null]) {
      const { out } = await call(directory, tables, viewer, { communitySlug: "public-circle" });
      expect(names(out.people)).toEqual(["Person 3", "Person 1"]);
      expect(out.total).toBe(2);
    }
  });

  it("an unknown or hidden community matches nobody", async () => {
    const tables = world(3, {
      hostOrgs: [{ _id: HID, name: "_TeamTest", slug: "teamtest", kind: "community", status: "active" }],
      communityMembers: [{ _id: "communityMembers:a", hostOrgId: HID, userId: "users:u1", role: "member", status: "active" }],
    });
    expect((await call(directory, tables, MEMBER, { communitySlug: "nope" })).out).toEqual({ people: [], total: 0, visitor: false });
    expect((await call(directory, tables, null, { communitySlug: "teamtest" })).out).toEqual({ people: [], total: 0, visitor: true });
  });
});

describe("profiles.directory — what it returns and reads", () => {
  it("returns the public projection, picture resolved", async () => {
    const tables = world(1, { profiles: [profile(5, { imageUrl: "https://x/face.jpg", payoutHandles: { venmo: "me" } })] });
    const { out } = await call(directory, tables, null);
    const row = out.people.find((p: { name: string }) => p.name === "Person 5");
    expect(row.imageUrl).toBe("https://x/face.jpg");
    expect(row).not.toHaveProperty("adminCode");
    expect(row).not.toHaveProperty("payoutHandles");
  });

  it("reads published events through their index, and only profiles and projects whole", async () => {
    const tables = world(3, { events: [event("e", "users:u1", 5)] });
    expect((await call(directory, tables, MEMBER)).scans.sort()).toEqual(["profiles", "projects"]);
    // A search reads what people are wondering too.
    expect((await call(directory, tables, MEMBER, { query: "x" })).scans.sort()).toEqual(["profiles", "projects", "wonderings"]);
  });
});

// The badge on a person's card: every row says `isLeader`, a yes or no, to a
// visitor as to a member. The admin flag itself never leaves the server.
describe("profiles.directory — who leads a community", () => {
  const LEAD = (n: number, hostOrgId: string, userId: string, role: string, status: string): Row => ({
    _id: `communityMembers:lead${n}`,
    hostOrgId,
    userId,
    role,
    status,
  });
  const led = () =>
    world(6, {
      profiles: [profile(50, { name: "Ada Admin", isAdmin: true })],
      hostOrgs: [{ _id: PUB, name: "Public Circle", slug: "public-circle", kind: "community", status: "active" }],
      communityMembers: [
        LEAD(1, PUB, "users:u1", "host", "active"),
        LEAD(2, PUB, "users:u2", "host", "removed"),
        LEAD(3, PUB, "users:u3", "moderator", "active"),
        LEAD(4, PUB, "users:u4", "host", "pending"),
        LEAD(5, PUB, "users:u5", "member", "active"),
      ],
    });
  const leaders = (people: { name: string; isLeader: boolean }[]) =>
    people.filter((p) => p.isLeader).map((p) => p.name).sort();

  for (const viewer of [MEMBER, null]) {
    const who = viewer ? "a member" : "a signed-out visitor";

    it(`marks an admin and an active host, and no one else, for ${who}`, async () => {
      const { out } = await call(directory, led(), viewer);
      expect(leaders(out.people)).toEqual(["Ada Admin", "Person 1"]);
    });
  }

  it("gives every row a plain true or false", async () => {
    const { out } = await call(directory, led(), null);
    expect(out.people.length).toBeGreaterThan(0);
    for (const p of out.people) expect(typeof p.isLeader).toBe("boolean");
  });

  it("never sends the admin flag: the admin's row has the badge and nothing of how", async () => {
    const { out } = await call(directory, led(), null);
    const admin = out.people.find((p: { name: string }) => p.name === "Ada Admin");
    expect(admin.isLeader).toBe(true);
    for (const p of out.people) expect(p).not.toHaveProperty("isAdmin");
  });

  it("finds them under a search and inside a community too", async () => {
    const found = (await call(directory, led(), MEMBER, { query: "ada" })).out;
    expect(leaders(found.people)).toEqual(["Ada Admin"]);
    // The community's active members: its host, its moderator and a member.
    const inCommunity = (await call(directory, led(), null, { communitySlug: "public-circle" })).out;
    expect(names(inCommunity.people)).toEqual(["Person 5", "Person 3", "Person 1"]);
    expect(leaders(inCommunity.people)).toEqual(["Person 1"]);
  });

  it("reads the leaders by index: the same whole-table reads as before, nothing more", async () => {
    expect((await call(directory, led(), MEMBER)).scans.sort()).toEqual(["profiles", "projects"]);
  });

  it("looks only at the page it returns, not at everyone who matches", async () => {
    const crowd = world(60, { communityMembers: [LEAD(9, PUB, "users:u60", "host", "active")] });
    const ctx = makeCtx(crowd, MEMBER);
    const asked: string[] = [];
    const query = ctx.db.query;
    ctx.db.query = (table: string) => (table === "communityMembers" && asked.push(table), query(table));
    const out = await run(directory, ctx, { limit: 24 });
    expect(out.people).toHaveLength(24);
    // One membership read for each of the 24 people on show, not 61.
    expect(asked).toHaveLength(24);
    expect(leaders(out.people)).toEqual(["Person 60"]);
  });
});

describe("profiles.search — the name picker", () => {
  const tables = world(40);

  it("carries the same leader flag as the directory", async () => {
    const withLeader = world(3, {
      profiles: [profile(50, { name: "Ada Admin", isAdmin: true })],
      hostOrgs: [{ _id: PUB, name: "Public Circle", slug: "public-circle", kind: "community", status: "active" }],
      communityMembers: [{ _id: "communityMembers:h", hostOrgId: PUB, userId: "users:u1", role: "host", status: "active" }],
    });
    for (const viewer of [MEMBER, null]) {
      const { out } = await call(search, withLeader, viewer, { query: "person 1" });
      expect(out.map((p: { name: string; isLeader: boolean }) => [p.name, p.isLeader])).toEqual([["Person 1", true]]);
      const admin = (await call(search, withLeader, viewer, { query: "ada" })).out;
      expect(admin.map((p: { isLeader: boolean }) => p.isLeader)).toEqual([true]);
      for (const p of admin) expect(p).not.toHaveProperty("isAdmin");
    }
  });

  it("finds people by name for a member, up to 30", async () => {
    const { out } = await call(search, tables, MEMBER, { query: "person" });
    expect(out).toHaveLength(30);
    expect(out[0].name).toBe("Person 40");
  });

  it("gives a visitor one page at most", async () => {
    expect((await call(search, tables, null, { query: "person" })).out).toHaveLength(DIRECTORY_PAGE);
  });
});
