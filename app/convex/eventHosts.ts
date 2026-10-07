// Who counts as a host of an event, and the index that finds the events a
// member co-hosts. The rules at the top are pure, tested without Convex.
// Below them, syncCoHosts keeps the eventCoHosts table in step with
// events.coHostIds (schema.ts says why the table exists), and
// backfillCoHosts brings every existing event in step once:
//   npx convex run eventHosts:backfillCoHosts [--prod]

import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalMutation, type MutationCtx } from "./_generated/server";

export const MAX_CO_HOSTS = 10;

/** Organizer or a listed co-host. Ids compared as strings so Id<"users">
 * and plain strings both work. */
export function isEventHost(
  event: { organizerId: unknown; coHostIds?: readonly unknown[] | null },
  userId: unknown,
): boolean {
  if (userId === null || userId === undefined || userId === "") return false;
  const id = String(userId);
  if (String(event.organizerId) === id) return true;
  return (event.coHostIds ?? []).some((c) => String(c) === id);
}

export type CoHostChange =
  | { ok: true; coHostIds: string[] }
  | { ok: false; reason: "is_organizer" | "duplicate" | "full" | "not_a_co_host" };

/** Pure rule for adding a co-host: not the organizer, no duplicates, max 10. */
export function planAddCoHost(
  event: { organizerId: unknown; coHostIds?: readonly unknown[] | null },
  userId: string,
): CoHostChange {
  const current = (event.coHostIds ?? []).map(String);
  if (String(event.organizerId) === userId) return { ok: false, reason: "is_organizer" };
  if (current.includes(userId)) return { ok: false, reason: "duplicate" };
  if (current.length >= MAX_CO_HOSTS) return { ok: false, reason: "full" };
  return { ok: true, coHostIds: [...current, userId] };
}

export function planRemoveCoHost(
  event: { coHostIds?: readonly unknown[] | null },
  userId: string,
): CoHostChange {
  const current = (event.coHostIds ?? []).map(String);
  if (!current.includes(userId)) return { ok: false, reason: "not_a_co_host" };
  return { ok: true, coHostIds: current.filter((c) => c !== userId) };
}

export const MAX_DISPLAY_HOSTS = 10;

/** For a "name" host (someone not on the platform), `id` is the name. */
export type DisplayHostRef = { kind: "user"; id: string } | { kind: "org"; id: string } | { kind: "name"; id: string };

/** The people a "Shown as host" save newly lists, to tell them (Rick,
 * 2026-10-07): in the new list, not shown before (the saved list, or the
 * organizer and co-hosts when there wasn't one), and not the person saving.
 * Someone already shown, a co-host included, already knows. */
export function newlyListedUsers(
  before: readonly string[],
  after: readonly DisplayHostRef[],
  actorId: string,
): string[] {
  const shown = new Set(before);
  const out: string[] = [];
  for (const r of after) {
    if (r.kind !== "user" || r.id === actorId || shown.has(r.id) || out.includes(r.id)) continue;
    out.push(r.id);
  }
  return out;
}

/** The longest name a "not on the platform" host can have. */
export const MAX_HOST_NAME = 80;

/** Pure rule for the "show as host" list: at most 10, no repeats, order kept. */
export function planDisplayHosts(
  refs: readonly DisplayHostRef[],
): { ok: true; refs: DisplayHostRef[] } | { ok: false; reason: "duplicate" | "full" } {
  if (refs.length > MAX_DISPLAY_HOSTS) return { ok: false, reason: "full" };
  const seen = new Set<string>();
  for (const r of refs) {
    const key = `${r.kind}:${r.kind === "name" ? r.id.trim().toLowerCase() : r.id}`;
    if (seen.has(key)) return { ok: false, reason: "duplicate" };
    seen.add(key);
  }
  return { ok: true, refs: [...refs] };
}

/** The writes that bring one event's eventCoHosts rows in step with its
 * coHostIds: a row for each listed co-host who has none, and every other row
 * removed, repeats included. Nothing when they're already in step. */
export function planCoHostSync<Row extends { userId: unknown }, UserId>(
  rows: readonly Row[],
  coHostIds: readonly UserId[],
): { insert: UserId[]; remove: Row[] } {
  const listed = new Map(coHostIds.map((id) => [String(id), id]));
  const kept = new Set<string>();
  const remove: Row[] = [];
  for (const row of rows) {
    const id = String(row.userId);
    if (listed.has(id) && !kept.has(id)) kept.add(id);
    else remove.push(row);
  }
  return { insert: [...listed].filter(([id]) => !kept.has(id)).map(([, userId]) => userId), remove };
}

/** Makes eventCoHosts match `coHostIds` for one event. Every write to
 * events.coHostIds calls it with the new list, in the same mutation; an
 * event's delete calls it with []. Idempotent. */
export async function syncCoHosts(
  ctx: MutationCtx,
  eventId: Id<"events">,
  coHostIds: readonly Id<"users">[],
): Promise<{ added: number; removed: number }> {
  const rows = await ctx.db
    .query("eventCoHosts")
    .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
    .collect();
  const { insert, remove } = planCoHostSync(rows, coHostIds);
  for (const row of remove) await ctx.db.delete(row._id);
  const now = Date.now();
  for (const userId of insert) await ctx.db.insert("eventCoHosts", { eventId, userId, createdAt: now });
  return { added: insert.length, removed: remove.length };
}

export const BACKFILL_PAGE_SIZE = 100;

/** Syncs every event's eventCoHosts rows, a page of events per run, then
 * schedules itself for the next page (updates.ts deliverBatch's shape).
 * Safe to run again: an event already in step writes nothing. */
export const backfillCoHosts = internalMutation({
  args: { cursor: v.optional(v.union(v.string(), v.null())) },
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("events")
      .paginate({ numItems: BACKFILL_PAGE_SIZE, cursor: args.cursor ?? null });
    let added = 0;
    let removed = 0;
    for (const event of page.page) {
      const synced = await syncCoHosts(ctx, event._id, event.coHostIds ?? []);
      added += synced.added;
      removed += synced.removed;
    }
    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.eventHosts.backfillCoHosts, { cursor: page.continueCursor });
    }
    return { scanned: page.page.length, added, removed, isDone: page.isDone };
  },
});
