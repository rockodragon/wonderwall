// A person's address, thecreative.exchange/@handle: claiming one, changing
// it, and the one search switch. The pure rules are handleRules.ts (shared
// with Settings) and heldHandles.ts (the held names); the public read is
// profiles.getProfileByHandle, which resolves through profileForHandle below.
//
// Changing an address keeps the old one: it forwards to the new one for
// HANDLE_FORWARD_DAYS (handleForwards table), and nobody else can claim it in
// that window. After that it's free.
//
// Some names are held (heldHandles.ts) and can't be claimed through the
// form; an operator gives one to the person it's held for (giveHeldHandle).
// A person who already holds a held name keeps it.

import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { internalMutation, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { fail } from "./errors";
import { hasPaidMembership } from "./garden/entitlements";
import { cleanHandle, HANDLE_FORWARD_MS, HANDLE_PROBLEM_REASON, handleProblem } from "./handleRules";
import { HANDLE_ALIASES, heldCategory, heldRefusal } from "./heldHandles";
import { requireProfile, requireUserId } from "./helpers";

type Db = Pick<QueryCtx, "db">;
type Refusal = { code: string; reason: string };

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

/** The profile that holds `handle`, else the one an old address forwards to. */
async function ownerOf(ctx: Db, handle: string, now: number): Promise<Doc<"profiles"> | null> {
  const holder = await holderOf(ctx, handle);
  if (holder) return holder;
  const forward = await liveForward(ctx, handle, now);
  return forward ? await ctx.db.get(forward.profileId) : null;
}

/**
 * The profile at an address: the one that holds it, else the one an old
 * address still forwards to, else — for a founder alias (heldHandles.ts
 * HANDLE_ALIASES, /@rick) — whoever holds the name it points at, for good.
 * Null for anything else. The caller compares the profile's current
 * `handle` with what was asked for to know it was a forward or an alias.
 */
export async function profileForHandle(
  ctx: Db,
  rawHandle: string,
  now: number = Date.now(),
): Promise<Doc<"profiles"> | null> {
  const handle = cleanHandle(rawHandle);
  if (!handle || handleProblem(handle)) return null;
  const owner = await ownerOf(ctx, handle, now);
  if (owner) return owner;
  const alias = HANDLE_ALIASES.get(handle);
  return alias ? await ownerOf(ctx, alias, now) : null;
}

/**
 * Why `handle` can't be `profile`'s, or null when it can: it breaks the
 * rules, it's a community's own address (hostOrgs.slug), another person
 * holds it, another person's old address still forwards from it, or it's
 * held (heldHandles.ts). Their own old address is theirs to take back, held
 * or not. A 3-character name comes with a paid membership.
 *
 * `giving` is an operator handing over a held name (giveHeldHandle): the
 * held list is skipped, nothing else is.
 */
export async function handleRefusal(
  ctx: Db,
  profile: Doc<"profiles">,
  handle: string,
  now: number = Date.now(),
  { giving = false }: { giving?: boolean } = {},
): Promise<Refusal | null> {
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
  if (forward || giving) return null;
  const held = heldRefusal(handle);
  if (held?.code === "handle_premium" && (await hasPaidMembership(ctx, profile.userId))) return null;
  return held;
}

/** As a person types in Settings: can this be their address? Their own
 * current one is `current`, not a change. `code` says which way a refusal
 * goes (handle_held: write to us; handle_premium: membership; handle_org:
 * Organization account). Signed-in only: it's for the form. */
export const checkHandle = query({
  args: { handle: v.string() },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const profile = await requireProfile(ctx, userId);
    const handle = cleanHandle(args.handle);
    if (handle && handle === profile.handle) {
      return { handle, ok: true as const, current: true as const, code: null, reason: null };
    }
    const refusal = await handleRefusal(ctx, profile, handle);
    return { handle, ok: !refusal, current: false as const, code: refusal?.code ?? null, reason: refusal?.reason ?? null };
  },
});

/** Moves `profile` to `handle`: the old address forwards here for
 * HANDLE_FORWARD_DAYS and can't be claimed by anyone else meanwhile. The
 * caller has already checked handleRefusal. */
async function moveToHandle(ctx: MutationCtx, profile: Doc<"profiles">, handle: string, now: number) {
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
}

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

    await moveToHandle(ctx, profile, handle, now);
    return { handle };
  },
});

/** Operator only: give a held name (heldHandles.ts) to the person it's held
 * for — a founder, a team member, a trademark or real-name owner who wrote
 * in. Everything but the held list still applies: it can't take a name
 * someone holds or a community's address. System names and art-form words
 * aren't given to people.
 *   npx convex run handles:giveHeldHandle '{"profileId":"…","handle":"rickmoy"}' [--prod] */
export const giveHeldHandle = internalMutation({
  args: { profileId: v.id("profiles"), handle: v.string() },
  handler: async (ctx, args) => {
    const profile = await ctx.db.get(args.profileId);
    if (!profile) throw new Error(`No profile ${args.profileId}`);
    const handle = cleanHandle(args.handle);
    const category = heldCategory(handle);
    if (category === "system" || category === "discipline") {
      throw new Error(`@${handle} is a ${category} name; it isn't given to people`);
    }
    const now = Date.now();
    if (handle === profile.handle) return { handle };
    const refusal = await handleRefusal(ctx, profile, handle, now, { giving: true });
    if (refusal) throw new Error(`@${handle}: ${refusal.reason}`);
    await moveToHandle(ctx, profile, handle, now);
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
