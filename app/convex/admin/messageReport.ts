// /admin/messages (routes/admin.messages.tsx): whether members are sending
// more messages over time, and how often a first message gets an answer.
//
// COUNTS ONLY. Members' messages are private, so the report reads message
// rows (createdAt, senderId, readAt, projectMemberId) to count them and
// returns numbers and dates, never text, names, user ids or conversation ids.
//
// The window is the last 12 full weeks plus the current one. Weeks start
// Monday 00:00 UTC, so a week is the same week for everyone and the page
// can print its date without a time zone shifting it a day.
//
// The report reads only that window, not the whole history: a Convex query
// may read only so many documents, and the whole message table grows without
// end. So it reads the conversations whose last message is in the window
// (by_lastMessageAt), then, for each, the messages in the window
// (by_conversationId_createdAt), plus one look at whether anything came
// before the window. A conversation whose first message is inside the window
// has its whole history in the rows read, so started / answered / depth are
// exact for it. One that started earlier still counts toward `messages` and
// `senders`, but not toward started or answered (its start isn't in view).
//
// Everything that is arithmetic (weeks, median, kind order, buckets) is an
// exported pure function below, so it is tested without a database; the
// query itself only gathers rows and asks them.

import { query } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { isAdmin, requireAdminCtx } from "../helpers";
import { isHostsGuest } from "../messaging";

// ——— Weeks ———

export const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
/** Full weeks before the current one that the report covers. */
export const WEEKS_BACK = 12;
/** How many weeks one "last N weeks" total on the page covers. */
export const PERIOD_WEEKS = 4;
// 1970-01-05 00:00 UTC, the first Monday after the epoch (1970-01-01 was a Thursday).
const FIRST_MONDAY_MS = 4 * 24 * 60 * 60 * 1000;

/** The Monday 00:00 UTC that starts the week `ms` falls in. */
export function weekStartOf(ms: number): number {
  return Math.floor((ms - FIRST_MONDAY_MS) / WEEK_MS) * WEEK_MS + FIRST_MONDAY_MS;
}

/** Where the window begins: the Monday 12 weeks before this week's. */
export function windowStartOf(now: number): number {
  return weekStartOf(now) - WEEKS_BACK * WEEK_MS;
}

// ——— Small rules ———

/** Middle value, or the mean of the middle two. Null when there is nothing. */
export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** What started a conversation. Checked in this order, first match wins. */
export const START_KINDS = ["project", "host", "admin", "member"] as const;
export type StartKind = (typeof START_KINDS)[number];

/** `project`: someone writing about a project role. `host`: a host writing to
 * their own event's guest. `admin`: the starter is an admin. `member`: one
 * member writing cold to another. The host and admin checks read the
 * database, so they are only run when an earlier kind did not already match. */
export async function startKindOf(checks: {
  project: boolean;
  host: () => Promise<boolean>;
  admin: () => Promise<boolean>;
}): Promise<StartKind> {
  if (checks.project) return "project";
  if (await checks.host()) return "host";
  if (await checks.admin()) return "admin";
  return "member";
}

export type Response = "replied" | "readNoReply" | "unread";

/** What the other person did with a first message: wrote back (the other
 * person sent any message), only read it, or has not opened it. */
export function responseOf(conversation: { firstReplyAt: number | null; starterRead: boolean }): Response {
  if (conversation.firstReplyAt !== null) return "replied";
  return conversation.starterRead ? "readNoReply" : "unread";
}

export type DepthBucket = "one" | "twoToThree" | "fourToNine" | "tenPlus";

/** How long a conversation ran, by total messages. */
export function depthBucketOf(messageCount: number): DepthBucket {
  if (messageCount <= 1) return "one";
  if (messageCount <= 3) return "twoToThree";
  if (messageCount <= 9) return "fourToNine";
  return "tenPlus";
}

// ——— One conversation ———

/** A message as the report sees it. No text, no ids beyond who sent it. */
export type MessageRow<S extends string = string> = {
  createdAt: number;
  senderId: S;
  readAt?: number;
  /** The message carries a projectMemberId (it was about a project role). */
  aboutProject: boolean;
};

/** A conversation read from all its messages, oldest first. Null when empty. */
export function summarizeConversation<S extends string>(rows: readonly MessageRow<S>[]) {
  if (rows.length === 0) return null;
  const sorted = [...rows].sort((a, b) => a.createdAt - b.createdAt);
  const first = sorted[0];
  const reply = sorted.find((row) => row.senderId !== first.senderId);
  return {
    starterId: first.senderId,
    startedAt: first.createdAt,
    messageCount: sorted.length,
    firstReplyAt: reply ? reply.createdAt : null,
    starterRead: first.readAt !== undefined,
    firstAboutProject: first.aboutProject,
  };
}

// ——— The report ———

/** A message sent in the window. Who sent it only matters to count people. */
export type SentMessage = { createdAt: number; senderId: string };

/** A conversation whose first message is in the window. */
export type StartedConversation = {
  startedAt: number;
  kind: StartKind;
  messageCount: number;
  firstReplyAt: number | null;
  starterRead: boolean;
};

type Totals = {
  messages: number;
  conversationsStarted: number;
  startedReplied: number;
  medianReplyMinutes: number | null;
};

const waitMinutes = (c: StartedConversation) => ((c.firstReplyAt ?? c.startedAt) - c.startedAt) / 60_000;
const roundedMinutes = (minutes: number | null) => (minutes === null ? null : Math.round(minutes));

export function buildReport(now: number, messages: readonly SentMessage[], started: readonly StartedConversation[]) {
  const firstWeek = windowStartOf(now);
  const weekCount = WEEKS_BACK + 1;
  const indexOf = (ms: number) => Math.floor((weekStartOf(ms) - firstWeek) / WEEK_MS);

  const perWeek = Array.from({ length: weekCount }, () => ({
    messages: 0,
    senders: new Set<string>(),
    started: 0,
    replied: 0,
    waits: [] as number[],
  }));

  for (const message of messages) {
    const week = perWeek[indexOf(message.createdAt)];
    if (!week) continue;
    week.messages += 1;
    week.senders.add(message.senderId);
  }

  const byKind = new Map(START_KINDS.map((kind) => [kind, { started: 0, replied: 0, waits: [] as number[] }]));
  const responses = { replied: 0, readNoReply: 0, unread: 0 };
  const depth = { one: 0, twoToThree: 0, fourToNine: 0, tenPlus: 0 };

  for (const conversation of started) {
    const answered = conversation.firstReplyAt !== null;
    const week = perWeek[indexOf(conversation.startedAt)];
    if (week) {
      week.started += 1;
      if (answered) {
        week.replied += 1;
        week.waits.push(waitMinutes(conversation));
      }
    }
    const kind = byKind.get(conversation.kind)!;
    kind.started += 1;
    if (answered) {
      kind.replied += 1;
      kind.waits.push(waitMinutes(conversation));
    }
    responses[responseOf(conversation)] += 1;
    depth[depthBucketOf(conversation.messageCount)] += 1;
  }

  const weeks = perWeek.map((week, i) => ({
    weekStart: firstWeek + i * WEEK_MS,
    messages: week.messages,
    conversationsStarted: week.started,
    senders: week.senders.size,
    startedReplied: week.replied,
    medianReplyMinutes: roundedMinutes(median(week.waits)),
  }));

  // The page's four headline numbers: the last 4 full weeks (the current,
  // part-way week is left out) and the 4 before them. The median is taken
  // over every wait in those weeks, not over the weekly medians.
  const period = (fromWeek: number): Totals => {
    const slice = perWeek.slice(fromWeek, fromWeek + PERIOD_WEEKS);
    return {
      messages: slice.reduce((sum, week) => sum + week.messages, 0),
      conversationsStarted: slice.reduce((sum, week) => sum + week.started, 0),
      startedReplied: slice.reduce((sum, week) => sum + week.replied, 0),
      medianReplyMinutes: roundedMinutes(median(slice.flatMap((week) => week.waits))),
    };
  };

  return {
    weeks,
    periods: { recent: period(WEEKS_BACK - PERIOD_WEEKS), before: period(WEEKS_BACK - 2 * PERIOD_WEEKS) },
    kinds: START_KINDS.map((kind) => {
      const row = byKind.get(kind)!;
      return { kind, started: row.started, replied: row.replied, medianReplyMinutes: roundedMinutes(median(row.waits)) };
    }),
    responses,
    depth,
  };
}

export type MessageReport = ReturnType<typeof buildReport>;

// ——— The query ———

export const getMessageReport = query({
  args: {},
  handler: async (ctx): Promise<MessageReport> => {
    await requireAdminCtx(ctx);

    // The window moves with the clock, which is fine for a page an admin
    // opens and reads; it is only recomputed when the data changes.
    const now = Date.now();
    const windowStart = windowStartOf(now);

    const conversations = await ctx.db
      .query("conversations")
      .withIndex("by_lastMessageAt", (q) => q.gte("lastMessageAt", windowStart))
      .collect();

    const adminByUser = new Map<Id<"users">, boolean>();
    const hostByPair = new Map<string, boolean>();
    const sent: SentMessage[] = [];
    const started: StartedConversation[] = [];

    for (const conversation of conversations) {
      const rows = await ctx.db
        .query("messages")
        .withIndex("by_conversationId_createdAt", (q) =>
          q.eq("conversationId", conversation._id).gte("createdAt", windowStart),
        )
        .collect();
      if (rows.length === 0) continue;
      for (const row of rows) sent.push({ createdAt: row.createdAt, senderId: row.senderId });

      // Anything before the window means this conversation started earlier.
      const earlier = await ctx.db
        .query("messages")
        .withIndex("by_conversationId_createdAt", (q) =>
          q.eq("conversationId", conversation._id).lt("createdAt", windowStart),
        )
        .first();
      if (earlier) continue;

      const summary = summarizeConversation(
        rows.map((row) => ({
          createdAt: row.createdAt,
          senderId: row.senderId,
          readAt: row.readAt,
          aboutProject: row.projectMemberId !== undefined,
        })),
      );
      if (!summary) continue;

      const starterId = summary.starterId;
      const otherId = conversation.participants.find((id) => id !== starterId);
      const kind = await startKindOf({
        project: summary.firstAboutProject || (conversation.projectMemberIds?.length ?? 0) > 0,
        host: async () => {
          if (!otherId) return false;
          const key = `${starterId}:${otherId}`;
          if (!hostByPair.has(key)) hostByPair.set(key, await isHostsGuest(ctx, starterId, otherId));
          return hostByPair.get(key)!;
        },
        admin: async () => {
          if (!adminByUser.has(starterId)) adminByUser.set(starterId, await isAdmin(ctx, starterId));
          return adminByUser.get(starterId)!;
        },
      });

      started.push({
        startedAt: summary.startedAt,
        kind,
        messageCount: summary.messageCount,
        firstReplyAt: summary.firstReplyAt,
        starterRead: summary.starterRead,
      });
    }

    return buildReport(now, sent, started);
  },
});
