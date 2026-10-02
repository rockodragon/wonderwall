// Tests for Updates (updates.ts; spec: docs/features/desk-updates.md).
//
// Two layers, same shape as moderation.test.ts. First the pure rules — field
// limits, the action link, the starter copy. Then the real handlers on a
// small in-memory ctx, because the rules only matter if the wiring holds: a
// draft, archived or out-of-date Update must never reach a member, the
// audience must match who it says it does, and Send it now must go out once,
// in batches, to the right people.

import { describe, expect, it } from "vitest";
import { getFunctionName } from "convex/server";
import {
  ACTION_LABEL_MAX,
  BODY_MAX,
  NEW_FOR_DAYS_DEFAULT,
  NOTIFICATION_MESSAGE_MAX,
  OCT6_EVENT_TITLE,
  SEND_BATCH_SIZE,
  STARTER_UPDATES,
  TITLE_MAX,
  WELCOME_BODY,
  addStarterDrafts,
  adminList,
  archive,
  audienceCount,
  cardPath,
  cleanUpdateFields,
  click,
  deliverBatch,
  emailButton,
  generateImageUploadUrl,
  isInDates,
  isValidActionUrl,
  listMine,
  open,
  save,
  sendNow,
  setStatus,
  trimToWord,
  type UpdateFieldsInput,
} from "./updates";

const ADMIN = "users:admin";
const ANN = "users:ann"; // member of the community, an old account
const BEN = "users:ben"; // not a member, an old account
const NEW1 = "users:newbie"; // created yesterday
const COMMUNITY = "hostOrgs:garden";
const OTHER_COMMUNITY = "hostOrgs:other";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const NOW = Date.now();

// ——————————————————————————————————————————————————————————————
// Pure rules
// ——————————————————————————————————————————————————————————————

const fields = (over: Partial<UpdateFieldsInput> = {}): UpdateFieldsInput => ({
  title: "Welcome",
  body: "Here is what this is.",
  audience: "everyone",
  startsAt: NOW,
  order: 1,
  ...over,
});

/** The {code, reason} a pure rule throws. */
function codeOf(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    return (e as { data?: { code?: string } }).data?.code ?? "no-code";
  }
  return "did-not-throw";
}

describe("cleanUpdateFields", () => {
  it("trims the text and keeps a clean record", () => {
    const clean = cleanUpdateFields(fields({ title: "  Welcome  ", body: "  Hello  " }));
    expect(clean).toMatchObject({ title: "Welcome", body: "Hello", audience: "everyone", order: 1 });
    expect(clean.hostOrgId).toBeUndefined();
    expect(clean.newForDays).toBeUndefined();
  });

  it("needs a title and a body, within their limits", () => {
    expect(codeOf(() => cleanUpdateFields(fields({ title: "   " })))).toBe("title_required");
    expect(codeOf(() => cleanUpdateFields(fields({ title: "x".repeat(TITLE_MAX + 1) })))).toBe("title_too_long");
    expect(() => cleanUpdateFields(fields({ title: "x".repeat(TITLE_MAX) }))).not.toThrow();
    expect(codeOf(() => cleanUpdateFields(fields({ body: "" })))).toBe("body_required");
    expect(codeOf(() => cleanUpdateFields(fields({ body: "x".repeat(BODY_MAX + 1) })))).toBe("body_too_long");
    expect(() => cleanUpdateFields(fields({ body: "x".repeat(BODY_MAX) }))).not.toThrow();
  });

  it("sets the action label and link together, or not at all", () => {
    expect(codeOf(() => cleanUpdateFields(fields({ actionLabel: "Go" })))).toBe("action_incomplete");
    expect(codeOf(() => cleanUpdateFields(fields({ actionUrl: "/events" })))).toBe("action_incomplete");
    const both = cleanUpdateFields(fields({ actionLabel: "Go", actionUrl: "/events" }));
    expect(both).toMatchObject({ actionLabel: "Go", actionUrl: "/events" });
    // Blank strings from an empty form field mean "not set".
    const none = cleanUpdateFields(fields({ actionLabel: " ", actionUrl: "" }));
    expect(none.actionLabel).toBeUndefined();
    expect(none.actionUrl).toBeUndefined();
  });

  it("caps the action label", () => {
    const long = "x".repeat(ACTION_LABEL_MAX + 1);
    expect(codeOf(() => cleanUpdateFields(fields({ actionLabel: long, actionUrl: "/a" })))).toBe(
      "action_label_too_long",
    );
    expect(() =>
      cleanUpdateFields(fields({ actionLabel: "x".repeat(ACTION_LABEL_MAX), actionUrl: "/a" })),
    ).not.toThrow();
  });

  it("takes an in-app path or an https link, nothing else", () => {
    for (const ok of ["/events/abc", "/today?view=people", "/settings", "https://example.com/a?b=1"]) {
      expect(isValidActionUrl(ok), ok).toBe(true);
    }
    for (const bad of [
      "http://example.com",
      "//evil.example.com",
      "/\\evil.example.com",
      "javascript:alert(1)",
      "events/abc",
      "https://",
      "https:///nohost",
      "/with space",
      "https://exa mple.com",
      "mailto:a@b.co",
    ]) {
      expect(isValidActionUrl(bad), bad).toBe(false);
    }
    expect(codeOf(() => cleanUpdateFields(fields({ actionLabel: "Go", actionUrl: "ftp://x.co" })))).toBe(
      "action_url_invalid",
    );
  });

  it("wants a community for a community audience, and only then", () => {
    expect(codeOf(() => cleanUpdateFields(fields({ audience: "community" })))).toBe("community_required");
    expect(
      cleanUpdateFields(fields({ audience: "community", hostOrgId: COMMUNITY as any })).hostOrgId,
    ).toBe(COMMUNITY);
    expect(codeOf(() => cleanUpdateFields(fields({ audience: "everyone", hostOrgId: COMMUNITY as any })))).toBe(
      "community_not_allowed",
    );
  });

  it("gives a new-members audience 14 days unless told, within 1 to 90", () => {
    expect(cleanUpdateFields(fields({ audience: "new" })).newForDays).toBe(NEW_FOR_DAYS_DEFAULT);
    expect(NEW_FOR_DAYS_DEFAULT).toBe(14);
    expect(cleanUpdateFields(fields({ audience: "new", newForDays: 1 })).newForDays).toBe(1);
    expect(cleanUpdateFields(fields({ audience: "new", newForDays: 90 })).newForDays).toBe(90);
    for (const bad of [0, 91, -3, 2.5, NaN]) {
      expect(codeOf(() => cleanUpdateFields(fields({ audience: "new", newForDays: bad }))), String(bad)).toBe(
        "days_invalid",
      );
    }
    // Days mean nothing to the other audiences.
    expect(cleanUpdateFields(fields({ audience: "everyone", newForDays: 30 })).newForDays).toBeUndefined();
  });

  it("ends after it starts", () => {
    expect(codeOf(() => cleanUpdateFields(fields({ startsAt: NOW, endsAt: NOW })))).toBe("ends_before_start");
    expect(codeOf(() => cleanUpdateFields(fields({ startsAt: NOW, endsAt: NOW - 1 })))).toBe("ends_before_start");
    expect(cleanUpdateFields(fields({ startsAt: NOW, endsAt: NOW + 1 })).endsAt).toBe(NOW + 1);
    expect(cleanUpdateFields(fields()).endsAt).toBeUndefined();
    expect(codeOf(() => cleanUpdateFields(fields({ startsAt: NaN })))).toBe("starts_invalid");
    expect(codeOf(() => cleanUpdateFields(fields({ order: Infinity })))).toBe("order_invalid");
  });
});

describe("isInDates", () => {
  it("shows from startsAt, and until endsAt when there is one", () => {
    expect(isInDates({ startsAt: NOW + 1 }, NOW)).toBe(false);
    expect(isInDates({ startsAt: NOW }, NOW)).toBe(true);
    expect(isInDates({ startsAt: NOW - DAY }, NOW)).toBe(true);
    expect(isInDates({ startsAt: NOW - DAY, endsAt: NOW + 1 }, NOW)).toBe(true);
    expect(isInDates({ startsAt: NOW - DAY, endsAt: NOW }, NOW)).toBe(false);
  });
});

describe("trimToWord", () => {
  it("leaves a short body alone, on one line", () => {
    expect(trimToWord("Short.")).toBe("Short.");
    expect(trimToWord("Two\n\nlines")).toBe("Two lines");
  });

  it("cuts a long body at a word boundary, near 140", () => {
    const body = "word ".repeat(100).trim();
    const out = trimToWord(body);
    expect(out.endsWith("…")).toBe(true);
    expect(out.length).toBeLessThanOrEqual(NOTIFICATION_MESSAGE_MAX + 1);
    expect(out.slice(0, -1).split(" ").every((w) => w === "word")).toBe(true);
  });

  it("drops a trailing comma before the ellipsis", () => {
    const body = `${"a".repeat(138)}, tail words that run on and on`;
    expect(trimToWord(body)).toBe(`${"a".repeat(138)}…`);
  });

  it("hard-cuts one very long word", () => {
    expect(trimToWord("x".repeat(500))).toBe(`${"x".repeat(NOTIFICATION_MESSAGE_MAX)}…`);
  });
});

describe("emailButton", () => {
  it("sends an in-app action straight to its path", () => {
    expect(emailButton({ _id: "updates:1", actionLabel: "Meet people", actionUrl: "/today?view=people" })).toEqual({
      ctaText: "Meet people",
      ctaUrl: "/today?view=people",
    });
  });

  it("opens the card on the desk when there's no action or it leaves the site", () => {
    const card = { ctaText: "Open it", ctaUrl: cardPath("updates:1") };
    expect(card.ctaUrl).toBe("/today?card=update:updates:1");
    expect(emailButton({ _id: "updates:1" })).toEqual(card);
    expect(emailButton({ _id: "updates:1", actionLabel: "Read", actionUrl: "https://example.com/x" })).toEqual(card);
  });
});

describe("the starter drafts", () => {
  it("are four, in order, and each passes the same rules as a saved Update", () => {
    expect(STARTER_UPDATES.map((s) => s.order)).toEqual([1, 2, 3, 4]);
    for (const s of STARTER_UPDATES) {
      expect(() => cleanUpdateFields({ ...s, startsAt: NOW }), s.title).not.toThrow();
    }
  });

  it("start with the Welcome card, built from the two CLAIMS sentences", () => {
    expect(STARTER_UPDATES[0]).toMatchObject({
      title: "Welcome",
      body: WELCOME_BODY,
      actionLabel: "Meet people",
      actionUrl: "/today?view=people",
      audience: "everyone",
    });
    // claims.test.ts checks WELCOME_BODY against CLAIMS word for word.
  });

  it("send new members to their profile for 14 days, and link the Oct 6 event by title", () => {
    expect(STARTER_UPDATES[2]).toMatchObject({
      audience: "new",
      newForDays: 14,
      actionLabel: "Edit my profile",
      actionUrl: "/settings",
    });
    expect(STARTER_UPDATES[3]).toMatchObject({ linksToEvent: OCT6_EVENT_TITLE, actionUrl: "/events" });
  });
});

// ——————————————————————————————————————————————————————————————
// The real handlers, on an in-memory ctx
// ——————————————————————————————————————————————————————————————

type Row = Record<string, any> & { _id: string };

/** Just enough of Convex's ctx for updates.ts: db get / insert / patch
 * (undefined removes a field), and query(table).withIndex(name, q =>
 * q.eq/gt(..)) followed by collect / first / unique / take / paginate. Index
 * names aren't checked — the schema does that for real (and the local-backend
 * push proved it); what's under test is which rows the handlers ask for and
 * what they do with them. Scheduled functions are recorded in `scheduled`;
 * storage deletes in `deletedFiles`. */
function makeCtx(tables: Record<string, Row[]>, viewerId: string | null) {
  const store: Record<string, Row[]> = {};
  for (const [name, rows] of Object.entries(tables)) store[name] = rows.map((r) => ({ ...r }));
  const rowsOf = (table: string) => (store[table] ??= []);
  const deletedFiles: string[] = [];
  const scheduled: { name: string; args: any }[] = [];
  let counter = 100;

  const find = (id: string) => rowsOf(id.split(":")[0]).find((r) => r._id === id) ?? null;

  function query(table: string) {
    let rows = rowsOf(table).slice();
    const api = {
      withIndex(_name: string, build?: (q: any) => any) {
        const conds: [string, string, any][] = [];
        const q = {
          eq(field: string, value: unknown) {
            conds.push([field, "eq", value]);
            return q;
          },
          gt(field: string, value: unknown) {
            conds.push([field, "gt", value]);
            return q;
          },
        };
        build?.(q);
        rows = rows.filter((r) =>
          conds.every(([f, op, val]) => (op === "eq" ? r[f] === val : r[f] > val)),
        );
        return api;
      },
      async collect() {
        return rows.map((r) => ({ ...r }));
      },
      async take(n: number) {
        return rows.slice(0, n).map((r) => ({ ...r }));
      },
      async first() {
        return rows[0] ? { ...rows[0] } : null;
      },
      async unique() {
        if (rows.length > 1) throw new Error("unique() matched more than one row");
        return rows[0] ? { ...rows[0] } : null;
      },
      async paginate(opts: { numItems: number; cursor: string | null }) {
        const start = opts.cursor ? Number(opts.cursor) : 0;
        const page = rows.slice(start, start + opts.numItems).map((r) => ({ ...r }));
        const end = start + page.length;
        return { page, isDone: end >= rows.length, continueCursor: String(end) };
      },
    };
    return api;
  }

  const db = {
    query,
    async get(id: string) {
      const r = find(id);
      return r ? { ...r } : null;
    },
    async insert(table: string, doc: Record<string, unknown>) {
      const _id = `${table}:${++counter}`;
      const clean = Object.fromEntries(Object.entries(doc).filter(([, v]) => v !== undefined));
      rowsOf(table).push({ _id, _creationTime: Date.now(), ...clean });
      return _id;
    },
    async patch(id: string, patch: Record<string, unknown>) {
      const r = find(id);
      if (!r) throw new Error(`patch: no row ${id}`);
      for (const [k, v] of Object.entries(patch)) {
        if (v === undefined) delete r[k];
        else r[k] = v;
      }
    },
  };

  const ctx = {
    db,
    auth: { getUserIdentity: async () => (viewerId ? { subject: `${viewerId}|session` } : null) },
    storage: {
      getUrl: async (id: string) => `https://files.test/${id}`,
      generateUploadUrl: async () => "https://upload.test/abc",
      delete: async (id: string) => {
        deletedFiles.push(id);
      },
    },
    scheduler: {
      runAfter: async (_ms: number, fn: unknown, args: any) => {
        scheduled.push({ name: getFunctionName(fn as any), args });
      },
    },
    store,
    deletedFiles,
    scheduled,
  };
  return ctx as any;
}

/** The same database, seen by someone else. */
const as = (ctx: any, viewerId: string | null) => ({
  ...ctx,
  auth: { getUserIdentity: async () => (viewerId ? { subject: `${viewerId}|session` } : null) },
});

// A Convex-registered function keeps the handler you wrote on `_handler`.
const run = (fn: unknown, ctx: unknown, args: Record<string, unknown> = {}) =>
  (fn as { _handler: (c: unknown, a: unknown) => Promise<any> })._handler(ctx, args);

/** The error a handler throws: its {code, reason} payload, or the Error. */
async function thrown(p: Promise<unknown>): Promise<any> {
  try {
    await p;
  } catch (e) {
    return (e as { data?: unknown }).data ?? e;
  }
  throw new Error("expected the handler to throw");
}

const world = (extra: Record<string, Row[]> = {}): Record<string, Row[]> => ({
  users: [
    { _id: ADMIN, _creationTime: NOW - 400 * DAY, email: "admin@x.test" },
    { _id: ANN, _creationTime: NOW - 100 * DAY, email: "ann@x.test" },
    { _id: BEN, _creationTime: NOW - 60 * DAY, email: "ben@x.test" },
    { _id: NEW1, _creationTime: NOW - 1 * DAY, email: "newbie@x.test" },
  ],
  profiles: [{ _id: "profiles:admin", userId: ADMIN, name: "Ada", isAdmin: true }],
  hostOrgs: [
    { _id: COMMUNITY, name: "The Garden", slug: "garden", kind: "community" },
    { _id: OTHER_COMMUNITY, name: "Other", slug: "other", kind: "community" },
  ],
  communityMembers: [
    { _id: "communityMembers:1", hostOrgId: COMMUNITY, userId: ANN, role: "member", status: "active" },
    { _id: "communityMembers:2", hostOrgId: COMMUNITY, userId: BEN, role: "member", status: "pending" },
    { _id: "communityMembers:3", hostOrgId: OTHER_COMMUNITY, userId: BEN, role: "member", status: "active" },
  ],
  updates: [],
  updateReads: [],
  ...extra,
});

let seq = 0;
/** A published Update in dates for everyone, unless overridden. */
const update = (over: Partial<Row> = {}): Row => ({
  _id: `updates:u${++seq}`,
  title: `Update ${seq}`,
  body: "Something worth a look.",
  audience: "everyone",
  startsAt: NOW - HOUR,
  order: 1,
  status: "published",
  createdBy: ADMIN,
  createdAt: NOW - DAY,
  updatedAt: NOW - DAY,
  ...over,
});

const saveArgs = (over: Record<string, unknown> = {}) => ({
  title: "Welcome",
  body: "Here is what this is.",
  audience: "everyone",
  startsAt: NOW,
  order: 1,
  ...over,
});

const titles = (cards: { title: string }[]) => cards.map((c) => c.title);

describe("saving an Update", () => {
  it("is admin-only", async () => {
    const ctx = makeCtx(world(), ANN);
    await expect(run(save, ctx, saveArgs())).rejects.toThrow();
    expect(ctx.store.updates).toEqual([]);
    const signedOut = makeCtx(world(), null);
    expect(await thrown(run(save, signedOut, saveArgs()))).toMatchObject({ code: "not_signed_in" });
  });

  it("starts a new one as a draft, with the admin as its author", async () => {
    const ctx = makeCtx(world(), ADMIN);
    const id = await run(save, ctx, saveArgs({ title: "  Welcome " }));
    expect(ctx.store.updates).toHaveLength(1);
    expect(ctx.store.updates[0]).toMatchObject({
      _id: id,
      title: "Welcome",
      status: "draft",
      createdBy: ADMIN,
    });
    expect(ctx.store.updates[0].sentAt).toBeUndefined();
  });

  it("throws the rule's {code, reason} and writes nothing", async () => {
    const ctx = makeCtx(world(), ADMIN);
    const bad = [
      ["title_too_long", { title: "x".repeat(TITLE_MAX + 1) }],
      ["body_too_long", { body: "x".repeat(BODY_MAX + 1) }],
      ["action_incomplete", { actionLabel: "Go" }],
      ["action_label_too_long", { actionLabel: "x".repeat(25), actionUrl: "/a" }],
      ["action_url_invalid", { actionLabel: "Go", actionUrl: "http://x.co" }],
      ["community_required", { audience: "community" }],
      ["community_not_allowed", { hostOrgId: COMMUNITY }],
      ["days_invalid", { audience: "new", newForDays: 91 }],
      ["ends_before_start", { endsAt: NOW - DAY }],
      ["community_not_found", { audience: "community", hostOrgId: "hostOrgs:gone" }],
    ] as const;
    for (const [code, over] of bad) {
      const err = await thrown(run(save, ctx, saveArgs(over)));
      expect(err, code).toMatchObject({ code });
      expect(typeof err.reason).toBe("string");
    }
    expect(ctx.store.updates).toEqual([]);
  });

  it("stores 14 days for a new-members audience, and a community for a community one", async () => {
    const ctx = makeCtx(world(), ADMIN);
    await run(save, ctx, saveArgs({ audience: "new" }));
    await run(save, ctx, saveArgs({ title: "Garden", audience: "community", hostOrgId: COMMUNITY }));
    expect(ctx.store.updates[0]).toMatchObject({ audience: "new", newForDays: 14 });
    expect(ctx.store.updates[1]).toMatchObject({ audience: "community", hostOrgId: COMMUNITY });
  });

  it("edits in place: status stays, an omitted optional is cleared, a replaced picture is deleted", async () => {
    const existing = update({
      status: "published",
      actionLabel: "Go",
      actionUrl: "/events",
      imageStorageId: "_storage:old",
      endsAt: NOW + DAY,
    });
    const ctx = makeCtx(world({ updates: [existing] }), ADMIN);
    const id = await run(save, ctx, saveArgs({ updateId: existing._id, title: "Renamed", imageStorageId: "_storage:new" }));
    expect(id).toBe(existing._id);
    expect(ctx.store.updates).toHaveLength(1);
    const row = ctx.store.updates[0];
    expect(row).toMatchObject({ title: "Renamed", status: "published", imageStorageId: "_storage:new" });
    expect(row.actionLabel).toBeUndefined();
    expect(row.actionUrl).toBeUndefined();
    expect(row.endsAt).toBeUndefined();
    expect(ctx.deletedFiles).toEqual(["_storage:old"]);

    // Keeping the same picture deletes nothing.
    await run(save, ctx, saveArgs({ updateId: existing._id, imageStorageId: "_storage:new" }));
    expect(ctx.deletedFiles).toEqual(["_storage:old"]);
    // Dropping it does.
    await run(save, ctx, saveArgs({ updateId: existing._id }));
    expect(ctx.deletedFiles).toEqual(["_storage:old", "_storage:new"]);
  });

  it("won't edit one that isn't there", async () => {
    const ctx = makeCtx(world(), ADMIN);
    expect(await thrown(run(save, ctx, saveArgs({ updateId: "updates:gone" })))).toMatchObject({
      code: "not_found",
    });
  });
});

describe("setStatus, audienceCount and the upload URL", () => {
  it("changes the status, admins only", async () => {
    const u = update({ status: "draft" });
    const ctx = makeCtx(world({ updates: [u] }), ANN);
    await expect(run(setStatus, ctx, { updateId: u._id, status: "published" })).rejects.toThrow();
    const admin = as(ctx, ADMIN);
    await run(setStatus, admin, { updateId: u._id, status: "published" });
    expect(admin.store.updates[0].status).toBe("published");
    await run(setStatus, admin, { updateId: u._id, status: "archived" });
    expect(admin.store.updates[0].status).toBe("archived");
  });

  it("counts who matches each audience", async () => {
    const ctx = makeCtx(world(), ADMIN);
    expect(await run(audienceCount, ctx, { audience: "everyone" })).toBe(4);
    // Only ANN is an active member; BEN is pending here, active elsewhere.
    expect(await run(audienceCount, ctx, { audience: "community", hostOrgId: COMMUNITY })).toBe(1);
    expect(await run(audienceCount, ctx, { audience: "community", hostOrgId: OTHER_COMMUNITY })).toBe(1);
    expect(await run(audienceCount, ctx, { audience: "community" })).toBe(0);
    // Default 14 days: only the account made yesterday.
    expect(await run(audienceCount, ctx, { audience: "new" })).toBe(1);
    expect(await run(audienceCount, ctx, { audience: "new", newForDays: 70 })).toBe(2);
    expect(await run(audienceCount, ctx, { audience: "new", newForDays: 1 })).toBe(0);
    await expect(run(audienceCount, as(ctx, ANN), { audience: "everyone" })).rejects.toThrow();
  });

  it("hands an admin an upload URL", async () => {
    expect(await run(generateImageUploadUrl, makeCtx(world(), ADMIN))).toBe("https://upload.test/abc");
    await expect(run(generateImageUploadUrl, makeCtx(world(), ANN))).rejects.toThrow();
  });
});

describe("listMine", () => {
  it("is empty when signed out", async () => {
    const ctx = makeCtx(world({ updates: [update()] }), null);
    expect(await run(listMine, ctx)).toEqual([]);
  });

  it("returns the card shape, with the picture's URL and null for the unset", async () => {
    const withAll = update({
      title: "Full",
      imageStorageId: "_storage:pic",
      actionLabel: "Go",
      actionUrl: "/events",
    });
    const bare = update({ title: "Bare", order: 2 });
    const ctx = makeCtx(world({ updates: [withAll, bare] }), ANN);
    expect(await run(listMine, ctx)).toEqual([
      {
        _id: withAll._id,
        title: "Full",
        body: withAll.body,
        imageUrl: "https://files.test/_storage:pic",
        actionLabel: "Go",
        actionUrl: "/events",
      },
      { _id: bare._id, title: "Bare", body: bare.body, imageUrl: null, actionLabel: null, actionUrl: null },
    ]);
  });

  it("hides drafts, archived, not-yet-started and past-their-end Updates", async () => {
    const ctx = makeCtx(
      world({
        updates: [
          update({ title: "Live" }),
          update({ title: "Draft", status: "draft" }),
          update({ title: "Archived", status: "archived" }),
          update({ title: "Later", startsAt: NOW + HOUR }),
          update({ title: "Over", endsAt: NOW - 1 }),
          update({ title: "Until tomorrow", endsAt: NOW + DAY }),
        ],
      }),
      ANN,
    );
    expect(titles(await run(listMine, ctx)).sort()).toEqual(["Live", "Until tomorrow"]);
  });

  it("sorts by order, then the newest start", async () => {
    const ctx = makeCtx(
      world({
        updates: [
          update({ title: "C", order: 2, startsAt: NOW - 3 * DAY }),
          update({ title: "B older", order: 1, startsAt: NOW - 2 * DAY }),
          update({ title: "A", order: 0, startsAt: NOW - 5 * DAY }),
          update({ title: "B newer", order: 1, startsAt: NOW - HOUR }),
        ],
      }),
      ANN,
    );
    expect(titles(await run(listMine, ctx))).toEqual(["A", "B newer", "B older", "C"]);
  });

  it("matches the audience: everyone, a community's active members, new accounts", async () => {
    const tables = world({
      updates: [
        update({ title: "All", order: 1 }),
        update({ title: "Garden", order: 2, audience: "community", hostOrgId: COMMUNITY }),
        update({ title: "Other", order: 3, audience: "community", hostOrgId: OTHER_COMMUNITY }),
        update({ title: "Newbies", order: 4, audience: "new", newForDays: 14 }),
        update({ title: "Ninety days", order: 5, audience: "new", newForDays: 90 }),
      ],
    });
    const seenBy = async (who: string) => titles(await run(listMine, makeCtx(tables, who)));
    // Ann: in the Garden, an account from 100 days ago.
    expect(await seenBy(ANN)).toEqual(["All", "Garden"]);
    // Ben: pending in the Garden (not a member yet), active in Other, 60 days in.
    expect(await seenBy(BEN)).toEqual(["All", "Other", "Ninety days"]);
    // The new account: no community, but young.
    expect(await seenBy(NEW1)).toEqual(["All", "Newbies", "Ninety days"]);
    // A removed member isn't one.
    const removed = world({
      communityMembers: [
        { _id: "communityMembers:9", hostOrgId: COMMUNITY, userId: ANN, role: "member", status: "removed" },
      ],
      updates: [update({ title: "Garden", audience: "community", hostOrgId: COMMUNITY })],
    });
    expect(titles(await run(listMine, makeCtx(removed, ANN)))).toEqual([]);
  });

  it("measures 'new' from users._creationTime", async () => {
    const tables = world({
      users: [
        { _id: ANN, _creationTime: NOW - 13 * DAY + HOUR },
        { _id: BEN, _creationTime: NOW - 14 * DAY - HOUR },
      ],
      updates: [update({ title: "Newbies", audience: "new", newForDays: 14 })],
    });
    expect(titles(await run(listMine, makeCtx(tables, ANN)))).toEqual(["Newbies"]);
    expect(titles(await run(listMine, makeCtx(tables, BEN)))).toEqual([]);
  });

  it("hides what this person archived, and only for them", async () => {
    const a = update({ title: "Read" });
    const b = update({ title: "Unread", order: 2 });
    const tables = world({
      updates: [a, b],
      updateReads: [
        { _id: "updateReads:1", userId: ANN, updateId: a._id, openedAt: NOW - HOUR, archivedAt: NOW - HOUR },
        // Opened but not archived stays on the desk.
        { _id: "updateReads:2", userId: ANN, updateId: b._id, openedAt: NOW - HOUR },
        // Someone else archiving it doesn't touch Ann's view.
        { _id: "updateReads:3", userId: BEN, updateId: b._id, archivedAt: NOW - HOUR },
      ],
    });
    expect(titles(await run(listMine, makeCtx(tables, ANN)))).toEqual(["Unread"]);
    expect(titles(await run(listMine, makeCtx(tables, BEN)))).toEqual(["Read"]);
    expect(titles(await run(listMine, makeCtx(tables, NEW1)))).toEqual(["Read", "Unread"]);
  });
});

describe("open, click and archive", () => {
  const readsFor = (ctx: any, who: string, u: Row) =>
    ctx.store.updateReads.filter((r: Row) => r.userId === who && r.updateId === u._id);

  it("need a signed-in person and a real Update", async () => {
    const u = update();
    const signedOut = makeCtx(world({ updates: [u] }), null);
    for (const fn of [open, click, archive]) {
      expect(await thrown(run(fn, signedOut, { updateId: u._id }))).toMatchObject({ code: "not_signed_in" });
    }
    const ctx = makeCtx(world({ updates: [u] }), ANN);
    expect(await thrown(run(open, ctx, { updateId: "updates:gone" }))).toMatchObject({ code: "not_found" });
    expect(ctx.store.updateReads).toEqual([]);
  });

  it("open records openedAt on a new row, once", async () => {
    const u = update();
    const ctx = makeCtx(world({ updates: [u] }), ANN);
    await run(open, ctx, { updateId: u._id });
    const [row] = readsFor(ctx, ANN, u);
    expect(row.openedAt).toBeTypeOf("number");
    expect(row.clickedAt).toBeUndefined();
    expect(row.archivedAt).toBeUndefined();

    ctx.store.updateReads[0].openedAt = 1; // pretend it was a while ago
    await run(open, ctx, { updateId: u._id });
    expect(readsFor(ctx, ANN, u)).toHaveLength(1);
    expect(readsFor(ctx, ANN, u)[0].openedAt).toBe(1);
  });

  it("click records the click, and archives it", async () => {
    const u = update();
    const ctx = makeCtx(world({ updates: [u] }), ANN);
    await run(open, ctx, { updateId: u._id });
    ctx.store.updateReads[0].openedAt = 1;
    await run(click, ctx, { updateId: u._id });
    await run(click, ctx, { updateId: u._id });
    const rows = readsFor(ctx, ANN, u);
    expect(rows).toHaveLength(1);
    expect(rows[0].openedAt).toBe(1);
    expect(rows[0].clickedAt).toBeTypeOf("number");
    expect(rows[0].archivedAt).toBeTypeOf("number");
    expect(await run(listMine, ctx)).toEqual([]);
  });

  it("archive records archivedAt (and opened, if it never was) and keeps the first time", async () => {
    const u = update();
    const ctx = makeCtx(world({ updates: [u] }), ANN);
    await run(archive, ctx, { updateId: u._id });
    let [row] = readsFor(ctx, ANN, u);
    expect(row.archivedAt).toBeTypeOf("number");
    expect(row.openedAt).toBeTypeOf("number");
    expect(row.clickedAt).toBeUndefined();

    ctx.store.updateReads[0].archivedAt = 2;
    await run(archive, ctx, { updateId: u._id });
    await run(open, ctx, { updateId: u._id });
    [row] = readsFor(ctx, ANN, u);
    expect(readsFor(ctx, ANN, u)).toHaveLength(1);
    expect(row.archivedAt).toBe(2);
    expect(await run(listMine, ctx)).toEqual([]);
  });

  it("keeps one person's rows apart from another's", async () => {
    const u = update();
    const ctx = makeCtx(world({ updates: [u] }), ANN);
    await run(archive, ctx, { updateId: u._id });
    await run(open, as(ctx, BEN), { updateId: u._id });
    expect(ctx.store.updateReads).toHaveLength(2);
    expect(titles(await run(listMine, as(ctx, BEN)))).toEqual([u.title]);
    expect(await run(listMine, as(ctx, ANN))).toEqual([]);
  });
});

describe("Send it now", () => {
  const sendable = (over: Partial<Row> = {}) => update({ title: "Big news", ...over });

  /** Runs every delivery batch the scheduler has queued, as it would. */
  async function drain(ctx: any): Promise<number> {
    let batches = 0;
    for (;;) {
      const i = ctx.scheduled.findIndex((s: any) => s.name === "updates:deliverBatch");
      if (i === -1) return batches;
      const [next] = ctx.scheduled.splice(i, 1);
      await run(deliverBatch, ctx, next.args);
      batches++;
    }
  }

  const emails = (ctx: any) => ctx.scheduled.filter((s: any) => s.name === "emails:sendNotificationEmail");
  const notes = (ctx: any, who?: string) =>
    ctx.store.notifications.filter((n: Row) => (who ? n.userId === who : true));

  it("is admin-only", async () => {
    const u = sendable();
    const ctx = makeCtx(world({ updates: [u] }), ANN);
    await expect(run(sendNow, ctx, { updateId: u._id })).rejects.toThrow();
    expect(ctx.store.updates[0].sentAt).toBeUndefined();
    expect(ctx.scheduled).toEqual([]);
  });

  it("refuses an Update that isn't published", async () => {
    for (const status of ["draft", "archived"]) {
      const u = sendable({ status });
      const ctx = makeCtx(world({ updates: [u] }), ADMIN);
      expect(await thrown(run(sendNow, ctx, { updateId: u._id }))).toMatchObject({ code: "not_published" });
      expect(ctx.store.updates[0].sentAt).toBeUndefined();
      expect(ctx.scheduled).toEqual([]);
    }
  });

  it("refuses a second send", async () => {
    const u = sendable();
    const ctx = makeCtx(world({ updates: [u] }), ADMIN);
    expect(await run(sendNow, ctx, { updateId: u._id })).toEqual({ recipients: 4 });
    expect(ctx.store.updates[0]).toMatchObject({ sentCount: 4 });
    expect(ctx.store.updates[0].sentAt).toBeTypeOf("number");
    expect(await thrown(run(sendNow, ctx, { updateId: u._id }))).toMatchObject({ code: "already_sent" });
    // Only the first send queued anything.
    expect(ctx.scheduled.filter((s: any) => s.name === "updates:deliverBatch")).toHaveLength(1);
  });

  it("marks a send to nobody as sent, and schedules nothing", async () => {
    const u = sendable({ audience: "community", hostOrgId: "hostOrgs:other" });
    const ctx = makeCtx(world({ updates: [u], communityMembers: [] }), ADMIN);
    expect(await run(sendNow, ctx, { updateId: u._id })).toEqual({ recipients: 0 });
    expect(ctx.store.updates[0].sentAt).toBeTypeOf("number");
    expect(ctx.scheduled).toEqual([]);
  });

  it("gives each person one notification and one email, shaped as the spec says", async () => {
    const u = sendable({
      title: "Meet people",
      body: "Ten new <people> joined & want to say hi.",
      actionLabel: "Go see",
      actionUrl: "/today?view=people",
    });
    const ctx = makeCtx(world({ updates: [u] }), ADMIN);
    await run(sendNow, ctx, { updateId: u._id });
    expect(await drain(ctx)).toBe(1);

    expect(notes(ctx)).toHaveLength(4);
    expect(notes(ctx, ANN)).toEqual([
      expect.objectContaining({
        userId: ANN,
        type: "update",
        title: "Meet people",
        message: "Ten new <people> joined & want to say hi.",
        linkUrl: `/today?card=update:${u._id}`,
      }),
    ]);
    expect(notes(ctx, ANN)[0].createdAt).toBeTypeOf("number");

    const sent = emails(ctx);
    expect(sent).toHaveLength(4);
    expect(sent.map((e: any) => e.args.to).sort()).toEqual([
      "admin@x.test",
      "ann@x.test",
      "ben@x.test",
      "newbie@x.test",
    ]);
    expect(sent[0].args).toMatchObject({
      subject: "Meet people",
      heading: "Meet people",
      body: "Ten new &lt;people&gt; joined &amp; want to say hi.",
      ctaText: "Go see",
      ctaUrl: "/today?view=people",
      category: "announcements",
    });
    expect(sent[0].args.unsubscribeToken).toBeTypeOf("string");
  });

  it("points the email at the card when there's no in-app action, and trims a long notification", async () => {
    const body = "word ".repeat(100).trim();
    const u = sendable({ body });
    const ctx = makeCtx(world({ updates: [u] }), ADMIN);
    await run(sendNow, ctx, { updateId: u._id });
    await drain(ctx);
    expect(emails(ctx)[0].args).toMatchObject({ ctaText: "Open it", ctaUrl: `/today?card=update:${u._id}` });
    const message = notes(ctx, ANN)[0].message;
    expect(message.endsWith("…")).toBe(true);
    expect(message.length).toBeLessThanOrEqual(NOTIFICATION_MESSAGE_MAX + 1);
  });

  it("skips the email for someone who opted out of announcements, but still notifies them", async () => {
    const u = sendable();
    const ctx = makeCtx(
      world({
        updates: [u],
        emailPreferences: [
          {
            _id: "emailPreferences:1",
            userId: BEN,
            activity: true,
            digest: true,
            announcements: false,
            unsubscribeToken: "tok",
            updatedAt: 0,
          },
        ],
      }),
      ADMIN,
    );
    await run(sendNow, ctx, { updateId: u._id });
    await drain(ctx);
    expect(notes(ctx, BEN)).toHaveLength(1);
    expect(emails(ctx).map((e: any) => e.args.to)).not.toContain("ben@x.test");
    expect(emails(ctx)).toHaveLength(3);
  });

  it("goes out in batches of 50, each person once", async () => {
    const many: Row[] = Array.from({ length: 120 }, (_, i) => ({
      _id: `users:bulk${i}`,
      _creationTime: NOW - 500 * DAY + i,
      email: `bulk${i}@x.test`,
    }));
    const u = sendable();
    const ctx = makeCtx(world({ users: many, updates: [u] }), ADMIN);
    expect(await run(sendNow, ctx, { updateId: u._id })).toEqual({ recipients: 120 });
    expect(SEND_BATCH_SIZE).toBe(50);

    // Nothing has been delivered yet; the first batch is queued.
    expect(ctx.store.notifications ?? []).toHaveLength(0);

    const first = ctx.scheduled.shift();
    await run(deliverBatch, ctx, first.args);
    expect(notes(ctx)).toHaveLength(50);
    expect(ctx.scheduled.filter((s: any) => s.name === "updates:deliverBatch")).toHaveLength(1);

    expect(await drain(ctx)).toBe(2);
    expect(notes(ctx)).toHaveLength(120);
    expect(new Set(notes(ctx).map((n: Row) => n.userId)).size).toBe(120);
    expect(emails(ctx)).toHaveLength(120);
  });

  it("sends a community Update to its active members only", async () => {
    const u = sendable({ audience: "community", hostOrgId: COMMUNITY });
    const ctx = makeCtx(world({ updates: [u] }), ADMIN);
    expect(await run(sendNow, ctx, { updateId: u._id })).toEqual({ recipients: 1 });
    await drain(ctx);
    expect(notes(ctx).map((n: Row) => n.userId)).toEqual([ANN]);
  });

  it("sends a new-members Update to accounts younger than its days, measured from the send", async () => {
    const u = sendable({ audience: "new", newForDays: 14 });
    const ctx = makeCtx(world({ updates: [u] }), ADMIN);
    expect(await run(sendNow, ctx, { updateId: u._id })).toEqual({ recipients: 1 });
    await drain(ctx);
    expect(notes(ctx).map((n: Row) => n.userId)).toEqual([NEW1]);
  });

  it("delivers nothing for an Update that was never sent", async () => {
    const u = sendable();
    const ctx = makeCtx(world({ updates: [u] }), ADMIN);
    await run(deliverBatch, ctx, { updateId: u._id, cursor: null });
    expect(ctx.store.notifications ?? []).toHaveLength(0);
    expect(ctx.scheduled).toEqual([]);
  });
});

describe("adminList", () => {
  it("is admin-only", async () => {
    await expect(run(adminList, makeCtx(world(), ANN))).rejects.toThrow();
    expect(await thrown(run(adminList, makeCtx(world(), null)))).toMatchObject({ code: "not_signed_in" });
  });

  it("lists every Update, drafts and archived too, with image URL and stats", async () => {
    const a = update({ title: "A", order: 1, imageStorageId: "_storage:a" });
    const b = update({ title: "B", order: 2, status: "draft", audience: "community", hostOrgId: COMMUNITY });
    const c = update({ title: "C", order: 3, status: "archived", audience: "new", newForDays: 14 });
    const reads = (id: string, userId: string, f: Record<string, number>): Row => ({
      _id: `updateReads:${id}`,
      userId,
      updateId: a._id,
      ...f,
    });
    const ctx = makeCtx(
      world({
        updates: [c, a, b],
        updateReads: [
          reads("1", ANN, { openedAt: 1, clickedAt: 2, archivedAt: 2 }),
          reads("2", BEN, { openedAt: 1, archivedAt: 3 }),
          reads("3", NEW1, { openedAt: 1 }),
          { _id: "updateReads:4", userId: ANN, updateId: b._id, openedAt: 1 },
        ],
      }),
      ADMIN,
    );
    const list = await run(adminList, ctx);
    expect(list.map((u: Row) => u.title)).toEqual(["A", "B", "C"]);
    expect(list[0]).toMatchObject({
      title: "A",
      status: "published",
      imageUrl: "https://files.test/_storage:a",
      opened: 3,
      clicked: 1,
      archived: 2,
      audienceNow: 4,
    });
    expect(list[1]).toMatchObject({ title: "B", status: "draft", imageUrl: null, opened: 1, clicked: 0, archived: 0, audienceNow: 1 });
    expect(list[2]).toMatchObject({ title: "C", opened: 0, clicked: 0, archived: 0, audienceNow: 1 });
  });
});

describe("addStarterDrafts", () => {
  const eventWorld = (events: Row[]) => world({ events });

  it("is admin-only", async () => {
    const ctx = makeCtx(eventWorld([]), ANN);
    await expect(run(addStarterDrafts, ctx)).rejects.toThrow();
    expect(ctx.store.updates).toEqual([]);
  });

  it("adds the four drafts, then adds nothing the second time", async () => {
    const ctx = makeCtx(eventWorld([]), ADMIN);
    expect(await run(addStarterDrafts, ctx)).toEqual({ added: 4 });
    expect(ctx.store.updates).toHaveLength(4);
    for (const row of ctx.store.updates) {
      expect(row.status).toBe("draft");
      expect(row.createdBy).toBe(ADMIN);
      expect(row.sentAt).toBeUndefined();
    }
    expect(await run(addStarterDrafts, ctx)).toEqual({ added: 0 });
    expect(ctx.store.updates).toHaveLength(4);
  });

  it("matches by title, so a renamed or edited draft isn't recreated and a missing one is", async () => {
    const ctx = makeCtx(eventWorld([]), ADMIN);
    await run(addStarterDrafts, ctx);
    ctx.store.updates.splice(1, 1); // "Your tools are in the corner" is gone
    ctx.store.updates[0].body = "Edited."; // Welcome edited, same title
    expect(await run(addStarterDrafts, ctx)).toEqual({ added: 1 });
    expect(ctx.store.updates.map((u: Row) => u.title).sort()).toEqual(
      STARTER_UPDATES.map((s) => s.title).sort(),
    );
    expect(ctx.store.updates.find((u: Row) => u.title === "Welcome").body).toBe("Edited.");
  });

  it("writes the spec's four, each as a record that would pass save", async () => {
    const ctx = makeCtx(eventWorld([]), ADMIN);
    await run(addStarterDrafts, ctx);
    const byTitle = (t: string) => ctx.store.updates.find((u: Row) => u.title === t);
    expect(byTitle("Welcome")).toMatchObject({
      body: WELCOME_BODY,
      actionLabel: "Meet people",
      actionUrl: "/today?view=people",
      audience: "everyone",
      order: 1,
    });
    expect(byTitle("Your tools are in the corner")).toMatchObject({ audience: "everyone", order: 2 });
    expect(byTitle("Your tools are in the corner").actionUrl).toBeUndefined();
    expect(byTitle("Add a photo and a few lines")).toMatchObject({
      audience: "new",
      newForDays: 14,
      actionLabel: "Edit my profile",
      actionUrl: "/settings",
      order: 3,
    });
    for (const row of ctx.store.updates) {
      expect(() =>
        cleanUpdateFields({
          title: row.title,
          body: row.body,
          actionLabel: row.actionLabel,
          actionUrl: row.actionUrl,
          audience: row.audience,
          hostOrgId: row.hostOrgId,
          newForDays: row.newForDays,
          startsAt: row.startsAt,
          endsAt: row.endsAt,
          order: row.order,
        }),
      ).not.toThrow();
    }
  });

  it("links the Oct 6 draft to /events when the event doesn't exist yet", async () => {
    const ctx = makeCtx(eventWorld([]), ADMIN);
    await run(addStarterDrafts, ctx);
    const oct6 = ctx.store.updates.find((u: Row) => u.title === "Oct 6: What is this and why?");
    expect(oct6).toMatchObject({ actionLabel: "See the event", actionUrl: "/events", audience: "everyone", order: 4 });
    expect(oct6.endsAt).toBeUndefined();
  });

  it("finds the event by title (any case), links it, and ends the day after", async () => {
    const when = NOW + 5 * DAY;
    const ctx = makeCtx(
      eventWorld([
        { _id: "events:other", title: "Open mic", datetime: when, status: "published" },
        { _id: "events:draft", title: OCT6_EVENT_TITLE, datetime: when, status: "draft" },
        { _id: "events:oct6", title: "what is THIS and why?", datetime: when, status: "published" },
      ]),
      ADMIN,
    );
    await run(addStarterDrafts, ctx);
    const oct6 = ctx.store.updates.find((u: Row) => u.title === "Oct 6: What is this and why?");
    expect(oct6.actionUrl).toBe("/events/events:oct6");
    expect(oct6.endsAt).toBe(when + DAY);
  });
});
