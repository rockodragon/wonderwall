import { v } from "convex/values";
import {
  action,
  internalMutation,
  internalQuery,
  query,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

// Generate embeddings using OpenAI
async function generateEmbedding(text: string): Promise<number[]> {
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
      model: "text-embedding-ada-002",
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

// Build searchable content from profile
function buildProfileContent(profile: {
  name: string;
  bio?: string;
  jobFunctions: string[];
  location?: string;
}): string {
  const parts = [
    profile.name,
    profile.bio,
    profile.jobFunctions.join(", "),
    profile.location,
  ].filter(Boolean);
  return parts.join(" | ");
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

// Internal mutation to save embedding
export const saveEmbedding = internalMutation({
  args: {
    entityType: v.string(),
    entityId: v.string(),
    vector: v.array(v.float64()),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    // Check if embedding already exists
    const existing = await ctx.db
      .query("embeddings")
      .withIndex("by_entity", (q) =>
        q.eq("entityType", args.entityType).eq("entityId", args.entityId),
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        vector: args.vector,
        content: args.content,
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("embeddings", {
        entityType: args.entityType,
        entityId: args.entityId,
        vector: args.vector,
        content: args.content,
        updatedAt: Date.now(),
      });
    }
  },
});

// Internal query to get profile for embedding
export const getProfileForEmbedding = internalQuery({
  args: { profileId: v.id("profiles") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.profileId);
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

// Action to generate and save embedding for a profile
export const embedProfile = action({
  args: { profileId: v.id("profiles") },
  handler: async (ctx, args) => {
    const profile = await ctx.runQuery(
      internal.embeddings.getProfileForEmbedding,
      {
        profileId: args.profileId,
      },
    );
    if (!profile) return;

    const content = buildProfileContent(profile);
    const vector = await generateEmbedding(content);

    await ctx.runMutation(internal.embeddings.saveEmbedding, {
      entityType: "profile",
      entityId: args.profileId,
      vector,
      content,
    });
  },
});

// Action to generate and save embedding for a wondering
export const embedWondering = action({
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
export const embedArtifact = action({
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

// Search action - generates embedding for query and performs vector search
export const search = action({
  args: {
    query: v.string(),
    entityTypes: v.optional(v.array(v.string())),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const queryVector = await generateEmbedding(args.query);
    const limit = args.limit || 20;

    // Perform vector search
    const results = await ctx.vectorSearch("embeddings", "by_vector", {
      vector: queryVector,
      limit,
      filter: args.entityTypes?.length
        ? (q) =>
            q.or(...args.entityTypes!.map((type) => q.eq("entityType", type)))
        : undefined,
    });

    return results;
  },
});

// Query to get profile/wondering/artifact details from search results
export const getSearchResultDetails = query({
  args: {
    results: v.array(
      v.object({
        _id: v.id("embeddings"),
        _score: v.number(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const detailedResults = await Promise.all(
      args.results.map(async (result) => {
        const embedding = await ctx.db.get(result._id);
        if (!embedding) return null;

        let entity = null;
        let entityData = null;

        if (embedding.entityType === "profile") {
          const profile = await ctx.db.get(
            embedding.entityId as Id<"profiles">,
          );
          if (profile) {
            // Get profile image
            let imageUrl = profile.imageUrl || null;
            if (profile.imageStorageId) {
              imageUrl = await ctx.storage.getUrl(profile.imageStorageId);
            }
            entityData = {
              _id: profile._id,
              name: profile.name,
              bio: profile.bio,
              jobFunctions: profile.jobFunctions,
              location: profile.location,
              imageUrl,
            };
          }
        } else if (embedding.entityType === "wondering") {
          const wondering = await ctx.db.get(
            embedding.entityId as Id<"wonderings">,
          );
          if (wondering) {
            // Get profile for wondering
            const profile = await ctx.db.get(wondering.profileId);
            entityData = {
              _id: wondering._id,
              prompt: wondering.prompt,
              profileId: wondering.profileId,
              profileName: profile?.name,
            };
          }
        } else if (embedding.entityType === "artifact") {
          const artifact = await ctx.db.get(
            embedding.entityId as Id<"artifacts">,
          );
          if (artifact) {
            // Get profile for artifact
            const profile = await ctx.db.get(artifact.profileId);
            let mediaUrl = artifact.mediaUrl || null;
            if (artifact.mediaStorageId) {
              mediaUrl = await ctx.storage.getUrl(artifact.mediaStorageId);
            }
            entityData = {
              _id: artifact._id,
              type: artifact.type,
              title: artifact.title,
              content: artifact.content,
              mediaUrl,
              profileId: artifact.profileId,
              profileName: profile?.name,
            };
          }
        }

        return entityData
          ? {
              type: embedding.entityType,
              score: result._score,
              data: entityData,
            }
          : null;
      }),
    );

    return detailedResults.filter(Boolean);
  },
});
