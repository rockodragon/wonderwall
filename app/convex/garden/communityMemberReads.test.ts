// The queries that read a community's members through communityLookup.ts
// (activeMembersOfCommunity, membersOfCommunity) instead of each writing the
// read out: who counts as a member, a host, a recipient. Pending requests
// and removed members are in the table and must stay out where they always
// were, and in where a host is meant to see them.

import { ConvexError } from "convex/values";
import { describe, expect, it } from "vitest";
import { makeCtx, run, type Row } from "../../test-support/convexContext";
import { getCommunityMembersByLevel } from "./reports";
import { leaveCommunity, listCommunities, listCommunityApplications, listMembers } from "./communities";
import { searchRecipients } from "./giving";

const GARDEN = "hostOrgs:garden";
const OWNER = "users:owner"; // active host, and the owner
const MIA = "users:mia"; // active member
const HANA = "users:hana"; // active host
const PAT = "users:pat"; // asked to join, still pending
const REM = "users:rem"; // removed
const SOON = "users:soon"; // would-be host, still pending
const ADMIN = "users:admin";

const profile = (userId: string, name: string, over: Partial<Row> = {}): Row => ({
  _id: `profiles:${userId.split(":")[1]}`,
  userId,
  name,
  interests: [],
  createdAt: 1,
  updatedAt: 1,
  ...over,
});
const member = (userId: string, role: string, status: string, n: number): Row => ({
  _id: `communityMembers:${n}`,
  hostOrgId: GARDEN,
  userId,
  role,
  status,
  joinedAt: n,
});

function world(): Record<string, Row[]> {
  return {
    hostOrgs: [
      {
        _id: GARDEN,
        kind: "community",
        name: "The Garden",
        slug: "the-garden",
        status: "active",
        visibility: "public",
        ownerUserId: OWNER,
        createdAt: 1,
      },
    ],
    profiles: [
      profile(OWNER, "Olu"),
      profile(MIA, "Mia"),
      profile(HANA, "Hana"),
      profile(PAT, "Pat"),
      profile(REM, "Rem"),
      profile(SOON, "Soon"),
      profile(ADMIN, "Ada", { isAdmin: true }),
    ],
    communityMembers: [
      member(OWNER, "host", "active", 1),
      member(MIA, "member", "active", 2),
      member(HANA, "host", "active", 3),
      member(PAT, "member", "pending", 4),
      member(REM, "member", "removed", 5),
      member(SOON, "host", "pending", 6),
    ],
    memberships: [],
    favorites: [],
    memberGifts: [{ _id: "memberGifts:g", userId: MIA, communityId: GARDEN, status: "open", createdAt: 1 }],
  };
}

async function refusal(p: Promise<unknown>): Promise<ConvexError<any>> {
  try {
    await p;
  } catch (err) {
    return err as ConvexError<any>;
  }
  throw new Error("expected a refusal");
}

describe("who counts as a community's member", () => {
  it("listCommunities counts active members, and names only active hosts", async () => {
    const [garden] = await run(listCommunities, makeCtx(world(), null));
    expect(garden.memberCount).toBe(3);
    expect([...garden.hosts].sort()).toEqual(["Hana", "Olu"]);
  });

  it("listCommunityApplications counts active members too", async () => {
    const [garden] = await run(listCommunityApplications, makeCtx(world(), ADMIN));
    expect(garden.memberCount).toBe(3);
  });

  it("listMembers shows a host the pending requests, never the removed; a member sees only who is in", async () => {
    const forHost = await run(listMembers, makeCtx(world(), OWNER), { hostOrgId: GARDEN });
    expect(forHost.map((m: { name: string }) => m.name).sort()).toEqual(["Hana", "Mia", "Olu", "Pat", "Soon"]);
    const forMember = await run(listMembers, makeCtx(world(), MIA), { hostOrgId: GARDEN });
    expect(forMember.map((m: { name: string }) => m.name).sort()).toEqual(["Hana", "Mia", "Olu"]);
  });

  it("getCommunityMembersByLevel counts the active and the pending, and leaves the removed out", async () => {
    const summary = await run(getCommunityMembersByLevel, makeCtx(world(), OWNER), { hostOrgId: GARDEN });
    expect(summary.total).toBe(3);
    expect(summary.pending).toBe(2);
  });

  it("searchRecipients offers the active members other than the giver", async () => {
    const people = await run(searchRecipients, makeCtx(world(), MIA), { giftId: "memberGifts:g" });
    expect(people.map((p: { name: string }) => p.name).sort()).toEqual(["Hana", "Olu"]);
  });
});

describe("leaveCommunity — the last host can't leave", () => {
  it("a host may leave while another active host stays", async () => {
    const ctx = makeCtx(world(), HANA);
    expect(await run(leaveCommunity, ctx, { hostOrgId: GARDEN })).toEqual({ ok: true });
    expect(ctx.store.communityMembers.some((m: Row) => m.userId === HANA)).toBe(false);
  });

  it("a pending host doesn't count as the other host", async () => {
    const tables = world();
    // Hana is the only active host left once the owner's row is a plain member.
    tables.hostOrgs[0].ownerUserId = undefined;
    tables.communityMembers = tables.communityMembers.map((m) => (m.userId === OWNER ? { ...m, role: "member" } : m));
    const err = await refusal(run(leaveCommunity, makeCtx(tables, HANA), { hostOrgId: GARDEN }));
    expect(err).toBeInstanceOf(ConvexError);
    expect(err.data.code).toBe("last_host");
  });
});
