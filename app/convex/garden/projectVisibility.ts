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
import { isAdmin, isOwnerOrAdmin } from "../helpers";
import { fail } from "../errors";
import { isDraft, isHidden } from "../moderationRules";
import { publicPlace } from "../eventAddress";
import { communityVisibility } from "./communityVisibility";

type ProjectLike = Pick<Doc<"projects">, "userId" | "status" | "hostOrgId">;

/** True when `viewerId` (null: signed out) may see this project. Its lead
 * always may. An admin-hidden project (moderation.ts), or a draft its lead
 * hasn't posted: only its lead and admins. Posted into a hidden (test)
 * community: only its lead, admins and that community's active members. */
export async function projectVisibleTo(
  ctx: QueryCtx,
  project: ProjectLike,
  viewerId: Id<"users"> | null,
): Promise<boolean> {
  if (viewerId !== null && viewerId === project.userId) return true;
  if ((isHidden(project) || isDraft(project)) && !(viewerId && (await isAdmin(ctx, viewerId)))) return false;
  return await communityVisibility(ctx, viewerId).idVisible(project.hostOrgId);
}

/** Refuses a write that treats a draft as a posted project: a cheer, a
 * backing, an offer to join or invite, an update. A draft has no audience
 * until its lead posts it (publishProject), and everyone but the lead and
 * admins can't see it at all, so the refusal reads the same to them. */
export function assertNotDraft(project: Pick<Doc<"projects">, "status">): void {
  if (isDraft(project)) fail("draft", "This project is still a draft. It has to be posted first.");
}

/** True when `viewerId` may see the project's exact place (placeForViewer):
 * its lead and admins. */
export async function seesProjectAddress(
  ctx: QueryCtx,
  project: Pick<Doc<"projects">, "userId">,
  viewerId: Id<"users"> | null,
): Promise<boolean> {
  if (!viewerId) return false;
  return await isOwnerOrAdmin(ctx, project.userId, viewerId);
}

type PlaceFields = Pick<Doc<"projects">, "location" | "locationType" | "address" | "coordinates" | "placeId">;

/** The project's place as a viewer may see it, so no street address goes to
 * the world. `exact` (the lead, an admin): as stored. Anyone else: no map
 * position or Places id, the address cut back to its city, region and
 * country, and, where the place IS a street address (locationType
 * "address"), the city in place of it ("Oakland, CA", publicPlace). Pure. */
export function placeForViewer<T extends PlaceFields>(project: T, exact: boolean): T {
  if (exact) return project;
  const { address } = project;
  return {
    ...project,
    location: project.locationType === "address" ? publicPlace(project) : project.location,
    address: address
      ? { city: address.city, state: address.state, stateCode: address.stateCode, country: address.country, countryCode: address.countryCode }
      : undefined,
    coordinates: undefined,
    placeId: undefined,
  };
}
