// A row's `community` is the community it was posted into — only a hostOrg
// of kind "community". Content that carries the platform row (or a church)
// as its hostOrgId shows no community, the same in every list: events,
// classes, and both project lists. (The events and classes lists used to
// show any hostOrg; one shared resolveCommunities now filters them all.)

import { describe, expect, it } from "vitest";
import { makeCtx, run, type Row } from "../test-support/convexContext";
import { list as listEvents } from "./events";
import { listOfferings } from "./offerings";
import { listProjects as listProjectsDetail } from "./garden/projects";
import { listProjects as listProjectsPublic } from "./garden/projectsPublic";

const OWNER = "users:owner";
const GARDEN = "hostOrgs:garden";
const PLATFORM = "hostOrgs:platform";

const NOW = Date.now();
const DAY = 86_400_000;

const world = (): Record<string, Row[]> => ({
  profiles: [{ _id: "profiles:owner", userId: OWNER, name: "Olu", interests: [], createdAt: 0, updatedAt: 0 }],
  hostOrgs: [
    { _id: GARDEN, name: "The Garden", slug: "the-garden", kind: "community", status: "active", createdAt: 1 },
    { _id: PLATFORM, name: "The Creative Exchange", slug: "creatives-exchange", kind: "platform", createdAt: 1 },
  ],
  events: [
    event("events:garden", "In the Garden", GARDEN),
    event("events:platform", "On the platform", PLATFORM),
    event("events:plain", "In neither", undefined),
  ],
  offerings: [
    offering("offerings:garden", "In the Garden", GARDEN),
    offering("offerings:platform", "On the platform", PLATFORM),
    offering("offerings:plain", "In neither", undefined),
  ],
  projects: [
    project("projects:garden", "In the Garden", "in-the-garden", GARDEN),
    project("projects:platform", "On the platform", "on-the-platform", PLATFORM),
    project("projects:plain", "In neither", "in-neither", undefined),
  ],
});

function event(_id: string, title: string, hostOrgId: string | undefined): Row {
  return {
    _id, organizerId: OWNER, title, description: "Bring a song", datetime: NOW + DAY, tags: [],
    requiresApproval: false, status: "published", hostOrgId, createdAt: 0, updatedAt: 0,
  };
}

function offering(_id: string, title: string, hostOrgId: string | undefined): Row {
  return { _id, userId: OWNER, title, format: "class", status: "active", hostOrgId, createdAt: 1, updatedAt: 0 };
}

function project(_id: string, title: string, storySlug: string, hostOrgId: string | undefined): Row {
  return {
    _id, userId: OWNER, kind: "passion", origin: "posted", title, status: "active", storySlug,
    hostOrgId, createdAt: 1, updatedAt: 0,
  };
}

/** title -> the community the row shows (name only, or null). */
const communities = (rows: { title: string; community?: { name: string } | null }[]) =>
  Object.fromEntries(rows.map((r) => [r.title, r.community?.name ?? null]));

const EXPECTED = { "In the Garden": "The Garden", "On the platform": null, "In neither": null };

describe("only a real community shows as a row's community", () => {
  it("events", async () => {
    expect(communities(await run(listEvents, makeCtx(world(), null), {}))).toEqual(EXPECTED);
  });

  it("classes", async () => {
    expect(communities(await run(listOfferings, makeCtx(world(), null)))).toEqual(EXPECTED);
  });

  it("projects (the signed-in list)", async () => {
    expect(communities(await run(listProjectsDetail, makeCtx(world(), null)))).toEqual(EXPECTED);
  });

  it("projects (the public list)", async () => {
    expect(communities(await run(listProjectsPublic, makeCtx(world(), null)))).toEqual(EXPECTED);
  });
});
