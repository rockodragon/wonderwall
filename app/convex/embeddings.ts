import { v } from "convex/values";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { getProfileByUserId } from "./helpers";
import { richDocPlainText } from "./garden/richText";
import { placeForViewer } from "./garden/projectVisibility";
import {
  SEARCH_MODEL,
  embeddingIsCurrent,
  profileSearchText,
  projectSearchText,
} from "./searchRules";

// Embeddings: what smart search (convex/smartSearch.ts, rules in
// convex/searchRules.ts) compares a search against. A profile's and a
// project's are rewritten when they change (embedProfile, embedProject,
// scheduled by the writes) and skipped when the text and model are the
// same as what is stored. Pieces and wonderings keep their own (embedArtifact,
// embedWondering); nothing searches those yet.
//
// Everything here is internal: only the server schedules an embedding, and
// a search goes through smartSearch.rank.

/** One OpenAI embedding of `text` with SEARCH_MODEL. Throws when the key is
 * missing or the call fails; callers decide what that means. */
export async function generateEmbedding(text: string): Promise<number[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY not configured");
  }

  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: SEARCH_MODEL,
      input: text.slice(0, 8000), // Limit input to avoid token limits
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${error}`);
  }

  const data = await response.json();
  return data.data[0].embedding;
}

// Build searchable content from wondering
function buildWonderingContent(wondering: { prompt: string }): string {
  return wondering.prompt;
}

// Build searchable content from artifact
function buildArtifactContent(artifact: {
  type: string;
  title?: string;
  content?: string;
}): string {
  const parts = [artifact.title, artifact.content].filter(Boolean);
  return parts.join(" | ") || artifact.type;
}

/** Writes (or rewrites) the one embedding an entity has. */
export const saveEmbedding = internalMutation({
  args: {
    entityType: v.string(),
    entityId: v.string(),
    vector: v.array(v.float64()),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("embeddings")
      .withIndex("by_entity", (q) =>
        q.eq("entityType", args.entityType).eq("entityId", args.entityId),
      )
      .first();
    const row = { vector: args.vector, content: args.content, model: SEARCH_MODEL, updatedAt: Date.now() };
    if (existing) {
      await ctx.db.patch(existing._id, row);
    } else {
      await ctx.db.insert("embeddings", { entityType: args.entityType, entityId: args.entityId, ...row });
    }
  },
});

async function storedEmbedding(
  ctx: { db: any },
  entityType: string,
  entityId: string,
): Promise<{ content: string; model?: string } | null> {
  return await ctx.db
    .query("embeddings")
    .withIndex("by_entity", (q: any) => q.eq("entityType", entityType).eq("entityId", entityId))
    .first();
}

/** A profile's search text (searchRules.profileSearchText), and whether its
 * stored embedding already says that. Null when the profile is gone. */
export const profileEmbeddingSource = internalQuery({
  args: { profileId: v.id("profiles") },
  handler: async (ctx, { profileId }) => {
    const profile = await ctx.db.get(profileId);
    if (!profile) return null;
    const wondering = await ctx.db
      .query("wonderings")
      .withIndex("by_profileId_active", (q) => q.eq("profileId", profileId).eq("isActive", true))
      .first();
    const content = profileSearchText({ ...profile, wondering: wondering?.prompt });
    return { content, current: embeddingIsCurrent(await storedEmbedding(ctx, "profile", profileId), content) };
  },
});

/** A project's search text (searchRules.projectSearchText): what it says,
 * who made it, its open roles, its place as a visitor sees it, and its
 * pieces. Null when the project is gone. */
export const projectEmbeddingSource = internalQuery({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    const project = await ctx.db.get(projectId);
    if (!project) return null;
    const [maker, org, roles, pieces] = await Promise.all([
      getProfileByUserId(ctx, project.userId),
      project.organizationId ? ctx.db.get(project.organizationId) : null,
      ctx.db
        .query("projectRoles")
        .withIndex("by_projectId_status", (q) => q.eq("projectId", projectId).eq("status", "open"))
        .collect(),
      ctx.db
        .query("artifacts")
        .withIndex("by_projectId", (q) => q.eq("projectId", projectId))
        .collect(),
    ]);
    const content = projectSearchText({
      title: project.title,
      blurb: project.blurb,
      body: richDocPlainText(project.body),
      topics: project.interests,
      roles: roles.map((r) => r.title),
      place: placeForViewer(project, false).location,
      maker: org?.name ?? maker?.name,
      pieces: pieces.map((a) => ({ title: a.title, description: a.description })),
    });
    return { content, current: embeddingIsCurrent(await storedEmbedding(ctx, "project", projectId), content) };
  },
});

// Internal query to get wondering for embedding
export const getWonderingForEmbedding = internalQuery({
  args: { wonderingId: v.id("wonderings") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.wonderingId);
  },
});

// Internal query to get artifact for embedding
export const getArtifactForEmbedding = internalQuery({
  args: { artifactId: v.id("artifacts") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.artifactId);
  },
});

/** Re-embeds a profile when what it would be made of has changed. */
export const embedProfile = internalAction({
  args: { profileId: v.id("profiles") },
  handler: async (ctx, { profileId }) => {
    const source = await ctx.runQuery(internal.embeddings.profileEmbeddingSource, { profileId });
    if (!source || source.current) return;
    const vector = await generateEmbedding(source.content);
    await ctx.runMutation(internal.embeddings.saveEmbedding, {
      entityType: "profile",
      entityId: profileId,
      vector,
      content: source.content,
    });
  },
});

/** Re-embeds a project when what it would be made of has changed. Every
 * project is embedded, listed or not (a draft, say); smartSearch only ever
 * returns listed ones. */
export const embedProject = internalAction({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    const source = await ctx.runQuery(internal.embeddings.projectEmbeddingSource, { projectId });
    if (!source || source.current) return;
    const vector = await generateEmbedding(source.content);
    await ctx.runMutation(internal.embeddings.saveEmbedding, {
      entityType: "project",
      entityId: projectId,
      vector,
      content: source.content,
    });
  },
});

// Action to generate and save embedding for a wondering
export const embedWondering = internalAction({
  args: { wonderingId: v.id("wonderings") },
  handler: async (ctx, args) => {
    const wondering = await ctx.runQuery(
      internal.embeddings.getWonderingForEmbedding,
      { wonderingId: args.wonderingId },
    );
    if (!wondering) return;

    const content = buildWonderingContent(wondering);
    const vector = await generateEmbedding(content);

    await ctx.runMutation(internal.embeddings.saveEmbedding, {
      entityType: "wondering",
      entityId: args.wonderingId,
      vector,
      content,
    });
  },
});

// Action to generate and save embedding for an artifact
export const embedArtifact = internalAction({
  args: { artifactId: v.id("artifacts") },
  handler: async (ctx, args) => {
    const artifact = await ctx.runQuery(
      internal.embeddings.getArtifactForEmbedding,
      { artifactId: args.artifactId },
    );
    if (!artifact) return;

    // Only embed text-based artifacts
    if (!artifact.title && !artifact.content) return;

    const content = buildArtifactContent(artifact);
    const vector = await generateEmbedding(content);

    await ctx.runMutation(internal.embeddings.saveEmbedding, {
      entityType: "artifact",
      entityId: args.artifactId,
      vector,
      content,
    });
  },
});

/** The gap between two scheduled embeddings in a backfill, so a few hundred
 * don't hit OpenAI at once. */
export const BACKFILL_SPACING_MS = 150;

/**
 * Operator CLI, once after deploy and again whenever SEARCH_MODEL changes:
 * `npx convex run --prod embeddings:backfillSearch`. Schedules an embedding
 * for every profile and every project that isn't archived (a hidden one is
 * embedded too, so it is indexed the moment it is unhidden; the search's
 * resolveHits drops what the caller may not see). Each one skips the call when what is stored is already
 * current, so running it twice costs nothing. Returns how many it queued.
 */
export const backfillSearch = internalMutation({
  args: {},
  handler: async (ctx) => {
    const [profiles, projects] = await Promise.all([
      ctx.db.query("profiles").collect(),
      ctx.db.query("projects").collect(),
    ]);
    const shown = projects.filter((p) => p.status !== "archived");
    let at = 0;
    for (const p of profiles) {
      await ctx.scheduler.runAfter(at, internal.embeddings.embedProfile, { profileId: p._id });
      at += BACKFILL_SPACING_MS;
    }
    for (const p of shown) {
      await ctx.scheduler.runAfter(at, internal.embeddings.embedProject, { projectId: p._id as Id<"projects"> });
      at += BACKFILL_SPACING_MS;
    }
    return { profiles: profiles.length, projects: shown.length };
  },
});
