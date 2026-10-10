// Posting a project as an organization (Rick, 2026-10-10: Abiding Practice
// "should only be an org"): someone who's part of it can; anyone else
// can't; it shows on the organization's page; and sign-up can tell a
// person's name from an organization's.

import { describe, expect, it } from "vitest";
import { makeCtx, run } from "../test-support/convexContext";
import { createPassionProject, updateProject } from "./garden/projects";
import { listOrgProjects } from "./garden/projectTeam";
import { matchByName } from "./organizations";

const DAVID = "users:david";
const STRANGER = "users:stranger";
const AP = "organizations:ap";

function world(viewer: string | null) {
  return makeCtx(
    {
      users: [{ _id: DAVID }, { _id: STRANGER }],
      profiles: [
        { _id: "profiles:david", userId: DAVID, name: "David Russo" },
        { _id: "profiles:stranger", userId: STRANGER, name: "Sam" },
      ],
      organizations: [{ _id: AP, name: "Abiding Practice", nameKey: "abiding practice", slug: "abiding-practice" }],
      orgPositions: [
        { _id: "orgPositions:d", organizationId: AP, userId: DAVID, profileId: "profiles:david", isAdmin: false, order: 0, createdAt: 1 },
      ],
    },
    viewer,
  );
}

describe("posting as an organization", () => {
  it("someone part of it can, and it lists on the organization's page", async () => {
    const ctx = world(DAVID);
    const { projectId } = await run(createPassionProject, ctx, { title: "Bloom (short film)", organizationId: AP });
    const saved = ctx.store.projects.find((p: any) => p._id === projectId);
    expect(saved).toMatchObject({ userId: DAVID, organizationId: AP });
    const rows = await run(listOrgProjects, ctx, { organizationId: AP });
    expect(rows.map((r: any) => [r.title, r.role])).toEqual([["Bloom (short film)", null]]);
  });

  it("someone not part of it can't", async () => {
    await expect(
      run(createPassionProject, world(STRANGER), { title: "Not theirs", organizationId: AP }),
    ).rejects.toMatchObject({ data: { code: "not_in_org" } });
  });

  it("an edit can move it back to the person", async () => {
    const ctx = world(DAVID);
    const { projectId } = await run(createPassionProject, ctx, { title: "Bloom", organizationId: AP });
    await run(updateProject, ctx, { projectId, postAsSelf: true });
    expect(ctx.store.projects.find((p: any) => p._id === projectId).organizationId).toBeUndefined();
    expect(await run(listOrgProjects, ctx, { organizationId: AP })).toEqual([]);
  });
});

describe("matchByName", () => {
  it("finds an organization's exact name, whatever the case and spacing", async () => {
    const ctx = world(null);
    expect(await run(matchByName, ctx, { name: "  abiding   PRACTICE " })).toEqual({
      name: "Abiding Practice",
      slug: "abiding-practice",
    });
    expect(await run(matchByName, ctx, { name: "David Russo" })).toBeNull();
    expect(await run(matchByName, ctx, { name: "ab" })).toBeNull();
  });
});
