// Seed the "Small Acts: Neighbors" documentary project — the Exchange's
// first patronage pilot. Owned by rickmoy@gmail.com's user record.
//
// Run against the deployment you mean:
//   npx convex run garden/seedNeighborsProject:seed
//   npx convex run garden/seedNeighborsProject:seed --prod
//
// Idempotent: skips if a project with this title already exists for the user.
// Creates the project, posts the initial story updates, and sets up the
// Abiding Practice fiscal sponsor association.

import { internalMutation } from "../_generated/server";
import { resolveAvailableSlug, slugifyTitle } from "./stories";

const PROJECT_TITLE = "Small Acts: Neighbors";

const BLURB =
  "A documentary about what happens when ordinary people cross every boundary they have to love their neighbor. Following a team into Nepal's flood-devastated districts — through the doubt, preparation, and cost — and back home changed.";

const INITIAL_UPDATES = [
  {
    body: "We felt called to go. Not as rescuers — we have no expertise in disaster relief. Not as missionaries — Nepal is eighty percent Hindu with deep Buddhist roots, and we're not going to convert anyone. We're going as neighbors, to serve under local leadership and do whatever small thing is in front of us.",
  },
  {
    body: "The command to love your neighbor doesn't come with a footnote about what your neighbor believes. We disagree deeply with much of what they believe, and we're going anyway, because the command doesn't require agreement. It requires love.",
  },
  {
    body: "Discernment, preparation, partnership building, crew assembly. Updates are live. If you're a person of prayer, that's the single most valuable thing you can offer.",
  },
];

export const seed = internalMutation({
  args: {},
  handler: async (ctx) => {
    // Find rickmoy@gmail.com's user record.
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_name")
      .collect();
    // Look up by email through the users table (accounts store email).
    const allUsers = await ctx.db.query("users").collect();
    let ownerUserId: typeof allUsers[0]["_id"] | null = null;

    for (const user of allUsers) {
      if (user.email === "rickmoy@gmail.com") {
        ownerUserId = user._id;
        break;
      }
    }

    if (!ownerUserId) {
      // Try accounts table (Convex Auth stores email there).
      // Cast through `any` — accounts is an auth-managed table not in the
      // app's typed schema, and this is a one-off seed script.
      const accounts = await (ctx.db as any).query("accounts").collect();
      for (const acc of accounts as any[]) {
        if (
          acc.providerAccountId === "rickmoy@gmail.com" ||
          acc.email === "rickmoy@gmail.com"
        ) {
          ownerUserId = acc.userId;
          break;
        }
      }
    }

    if (!ownerUserId) {
      throw new Error(
        "No user found for rickmoy@gmail.com — sign in first, then re-run.",
      );
    }

    // Check for existing project with this title by this user.
    const existing = await ctx.db
      .query("projects")
      .withIndex("by_userId", (q) => q.eq("userId", ownerUserId!))
      .collect();
    if (existing.some((p) => p.title === PROJECT_TITLE)) {
      return { ok: true, existed: true };
    }

    // Find Abiding Practice hostOrg for fiscal sponsor association.
    const ap = await ctx.db
      .query("hostOrgs")
      .withIndex("by_slug", (q) => q.eq("slug", "abiding-practice"))
      .unique();

    const now = Date.now();
    const storySlug = await resolveAvailableSlug(
      slugifyTitle(PROJECT_TITLE),
      async (candidate) => {
        const hit = await ctx.db
          .query("projects")
          .withIndex("by_storySlug", (q) => q.eq("storySlug", candidate))
          .unique();
        return hit !== null;
      },
    );

    const projectId = await ctx.db.insert("projects", {
      userId: ownerUserId,
      kind: "passion",
      origin: "posted",
      title: PROJECT_TITLE,
      blurb: BLURB,
      status: "active",
      stage: "planning",
      stageChangedAt: now,
      storySlug,
      interests: ["Filmmaking", "Photography"],
      hostOrgId: ap?._id,
      location: "Nepal / San Diego, CA",
      remote: false,
      benefitsNonprofit: true,
      nonprofitName: "Abiding Practice",
      createdAt: now,
      updatedAt: now,
    });

    // Post initial story updates (oldest first so timeline is correct).
    for (let i = 0; i < INITIAL_UPDATES.length; i++) {
      await ctx.db.insert("storyUpdates", {
        projectId,
        authorUserId: ownerUserId,
        body: INITIAL_UPDATES[i].body,
        createdAt: now - (INITIAL_UPDATES.length - i) * 86400_000,
      });
    }

    return { ok: true, existed: false, projectId, storySlug };
  },
});
