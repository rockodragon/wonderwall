// A person's address, thecreative.exchange/@handle: claiming one, changing
// it, and the one search switch. The pure rules are handleRules.ts (shared
// with Settings); the public read is profiles.getProfileByHandle, which
// resolves through profileForHandle below.
//
// Changing an address keeps the old one: it forwards to the new one for
// HANDLE_FORWARD_DAYS (handleForwards table), and nobody else can claim it in
// that window. After that it's free.

import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { mutation, query, type QueryCtx } from "./_generated/server";
import { fail } from "./errors";
import { cleanHandle, HANDLE_FORWARD_MS, HANDLE_PROBLEM_REASON, handleProblem } from "./handleRules";
import { requireProfile, requireUserId } from "./helpers";

type Db = Pick<QueryCtx, "db">;

const HANDLE_TAKEN = { code: "handle_taken", reason: "That address is taken." } as const;

async function holderOf(ctx: Db, handle: string): Promise<Doc<"profiles"> | null> {
  return await ctx.db
    .query("profiles")
    .withIndex("by_handle", (q) => q.eq("handle", handle))
    .first();
}

/** The forward from an old address, while it still runs. */
async function liveForward(ctx: Db, handle: string, now: number): Promise<Doc<"handleForwards"> | null> {
  const forward = await ctx.db
    .query("handleForwards")
    .withIndex("by_handle", (q) => q.eq("handle", handle))
    .first();
  return forward && forward.expiresAt > now ? forward : null;
}

/**
 * The profile at an address: the one that holds it, else the one an old
 * address still forwards to. Null for anything else. The caller compares the
 * profile's current `handle` with what was asked for to know it was a forward.
 */
export async function profileForHandle(
  ctx: Db,
  rawHandle: string,
  now: number = Date.now(),
): Promise<Doc<"profiles"> | null> {
  const handle = cleanHandle(rawHandle);
  if (!handle || handleProblem(handle)) return null;
  const holder = await holderOf(ctx, handle);
  if (holder) return holder;
  const forward = await liveForward(ctx, handle, now);
  return forward ? await ctx.db.get(forward.profileId) : null;
}

/**
 * Why `handle` can't be `profile`'s, or null when it can: it breaks the
 * rules, it's a community's own address (hostOrgs.slug), another person
 * holds it, or another person's old address still forwards from it. Their
 * own old address is theirs to take back.
 */
export async function handleRefusal(
  ctx: Db,
  profile: Doc<"profiles">,
  handle: string,
  now: number = Date.now(),
): Promise<{ code: string; reason: string } | null> {
  const problem = handleProblem(handle);
  if (problem) return { code: `handle_${problem}`, reason: HANDLE_PROBLEM_REASON[problem] };
  const community = await ctx.db
    .query("hostOrgs")
    .withIndex("by_slug", (q) => q.eq("slug", handle))
    .first();
  if (community) return { code: "handle_reserved", reason: HANDLE_PROBLEM_REASON.reserved };
  const holder = await holderOf(ctx, handle);
  if (holder && holder._id !== profile._id) return HANDLE_TAKEN;
  const forward = await liveForward(ctx, handle, now);
  if (forward && forward.profileId !== profile._id) return HANDLE_TAKEN;
  return null;
}

/** As a person types in Settings: can this be their address? Their own
 * current one is `current`, not a change. Signed-in only: it's for the form. */
export const checkHandle = query({
  args: { handle: v.string() },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const profile = await requireProfile(ctx, userId);
    const handle = cleanHandle(args.handle);
    if (handle && handle === profile.handle) return { handle, ok: true as const, current: true as const, reason: null };
    const refusal = await handleRefusal(ctx, profile, handle);
    return { handle, ok: !refusal, current: false as const, reason: refusal?.reason ?? null };
  },
});

/** Claim an address, or change to a new one. The old one forwards here for
 * HANDLE_FORWARD_DAYS and can't be claimed by anyone else meanwhile. */
export const claimHandle = mutation({
  args: { handle: v.string() },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const profile = await requireProfile(ctx, userId);
    const handle = cleanHandle(args.handle);
    const now = Date.now();
    if (handle === profile.handle) return { handle };

    const refusal = await handleRefusal(ctx, profile, handle, now);
    if (refusal) fail(refusal.code, refusal.reason);

    await ctx.db.patch(profile._id, { handle, updatedAt: now });

    // A forward to this address is spent: their own old one taken back, or
    // one that ran out.
    const spent = await ctx.db
      .query("handleForwards")
      .withIndex("by_handle", (q) => q.eq("handle", handle))
      .collect();
    for (const f of spent) await ctx.db.delete(f._id);

    if (profile.handle) {
      await ctx.db.insert("handleForwards", {
        handle: profile.handle,
        profileId: profile._id,
        expiresAt: now + HANDLE_FORWARD_MS,
      });
    }
    return { handle };
  },
});

/** "Hide my profile from search engines" (Settings). Off by default: a
 * profile with an address is for search engines and answer tools to find. */
export const setHideFromSearch = mutation({
  args: { hide: v.boolean() },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const profile = await requireProfile(ctx, userId);
    await ctx.db.patch(profile._id, { hideFromSearch: args.hide, updatedAt: Date.now() });
    return { hide: args.hide };
  },
});
