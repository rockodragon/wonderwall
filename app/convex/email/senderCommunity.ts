// The database side of choosing which community an email is from. The
// choice itself is pickSenderCommunity in sender.ts (pure, unit-tested); this
// reads what it needs. Used by emails.ts through
// emailDeliveries.getCommunitySenderName, and by mutations that put the
// community's name in a subject or body, so the text and the From name agree.

import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { getDefaultCommunity } from "../garden/defaultCommunity";
import { isActiveCommunity, pickSenderCommunity, type SenderMembership } from "./sender";

/** `communityId`: the community the email is about, when the caller knows
 * it (an event's, a project's, a class's). `userId`: the recipient, when they
 * have an account — used only if the email isn't about an active community.
 * Null when there is no default community either. */
export async function resolveSenderCommunity(
  ctx: QueryCtx | MutationCtx,
  args: { communityId?: Id<"hostOrgs">; userId?: Id<"users"> },
): Promise<Doc<"hostOrgs"> | null> {
  const explicit = args.communityId ? await ctx.db.get(args.communityId) : null;
  const defaultCommunity = await getDefaultCommunity(ctx);

  // Nothing below can beat an active community the email is about, so skip
  // the membership reads.
  let memberships: SenderMembership<Doc<"hostOrgs">>[] = [];
  if (args.userId && !(explicit && isActiveCommunity(explicit))) {
    const userId = args.userId;
    const rows = await ctx.db
      .query("communityMembers")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect();
    for (const row of rows) {
      if (row.status !== "active") continue;
      const community = await ctx.db.get(row.hostOrgId);
      if (community) memberships.push({ community, joinedAt: row.joinedAt });
    }
  }

  return pickSenderCommunity({ explicit, memberships, defaultCommunity });
}

/** The community's name, or null to keep the platform name. */
export async function resolveSenderCommunityName(
  ctx: QueryCtx | MutationCtx,
  args: { communityId?: Id<"hostOrgs">; userId?: Id<"users"> },
): Promise<string | null> {
  return (await resolveSenderCommunity(ctx, args))?.name ?? null;
}
