// Finding whose invite a code is. Shared by
// invites.ts (crediting the inviter at signup) and garden/communities.ts
// (an invite-only community checks the code before it lets anyone in). Kept
// here, with no imports beyond types, so the community code doesn't pull in
// invites.ts's auth and email wiring.

import type { QueryCtx, MutationCtx } from "./_generated/server";

// A pasted or emailed code can be either kind of invite: a member's own
// inviteSlug, or an admin's fixed waitlist-approval code (adminCode, set by
// waitlist.ts's approveEntry). Both live on the profiles table and both
// land at /signup/:code, so every lookup here tries inviteSlug first —
// the far more common case — and falls back to adminCode.
//
// Old invites got a name-based inviteSlug ("rick-moy"); new ones get a
// short generated code ("K7M4QD", see generateInviteSlug in invites.ts and
// convex/inviteCode.ts). Both are stored as-is in the same field, so the
// exact-match lookup finds either one — every link already shared keeps
// redeeming forever, nothing was migrated. The uppercased retry only helps
// a short code typed in a different case; it can never accidentally match
// an old lowercase, dashed slug, since uppercasing one of those doesn't
// produce another real slug.
export async function findInviterProfile(ctx: QueryCtx | MutationCtx, code: string) {
  // However the code arrived — typed, pasted, any case — try the shapes it
  // could be stored in: as given, lowercase (old name-based slugs like
  // "rick-moy"), and uppercase without dashes (new 6-character codes and
  // admin codes). Each is one indexed lookup.
  const candidates = [...new Set([code, code.toLowerCase(), code.toUpperCase().replace(/[\s-]+/g, "")])];
  for (const candidate of candidates) {
    const bySlug = await ctx.db
      .query("profiles")
      .withIndex("by_inviteSlug", (q) => q.eq("inviteSlug", candidate))
      .first();
    if (bySlug) return bySlug;
  }
  for (const candidate of [...new Set([code, code.toUpperCase()])]) {
    const byAdmin = await ctx.db
      .query("profiles")
      .withIndex("by_adminCode", (q) => q.eq("adminCode", candidate))
      .first();
    if (byAdmin) return byAdmin;
  }
  return null;
}
