// The shared community reads: which hostOrgs rows count as communities
// (resolveCommunities — the B5 kind filter), whether one is open, who
// belongs, and who a community's members are. Run on the in-memory ctx in
// test-support/.

import { describe, expect, it } from "vitest";
import { makeCtx } from "../../test-support/convexContext";
import {
  COMMUNITY_KIND,
  activeCommunityMemberships,
  activeMembersOfCommunity,
  communityMembershipsOf,
  getCommunityMember,
  isActiveCommunityOrg,
  membersOfCommunity,
  resolveCommunities,
} from "./communityLookup";
import { COMMUNITY_KIND as RE_EXPORTED_KIND, getCommunityMember as reExportedMember } from "./communities";

const GARDEN = "hostOrgs:garden";
const SD = "hostOrgs:sd";
const PLATFORM = "hostOrgs:platform";
const CHURCH = "hostOrgs:church";
const GHOST = "hostOrgs:ghost";

const ANN = "users:ann";
const BEN = "users:ben";

const world = () => ({
  hostOrgs: [
    { _id: GARDEN, kind: "community", name: "The Garden", slug: "the-garden" },
    { _id: SD, kind: "community", name: "Create SD", slug: "sd", status: "pending" },
    { _id: PLATFORM, kind: "platform", name: "The Creative Exchange", slug: "creatives-exchange" },
    { _id: CHURCH, kind: "church", name: "St. Mary's", slug: "st-marys" },
  ],
  communityMembers: [
    { _id: "communityMembers:1", hostOrgId: GARDEN, userId: ANN, status: "active", role: "member", joinedAt: 1 },
    { _id: "communityMembers:2", hostOrgId: SD, userId: ANN, status: "pending", role: "host", joinedAt: 2 },
    { _id: "communityMembers:3", hostOrgId: PLATFORM, userId: ANN, status: "removed", role: "member", joinedAt: 3 },
    { _id: "communityMembers:4", hostOrgId: GARDEN, userId: BEN, status: "active", role: "host", joinedAt: 4 },
  ],
});
const ctx = () => makeCtx(world(), null);
const id = (s: string) => s as any;

describe("resolveCommunities", () => {
  it("returns a real community's name and slug", async () => {
    const got = await resolveCommunities(ctx(), [id(GARDEN)]);
    expect(got.get(GARDEN)).toEqual({ name: "The Garden", slug: "the-garden" });
  });

  it("leaves out a hostOrg that isn't a community (the platform row, a church)", async () => {
    const got = await resolveCommunities(ctx(), [id(GARDEN), id(PLATFORM), id(CHURCH)]);
    expect([...got.keys()]).toEqual([GARDEN]);
    expect(got.has(PLATFORM)).toBe(false);
    expect(got.has(CHURCH)).toBe(false);
  });

  it("keeps a community that isn't open yet (the caller decides what to show)", async () => {
    expect((await resolveCommunities(ctx(), [id(SD)])).get(SD)).toEqual({ name: "Create SD", slug: "sd" });
  });

  it("skips missing ids and orgs that no longer exist", async () => {
    const got = await resolveCommunities(ctx(), [undefined, null, id(GHOST), id(GARDEN)]);
    expect([...got.keys()]).toEqual([GARDEN]);
  });

  it("reads each distinct org once, however many rows share it", async () => {
    const c = ctx();
    let reads = 0;
    const get = c.db.get;
    c.db.get = async (x: string) => (reads++, get(x));
    await resolveCommunities(c, [id(GARDEN), id(GARDEN), id(SD), id(GARDEN)]);
    expect(reads).toBe(2);
  });
});

describe("isActiveCommunityOrg", () => {
  it("is a community with no status or an active one", () => {
    expect(isActiveCommunityOrg({ kind: COMMUNITY_KIND })).toBe(true);
    expect(isActiveCommunityOrg({ kind: COMMUNITY_KIND, status: "active" })).toBe(true);
  });

  it("is not a pending, declined or archived community", () => {
    for (const status of ["pending", "declined", "archived"]) {
      expect(isActiveCommunityOrg({ kind: COMMUNITY_KIND, status })).toBe(false);
    }
  });

  it("is not another kind of org", () => {
    for (const kind of ["platform", "church", "org"]) {
      expect(isActiveCommunityOrg({ kind, status: "active" })).toBe(false);
    }
  });
});

describe("community membership reads", () => {
  it("getCommunityMember finds one person's row in one community, any status", async () => {
    expect((await getCommunityMember(ctx(), id(SD), id(ANN)))?.status).toBe("pending");
    expect(await getCommunityMember(ctx(), id(SD), id(BEN))).toBeNull();
  });

  it("communityMembershipsOf is every row, any status", async () => {
    expect((await communityMembershipsOf(ctx(), id(ANN))).map((m) => m.status).sort()).toEqual([
      "active",
      "pending",
      "removed",
    ]);
  });

  it("activeCommunityMemberships is only the active rows", async () => {
    const rows = await activeCommunityMemberships(ctx(), id(ANN));
    expect(rows.map((m) => m.hostOrgId)).toEqual([GARDEN]);
    expect(await activeCommunityMemberships(ctx(), id("users:nobody"))).toEqual([]);
  });

  it("membersOfCommunity is every row of the community, any status", async () => {
    const tables = world();
    tables.communityMembers.push({ _id: "communityMembers:5", hostOrgId: GARDEN, userId: "users:cy", status: "pending", role: "member", joinedAt: 5 });
    const rows = await membersOfCommunity(makeCtx(tables, null), id(GARDEN));
    expect(rows.map((m) => m.userId)).toEqual([ANN, BEN, "users:cy"]);
    expect(await membersOfCommunity(ctx(), id(GHOST))).toEqual([]);
  });

  it("activeMembersOfCommunity is who is in it now: no pending request, no one removed", async () => {
    const tables = world();
    tables.communityMembers.push(
      { _id: "communityMembers:5", hostOrgId: GARDEN, userId: "users:cy", status: "pending", role: "member", joinedAt: 5 },
      { _id: "communityMembers:6", hostOrgId: GARDEN, userId: "users:di", status: "removed", role: "member", joinedAt: 6 },
    );
    const rows = await activeMembersOfCommunity(makeCtx(tables, null), id(GARDEN));
    expect(rows.map((m) => m.userId)).toEqual([ANN, BEN]);
    expect(rows.map((m) => m.role)).toEqual(["member", "host"]);
    expect(await activeMembersOfCommunity(ctx(), id(SD))).toEqual([]);
  });
});

describe("communities.ts re-exports", () => {
  it("still serves the names callers import from there", () => {
    expect(RE_EXPORTED_KIND).toBe(COMMUNITY_KIND);
    expect(reExportedMember).toBe(getCommunityMember);
  });
});
