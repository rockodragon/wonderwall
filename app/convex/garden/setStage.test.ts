// setStage and the stage a new project starts at, run on the in-memory ctx in
// test-support. "Released" is gone from the owner's menu and Completed is the
// one finished stage, so a write of the old word (an open tab from before the
// change may still send it) stores Completed instead of erroring. Anything
// else that isn't a stage is refused, as before.

import { describe, expect, it } from "vitest";
import { makeCtx, run } from "../../test-support/convexContext";
import { createPassionProject, setStage } from "./projects";

const BO = "users:bo";
const ADA = "users:ada";

const project = (extra: Record<string, unknown> = {}) => ({
  _id: "projects:p1",
  userId: BO,
  kind: "passion",
  title: "A film",
  status: "active",
  createdAt: 1,
  updatedAt: 1,
  ...extra,
});

const world = (extra: Record<string, unknown> = {}) => ({
  users: [{ _id: ADA }, { _id: BO }],
  profiles: [
    { _id: "profiles:ada", userId: ADA, name: "Ada", interests: [] },
    { _id: "profiles:bo", userId: BO, name: "Bo", interests: [] },
  ],
  projects: [project({ stage: "working", stageChangedAt: 1 })],
  projectMembers: [
    { _id: "projectMembers:m1", projectId: "projects:p1", userId: ADA, name: "Ada", role: "Singer", status: "accepted", createdAt: 1 },
  ],
  ...extra,
});

const stored = (ctx: ReturnType<typeof makeCtx>) => ctx.store.projects.find((p: any) => p._id === "projects:p1");

describe("setStage", () => {
  it("stores completed when an old tab sends releasing", async () => {
    const ctx = makeCtx(world(), BO);
    const result = await run(setStage, ctx, { projectId: "projects:p1", stage: "releasing" });
    expect(stored(ctx).stage).toBe("completed");
    expect(result).toMatchObject({ ok: true, changed: true });
  });

  it("tells the team the project is Completed, not Released", async () => {
    const ctx = makeCtx(world(), BO);
    await run(setStage, ctx, { projectId: "projects:p1", stage: "releasing" });
    expect(ctx.store.notifications).toEqual([
      expect.objectContaining({ userId: ADA, type: "project_stage_changed", title: "A film is now Completed" }),
    ]);
  });

  it("changes nothing for a project already stored as releasing, which reads as Completed", async () => {
    const ctx = makeCtx(world({ projects: [project({ stage: "releasing", stageChangedAt: 1 })] }), BO);
    const result = await run(setStage, ctx, { projectId: "projects:p1", stage: "releasing" });
    expect(result).toEqual({ ok: true, changed: false });
    expect(stored(ctx).stage).toBe("releasing");
    expect(ctx.store.notifications ?? []).toEqual([]);
    const again = await run(setStage, ctx, { projectId: "projects:p1", stage: "completed" });
    expect(again).toEqual({ ok: true, changed: false });
    expect(ctx.store.notifications ?? []).toEqual([]);
  });

  it("moves a project stored as releasing on to another stage", async () => {
    const ctx = makeCtx(world({ projects: [project({ stage: "releasing", stageChangedAt: 1 })] }), BO);
    await run(setStage, ctx, { projectId: "projects:p1", stage: "paused" });
    expect(stored(ctx).stage).toBe("paused");
  });

  it("still takes every stage an owner can pick", async () => {
    for (const stage of ["planning", "raising", "forming", "working", "paused", "completed", "cancelled"]) {
      const ctx = makeCtx(world({ projects: [project({ stage: stage === "planning" ? "working" : "planning" })] }), BO);
      await run(setStage, ctx, { projectId: "projects:p1", stage });
      expect(stored(ctx).stage).toBe(stage);
    }
  });

  it("still refuses anything that is not a stage", async () => {
    for (const stage of ["bogus", "", "Releasing", "RELEASING", "archived", "constructor"]) {
      const ctx = makeCtx(world(), BO);
      await expect(run(setStage, ctx, { projectId: "projects:p1", stage })).rejects.toMatchObject({
        data: { code: "invalid_stage" },
      });
      expect(stored(ctx).stage).toBe("working");
    }
  });
});

describe("createPassionProject's starting stage", () => {
  it("stores completed when sent releasing, and refuses junk", async () => {
    const ctx = makeCtx(world({ projects: [], projectMembers: [] }), ADA);
    await run(createPassionProject, ctx, { title: "Finished", stage: "releasing" });
    expect(ctx.store.projects.map((p: any) => p.stage)).toEqual(["completed"]);
    await expect(run(createPassionProject, ctx, { title: "Nope", stage: "bogus" })).rejects.toMatchObject({
      data: { code: "invalid_stage" },
    });
  });
});
