// A short, readable address for an event: /e/renaissance-nov6. Made from the
// title and the date when the event is created, kept for good once set (a
// retitle keeps it so shared links hold), and unique across events.
// The event page answers at it directly (routes/event.tsx in the app,
// functions/e/[slug].ts at the edge), so the address stays in the bar.

import { ConvexError, v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import type { Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, query, type QueryCtx } from "./_generated/server";

/** Words that add length, not meaning, to an address. */
const FILLER = new Set(["a", "an", "the", "of", "and", "at", "in", "on", "for", "to", "with", "by", "our", "my", "your"]);
const MAX_WORDS = 3;
const MAX_LENGTH = 40;
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** "Nov7" style tag in the events' home time zone (San Diego). */
export function dateTag(datetime: number): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    month: "numeric",
    day: "numeric",
  }).formatToParts(new Date(datetime));
  const month = Number(parts.find((p) => p.type === "month")?.value ?? 1);
  const day = parts.find((p) => p.type === "day")?.value ?? "1";
  return `${MONTHS[month - 1] ?? "jan"}${day}`;
}

/** "Creative Renaissance - San Diego" on Nov 7 → "creative-renaissance-san-nov7". */
export function eventSlugBase(title: string, datetime: number): string {
  const words = title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .split(/[^a-z0-9]+/)
    .filter((w) => w && !FILLER.has(w));
  let name = words.slice(0, MAX_WORDS).join("-");
  if (name.length > MAX_LENGTH) name = name.slice(0, MAX_LENGTH).replace(/-[^-]*$/, "") || name.slice(0, MAX_LENGTH);
  return [name || "event", dateTag(datetime)].join("-");
}

/** Lowercase letters, digits and single hyphens only; what a host types is cleaned to this. */
export function cleanSlug(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

async function taken(ctx: QueryCtx, slug: string, except?: Id<"events">): Promise<boolean> {
  const row = await ctx.db
    .query("events")
    .withIndex("by_slug", (q) => q.eq("slug", slug))
    .first();
  return !!row && row._id !== except;
}

/** The first free address: the base, then base-2, base-3, … */
export async function uniqueEventSlug(ctx: QueryCtx, base: string, except?: Id<"events">): Promise<string> {
  if (!(await taken(ctx, base, except))) return base;
  for (let n = 2; n < 100; n++) {
    const candidate = `${base}-${n}`;
    if (!(await taken(ctx, candidate, except))) return candidate;
  }
  return `${base}-${Math.random().toString(36).slice(2, 8)}`;
}

/** A host's edit of the address. Empty gives the generated one back; a taken
 * or too-short one is refused in words the host can act on. */
export async function resolveSlugEdit(ctx: QueryCtx, event: Doc<"events">, input: string): Promise<string> {
  const slug = cleanSlug(input);
  if (!slug) return uniqueEventSlug(ctx, eventSlugBase(event.title, event.datetime), event._id);
  if (slug.length < 3) {
    throw new ConvexError({ code: "slug_short", reason: "The link needs at least 3 letters or numbers." });
  }
  if (await taken(ctx, slug, event._id)) {
    throw new ConvexError({ code: "slug_taken", reason: "That link is already used by another event. Try another." });
  }
  return slug;
}

/** The address for a new event. */
export async function newEventSlug(ctx: QueryCtx, title: string, datetime: number): Promise<string> {
  return uniqueEventSlug(ctx, eventSlugBase(title, datetime));
}

/** Slug → event id, for the page at /e/:slug. Public: the event page itself
 * decides who may see the event, so this reveals only that an address exists. */
export const idForSlug = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("events")
      .withIndex("by_slug", (q) => q.eq("slug", cleanSlug(args.slug)))
      .first();
    return row?._id ?? null;
  },
});

/** Operator: give every event without an address one. Run from the Convex
 * dashboard until `remaining` is 0. */
export const backfillSlugs = internalMutation({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const rows = await ctx.db.query("events").collect();
    const missing = rows.filter((e) => !e.slug);
    const batch = missing.slice(0, args.limit ?? 200);
    for (const e of batch) {
      const slug = await newEventSlug(ctx, e.title, e.datetime);
      await ctx.db.patch(e._id, { slug });
    }
    return { set: batch.length, remaining: missing.length - batch.length };
  },
});

/** Operator: choose an event's address by hand, e.g. renaissance-nov6.
 * Refuses one another event already has. */
export const setSlug = internalMutation({
  args: { eventId: v.id("events"), slug: v.string() },
  handler: async (ctx, args) => {
    const slug = cleanSlug(args.slug);
    if (!slug) throw new Error("Address is empty after cleaning.");
    if (await taken(ctx, slug, args.eventId)) throw new Error(`/e/${slug} belongs to another event.`);
    await ctx.db.patch(args.eventId, { slug });
    return slug;
  },
});

/** Operator: what address an event has. */
export const slugOf = internalQuery({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => (await ctx.db.get(args.eventId))?.slug ?? null,
});
