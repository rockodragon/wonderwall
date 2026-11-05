// Search stays fresh: every write that changes what a profile or a project
// says about itself schedules its embedding (convex/searchIndexing.ts), which
// is skipped later if the text turns out the same. These run the real
// mutations on the in-memory ctx and read what they scheduled.

import { getFunctionName } from "convex/server";
import { describe, expect, it } from "vitest";
import { makeCtx, run, type Row } from "../test-support/convexContext";
import { create as createArtifact, remove as removeArtifact, setDescription, update as updateArtifact } from "./artifacts";
import { addRole, closeRole, updateRole } from "./garden/projectTeam";
import { createPassionProject, updateProject } from "./garden/projects";
import { fillMissingBasics } from "./profiles";
import { scheduleProfileEmbedding, scheduleProjectEmbedding } from "./searchIndexing";
import { archive, create as createWondering, update as updateWondering } from "./wonderings";

const ME = "users:me";
const OTHER = "users:other";

function world(): Record<string, Row[]> {
  return {
    users: [{ _id: ME }, { _id: OTHER }],
    profiles: [
      { _id: "profiles:me", userId: ME, name: "user", interests: [], createdAt: 1 },
      { _id: "profiles:other", userId: OTHER, name: "Olu", interests: [], createdAt: 1 },
    ],
    projects: [
      { _id: "projects:p1", userId: ME, kind: "passion", title: "Harbor Songs", status: "active", createdAt: 1, updatedAt: 1 },
    ],
    projectRoles: [
      { _id: "projectRoles:r1", projectId: "projects:p1", title: "Drummer", status: "open", createdAt: 1 },
    ],
    artifacts: [
      { _id: "artifacts:a1", profileId: "profiles:me", projectId: "projects:p1", type: "text", title: "Track 1", order: 0, createdAt: 1 },
    ],
    wonderings: [
      { _id: "wonderings:w1", profileId: "profiles:me", prompt: "Who sings?", isActive: true, isPermanent: true, createdAt: 1 },
    ],
    uploadClaims: [],
    projectMembers: [],
  };
}

/** What a mutation scheduled, as "module:function" plus its id argument. */
async function scheduledBy(fn: unknown, args: Record<string, unknown>, viewer: string | null = ME) {
  const ctx = makeCtx(world(), viewer);
  await run(fn, ctx, args);
  return ctx.scheduled.map((s: { fn: unknown; args: any }) => ({
    name: getFunctionName(s.fn as any),
    id: s.args.projectId ?? s.args.profileId ?? s.args.artifactId ?? s.args.wonderingId,
  }));
}

const PROJECT_EMBED = { name: "embeddings:embedProject", id: "projects:p1" };
const PROFILE_EMBED = { name: "embeddings:embedProfile", id: "profiles:me" };

describe("the helpers", () => {
  it("each schedules its own embedding, now", async () => {
    const ctx = makeCtx({}, null);
    await scheduleProjectEmbedding(ctx, "projects:x" as any);
    await scheduleProfileEmbedding(ctx, "profiles:y" as any);
    expect(ctx.scheduled.map((s: any) => [s.delay, getFunctionName(s.fn), s.args])).toEqual([
      [0, "embeddings:embedProject", { projectId: "projects:x" }],
      [0, "embeddings:embedProfile", { profileId: "profiles:y" }],
    ]);
  });
});

describe("a project's embedding is rescheduled when its text changes", () => {
  it("createPassionProject schedules the new project", async () => {
    const ctx = makeCtx(world(), ME);
    const { projectId } = await run(createPassionProject, ctx, { title: "A film" });
    const embeds = ctx.scheduled.filter((s: any) => getFunctionName(s.fn) === "embeddings:embedProject");
    expect(embeds.map((s: any) => s.args)).toEqual([{ projectId }]);
  });

  it("updateProject schedules it", async () => {
    expect(await scheduledBy(updateProject, { projectId: "projects:p1", blurb: "New words" })).toContainEqual(PROJECT_EMBED);
  });

  it("addRole, updateRole and closeRole schedule the role's project", async () => {
    expect(await scheduledBy(addRole, { projectId: "projects:p1", title: "Mixer" })).toContainEqual(PROJECT_EMBED);
    expect(await scheduledBy(updateRole, { roleId: "projectRoles:r1", title: "Percussion" })).toContainEqual(PROJECT_EMBED);
    expect(await scheduledBy(closeRole, { roleId: "projectRoles:r1" })).toContainEqual(PROJECT_EMBED);
  });

  it("a role edit that changes nothing schedules nothing", async () => {
    expect(await scheduledBy(updateRole, { roleId: "projectRoles:r1" })).toEqual([]);
  });

  it("a piece's description, title or removal schedules its project", async () => {
    expect(await scheduledBy(setDescription, { artifactId: "artifacts:a1", description: "The opener" })).toContainEqual(PROJECT_EMBED);
    expect(await scheduledBy(updateArtifact, { artifactId: "artifacts:a1", title: "Track one" })).toContainEqual(PROJECT_EMBED);
    expect(await scheduledBy(removeArtifact, { artifactId: "artifacts:a1" })).toContainEqual(PROJECT_EMBED);
  });

  it("a new piece schedules the project made for it", async () => {
    const ctx = makeCtx(world(), ME);
    await run(createArtifact, ctx, { type: "text", title: "Poem", content: "Roses" });
    const made = ctx.store.projects.find((p: Row) => p.title !== "Harbor Songs");
    const embeds = ctx.scheduled.filter((s: any) => getFunctionName(s.fn) === "embeddings:embedProject");
    expect(embeds.map((s: any) => s.args)).toEqual([{ projectId: made!._id }]);
  });

  it("someone else's edit is refused and schedules nothing", async () => {
    const ctx = makeCtx(world(), OTHER);
    await expect(run(setDescription, ctx, { artifactId: "artifacts:a1", description: "x" })).rejects.toBeTruthy();
    expect(ctx.scheduled).toEqual([]);
  });
});

describe("a profile's embedding is rescheduled when its text changes", () => {
  it("a wondering created, edited or archived schedules its owner's profile", async () => {
    const without = world();
    without.wonderings = [];
    const ctx = makeCtx(without, ME);
    await run(createWondering, ctx, { prompt: "Who paints?" });
    expect(ctx.scheduled.map((s: any) => getFunctionName(s.fn))).toContain("embeddings:embedProfile");

    expect(await scheduledBy(updateWondering, { wonderingId: "wonderings:w1", prompt: "Who dances?" })).toContainEqual(PROFILE_EMBED);
    expect(await scheduledBy(archive, { wonderingId: "wonderings:w1" })).toContainEqual(PROFILE_EMBED);
  });

  it("filling in a missing name schedules the profile", async () => {
    const blank = makeCtx({ ...world(), profiles: [{ _id: "profiles:me", userId: ME, name: "New User", interests: [], createdAt: 1 }] }, ME);
    await run(fillMissingBasics, blank, { name: "Mia Lopez" });
    expect(blank.scheduled.map((s: any) => [getFunctionName(s.fn), s.args])).toEqual([
      ["embeddings:embedProfile", { profileId: "profiles:me" }],
    ]);
    // A name they already have is left alone, and nothing is queued.
    expect(await scheduledBy(fillMissingBasics, { name: "Mia Lopez" })).toEqual([]);
  });
});
