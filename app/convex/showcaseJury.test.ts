// The jury side of showcase.ts: which projects are on the ballot, a vote
// upserts per (project, admin), and the decision is its own field that only
// an admin's hand sets. Fake ctx from test-support/convexContext, reads
// checked against the real schema's indexes.

import { describe, expect, it } from "vitest";
import { makeCtx, run } from "../test-support/convexContext";
import { adminList, castVote, clearVote, setStatus } from "./showcase";

const ADMIN = "users:admin";
const MAKER = "users:maker";

function world(viewer: string = ADMIN) {
  return makeCtx(
    {
      profiles: [
        { _id: "profiles:admin", userId: ADMIN, name: "Ada", isAdmin: true },
        { _id: "profiles:maker", userId: MAKER, name: "Maker" },
      ],
      projects: [
        { _id: "projects:live", userId: MAKER, kind: "passion", title: "Mural", status: "active", createdAt: 2 },
        { _id: "projects:done", userId: MAKER, kind: "paid", title: "Short film", status: "completed", createdAt: 1 },
        { _id: "projects:hidden", userId: MAKER, kind: "passion", title: "Hidden", status: "hidden", createdAt: 3 },
        { _id: "projects:gone", userId: MAKER, kind: "passion", title: "Archived", status: "archived", createdAt: 4 },
        { _id: "projects:share", userId: MAKER, kind: "passion", title: "Quick share", status: "active", origin: "portfolio", createdAt: 5 },
      ],
    },
    viewer,
  );
}

describe("the ballot", () => {
  it("is every project the browse grid shows: no hidden, archived or quick shares", async () => {
    const rows = await run(adminList, world());
    expect(rows.map((r: any) => r.title)).toEqual(["Mural", "Short film"]);
    expect(rows[0].byName).toBe("Maker");
    expect(rows[0].status).toBe("new");
    expect(rows[0].tally).toEqual({ yes: 0, maybe: 0, no: 0 });
  });

  it("is admins only", async () => {
    await expect(run(adminList, world(MAKER))).rejects.toThrow();
    await expect(run(castVote, world(MAKER), { projectId: "projects:live", vote: "yes" })).rejects.toThrow();
    await expect(run(setStatus, world(MAKER), { projectId: "projects:live", status: "selected" })).rejects.toThrow();
  });
});

describe("a vote", () => {
  it("revises rather than stacks, and clears only its owner's", async () => {
    const ctx = world();
    await run(castVote, ctx, { projectId: "projects:live", vote: "maybe", note: "  not sure  " });
    await run(castVote, ctx, { projectId: "projects:live", vote: "yes", note: "sure now" });
    let [row] = await run(adminList, ctx);
    expect(row.tally).toEqual({ yes: 1, maybe: 0, no: 0 });
    expect(row.myVote).toBe("yes");
    expect(row.votes).toEqual([{ userId: ADMIN, voter: "Ada", vote: "yes", note: "sure now" }]);

    await run(clearVote, ctx, { projectId: "projects:live" });
    [row] = await run(adminList, ctx);
    expect(row.tally).toEqual({ yes: 0, maybe: 0, no: 0 });
    expect(row.myVote).toBeNull();
  });

  it("puts the jury's favourite first", async () => {
    const ctx = world();
    await run(castVote, ctx, { projectId: "projects:done", vote: "yes" });
    const rows = await run(adminList, ctx);
    expect(rows.map((r: any) => r.title)).toEqual(["Short film", "Mural"]);
  });

  it("needs a project that still exists", async () => {
    await expect(run(castVote, world(), { projectId: "projects:missing", vote: "yes" })).rejects.toThrow();
  });
});

describe("the decision", () => {
  it("is set by hand, records who, and Undecided clears it", async () => {
    const ctx = world();
    await run(setStatus, ctx, { projectId: "projects:live", status: "selected" });
    let [row] = await run(adminList, ctx);
    expect(row.status).toBe("selected");
    expect(ctx.db.get("projects:live")).resolves.toMatchObject({ showcaseStatus: "selected", showcaseDecidedBy: ADMIN });

    await run(setStatus, ctx, { projectId: "projects:live", status: "new" });
    [row] = await run(adminList, ctx);
    expect(row.status).toBe("new");
    const cleared = await ctx.db.get("projects:live");
    expect(cleared.showcaseStatus).toBeUndefined();
    expect(cleared.showcaseDecidedBy).toBeUndefined();
  });
});
