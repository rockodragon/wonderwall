// The message report (messageReport.ts): counts only. The real query against
// the in-memory ctx (test-support/convexContext.ts), and the pure rules on
// their own.

import { ConvexError } from "convex/values";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeCtx, run, type Row } from "../../test-support/convexContext";
import { checkIndexes } from "../../test-support/indexChecks";
import {
  buildReport,
  depthBucketOf,
  getMessageReport,
  median,
  responseOf,
  startKindOf,
  summarizeConversation,
  WEEK_MS,
  weekStartOf,
  windowStartOf,
} from "./messageReport";

// Tuesday 2026-11-03, noon UTC. This week starts Monday 2026-11-02.
const NOW = Date.UTC(2026, 10, 3, 12);
const THIS_WEEK = weekStartOf(NOW);
const LAST_WEEK = THIS_WEEK - WEEK_MS;
const HOUR = 60 * 60 * 1000;
const MINUTE = 60 * 1000;

const ADMIN = "users:rick";
const ANA = "users:ana";
const BEN = "users:ben";
const CAL = "users:cal";
const DEE = "users:dee";
const HOST = "users:host";
const GUEST = "users:guest";

// Private words and ids that must never come back.
const SECRETS = [
  "meet me behind the gallery",
  "sure, thursday works",
  "do you have a minute about the mural",
  "welcome to the garden",
  "I would love the bass role",
  "see you at the show",
  "old note from the spring",
  "hello there",
];

let counter = 0;
function message(conversationId: string, senderId: string, createdAt: number, content: string, extra: Record<string, unknown> = {}): Row {
  return { _id: `messages:m${++counter}`, conversationId, senderId, content, createdAt, ...extra };
}
function conversation(id: string, participants: string[], lastMessageAt: number, extra: Record<string, unknown> = {}): Row {
  return { _id: id, participants, lastMessageAt, createdAt: 1, ...extra };
}

function world(opts: { viewer?: string; conversations?: Row[]; messages?: Row[]; extra?: Record<string, Row[]> } = {}) {
  return makeCtx(
    {
      users: [ADMIN, ANA, BEN, CAL, DEE, HOST, GUEST].map((id) => ({ _id: id })),
      profiles: [
        { _id: "profiles:rick", userId: ADMIN, name: "Rick Moy", isAdmin: true },
        { _id: "profiles:ana", userId: ANA, name: "Ana Vega" },
        { _id: "profiles:ben", userId: BEN, name: "Ben Ortiz" },
        { _id: "profiles:cal", userId: CAL, name: "Cal Reyes", isAdmin: false },
        { _id: "profiles:dee", userId: DEE, name: "Dee Park" },
        { _id: "profiles:host", userId: HOST, name: "Hazel Host" },
        { _id: "profiles:guest", userId: GUEST, name: "Gus Guest" },
      ],
      conversations: opts.conversations ?? [],
      messages: opts.messages ?? [],
      ...opts.extra,
    },
    opts.viewer ?? ADMIN,
  );
}

beforeEach(() => {
  counter = 0;
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

// Three conversations over two weeks:
//   c1  Ana -> Ben last Tuesday, Ben answers 90 minutes later, Ana writes again. Member to member.
//   c2  Rick (admin) -> Cal last Wednesday, read, never answered.
//   c3  Ben -> Dee this Monday about a project role, not read.
function threeConversations() {
  const c1 = "conversations:c1";
  const c2 = "conversations:c2";
  const c3 = "conversations:c3";
  const tue = LAST_WEEK + 24 * HOUR + 10 * HOUR;
  const wed = LAST_WEEK + 48 * HOUR + 9 * HOUR;
  const mon = THIS_WEEK + 8 * HOUR;
  return {
    conversations: [
      conversation(c1, [ANA, BEN], tue + 3 * HOUR),
      conversation(c2, [ADMIN, CAL], wed),
      conversation(c3, [BEN, DEE], mon),
    ],
    messages: [
      message(c1, ANA, tue, SECRETS[0], { readAt: tue + 80 * MINUTE }),
      message(c1, BEN, tue + 90 * MINUTE, SECRETS[1]),
      message(c1, ANA, tue + 3 * HOUR, SECRETS[2]),
      message(c2, ADMIN, wed, SECRETS[3], { readAt: wed + HOUR }),
      message(c3, BEN, mon, SECRETS[4], { projectMemberId: "projectMembers:bass" }),
    ],
  };
}

describe("getMessageReport access", () => {
  it("refuses someone who is not an admin", async () => {
    const ctx = world({ viewer: CAL });
    try {
      await run(getMessageReport, ctx, {});
      throw new Error("expected a refusal");
    } catch (err) {
      expect(err).toBeInstanceOf(ConvexError);
      expect((err as ConvexError<{ code: string }>).data.code).toBe("forbidden");
    }
  });

  it("refuses someone who is signed out", async () => {
    const ctx = world();
    ctx.auth.getUserIdentity = async () => null;
    await expect(run(getMessageReport, ctx, {})).rejects.toBeInstanceOf(ConvexError);
  });
});

describe("getMessageReport weeks", () => {
  it("gives 13 weeks, oldest first, starting on a Monday in UTC", async () => {
    const report = await run(getMessageReport, world(), {});
    expect(report.weeks).toHaveLength(13);
    expect(report.weeks[12].weekStart).toBe(THIS_WEEK);
    expect(report.weeks[0].weekStart).toBe(THIS_WEEK - 12 * WEEK_MS);
    expect(new Date(THIS_WEEK).getUTCDay()).toBe(1);
    expect(new Date(THIS_WEEK).getUTCHours()).toBe(0);
    for (let i = 1; i < 13; i += 1) expect(report.weeks[i].weekStart - report.weeks[i - 1].weekStart).toBe(WEEK_MS);
    expect(report.weeks.every((w: any) => w.messages === 0 && w.medianReplyMinutes === null)).toBe(true);
  });

  it("buckets messages, starts, replies and the median wait by week", async () => {
    const ctx = world(threeConversations());
    const report = await run(getMessageReport, ctx, {});
    const last = report.weeks[11];
    const current = report.weeks[12];
    expect(last).toEqual({
      weekStart: LAST_WEEK,
      messages: 4,
      conversationsStarted: 2,
      senders: 3, // Ana, Ben and Rick
      startedReplied: 1,
      medianReplyMinutes: 90,
    });
    expect(current).toEqual({
      weekStart: THIS_WEEK,
      messages: 1,
      conversationsStarted: 1,
      senders: 1,
      startedReplied: 0,
      medianReplyMinutes: null,
    });
    expect(report.weeks.slice(0, 11).every((w: any) => w.messages === 0 && w.conversationsStarted === 0)).toBe(true);
  });

  it("takes the median of the waits when several conversations were answered", async () => {
    const c = ["conversations:a", "conversations:b", "conversations:c"];
    const t = LAST_WEEK + 5 * HOUR;
    const ctx = world({
      conversations: c.map((id) => conversation(id, [ANA, BEN], t + 10 * HOUR)),
      messages: [
        message(c[0], ANA, t, "hello there"), message(c[0], BEN, t + 10 * MINUTE, "hi"),
        message(c[1], ANA, t, "hello there"), message(c[1], BEN, t + 30 * MINUTE, "hi"),
        message(c[2], ANA, t, "hello there"), message(c[2], BEN, t + 5 * HOUR, "hi"),
      ],
    });
    const report = await run(getMessageReport, ctx, {});
    expect(report.weeks[11]).toMatchObject({ conversationsStarted: 3, startedReplied: 3, medianReplyMinutes: 30 });
  });

  it("counts a conversation that started before the window toward messages and senders, not starts", async () => {
    const c = "conversations:old";
    const before = windowStartOf(NOW) - 3 * WEEK_MS;
    const ctx = world({
      conversations: [conversation(c, [ANA, BEN], THIS_WEEK + HOUR)],
      messages: [
        message(c, ANA, before, SECRETS[6]),
        message(c, BEN, before + HOUR, "hello there"),
        message(c, ANA, THIS_WEEK + HOUR, "hello there"),
      ],
    });
    const report = await run(getMessageReport, ctx, {});
    expect(report.weeks[12]).toMatchObject({ messages: 1, senders: 1, conversationsStarted: 0, startedReplied: 0 });
    expect(report.kinds.reduce((sum: number, k: any) => sum + k.started, 0)).toBe(0);
    expect(report.responses).toEqual({ replied: 0, readNoReply: 0, unread: 0 });
    expect(report.depth).toEqual({ one: 0, twoToThree: 0, fourToNine: 0, tenPlus: 0 });
  });

  it("leaves out a conversation whose last message is before the window", async () => {
    const c = "conversations:stale";
    const long = windowStartOf(NOW) - 5 * WEEK_MS;
    const ctx = world({
      conversations: [conversation(c, [ANA, BEN], long)],
      messages: [message(c, ANA, long, "hello there")],
    });
    const report = await run(getMessageReport, ctx, {});
    expect(report.weeks.every((w: any) => w.messages === 0)).toBe(true);
  });

  it("totals the last 4 full weeks and the 4 before, leaving out the current week", async () => {
    const ctx = world(threeConversations());
    const report = await run(getMessageReport, ctx, {});
    expect(report.periods.recent).toEqual({ messages: 4, conversationsStarted: 2, startedReplied: 1, medianReplyMinutes: 90 });
    expect(report.periods.before).toEqual({ messages: 0, conversationsStarted: 0, startedReplied: 0, medianReplyMinutes: null });
  });
});

describe("getMessageReport reads", () => {
  it("reads only through the window indexes, never a whole table", async () => {
    const ctx = world(threeConversations());
    const { scans } = checkIndexes(ctx);
    await run(getMessageReport, ctx, {});
    expect(scans).toEqual([]);
  });

  it("reads only the window: a conversation from before it is never opened", async () => {
    const c = "conversations:stale";
    const long = windowStartOf(NOW) - 5 * WEEK_MS;
    const ctx = world({ conversations: [conversation(c, [ANA, BEN], long)], messages: [message(c, ANA, long, "hello there")] });
    const tables: string[] = [];
    const query = ctx.db.query;
    ctx.db.query = (table: string) => (tables.push(table), query(table));
    await run(getMessageReport, ctx, {});
    expect(tables).not.toContain("messages");
  });
});

describe("getMessageReport kinds", () => {
  const kinds = (report: any) => Object.fromEntries(report.kinds.map((k: any) => [k.kind, k]));

  it("sorts the three conversations by what started them", async () => {
    const report = await run(getMessageReport, world(threeConversations()), {});
    const byKind = kinds(report);
    expect(report.kinds.map((k: any) => k.kind)).toEqual(["project", "host", "admin", "member"]);
    expect(byKind.member).toEqual({ kind: "member", started: 1, replied: 1, medianReplyMinutes: 90 });
    expect(byKind.admin).toEqual({ kind: "admin", started: 1, replied: 0, medianReplyMinutes: null });
    expect(byKind.project).toEqual({ kind: "project", started: 1, replied: 0, medianReplyMinutes: null });
    expect(byKind.host).toEqual({ kind: "host", started: 0, replied: 0, medianReplyMinutes: null });
  });

  it("calls a conversation a project one when it has project members, even if the first message has none", async () => {
    const c = "conversations:proj";
    const t = LAST_WEEK + HOUR;
    const ctx = world({
      conversations: [conversation(c, [ANA, BEN], t, { projectMemberIds: ["projectMembers:drums"] })],
      messages: [message(c, ANA, t, "hello there")],
    });
    expect(kinds(await run(getMessageReport, ctx, {})).project.started).toBe(1);
  });

  it("calls a host writing to their own guest a host one, and checks it before admin", async () => {
    const c = "conversations:host";
    const t = LAST_WEEK + HOUR;
    const ctx = world({
      conversations: [conversation(c, [HOST, GUEST], t)],
      messages: [message(c, HOST, t, SECRETS[5])],
      extra: {
        events: [{ _id: "events:show", organizerId: HOST, title: "Show", status: "published" }],
        eventRsvps: [{ _id: "eventRsvps:1", eventId: "events:show", userId: GUEST, email: "g@x.com" }],
      },
    });
    ctx.store.profiles.find((p: Row) => p.userId === HOST)!.isAdmin = true;
    const byKind = kinds(await run(getMessageReport, ctx, {}));
    expect(byKind.host.started).toBe(1);
    expect(byKind.admin.started).toBe(0);
  });

  it("does not call a message to a stranger a host one", async () => {
    const c = "conversations:cold";
    const t = LAST_WEEK + HOUR;
    const ctx = world({
      conversations: [conversation(c, [HOST, DEE], t)],
      messages: [message(c, HOST, t, "hello there")],
      extra: {
        events: [{ _id: "events:show", organizerId: HOST, title: "Show", status: "published" }],
        eventRsvps: [{ _id: "eventRsvps:1", eventId: "events:show", userId: GUEST, email: "g@x.com" }],
      },
    });
    const byKind = kinds(await run(getMessageReport, ctx, {}));
    expect(byKind.host.started).toBe(0);
    expect(byKind.member.started).toBe(1);
  });
});

describe("getMessageReport responses and depth", () => {
  it("splits first messages into answered, read with no answer, and not read", async () => {
    const report = await run(getMessageReport, world(threeConversations()), {});
    expect(report.responses).toEqual({ replied: 1, readNoReply: 1, unread: 1 });
  });

  it("buckets conversations by how many messages they ran", async () => {
    const ids = ["one", "two", "three", "four", "nine", "ten"].map((n) => `conversations:${n}`);
    const counts = [1, 2, 3, 4, 9, 10];
    const t = LAST_WEEK + HOUR;
    const messages: Row[] = [];
    ids.forEach((id, i) => {
      // Alternating senders; the first message is from Ana.
      for (let n = 0; n < counts[i]; n += 1) messages.push(message(id, n % 2 === 0 ? ANA : BEN, t + n * MINUTE, "hello there"));
    });
    const ctx = world({ conversations: ids.map((id, i) => conversation(id, [ANA, BEN], t + counts[i] * MINUTE)), messages });
    const report = await run(getMessageReport, ctx, {});
    expect(report.depth).toEqual({ one: 1, twoToThree: 2, fourToNine: 2, tenPlus: 1 });
  });
});

describe("getMessageReport privacy", () => {
  it("returns numbers and dates only: no message text, names or ids", async () => {
    const ctx = world(threeConversations());
    ctx.store.users[1].email = "ana-private@example.com";
    const report = await run(getMessageReport, ctx, {});
    const json = JSON.stringify(report);
    for (const text of SECRETS) expect(json).not.toContain(text);
    for (const id of [ADMIN, ANA, BEN, CAL, DEE, HOST, GUEST, "conversations:c1", "conversations:c2", "conversations:c3", "messages:", "projectMembers:"]) {
      expect(json).not.toContain(id);
    }
    for (const name of ["Rick", "Ana", "Ben", "Cal", "Dee", "Vega", "ana-private"]) expect(json).not.toContain(name);
    // Every leaf is a number, a null or a kind name.
    const leaves: unknown[] = [];
    const walk = (value: unknown) => {
      if (value && typeof value === "object") Object.values(value).forEach(walk);
      else leaves.push(value);
    };
    walk(report);
    expect(leaves.every((leaf) => leaf === null || typeof leaf === "number" || ["project", "host", "admin", "member"].includes(leaf as string))).toBe(true);
  });
});

describe("the pure rules", () => {
  it("starts weeks on Monday 00:00 UTC", () => {
    expect(weekStartOf(Date.UTC(2026, 10, 2))).toBe(Date.UTC(2026, 10, 2));
    expect(weekStartOf(Date.UTC(2026, 10, 8, 23, 59, 59))).toBe(Date.UTC(2026, 10, 2));
    expect(weekStartOf(Date.UTC(2026, 10, 9))).toBe(Date.UTC(2026, 10, 9));
    expect(weekStartOf(Date.UTC(2026, 0, 1))).toBe(Date.UTC(2025, 11, 29));
    expect(windowStartOf(NOW)).toBe(Date.UTC(2026, 7, 10));
  });

  it("finds the median", () => {
    expect(median([])).toBeNull();
    expect(median([7])).toBe(7);
    expect(median([9, 1, 5])).toBe(5);
    expect(median([10, 20, 30, 40])).toBe(25);
  });

  it("checks the kinds in order and stops at the first match", async () => {
    const calls: string[] = [];
    const host = (answer: boolean) => async () => (calls.push("host"), answer);
    const admin = (answer: boolean) => async () => (calls.push("admin"), answer);
    expect(await startKindOf({ project: true, host: host(true), admin: admin(true) })).toBe("project");
    expect(calls).toEqual([]);
    expect(await startKindOf({ project: false, host: host(true), admin: admin(true) })).toBe("host");
    expect(calls).toEqual(["host"]);
    expect(await startKindOf({ project: false, host: host(false), admin: admin(true) })).toBe("admin");
    expect(await startKindOf({ project: false, host: host(false), admin: admin(false) })).toBe("member");
  });

  it("tells answered, read and not read apart", () => {
    expect(responseOf({ firstReplyAt: 5, starterRead: false })).toBe("replied");
    expect(responseOf({ firstReplyAt: null, starterRead: true })).toBe("readNoReply");
    expect(responseOf({ firstReplyAt: null, starterRead: false })).toBe("unread");
  });

  it("buckets depth at the edges", () => {
    expect([1, 2, 3, 4, 9, 10, 40].map(depthBucketOf)).toEqual(["one", "twoToThree", "twoToThree", "fourToNine", "fourToNine", "tenPlus", "tenPlus"]);
  });

  it("reads a conversation's start, first reply and depth from its messages", () => {
    const rows = [
      { createdAt: 300, senderId: "b", aboutProject: false },
      { createdAt: 100, senderId: "a", readAt: 150, aboutProject: true },
      { createdAt: 200, senderId: "a", aboutProject: false },
    ];
    expect(summarizeConversation(rows)).toEqual({
      starterId: "a",
      startedAt: 100,
      messageCount: 3,
      firstReplyAt: 300,
      starterRead: true,
      firstAboutProject: true,
    });
    expect(summarizeConversation([])).toBeNull();
  });

  it("builds the whole report from plain numbers", () => {
    const report = buildReport(
      NOW,
      [{ createdAt: LAST_WEEK + 1, senderId: "a" }, { createdAt: LAST_WEEK + 2, senderId: "a" }, { createdAt: THIS_WEEK + 1, senderId: "b" }],
      [{ startedAt: LAST_WEEK + 1, kind: "member", messageCount: 2, firstReplyAt: LAST_WEEK + 1 + 45 * MINUTE, starterRead: true }],
    );
    expect(report.weeks[11]).toMatchObject({ messages: 2, senders: 1, conversationsStarted: 1, startedReplied: 1, medianReplyMinutes: 45 });
    expect(report.weeks[12]).toMatchObject({ messages: 1, senders: 1, conversationsStarted: 0 });
    expect(report.depth.twoToThree).toBe(1);
    expect(report.responses.replied).toBe(1);
  });
});
