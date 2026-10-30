// Internal-only tools, run by an operator (`npx convex run`). Refile a
// project someone posted as themselves during onboarding (Rick, 2026-10-30):
// "Elyon Technologies", a boutique consultancy, is a project when it should
// be an organization page with Micah Lyle on it; "Artist | Pastor | Creative
// Director" is a project whose text is Danny Barragan's bio.
//
//   toOrganization  the project becomes an organization. It is found by the
//                   project's title or created, the same way "add an
//                   organization by name" does (organizations.ts findOrCreate
//                   and joinOrg); the project's lead gets a position there,
//                   titled Founder unless they already have one; and the
//                   organization's empty tagline, about and logo are filled
//                   from the project's blurb, story and photo (what the
//                   organization already says always wins, as in
//                   mergeOrganizations' orgFill).
//   toProfileBio    the project's blurb and story become the lead's profile
//                   bio, when the bio is empty or blank. A bio that already
//                   has text is never overwritten: the run then changes
//                   nothing at all, project included, and answers
//                   `bioKept: true` so Rick can decide.
//
// Once the text has its new home the project is HIDDEN, the way an admin's
// Hide does it (moderation.ts setProjectHidden: status "hidden", when, and
// the status to put back). Why hidden, not archived or deleted:
//   - archived is the creator's own take-down; they can flip it back in the
//     project's settings, and the page still opens by its link. Hidden is the
//     operator's: browse lists, profiles and direct links stop showing it to
//     everyone but its owner and admins, and an admin's Unhide (the project's
//     ⋮ menu) puts the old status back, so a wrong refile is one click to undo.
//   - delete (moderation.ts deleteProject) is permanent and takes the team,
//     updates and uploaded files with it. It would also remove the project's
//     photo from storage, which toOrganization shares with the organization
//     as its logo (the same stored file, not a copy): don't delete the hidden
//     project afterwards, or the logo goes with it.
//
// Both refuse (ConvexError, code "needs_a_decision") when the project has
// anything that needs a person to decide where it goes: accepted team
// members other than the lead, pending team requests, open roles, updates,
// supporters or backings (and their payments, fund allocations, grant
// proposals and backing tiers) or recurring gigs. A project has no tickets;
// recurring gigs are the dates people book. The refusal names which.
//
// `dryRun: true` reports what would happen and changes nothing. Leaving it
// out applies the change, so say it every time on the first run.
//
//   npx convex run admin/refileProject:toOrganization \
//     '{"projectId":"…","dryRun":true}' --prod
//   npx convex run admin/refileProject:toProfileBio \
//     '{"projectId":"…","dryRun":true}' --prod
//
// Run it again without `dryRun` to apply. Running either one twice is safe:
// the organization and the position are found, not made again, and a hidden
// project is not hidden twice.

import { v } from "convex/values";
import { api } from "../_generated/api";
import { internalMutation, type MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { fail } from "../errors";
import { richDocPlainText } from "../garden/richText";
import { getProfileByUserId } from "../helpers";
import { HIDDEN_STATUS, hiddenFields, isHidden, joinList, plural } from "../moderationRules";
import { ORG_LIMITS } from "../organizationRules";
import { findOrCreate, findOrgByName, joinOrg, positionsOfOrg } from "../organizations";
import { orgFill } from "./mergeOrganizations";

/** The title the project's lead gets at the organization, when they have no
 * position there yet. */
const LEAD_TITLE = "Founder";

/** What stops a project from being refiled by itself: each is something a
 * person has to decide about. Empty when nothing does. */
async function blockers(ctx: MutationCtx, project: Doc<"projects">): Promise<string[]> {
  const projectId = project._id;
  const [members, roles, updates, support, payments, allocations, proposals, tiers, gigs] = await Promise.all([
    ctx.db.query("projectMembers").withIndex("by_projectId_status", (q) => q.eq("projectId", projectId)).collect(),
    ctx.db
      .query("projectRoles")
      .withIndex("by_projectId_status", (q) => q.eq("projectId", projectId).eq("status", "open"))
      .collect(),
    ctx.db.query("storyUpdates").withIndex("by_projectId", (q) => q.eq("projectId", projectId)).collect(),
    ctx.db.query("projectSupport").withIndex("by_projectId", (q) => q.eq("projectId", projectId)).collect(),
    ctx.db.query("backingPayments").withIndex("by_projectId", (q) => q.eq("projectId", projectId)).collect(),
    ctx.db.query("allocations").withIndex("by_projectId", (q) => q.eq("projectId", projectId)).collect(),
    ctx.db.query("grantProposals").withIndex("by_projectId", (q) => q.eq("projectId", projectId)).collect(),
    ctx.db.query("patronTiers").withIndex("by_projectId", (q) => q.eq("projectId", projectId)).collect(),
    ctx.db.query("gigSeries").withIndex("by_projectId", (q) => q.eq("projectId", projectId)).collect(),
  ]);
  // The lead is projects.userId; a member row of theirs doesn't count.
  const others = members.filter((m) => m.userId !== project.userId);
  const counts: [noun: string, n: number][] = [
    ["accepted team member", others.filter((m) => m.status === "accepted").length],
    ["pending team request", others.filter((m) => m.status === "pending" || m.status === "invited").length],
    ["open role", roles.length],
    ["update", updates.length],
    ["supporter", support.length],
    ["backing payment", payments.length],
    ["fund allocation", allocations.length],
    ["grant proposal", proposals.length],
    ["backing tier", tiers.length],
    ["recurring gig", gigs.length],
  ];
  return counts.filter(([, n]) => n > 0).map(([noun, n]) => plural(n, noun));
}

/** The project and its lead's profile, once nothing needs a person to decide. */
async function loadProject(ctx: MutationCtx, projectId: Id<"projects">) {
  const project = await ctx.db.get(projectId);
  if (!project) fail("not_found", "No such project.");
  const lead = await getProfileByUserId(ctx, project.userId);
  if (!lead) fail("lead_has_no_profile", `The lead of "${project.title}" has no profile to put it on.`);
  const blocked = await blockers(ctx, project);
  if (blocked.length > 0) {
    fail(
      "needs_a_decision",
      `"${project.title}" has ${joinList(blocked)}. That needs a person to decide where it goes, so nothing was changed.`,
    );
  }
  return { project, lead };
}

/** What the project says: its blurb, then its story as plain text. The blurb
 * is left out when the story already has it. */
function projectText(project: Doc<"projects">) {
  const blurb = (project.blurb ?? "").trim();
  const story = richDocPlainText(project.body).trim();
  const oneLine = (text: string) => text.replace(/\s+/g, " ");
  const storyHasBlurb = !!blurb && oneLine(story).includes(oneLine(blurb));
  return { blurb, text: [storyHasBlurb ? "" : blurb, story].filter(Boolean).join("\n\n") };
}

const clip = (text: string, max: number) => (text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`);

/** What the project offers an organization page: a one-line tagline when the
 * blurb fits, the rest of what it says as the about, and its photo as the
 * logo. orgFill takes only what the organization doesn't already have. */
function orgSource(project: Doc<"projects">): Partial<Doc<"organizations">> {
  const { blurb, text } = projectText(project);
  const tagline = blurb && blurb.length <= ORG_LIMITS.tagline ? blurb : undefined;
  return {
    tagline,
    mission: text && text !== tagline ? clip(text, ORG_LIMITS.mission) : undefined,
    logoStorageId: project.photoStorageId,
  };
}

/** Take the project out of every list: Hide, the way the admin menu does it. */
async function hideProject(ctx: MutationCtx, project: Doc<"projects">) {
  if (!isHidden(project)) await ctx.db.patch(project._id, hiddenFields(project, Date.now()));
  return HIDDEN_STATUS;
}

// Internal, so no caller check is needed: only an operator can run it.
export const toOrganization = internalMutation({
  args: { projectId: v.id("projects"), dryRun: v.optional(v.boolean()) },
  handler: async (ctx, { projectId, dryRun }) => {
    const { project, lead } = await loadProject(ctx, projectId);
    const source = orgSource(project);

    if (dryRun) {
      // findOrgByName reads what findOrCreate would find; nothing is made.
      const found = await findOrgByName(ctx, project.title);
      const listed = found ? (await positionsOfOrg(ctx, found._id)).some((p) => p.profileId === lead._id) : false;
      return {
        dryRun: true as const,
        organizationId: found?._id ?? null,
        slug: found?.slug ?? null,
        created: !found,
        leadAdded: !listed,
        filled: orgFill(source, found ?? {}).words,
        projectStatus: HIDDEN_STATUS,
      };
    }

    const { org, created } = await findOrCreate(ctx, project.userId, project.title);
    const listed = (await positionsOfOrg(ctx, org._id)).some((p) => p.profileId === lead._id);
    // A title only for a lead who has no position yet: one they already
    // hold keeps its own.
    await joinOrg(ctx, org, lead, { title: listed ? undefined : LEAD_TITLE });
    const { patch, words } = orgFill(source, org);
    if (words.length > 0) await ctx.db.patch(org._id, { ...patch, updatedAt: Date.now() });
    return {
      dryRun: false as const,
      organizationId: org._id,
      slug: org.slug,
      created,
      leadAdded: !listed,
      filled: words,
      projectStatus: await hideProject(ctx, project),
    };
  },
});

// Internal, so no caller check is needed: only an operator can run it.
export const toProfileBio = internalMutation({
  args: { projectId: v.id("projects"), dryRun: v.optional(v.boolean()) },
  handler: async (ctx, { projectId, dryRun }) => {
    const { project, lead } = await loadProject(ctx, projectId);
    const { text } = projectText(project);
    if (!text) {
      fail("nothing_to_move", `"${project.title}" has no blurb or story to put on ${lead.name}'s profile.`);
    }

    // Never overwrite: Rick decides what to do with a bio that has text.
    if (lead.bio?.trim()) {
      return {
        dryRun: !!dryRun,
        profileId: lead._id,
        bioSet: false,
        bioKept: true as const,
        projectStatus: project.status,
      };
    }

    if (dryRun) {
      return {
        dryRun: true,
        profileId: lead._id,
        bioSet: true,
        bioKept: false as const,
        projectStatus: HIDDEN_STATUS,
      };
    }

    await ctx.db.patch(lead._id, { bio: text, updatedAt: Date.now() });
    // Search reads the bio through the profile's embedding, as profiles.ts does after a save.
    await ctx.scheduler.runAfter(0, api.embeddings.embedProfile, { profileId: lead._id });
    return {
      dryRun: false,
      profileId: lead._id,
      bioSet: true,
      bioKept: false as const,
      projectStatus: await hideProject(ctx, project),
    };
  },
});
