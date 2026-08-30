// V1 pivot: fold Portfolio into Projects (spec docs/the-exchange-v1-prd.md §7).
// Each artifact becomes its own new passion project; the artifact itself
// becomes that project's attached media via projectId. Idempotent by
// projectId — an artifact already migrated is skipped. profileId is kept
// (legacy /works reader, original-author link), nothing is deleted.

import { internalMutation } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

// ——— Pure core ———

export interface LegacyArtifact {
  _id: Id<"artifacts">;
  profileId: Id<"profiles">;
  type: string; // "text" | "image" | "video" | "audio" | "link"
  content?: string;
  mediaUrl?: string;
  ogImageUrl?: string;
  title?: string;
  createdAt: number;
}

const TYPE_FALLBACK_TITLE: Record<string, string> = {
  image: "Untitled image",
  video: "Untitled video",
  audio: "Untitled audio",
  link: "Untitled link",
  text: "Untitled",
};

/** An artifact's title is optional; a project's is required. Prefer the
 * artifact's own title; for untitled text pieces, borrow the opening words
 * rather than falling straight to a generic label. */
export function deriveProjectTitle(artifact: Pick<LegacyArtifact, "type" | "title" | "content">): string {
  if (artifact.title?.trim()) return artifact.title.trim();
  if (artifact.type === "text" && artifact.content?.trim()) {
    const words = artifact.content.trim().split(/\s+/).slice(0, 8).join(" ");
    return words.length < artifact.content.trim().length ? `${words}…` : words;
  }
  return TYPE_FALLBACK_TITLE[artifact.type] ?? "Untitled";
}

export function mapArtifactToProject(artifact: LegacyArtifact, userId: Id<"users">) {
  return {
    userId,
    kind: "passion" as const,
    title: deriveProjectTitle(artifact),
    blurb: artifact.type === "text" ? artifact.content : undefined,
    status: "active",
    photoUrl: artifact.type === "image" || artifact.type === "link"
      ? artifact.mediaUrl ?? artifact.ogImageUrl
      : undefined,
    createdAt: artifact.createdAt,
    updatedAt: Date.now(),
  };
}

// ——— Runner (operator-invoked once from the dashboard/CLI, idempotent) ———

export const migrateArtifactsToProjects = internalMutation({
  args: {},
  handler: async (ctx) => {
    const artifacts = await ctx.db.query("artifacts").collect();
    let migrated = 0;
    let skipped = 0;
    const missingProfile: Id<"artifacts">[] = [];
    for (const artifact of artifacts) {
      if (artifact.projectId) {
        skipped++;
        continue;
      }
      const profile = await ctx.db.get(artifact.profileId);
      if (!profile) {
        // Orphaned artifact (profile deleted) — leave it alone rather than
        // guess an owner; flag it back to the caller instead of failing
        // the whole run.
        missingProfile.push(artifact._id);
        continue;
      }
      const projectId = await ctx.db.insert(
        "projects",
        mapArtifactToProject(artifact, profile.userId),
      );
      await ctx.db.patch(artifact._id, { projectId });
      migrated++;
    }
    return { migrated, skipped, missingProfile, total: artifacts.length };
  },
});
