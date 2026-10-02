// Tests for the Shortlist query (shortlist.ts; spec: docs/handoff/
// favorites-redesign/README.md, contract: app/lib/shortlist/types.ts).
//
// Two layers, as in offeringModeration.test.ts. First the pure rules —
// relation mapping, pay, backing, dedupe — with no Convex. (Which support
// counts and which roles a project page lists are tested where those rules
// live: garden/support.test.ts, garden/projectTeam.test.ts.)
// Then getMine runs against a small in-memory ctx, because the rules are
// only as good as the wiring: a hidden project must really drop out, a
// request must really land on the lead. The fake checks every withIndex
// against the real schema and refuses a read without one, so "every read is
// indexed" is tested too.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import schema from "./schema";
import {
  ENDED_EVENTS_KEPT,
  backingRelation,
  dedupeEvents,
  dedupeProjects,
  getMine,
  memberRelation,
  payFor,
  projectThing,
  savedRoleRelation,
  summarizeBacking,
  untilFinished,
} from "./shortlist";
import type { ProjectRelation, ShortlistEvent, ShortlistProject } from "../app/lib/shortlist/types";

// ——————————————————————————————————————————————————————————————
// Pure rules
// ——————————————————————————————————————————————————————————————

describe("memberRelation — projectMembers status to relation", () => {
  it("maps the live statuses", () => {
    expect(memberRelation("invited", false)).toEqual({ relation: "invited" });
    expect(memberRelation("accepted", false)).toEqual({ relation: "team" });
    expect(memberRelation("pending", false)).toEqual({ relation: "waiting" });
  });

  it("closes the ended statuses with their own reason", () => {
    for (const status of ["declined", "withdrawn", "left", "removed"] as const) {
      expect(memberRelation(status, false)).toEqual({ relation: "closed", closedReason: status });
    }
  });

  it("a finished project closes a live row as finished", () => {
    for (const status of ["invited", "accepted", "pending"] as const) {
      expect(memberRelation(status, true)).toEqual({ relation: "closed", closedReason: "finished" });
    }
  });

  it("a row that ended before the project finished keeps its own reason", () => {
    expect(memberRelation("left", true)).toEqual({ relation: "closed", closedReason: "left" });
  });
});

describe("payFor — the role's pay, else a paid project's, else none", () => {
  const paid = { kind: "paid", budgetType: "amount", budget: 1200 };
  const passion = { kind: "passion", goal: 5000 };

  it("a role that declared pay wins, even volunteer on a paid project", () => {
    expect(payFor({ budgetType: "range", budget: 300, budgetMax: 600 }, paid)).toEqual({
      budgetType: "range",
      budget: 300,
      budgetMax: 600,
    });
    expect(payFor({ budgetType: "volunteer" }, paid)).toEqual({ budgetType: "volunteer" });
  });

  it("a role that didn't say falls back to a paid project's pay", () => {
    expect(payFor({}, paid)).toEqual({ budgetType: "amount", budget: 1200 });
    expect(payFor(null, paid)).toEqual({ budgetType: "amount", budget: 1200 });
  });

  it("a passion project has no pay of its own", () => {
    expect(payFor(null, passion)).toBeNull();
    expect(payFor({}, passion)).toBeNull();
    // A paid role on a passion project still shows its pay.
    expect(payFor({ budgetType: "confidential" }, passion)).toEqual({ budgetType: "confidential" });
  });
});

describe("summarizeBacking — one backing per project", () => {
  it("shows recurring money over newer one-time money, since the first", () => {
    expect(
      summarizeBacking([
        { type: "financial_recurring", amountCents: 1000, createdAt: 10 },
        { type: "financial_one_time", amountCents: 5000, createdAt: 30 },
        { type: "encouragement", createdAt: 5 },
      ]),
    ).toEqual({ since: 5, backing: { amountCents: 1000, recurring: true } });
  });

  it("an annual backing is recurring too", () => {
    expect(summarizeBacking([{ type: "financial_annual", amountCents: 12000, createdAt: 1 }]).backing).toEqual({
      amountCents: 12000,
      recurring: true,
    });
  });

  it("the newest one-time money when nothing recurs", () => {
    expect(
      summarizeBacking([
        { type: "financial_one_time", amountCents: 2500, createdAt: 10 },
        { type: "financial_one_time", amountCents: 4000, createdAt: 20 },
      ]).backing,
    ).toEqual({ amountCents: 4000, recurring: false });
  });

  it("a cheer or a resource alone has no amount", () => {
    expect(summarizeBacking([{ type: "resource", createdAt: 7 }])).toEqual({
      since: 7,
      backing: { amountCents: null, recurring: false },
    });
  });
});

describe("untilFinished and backingRelation — what closes with the project", () => {
  it("a live relation holds while the work does, then closes as finished", () => {
    expect(untilFinished("saved", false)).toEqual({ relation: "saved" });
    expect(untilFinished("saved", true)).toEqual({ relation: "closed", closedReason: "finished" });
  });

  it("a one-time backing closes with the project; a recurring one stays, since it still charges", () => {
    expect(backingRelation(false, false)).toEqual({ relation: "backing" });
    expect(backingRelation(true, false)).toEqual({ relation: "backing" });
    expect(backingRelation(false, true)).toEqual({ relation: "closed", closedReason: "finished" });
    expect(backingRelation(true, true)).toEqual({ relation: "backing" });
  });
});

describe("savedRoleRelation — a saved role closes once it can't be applied to", () => {
  it("an open role on live work stays saved", () => {
    expect(savedRoleRelation("open", false)).toEqual({ relation: "saved" });
  });

  it("a filled or closed role closes as filled", () => {
    expect(savedRoleRelation("filled", false)).toEqual({ relation: "closed", closedReason: "filled" });
    expect(savedRoleRelation("closed", false)).toEqual({ relation: "closed", closedReason: "filled" });
  });

  it("an open role on a finished project closes as finished", () => {
    expect(savedRoleRelation("open", true)).toEqual({ relation: "closed", closedReason: "finished" });
  });

  it("a role that was filled before the project finished keeps its own reason", () => {
    expect(savedRoleRelation("filled", true)).toEqual({ relation: "closed", closedReason: "filled" });
    expect(savedRoleRelation("closed", true)).toEqual({ relation: "closed", closedReason: "filled" });
  });
});

const PROJECT_ORDER: ProjectRelation[] = ["invited", "leading", "team", "waiting", "backing", "saved", "closed"];

function row(relation: ProjectRelation, projectId: string, roleId: string | null = null, since = 1): ShortlistProject {
  return {
    key: roleId ? `${relation}:${projectId}:${roleId}` : `${relation}:${projectId}`,
    relation,
    kind: "passion",
    isGig: false,
    projectId,
    title: projectId,
    stage: "planning",
    lead: { name: "Lead", profileId: null },
    coverUrl: null,
    role: roleId ? { id: roleId, title: roleId, neededBy: null } : null,
    pay: null,
    since,
  };
}

/** A row on a free-text role: the member's own place, no posting. */
function freeText(relation: ProjectRelation, projectId: string, since = 1): ShortlistProject {
  return {
    ...row(relation, projectId, null, since),
    key: `${relation}:${projectId}:member`,
    role: { id: null, title: "Editor", neededBy: null },
  };
}

const evt = (relation: ShortlistEvent["relation"], eventId: string, datetime = 1): ShortlistEvent => ({
  key: `${relation}:${eventId}`,
  relation,
  eventId,
  title: eventId,
  datetime,
  endTime: null,
  location: null,
  coverUrl: null,
  goingCount: 0,
  cancelled: false,
  since: 1,
});

describe("dedupeProjects — one row per thing (types.ts header)", () => {
  it("keeps the first relation in invited → leading → team → waiting → backing → saved → closed", () => {
    PROJECT_ORDER.forEach((winner, i) => {
      // Every relation from the winner down, in reverse so order of arrival can't decide it.
      const rows = PROJECT_ORDER.slice(i).reverse().map((r) => row(r, "p"));
      expect(dedupeProjects(rows).map((r) => r.relation)).toEqual([winner]);
    });
  });

  it("the same order holds per role", () => {
    const rows = [row("closed", "p", "r1"), row("saved", "p", "r1"), row("waiting", "p", "r1"), row("saved", "p", "r2")];
    expect(dedupeProjects(rows).map((r) => r.key)).toEqual(["waiting:p:r1", "saved:p:r2"]);
  });

  it("projectThing: a posted role, the member's place on a free-text role, or the project", () => {
    expect(projectThing(row("team", "p", "r1"))).toBe("p:r1");
    expect(projectThing(freeText("team", "p"))).toBe("p:member");
    expect(projectThing(row("backing", "p"))).toBe("p");
  });

  it("a free-text role is its own thing: on the team through one, and backing, both show", () => {
    expect(dedupeProjects([row("backing", "p"), freeText("team", "p")]).map((r) => r.key)).toEqual([
      "team:p:member",
      "backing:p",
    ]);
  });

  it("a free-text role doesn't collide with leading or a bare save either; its own relations still dedupe", () => {
    expect(dedupeProjects([row("leading", "p"), freeText("waiting", "p")]).map((r) => r.key)).toEqual([
      "leading:p",
      "waiting:p:member",
    ]);
    expect(dedupeProjects([freeText("closed", "p"), freeText("waiting", "p")]).map((r) => r.key)).toEqual([
      "waiting:p:member",
    ]);
  });

  it("a saved project drops out once anything live is left for it, a saved role included", () => {
    expect(dedupeProjects([row("saved", "p"), row("team", "p", "r1")]).map((r) => r.key)).toEqual(["team:p:r1"]);
    expect(dedupeProjects([row("saved", "p"), row("saved", "p", "r1")]).map((r) => r.key)).toEqual(["saved:p:r1"]);
    expect(dedupeProjects([row("saved", "p"), freeText("waiting", "p")]).map((r) => r.key)).toEqual(["waiting:p:member"]);
  });

  it("something closed doesn't cover a save: declined on role R, then saved the project, the save shows", () => {
    expect(dedupeProjects([row("closed", "p", "r1"), row("saved", "p")]).map((r) => r.key)).toEqual([
      "saved:p",
      "closed:p:r1",
    ]);
    expect(dedupeProjects([freeText("closed", "p"), row("saved", "p")]).map((r) => r.key)).toEqual([
      "saved:p",
      "closed:p:member",
    ]);
  });

  it("a saved project with nothing else stays, and other projects don't touch it", () => {
    expect(dedupeProjects([row("saved", "p"), row("team", "q")]).map((r) => r.key)).toEqual(["team:q", "saved:p"]);
  });

  it("returns group order, newest first within a group", () => {
    const rows = [row("saved", "a", null, 5), row("team", "b", null, 1), row("saved", "c", null, 9), row("invited", "d")];
    expect(dedupeProjects(rows).map((r) => r.key)).toEqual(["invited:d", "team:b", "saved:c", "saved:a"]);
  });
});

describe("dedupeEvents — one row per event", () => {
  it("keeps the first relation in hosting → going → requested → saved", () => {
    const order = ["hosting", "going", "requested", "saved"] as const;
    order.forEach((winner, i) => {
      const rows = order.slice(i).reverse().map((r) => evt(r, "e"));
      expect(dedupeEvents(rows).map((r) => r.relation)).toEqual([winner]);
    });
  });

  it("returns group order, soonest first within a group", () => {
    const rows = [evt("saved", "a", 9), evt("going", "b", 7), evt("going", "c", 3), evt("hosting", "d", 99)];
    expect(dedupeEvents(rows).map((r) => r.key)).toEqual(["hosting:d", "going:c", "going:b", "saved:a"]);
  });
});

// ——————————————————————————————————————————————————————————————
// getMine, on an in-memory ctx
// ——————————————————————————————————————————————————————————————

type Row = Record<string, any> & { _id: string };

/** The fields of a real schema index, or a throw: a typo'd or missing index
 * (eventRsvps.by_userId, say) fails here rather than in a deployment. */
function indexFields(table: string, index: string): string[] {
  const tables = schema.tables as unknown as Record<
    string,
    { " indexes"(): { indexDescriptor: string; fields: string[] }[] } | undefined
  >;
  const found = tables[table]?.[" indexes"]().find((i) => i.indexDescriptor === index);
  if (!found) throw new Error(`${table} has no index ${index}`);
  return found.fields;
}

/** Just enough of Convex's ctx for getMine and what it calls: db.get,
 * db.normalizeId, and query().withIndex(name, q => q.eq(..)...) then
 * collect/first/unique. withIndex checks the index exists and that the
 * eq()s walk its fields in order; reading without one throws. Storage
 * resolves an id to https://files/<id>. `reads` lists every index used;
 * `lookups` every index read with the values it was read at, and every
 * storage id resolved, so a test can count what one event cost. */
function makeCtx(tables: Record<string, Row[]>, viewerId: string | null) {
  const reads: string[] = [];
  const lookups: string[] = [];
  const rowsOf = (table: string) => tables[table] ?? [];

  function query(table: string) {
    let rows: Row[] | null = null;
    const matched = () => {
      if (!rows) throw new Error(`unindexed read of ${table}`);
      return rows.map((r) => ({ ...r }));
    };
    const api = {
      withIndex(name: string, build: (q: any) => any) {
        const fields = indexFields(table, name);
        const conds: [string, unknown][] = [];
        const q = {
          eq(field: string, value: unknown) {
            conds.push([field, value]);
            return q;
          },
        };
        build(q);
        conds.forEach(([field], i) => {
          if (fields[i] !== field) throw new Error(`${table}.${name}: eq("${field}") isn't field ${i} of the index`);
        });
        reads.push(`${table}.${name}`);
        lookups.push(`${table}.${name}(${conds.map(([, v]) => String(v)).join(", ")})`);
        rows = rowsOf(table).filter((r) => conds.every(([f, v]) => r[f] === v));
        return api;
      },
      async collect() {
        return matched();
      },
      async first() {
        return matched()[0] ?? null;
      },
      async unique() {
        const all = matched();
        if (all.length > 1) throw new Error("unique() matched more than one row");
        return all[0] ?? null;
      },
    };
    return api;
  }

  const find = (id: string) => rowsOf(id.split(":")[0]).find((r) => r._id === id) ?? null;
  const ctx = {
    db: {
      query,
      async get(id: string) {
        const r = find(id);
        return r ? { ...r } : null;
      },
      normalizeId(table: string, id: string) {
        return id.startsWith(`${table}:`) && find(id) ? id : null;
      },
    },
    auth: { getUserIdentity: async () => (viewerId ? { subject: `${viewerId}|session` } : null) },
    storage: {
      getUrl: async (id: string) => {
        lookups.push(`storage(${id})`);
        return `https://files/${id}`;
      },
    },
  };
  return { ctx: ctx as any, reads, lookups };
}

// A Convex-registered function keeps the handler you wrote on `_handler`.
const run = (fn: unknown, ctx: unknown) =>
  (fn as { _handler: (c: unknown, a: unknown) => Promise<any> })._handler(ctx, {});

// getMine reads the clock: the world's events (datetime 5000 on) are ahead of
// it, the ones a test ends sit before it.
const CLOCK = 1000;
beforeEach(() => {
  vi.spyOn(Date, "now").mockReturnValue(CLOCK);
});
afterEach(() => {
  vi.restoreAllMocks();
});

const ME = "users:me";
const LEAD = "users:lead";
const ALEX = "users:alex";
const BO = "users:bo";
const CY = "users:cy";
const SAM = "users:sam";

const project = (id: string, over: Partial<Row> = {}): Row => ({
  _id: `projects:${id}`,
  userId: LEAD,
  kind: "passion",
  title: `Project ${id}`,
  status: "active",
  createdAt: 100,
  updatedAt: 100,
  ...over,
});
const member = (id: string, projectId: string, status: string, over: Partial<Row> = {}): Row => ({
  _id: `projectMembers:${id}`,
  projectId: `projects:${projectId}`,
  userId: ME,
  name: "Me",
  role: "Collaborator",
  status,
  createdAt: 200,
  ...over,
});
const support = (id: string, projectId: string, type: string, over: Partial<Row> = {}): Row => ({
  _id: `projectSupport:${id}`,
  projectId: `projects:${projectId}`,
  supporterUserId: ME,
  supporterName: "Me",
  type,
  status: "confirmed",
  visible: true,
  createdAt: 150,
  ...over,
});
const event = (id: string, over: Partial<Row> = {}): Row => ({
  _id: `events:${id}`,
  organizerId: LEAD,
  title: `Event ${id}`,
  description: "",
  datetime: 5000,
  tags: [],
  requiresApproval: true,
  status: "published",
  createdAt: 50,
  updatedAt: 50,
  ...over,
});
const application = (id: string, eventId: string, applicantId: string, status: string, over: Partial<Row> = {}): Row => ({
  _id: `eventApplications:${id}`,
  eventId: `events:${eventId}`,
  applicantId,
  status,
  createdAt: 500,
  updatedAt: 500,
  ...over,
});
const rsvp = (id: string, eventId: string, userId: string | undefined, createdAt: number): Row => ({
  _id: `eventRsvps:${id}`,
  eventId: `events:${eventId}`,
  ...(userId ? { userId } : {}),
  name: id,
  email: `${id}@example.com`,
  createdAt,
});
const fav = (targetType: string, targetId: string, createdAt: number): Row => ({
  _id: `favorites:${targetType}-${targetId}`,
  userId: ME,
  targetType,
  targetId,
  createdAt,
});
const TIERS = [{ name: "General", priceCents: 2500 }];

const WORLD = (): Record<string, Row[]> => ({
  profiles: [
    { _id: "profiles:me", userId: ME, name: "Me Member", interests: [] },
    {
      _id: "profiles:lead",
      userId: LEAD,
      name: "Mara Lead",
      interests: ["Music"],
      imageUrl: "https://legacy/mara.jpg",
      imageStorageId: "_storage:mara",
    },
    { _id: "profiles:alex", userId: ALEX, name: "Alex Asks", interests: ["Film", "Music"], imageUrl: "https://legacy/alex.jpg" },
    { _id: "profiles:cy", userId: CY, name: "Cy", interests: [] },
    // Sam can sell tickets (a partner listing), so Sam's ticketed event is public.
    { _id: "profiles:sam", userId: SAM, name: "Sam Seller", interests: [], partnerRole: true },
  ],
  projects: [
    project("invite", { kind: "paid", budgetType: "amount", budget: 1200, photoStorageId: "_storage:invite-photo" }),
    project("team", { stage: "working" }),
    project("wait", { kind: "paid", budgetType: "proposals", mediaPreviewUrl: "https://still/wait.jpg" }),
    project("declined"),
    project("withdrawn"),
    project("left"),
    project("removed"),
    project("done", { status: "completed" }),
    project("shelved", { status: "archived" }),
    project("hidden", { status: "hidden" }),
    project("mine", { userId: ME, kind: "paid", budgetType: "range", budget: 300, budgetMax: 600 }),
    project("mineHidden", { userId: ME, status: "hidden", createdAt: 90 }),
    project("portfolio", { userId: ME, origin: "portfolio" }),
    project("backed"),
    project("saved", { kind: "paid", budgetType: "volunteer" }),
    project("roles", { kind: "paid", budgetType: "amount", budget: 5000 }),
    project("art"),
  ],
  projectRoles: [
    {
      _id: "projectRoles:sound",
      projectId: "projects:team",
      title: "Sound Mixer",
      status: "filled",
      budgetType: "range",
      budget: 300,
      budgetMax: 600,
      createdAt: 1,
    },
    { _id: "projectRoles:director", projectId: "projects:roles", title: "Director", status: "open", neededBy: 9000, createdAt: 1 },
    { _id: "projectRoles:gaffer", projectId: "projects:roles", title: "Gaffer", status: "closed", createdAt: 1 },
    { _id: "projectRoles:editor", projectId: "projects:mine", title: "Editor", status: "open", budgetType: "amount", budget: 800, createdAt: 1 },
  ],
  projectMembers: [
    member("invite", "invite", "invited", { role: "Cellist", createdAt: 210 }),
    member("team", "team", "accepted", { role: "Sound Mixer", roleId: "projectRoles:sound", createdAt: 220, respondedAt: 225 }),
    member("wait", "wait", "pending", { role: "Editor", createdAt: 230 }),
    ...["declined", "withdrawn", "left", "removed"].map((s) => member(s, s, s, { createdAt: 240, respondedAt: 245 })),
    member("done", "done", "accepted", { createdAt: 250, respondedAt: 255 }),
    member("shelved", "shelved", "invited", { createdAt: 260 }),
    member("hidden", "hidden", "accepted", { createdAt: 270, respondedAt: 275 }),
    // Requests on the project I lead: one for a posted role, one free-text from
    // someone with no profile. An accepted member isn't a request.
    member("alexAsks", "mine", "pending", {
      userId: ALEX,
      name: "Alex A.",
      role: "Editor",
      roleId: "projectRoles:editor",
      message: "I cut docs.",
      createdAt: 400,
    }),
    member("boAsks", "mine", "pending", { userId: BO, name: "Bo Nophoto", role: "Runner", createdAt: 410 }),
    member("cyOn", "mine", "accepted", { userId: CY, name: "Cy", createdAt: 1 }),
  ],
  projectSupport: [
    support("oneTime", "backed", "financial_one_time", { amountCents: 2500, createdAt: 150 }),
    support("monthly", "backed", "financial_recurring", { amountCents: 1000, createdAt: 170 }),
    support("unpaid", "backed", "financial_annual", { amountCents: 99999, status: "pending", createdAt: 120 }),
    support("cheerHidden", "hidden", "encouragement", { createdAt: 160 }),
    support("cheerInvite", "invite", "encouragement", { createdAt: 160 }),
  ],
  artifacts: [
    { _id: "artifacts:note", projectId: "projects:art", type: "text", content: "hi", order: 0, createdAt: 1 },
    { _id: "artifacts:pic", projectId: "projects:art", type: "image", mediaStorageId: "_storage:art-img", order: 1, createdAt: 2 },
  ],
  favorites: [
    fav("project", "projects:saved", 300),
    fav("project", "projects:art", 305),
    fav("project", "projects:invite", 306),
    fav("project", "projects:roles", 307),
    fav("project", "projects:hidden", 308),
    fav("project", "not-an-id", 309),
    fav("role", "projectRoles:director", 330),
    fav("role", "projectRoles:gaffer", 331),
    fav("event", "events:saved", 340),
    fav("event", "events:ticketedSeller", 341),
    fav("event", "events:ticketedNoSeller", 342),
    fav("event", "events:hidden", 343),
    fav("event", "events:hosted", 344),
    fav("profile", "profiles:alex", 310),
    fav("profile", "profiles:lead", 320),
    fav("profile", "profiles:gone", 321),
  ],
  events: [
    event("hosted", { organizerId: ME, datetime: 6000, location: "The Garden", coverImageStorageId: "_storage:hosted-cover" }),
    event("hostedHidden", { organizerId: ME, status: "hidden" }),
    event("going", { datetime: 5100, imageStorageIds: ["_storage:going-gallery"] }),
    event("rsvp", { datetime: 5200, mediaPreviewUrl: "https://still/rsvp.jpg" }),
    event("cancelled", { datetime: 5300, status: "cancelled" }),
    event("requested"),
    event("saved"),
    event("hidden", { status: "hidden" }),
    event("ticketedNoSeller", { ticketTiers: TIERS }),
    event("ticketedSeller", { organizerId: SAM, ticketTiers: TIERS, datetime: 7000 }),
  ],
  eventApplications: [
    application("meGoing", "going", ME, "accepted", { createdAt: 500, updatedAt: 520 }),
    application("boGoing", "going", BO, "accepted"),
    application("meRequested", "requested", ME, "pending", { createdAt: 530 }),
    application("meDeclined", "rsvp", ME, "declined"),
    application("meTicketed", "ticketedNoSeller", ME, "accepted"),
    application("alexHosted", "hosted", ALEX, "pending", { message: "Can I come?", createdAt: 600 }),
    application("cyHosted", "hosted", CY, "accepted"),
  ],
  eventRsvps: [
    rsvp("meGoing", "going", ME, 510),
    rsvp("boGoing", "going", BO, 515),
    rsvp("guestGoing", "going", undefined, 516),
    rsvp("meRsvp", "rsvp", ME, 540),
    rsvp("meCancelled", "cancelled", ME, 550),
    rsvp("meHosted", "hosted", ME, 560),
  ],
  memberships: [],
  hostOrgs: [],
});

async function mine(viewer: string | null = ME, world = WORLD()) {
  const { ctx, reads, lookups } = makeCtx(world, viewer);
  return { data: await run(getMine, ctx), reads, lookups };
}

describe("getMine — signed out", () => {
  it("returns empty lists and reads nothing", async () => {
    const { data, reads } = await mine(null);
    expect(data).toEqual({ projects: [], requests: [], events: [], people: [] });
    expect(reads).toEqual([]);
  });
});

describe("getMine — projects", () => {
  it("one row per thing, in group order", async () => {
    const { data } = await mine();
    expect(data.projects.map((p: ShortlistProject) => p.key)).toEqual([
      "invited:projects:invite:member",
      "leading:projects:mine",
      "leading:projects:mineHidden",
      "team:projects:team:projectRoles:sound",
      "waiting:projects:wait:member",
      "backing:projects:invite",
      "backing:projects:backed",
      "saved:projects:roles:projectRoles:director",
      "saved:projects:art",
      "saved:projects:saved",
      "closed:projects:roles:projectRoles:gaffer",
      "closed:projects:shelved:member",
      "closed:projects:done:member",
      "closed:projects:declined:member",
      "closed:projects:withdrawn:member",
      "closed:projects:left:member",
      "closed:projects:removed:member",
    ]);
  });

  it("invited: the project's pay, its photo, the lead's name, and its stage", async () => {
    const { data } = await mine();
    expect(data.projects[0]).toEqual({
      key: "invited:projects:invite:member",
      relation: "invited",
      kind: "paid",
      isGig: false,
      projectId: "projects:invite",
      title: "Project invite",
      stage: "forming",
      lead: { name: "Mara Lead", profileId: "profiles:lead" },
      coverUrl: "https://files/_storage:invite-photo",
      role: { id: null, title: "Cellist", neededBy: null },
      pay: { budgetType: "amount", budget: 1200 },
      since: 210,
    });
  });

  it("team: the posted role's title and pay, since they joined", async () => {
    const { data } = await mine();
    expect(data.projects.find((p: ShortlistProject) => p.relation === "team")).toMatchObject({
      kind: "passion",
      stage: "working",
      role: { id: "projectRoles:sound", title: "Sound Mixer", neededBy: null },
      pay: { budgetType: "range", budget: 300, budgetMax: 600 },
      since: 225,
    });
  });

  it("waiting: a free-text role, the project's pay, and a pasted link's still", async () => {
    const { data } = await mine();
    expect(data.projects.find((p: ShortlistProject) => p.relation === "waiting")).toMatchObject({
      role: { id: null, title: "Editor", neededBy: null },
      pay: { budgetType: "proposals" },
      coverUrl: "https://still/wait.jpg",
      since: 230,
    });
  });

  it("closed: declined, withdrawn, left and removed keep their reason; completed and archived projects finish; a closed saved role reads filled", async () => {
    const { data } = await mine();
    const reasons = Object.fromEntries(
      data.projects
        .filter((p: ShortlistProject) => p.relation === "closed")
        .map((p: ShortlistProject) => [p.projectId, p.closedReason]),
    );
    expect(reasons).toEqual({
      "projects:declined": "declined",
      "projects:withdrawn": "withdrawn",
      "projects:left": "left",
      "projects:removed": "removed",
      "projects:done": "finished",
      "projects:shelved": "finished",
      "projects:roles": "filled",
    });
  });

  it("leading: counts requests waiting; a portfolio share isn't a project you lead", async () => {
    const { data } = await mine();
    const leading = data.projects.filter((p: ShortlistProject) => p.relation === "leading");
    expect(leading.map((p: ShortlistProject) => [p.projectId, p.pendingRequests, p.pay])).toEqual([
      ["projects:mine", 2, { budgetType: "range", budget: 300, budgetMax: 600 }],
      ["projects:mineHidden", 0, null],
    ]);
    expect(data.projects.some((p: ShortlistProject) => p.projectId === "projects:portfolio")).toBe(false);
  });

  it("flags a recurring gig, the project a gigSeries hangs on, on every row of it, reading the series once", async () => {
    const w = WORLD();
    w.gigSeries = [{ _id: "gigSeries:fridays", projectId: "projects:invite", hostUserId: LEAD, status: "open" }];
    const { data, lookups } = await mine(ME, w);
    const flags = data.projects.map((p: ShortlistProject) => [p.key, p.isGig]);
    expect(flags.filter(([, isGig]: [string, boolean]) => isGig)).toEqual([
      ["invited:projects:invite:member", true],
      ["backing:projects:invite", true],
    ]);
    expect(lookups.filter((l) => l === "gigSeries.by_projectId(projects:invite)")).toHaveLength(1);
  });

  it("backing: recurring money shown, an unfinished checkout ignored, since the first", async () => {
    const { data } = await mine();
    expect(data.projects.find((p: ShortlistProject) => p.key === "backing:projects:backed")).toMatchObject({
      backing: { amountCents: 1000, recurring: true },
      pay: null,
      since: 150,
    });
  });

  it("saved: a role with its deadline and the project's pay; a project with its first image artifact", async () => {
    const { data } = await mine();
    const byKey = Object.fromEntries(data.projects.map((p: ShortlistProject) => [p.key, p]));
    expect(byKey["saved:projects:roles:projectRoles:director"]).toMatchObject({
      role: { id: "projectRoles:director", title: "Director", neededBy: 9000 },
      pay: { budgetType: "amount", budget: 5000 },
      since: 330,
    });
    expect(byKey["saved:projects:art"]).toMatchObject({ coverUrl: "https://files/_storage:art-img", pay: null });
    expect(byKey["saved:projects:saved"]).toMatchObject({ pay: { budgetType: "volunteer" }, coverUrl: null });
  });

  it("dedupe: an invite on a free-text role and a cheer on the same project both show; a live row hides the bare save", async () => {
    const { data } = await mine();
    const keys = data.projects.map((p: ShortlistProject) => p.key);
    expect(keys).toEqual(expect.arrayContaining(["invited:projects:invite:member", "backing:projects:invite"]));
    expect(keys).not.toContain("saved:projects:invite");
    expect(keys).not.toContain("saved:projects:roles");
  });
});

describe("getMine — visibility", () => {
  it("drops a hidden project from every relation but the member's own", async () => {
    const { data } = await mine();
    const ids = data.projects.map((p: ShortlistProject) => p.projectId);
    expect(ids).not.toContain("projects:hidden"); // team row, cheer and save all gone
    expect(ids).toContain("projects:mineHidden"); // still yours to lead
  });

  it("drops hidden events and ticketed ones whose organizer can't sell, unless you host them", async () => {
    const { data } = await mine();
    const ids = data.events.map((e: ShortlistEvent) => e.eventId);
    expect(ids).not.toContain("events:hidden");
    expect(ids).not.toContain("events:ticketedNoSeller"); // saved and going, both gone
    expect(ids).toContain("events:ticketedSeller");
    expect(ids).toContain("events:hostedHidden");
  });

  it("skips saves whose target is gone or malformed", async () => {
    const { data } = await mine();
    expect(data.people.map((p: { profileId: string }) => p.profileId)).not.toContain("profiles:gone");
    expect(data.projects.some((p: ShortlistProject) => p.projectId === "not-an-id")).toBe(false);
  });
});

describe("getMine — hidden (test) communities", () => {
  // "_TeamTest" is hidden (garden/hiddenCommunity.ts); "Open Studio" isn't.
  // Everything here is the member's: saved, backed, on the team, going, or
  // their own to lead and host.
  const TEST = "hostOrgs:test";
  const OPEN = "hostOrgs:open";
  const inTest = { hostOrgId: TEST };

  function world(viewer: { membership?: string; admin?: boolean } = {}) {
    const w = WORLD();
    w.hostOrgs = [
      { _id: TEST, name: "_TeamTest", slug: "teamtest" },
      { _id: OPEN, name: "Open Studio", slug: "open-studio" },
    ];
    w.communityMembers = viewer.membership
      ? [{ _id: "communityMembers:me", hostOrgId: TEST, userId: ME, role: "member", status: viewer.membership, joinedAt: 1 }]
      : [];
    if (viewer.admin) w.profiles[0].isAdmin = true;
    w.projects.push(
      project("testSaved", inTest),
      project("testBacked", inTest),
      project("testTeam", inTest),
      project("testRoles", inTest),
      project("testMine", { ...inTest, userId: ME }),
      project("openSaved", { hostOrgId: OPEN }),
    );
    w.projectRoles.push({ _id: "projectRoles:testRole", projectId: "projects:testRoles", title: "Tester", status: "open", createdAt: 1 });
    w.projectMembers.push(member("testTeam", "testTeam", "accepted", { createdAt: 280, respondedAt: 285 }));
    w.projectSupport.push(support("testBacked", "testBacked", "encouragement"));
    w.events.push(
      event("testSaved", inTest),
      event("testGoing", inTest),
      event("testHosted", { ...inTest, organizerId: ME }),
      event("testCoHosted", { ...inTest, coHostIds: [ME] }),
      event("openSaved", { hostOrgId: OPEN }),
    );
    w.eventApplications.push(application("alexTest", "testHosted", ALEX, "pending", { createdAt: 610 }));
    w.eventRsvps.push(rsvp("meTestGoing", "testGoing", ME, 570));
    w.favorites.push(
      fav("project", "projects:testSaved", 350),
      fav("role", "projectRoles:testRole", 351),
      fav("project", "projects:openSaved", 352),
      fav("event", "events:testSaved", 353),
      fav("event", "events:testCoHosted", 354),
      fav("event", "events:openSaved", 355),
    );
    return w;
  }

  const ids = (data: { projects: ShortlistProject[]; events: ShortlistEvent[] }) => ({
    projects: data.projects.map((p) => p.projectId),
    events: data.events.map((e) => e.eventId),
  });
  const TEST_PROJECTS = ["projects:testSaved", "projects:testBacked", "projects:testTeam", "projects:testRoles"];
  const TEST_EVENTS = ["events:testSaved", "events:testGoing"];

  it("drops what's saved, backed, joined or attended there for someone outside it", async () => {
    const { data } = await mine(ME, world());
    const shown = ids(data);
    for (const id of TEST_PROJECTS) expect(shown.projects).not.toContain(id);
    for (const id of TEST_EVENTS) expect(shown.events).not.toContain(id);
    // An ordinary community changes nothing.
    expect(shown.projects).toContain("projects:openSaved");
    expect(shown.events).toContain("events:openSaved");
  });

  it("keeps the member's own: the project they lead, the events they host or co-host, and the requests on them", async () => {
    const { data } = await mine(ME, world());
    const shown = ids(data);
    expect(shown.projects).toContain("projects:testMine");
    expect(shown.events).toEqual(expect.arrayContaining(["events:testHosted", "events:testCoHosted"]));
    expect(data.requests.map((r: { key: string }) => r.key)).toContain("request:event:eventApplications:alexTest");
  });

  it("shows all of it to the community's active members and to admins", async () => {
    for (const viewer of [{ membership: "active" }, { admin: true }]) {
      const shown = ids((await mine(ME, world(viewer))).data);
      expect(shown.projects).toEqual(expect.arrayContaining(TEST_PROJECTS));
      expect(shown.events).toEqual(expect.arrayContaining(TEST_EVENTS));
    }
  });

  it("a pending or removed membership isn't one", async () => {
    for (const membership of ["pending", "removed"]) {
      const shown = ids((await mine(ME, world({ membership }))).data);
      for (const id of TEST_PROJECTS) expect(shown.projects).not.toContain(id);
      for (const id of TEST_EVENTS) expect(shown.events).not.toContain(id);
    }
  });

  it("reads nothing about the member's communities until a hidden one turns up", async () => {
    const { reads } = await mine();
    expect(reads).not.toContain("communityMembers.by_userId");
    expect((await mine(ME, world())).reads).toContain("communityMembers.by_userId");
  });
});

describe("getMine — events", () => {
  it("one row per event, in group order", async () => {
    const { data } = await mine();
    expect(data.events.map((e: ShortlistEvent) => e.key)).toEqual([
      "hosting:events:hostedHidden",
      "hosting:events:hosted",
      "going:events:going",
      "going:events:rsvp",
      "going:events:cancelled",
      "requested:events:requested",
      "saved:events:saved",
      "saved:events:ticketedSeller",
    ]);
  });

  it("hosting: requests waiting, location, cover; my own RSVP and save fold into it", async () => {
    const { data } = await mine();
    expect(data.events.find((e: ShortlistEvent) => e.eventId === "events:hosted")).toEqual({
      key: "hosting:events:hosted",
      relation: "hosting",
      eventId: "events:hosted",
      title: "Event hosted",
      datetime: 6000,
      endTime: null,
      location: "The Garden",
      coverUrl: "https://files/_storage:hosted-cover",
      // Cy's accepted application and my RSVP.
      goingCount: 2,
      cancelled: false,
      since: 50,
      pendingRequests: 1,
    });
  });

  it("going: an accepted application and an RSVP are one row, since the earlier; the count is the event page's", async () => {
    const { data } = await mine();
    expect(data.events.find((e: ShortlistEvent) => e.eventId === "events:going")).toMatchObject({
      relation: "going",
      since: 510,
      // Me and Bo, each once across application and RSVP, and the guest, as
      // the event page counts them (events.ts loadGoingCount).
      goingCount: 3,
      coverUrl: "https://files/_storage:going-gallery",
      location: null,
    });
  });

  it("going by RSVP alone, with a pasted link's still; a cancelled event says so", async () => {
    const { data } = await mine();
    const byId = Object.fromEntries(data.events.map((e: ShortlistEvent) => [e.eventId, e]));
    expect(byId["events:rsvp"]).toMatchObject({ relation: "going", since: 540, coverUrl: "https://still/rsvp.jpg" });
    expect(byId["events:cancelled"]).toMatchObject({ relation: "going", cancelled: true });
  });

  it("requested and saved", async () => {
    const { data } = await mine();
    const byId = Object.fromEntries(data.events.map((e: ShortlistEvent) => [e.eventId, e]));
    expect(byId["events:requested"]).toMatchObject({ relation: "requested", since: 530 });
    expect(byId["events:saved"]).toMatchObject({ relation: "saved", since: 340 });
  });
});

describe("getMine — going by ticket", () => {
  it("a ticket bought here is going, since the purchase; a refunded one isn't; the count has it too", async () => {
    const world = WORLD();
    world.events.push(
      event("ticketed", { organizerId: SAM, ticketTiers: TIERS, datetime: 7100 }),
      event("refunded", { organizerId: SAM, ticketTiers: TIERS, datetime: 7200 }),
    );
    const purchase = (id: string, eventId: string, status: string, userId = ME): Row => ({
      _id: `ticketPurchases:${id}`,
      eventId: `events:${eventId}`,
      tierName: "General",
      amountCents: 2500,
      userId,
      buyerEmail: `${id}@example.com`,
      stripeSessionId: `cs_${id}`,
      status,
      createdAt: 580,
    });
    world.ticketPurchases = [
      purchase("mine", "ticketed", "paid"),
      purchase("bos", "ticketed", "paid", BO),
      purchase("back", "refunded", "refunded"),
    ];
    const { data, reads } = await mine(ME, world);
    const byId = Object.fromEntries(data.events.map((e: ShortlistEvent) => [e.eventId, e]));
    expect(byId["events:ticketed"]).toMatchObject({ relation: "going", since: 580, goingCount: 2 });
    expect(byId["events:refunded"]).toBeUndefined();
    expect(reads).toContain("ticketPurchases.by_userId");
  });
});

describe("getMine — events that have ended", () => {
  // Before CLOCK, so over; each would cost a count, a cover and (hosted)
  // its requests if it were upcoming.
  function world() {
    const w = WORLD();
    w.events.push(
      event("pastHosted", { organizerId: ME, datetime: 900, coverImageStorageId: "_storage:pastHosted-cover" }),
      event("pastGoing", { datetime: 800, imageStorageIds: ["_storage:pastGoing-gallery"] }),
      event("endedEarly", { datetime: 500, endTime: 999 }),
      // On now: started before CLOCK, ends after it.
      event("onNow", { organizerId: ME, datetime: 900, endTime: 2000 }),
      // Ends exactly now: not over yet.
      event("endsNow", { datetime: 500, endTime: CLOCK }),
    );
    w.eventApplications.push(
      application("alexPast", "pastHosted", ALEX, "pending", { createdAt: 620 }),
      application("alexNow", "onNow", ALEX, "pending", { createdAt: 630 }),
    );
    w.eventRsvps.push(rsvp("mePast", "pastGoing", ME, 570), rsvp("meNow", "endsNow", ME, 575));
    w.favorites.push(fav("event", "events:endedEarly", 360));
    return w;
  }
  const costOf = (lookups: string[], id: string) => lookups.filter((l) => l.includes(id));

  it("reads nothing past the event itself: no count, no cover, no requests", async () => {
    const { lookups } = await mine(ME, world());
    for (const id of ["events:pastHosted", "events:pastGoing", "events:endedEarly"]) {
      expect(costOf(lookups, id)).toEqual([]);
    }
    expect(lookups).not.toContain("storage(_storage:pastHosted-cover)");
    expect(lookups).not.toContain("storage(_storage:pastGoing-gallery)");
    // An upcoming one still costs its count.
    expect(costOf(lookups, "events:going")).toEqual(
      expect.arrayContaining(["eventApplications.by_eventId(events:going)", "eventRsvps.by_eventId(events:going)"]),
    );
  });

  it("comes back as a Past row: no picture, no count, nothing waiting, its requests dropped", async () => {
    const { data } = await mine(ME, world());
    const byId = Object.fromEntries(data.events.map((e: ShortlistEvent) => [e.eventId, e]));
    expect(byId["events:pastHosted"]).toMatchObject({ relation: "hosting", coverUrl: null, goingCount: 0, pendingRequests: 0 });
    expect(byId["events:pastGoing"]).toMatchObject({ relation: "going", coverUrl: null, goingCount: 0 });
    expect(byId["events:endedEarly"]).toMatchObject({ relation: "saved", endTime: 999 });
    expect(data.requests.map((r: { key: string }) => r.key)).not.toContain("request:event:eventApplications:alexPast");
  });

  it("one that's on now, or ends this very moment, hasn't ended", async () => {
    const { data, lookups } = await mine(ME, world());
    const byId = Object.fromEntries(data.events.map((e: ShortlistEvent) => [e.eventId, e]));
    expect(byId["events:onNow"]).toMatchObject({ relation: "hosting", endTime: 2000, pendingRequests: 1, goingCount: 0 });
    expect(data.requests.find((r: { key: string }) => r.key === "request:event:eventApplications:alexNow")?.on).toEqual({
      type: "event",
      id: "events:onNow",
      title: "Event onNow",
      datetime: 900,
      endTime: 2000,
    });
    expect(byId["events:endsNow"]).toMatchObject({ relation: "going", goingCount: 1 });
    expect(costOf(lookups, "events:endsNow")).not.toEqual([]);
  });

  it(`keeps the ${ENDED_EVENTS_KEPT} most recent across relations, after dropping what you can't open`, async () => {
    const w = WORLD();
    for (let i = 0; i < 30; i++) {
      // The two most recent are hidden: older ones take their place.
      w.events.push(event(`past${i}`, { datetime: 100 + i, ...(i >= 28 ? { status: "hidden" } : {}) }));
      if (i % 2) w.favorites.push(fav("event", `events:past${i}`, 400 + i));
      else w.eventRsvps.push(rsvp(`mePast${i}`, `past${i}`, ME, 400 + i));
    }
    const { data } = await mine(ME, w);
    const past = data.events.filter((e: ShortlistEvent) => e.eventId.startsWith("events:past"));
    expect(ENDED_EVENTS_KEPT).toBe(25);
    expect(past.map((e: ShortlistEvent) => e.datetime).sort((a: number, b: number) => b - a)).toEqual(
      Array.from({ length: 25 }, (_, i) => 127 - i),
    );
    // Upcoming events aren't capped.
    expect(data.events.map((e: ShortlistEvent) => e.eventId)).toEqual(
      expect.arrayContaining(["events:hosted", "events:going", "events:rsvp", "events:saved"]),
    );
  });
});

describe("getMine — requests waiting on you", () => {
  it("join requests on your project and a request to attend your event, newest first", async () => {
    const { data } = await mine();
    expect(data.requests).toEqual([
      {
        key: "request:event:eventApplications:alexHosted",
        requestId: "eventApplications:alexHosted",
        on: { type: "event", id: "events:hosted", title: "Event hosted", datetime: 6000, endTime: null },
        person: {
          profileId: "profiles:alex",
          name: "Alex Asks",
          imageUrl: "https://legacy/alex.jpg",
          interests: ["Film", "Music"],
        },
        message: "Can I come?",
        at: 600,
      },
      {
        key: "request:project:projectMembers:boAsks",
        requestId: "projectMembers:boAsks",
        on: {
          type: "project",
          id: "projects:mine",
          title: "Project mine",
          kind: "paid",
          roleTitle: "Runner",
          pay: { budgetType: "range", budget: 300, budgetMax: 600 },
        },
        // No profile: the name on the request, nothing else.
        person: { profileId: null, name: "Bo Nophoto", imageUrl: null, interests: [] },
        message: null,
        at: 410,
      },
      {
        key: "request:project:projectMembers:alexAsks",
        requestId: "projectMembers:alexAsks",
        on: {
          type: "project",
          id: "projects:mine",
          title: "Project mine",
          kind: "paid",
          roleTitle: "Editor",
          pay: { budgetType: "amount", budget: 800 },
        },
        person: {
          profileId: "profiles:alex",
          name: "Alex Asks",
          imageUrl: "https://legacy/alex.jpg",
          interests: ["Film", "Music"],
        },
        message: "I cut docs.",
        at: 400,
      },
    ]);
  });
});

// Closed holds anything that has ended for you (Rick's rule).
describe("getMine — what has ended for you", () => {
  const byKey = (data: { projects: ShortlistProject[] }) => Object.fromEntries(data.projects.map((p) => [p.key, p]));

  it("a project you lead that finished is closed, not Leading, and its requests drop", async () => {
    const world = WORLD();
    world.projects.push(
      project("mineDone", { userId: ME, status: "completed", createdAt: 95 }),
      project("mineShelved", { userId: ME, status: "archived", createdAt: 94 }),
      project("mineCancelled", { userId: ME, stage: "cancelled", createdAt: 93 }),
    );
    world.projectMembers.push(member("lateAsk", "mineDone", "pending", { userId: ALEX, name: "Alex A.", createdAt: 420 }));
    const { data } = await mine(ME, world);
    const rows = byKey(data);

    for (const id of ["mineDone", "mineShelved", "mineCancelled"]) {
      expect(rows[`leading:projects:${id}`]).toBeUndefined();
      expect(rows[`closed:projects:${id}`]).toMatchObject({ relation: "closed", closedReason: "finished" });
      expect(rows[`closed:projects:${id}`]).not.toHaveProperty("pendingRequests");
    }
    expect(rows["closed:projects:mineDone"].since).toBe(95);
    expect(data.requests.map((r: { key: string }) => r.key)).not.toContain("request:project:projectMembers:lateAsk");
    // Live work you lead is unchanged, and a hide isn't an ending.
    expect(rows["leading:projects:mine"]).toMatchObject({ pendingRequests: 2 });
    expect(rows["leading:projects:mineHidden"]).toBeDefined();
  });

  it("a saved role that was filled or closed is closed as filled; an opening on finished work as finished", async () => {
    const world = WORLD();
    world.projectRoles.push(
      { _id: "projectRoles:painter", projectId: "projects:roles", title: "Painter", status: "filled", neededBy: 9000, createdAt: 1 },
      { _id: "projectRoles:usher", projectId: "projects:done", title: "Usher", status: "open", createdAt: 1 },
      { _id: "projectRoles:grip", projectId: "projects:done", title: "Grip", status: "filled", createdAt: 1 },
      { _id: "projectRoles:mineFilled", projectId: "projects:mine", title: "Producer", status: "filled", createdAt: 1 },
    );
    world.favorites.push(
      fav("role", "projectRoles:painter", 332),
      fav("role", "projectRoles:usher", 333),
      fav("role", "projectRoles:grip", 334),
      fav("role", "projectRoles:mineFilled", 335),
    );
    const { data } = await mine(ME, world);
    const reasons = Object.fromEntries(
      data.projects
        .filter((p: ShortlistProject) => p.role?.id)
        .map((p: ShortlistProject) => [p.role!.id, [p.relation, p.closedReason]]),
    );

    expect(reasons).toMatchObject({
      "projectRoles:director": ["saved", undefined],
      "projectRoles:gaffer": ["closed", "filled"],
      "projectRoles:painter": ["closed", "filled"],
      "projectRoles:usher": ["closed", "finished"],
      // Filled before the project finished: its own reason wins.
      "projectRoles:grip": ["closed", "filled"],
      // The same on a project you lead.
      "projectRoles:mineFilled": ["closed", "filled"],
    });
    // Still the role's own row, with its title, deadline and pay, since it was saved.
    expect(byKey(data)["closed:projects:roles:projectRoles:painter"]).toMatchObject({
      role: { id: "projectRoles:painter", title: "Painter", neededBy: 9000 },
      pay: { budgetType: "amount", budget: 5000 },
      since: 332,
    });
  });

  it("a bare save and a one-time backing on finished work close as finished; a recurring backing stays", async () => {
    const world = WORLD();
    world.projects.push(
      project("savedDone", { status: "completed" }),
      project("backedDone", { stage: "cancelled" }),
      project("monthlyDone", { status: "archived" }),
    );
    world.favorites.push(fav("project", "projects:savedDone", 370));
    world.projectSupport.push(
      support("doneOnce", "backedDone", "financial_one_time", { amountCents: 2000 }),
      support("doneMonthly", "monthlyDone", "financial_recurring", { amountCents: 500 }),
    );
    const { data } = await mine(ME, world);
    const rows = byKey(data);

    expect(rows["closed:projects:savedDone"]).toMatchObject({ closedReason: "finished", since: 370 });
    expect(rows["saved:projects:savedDone"]).toBeUndefined();
    expect(rows["closed:projects:backedDone"]).toMatchObject({ closedReason: "finished" });
    expect(rows["closed:projects:backedDone"]).not.toHaveProperty("backing");
    expect(rows["backing:projects:monthlyDone"]).toMatchObject({ backing: { amountCents: 500, recurring: true } });
    // Live work is unchanged.
    expect(rows["saved:projects:saved"]).toBeDefined();
    expect(rows["backing:projects:backed"]).toBeDefined();
  });

  it("requests to attend a cancelled event you host drop, from the list and the row's count", async () => {
    const world = WORLD();
    world.events.push(event("hostedCancelled", { organizerId: ME, status: "cancelled", datetime: 5400 }));
    world.eventApplications.push(application("alexCancelled", "hostedCancelled", ALEX, "pending", { createdAt: 610 }));
    const { data } = await mine(ME, world);

    expect(data.events.find((e: ShortlistEvent) => e.eventId === "events:hostedCancelled")).toMatchObject({
      relation: "hosting",
      cancelled: true,
      pendingRequests: 0,
    });
    expect(data.requests.map((r: { key: string }) => r.key)).not.toContain("request:event:eventApplications:alexCancelled");
    // A live event you host keeps its request.
    expect(data.requests.map((r: { key: string }) => r.key)).toContain("request:event:eventApplications:alexHosted");
  });
});

describe("getMine — people", () => {
  it("follows with name, picture and interests, newest first; a stored picture wins", async () => {
    const { data } = await mine();
    expect(data.people).toEqual([
      {
        profileId: "profiles:lead",
        name: "Mara Lead",
        imageUrl: "https://files/_storage:mara",
        interests: ["Music"],
        since: 320,
      },
      {
        profileId: "profiles:alex",
        name: "Alex Asks",
        imageUrl: "https://legacy/alex.jpg",
        interests: ["Film", "Music"],
        since: 310,
      },
    ]);
  });
});

describe("getMine — reads", () => {
  it("every read uses a real index, the member's RSVPs through eventRsvps.by_userId", async () => {
    // makeCtx throws on an unknown index, an out-of-order eq, or no index at all.
    const { reads } = await mine();
    expect(reads).toContain("eventRsvps.by_userId");
    expect(reads).toContain("projectMembers.by_userId_status");
    expect(reads).toContain("favorites.by_userId_type");
  });
});
