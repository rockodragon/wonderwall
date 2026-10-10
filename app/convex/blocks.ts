// Blocks (the `blocks` table): one person refusing another. A block holds in
// both directions — neither side can message, invite or book the other — so
// every read and refusal goes through here, whether it's messaging.ts, a
// project team (garden/projectTeam.ts) or a gig (garden/gigs.ts).

import { ConvexError } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

type Ctx = QueryCtx | MutationCtx;

/** The block `blockerId` put on `blockedId`, one direction only (null if none). */
export async function findBlock(
  ctx: Ctx,
  blockerId: Id<"users">,
  blockedId: Id<"users">,
): Promise<Doc<"blocks"> | null> {
  return ctx.db
    .query("blocks")
    .withIndex("by_blocker_blocked", (q) => q.eq("blockerId", blockerId).eq("blockedId", blockedId))
    .first();
}

/** Everyone `userId` has blocked plus everyone who has blocked them. */
export async function blockedUserIds(ctx: Ctx, userId: Id<"users">): Promise<Set<Id<"users">>> {
  const [blockedByUser, blockedUser] = await Promise.all([
    ctx.db
      .query("blocks")
      .withIndex("by_blockerId", (q) => q.eq("blockerId", userId))
      .collect(),
    ctx.db
      .query("blocks")
      .withIndex("by_blockedId", (q) => q.eq("blockedId", userId))
      .collect(),
  ]);
  const ids = new Set<Id<"users">>();
  for (const block of blockedByUser) ids.add(block.blockedId);
  for (const block of blockedUser) ids.add(block.blockerId);
  return ids;
}

/** Which way a block between two people runs: "a_blocked_b", "b_blocked_a",
 * or null when there is none. If each has blocked the other, a's block wins
 * (a is the person asking, so they hear about their own block first). */
export async function blockBetween(
  ctx: Ctx,
  a: Id<"users">,
  b: Id<"users">,
): Promise<"a_blocked_b" | "b_blocked_a" | null> {
  if (await findBlock(ctx, a, b)) return "a_blocked_b";
  if (await findBlock(ctx, b, a)) return "b_blocked_a";
  return null;
}

/** Refuses when either of the two has blocked the other. The reason is
 * deliberately vague — a block is never announced to the other side. */
export async function assertNotBlocked(ctx: Ctx, a: Id<"users">, b: Id<"users">): Promise<void> {
  if (await blockBetween(ctx, a, b)) {
    throw new ConvexError({ code: "blocked", reason: "That isn't possible right now." });
  }
}
