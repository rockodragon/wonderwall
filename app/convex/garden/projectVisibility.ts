// Who may see a project at all, and who may see exactly where it is. The
// project page (/projects/:id) is public, so every query a visitor reaches
// from it answers the same way getProject does: an admin-hidden project, or
// one posted into a hidden (test) community, is not-found to everyone else.
//
// Lives here, not in projects.ts, so projectTeam.ts, stories.ts, support.ts
// and the rest can use it without importing projects.ts (which imports
// projectTeam.ts and stories.ts): no module cycle. Same reason as
// eventVisibility.ts.

import type { QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { isAdmin } from "../helpers";
import { isHidden } from "../moderationRules";
import { communityVisibility } from "./communityVisibility";

type ProjectLike = Pick<Doc<"projects">, "userId" | "status" | "hostOrgId">;

/** True when `viewerId` (null: signed out) may see this project. Its lead
 * always may. An admin-hidden project (moderation.ts): only its lead and
 * admins. Posted into a hidden (test) community: only its lead, admins and
 * that community's active members. */
export async function projectVisibleTo(
  ctx: QueryCtx,
  project: ProjectLike,
  viewerId: Id<"users"> | null,
): Promise<boolean> {
  if (viewerId !== null && viewerId === project.userId) return true;
  if (isHidden(project) && !(viewerId && (await isAdmin(ctx, viewerId)))) return false;
  return await communityVisibility(ctx, viewerId).idVisible(project.hostOrgId);
}

/** True when `viewerId` may see the project's exact place (the structured
 * address, coordinates and Places id): its lead and admins. Everyone else
 * gets the place's display name only, so no street address goes to the
 * world. */
export async function seesProjectAddress(
  ctx: QueryCtx,
  project: Pick<Doc<"projects">, "userId">,
  viewerId: Id<"users"> | null,
): Promise<boolean> {
  if (!viewerId) return false;
  return viewerId === project.userId || (await isAdmin(ctx, viewerId));
}
