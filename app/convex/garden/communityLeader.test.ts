// Who is a community leader (communityLeader.ts): a platform admin, or an
// ACTIVE host of a community. Run on the in-memory ctx in test-support/, with
// every read checked against the real schema's indexes.

import { describe, expect, it } from "vitest";
import { makeCtx } from "../../test-support/convexContext";
import { checkIndexes } from "../../test-support/indexChecks";
import { isCommunityLeader, leaderUserIds } from "./communityLeader";
import { isLeaderRole as fromLookup } from "./communityLookup";
import { isLeaderRole as fromCommunities } from "./communities";

const GARDEN = "hostOrgs:garden";
const SD = "hostOrgs:sd";

const ADMIN = "users:admin";
const HOST = "users:host";
const OWNER = "users:owner";
const REMOVED_HOST = "users:removedhost";
const MODERATOR = "users:mod";
const PENDING_HOST = "users:pendinghost";
const MEMBER = "users:member";
const NO_PROFILE = "users:ghost";
const HOST_NO_PROFILE = "users:hostghost";
const MIXED = "users:mixed";

const profile = (user: string, extra: Record<string, unknown> = {}) => ({
  _id: `profiles:${user.split(":")[1]}`,
  userId: user,
  name: user,
  interests: [],
  ...extra,
});
const row = (n: number, hostOrgId: string, userId: string, role: string, status: string) => ({
  _id: `communityMembers:${n}`,
  hostOrgId,
  userId,
  role,
  status,
  joinedAt: n,
});

const world = () => ({
  hostOrgs: [
    { _id: GARDEN, kind: "community", name: "The Garden", slug: "the-garden", ownerUserId: OWNER },
    { _id: SD, kind: "community", name: "Create SD", slug: "sd" },
  ],
  profiles: [
    profile(ADMIN, { isAdmin: true }),
    profile(HOST),
    profile(OWNER),
    profile(REMOVED_HOST),
    profile(MODERATOR),
    profile(PENDING_HOST),
    profile(MEMBER),
    profile(MIXED),
    // isAdmin false, not missing: the flag is only ever true or off.
    profile("users:notadmin", { isAdmin: false }),
  ],
  communityMembers: [
    row(1, GARDEN, OWNER, "host", "active"),
    row(2, GARDEN, HOST, "host", "active"),
    row(3, GARDEN, REMOVED_HOST, "host", "removed"),
    row(4, GARDEN, MODERATOR, "moderator", "active"),
    row(5, GARDEN, PENDING_HOST, "host", "pending"),
    row(6, GARDEN, MEMBER, "member", "active"),
    row(7, GARDEN, HOST_NO_PROFILE, "host", "active"),
    // Mixed: a removed host in one community, a plain member in another.
    row(8, GARDEN, MIXED, "host", "removed"),
    row(9, SD, MIXED, "member", "active"),
    row(10, GARDEN, "users:notadmin", "member", "active"),
  ],
});
const ctx = () => makeCtx(world(), null);
const id = (s: string) => s as any;

describe("isCommunityLeader", () => {
  it("is true for a platform admin, who needs no community", async () => {
    expect(await isCommunityLeader(ctx(), id(ADMIN))).toBe(true);
  });

  it("is true for an active host (an admin of a community)", async () => {
    expect(await isCommunityLeader(ctx(), id(HOST))).toBe(true);
  });

  it("is true for a community's owner, who is an active host too", async () => {
    expect(await isCommunityLeader(ctx(), id(OWNER))).toBe(true);
  });

  it("is false for a removed host", async () => {
    expect(await isCommunityLeader(ctx(), id(REMOVED_HOST))).toBe(false);
  });

  it("is false for a moderator: they manage, but don't lead", async () => {
    expect(await isCommunityLeader(ctx(), id(MODERATOR))).toBe(false);
  });

  it("is false for a host whose request is still pending", async () => {
    expect(await isCommunityLeader(ctx(), id(PENDING_HOST))).toBe(false);
  });

  it("is false for a plain member", async () => {
    expect(await isCommunityLeader(ctx(), id(MEMBER))).toBe(false);
  });

  it("is false for someone with no profile and no community", async () => {
    expect(await isCommunityLeader(ctx(), id(NO_PROFILE))).toBe(false);
  });

  it("is false for a profile that is not an admin (isAdmin: false) in no community", async () => {
    expect(await isCommunityLeader(ctx(), id("users:notadmin"))).toBe(false);
  });

  it("is true for an active host who has no profile row: leading is the membership", async () => {
    expect(await isCommunityLeader(ctx(), id(HOST_NO_PROFILE))).toBe(true);
  });

  it("counts the one community they lead, not the others they merely belong to", async () => {
    expect(await isCommunityLeader(ctx(), id(MIXED))).toBe(false);
    const w = world();
    w.communityMembers.push(row(11, SD, MIXED, "host", "active"));
    expect(await isCommunityLeader(makeCtx(w, null), id(MIXED))).toBe(true);
  });

  it("is the same for a signed-out caller as for anyone: the rule has no viewer", async () => {
    expect(await isCommunityLeader(makeCtx(world(), null), id(HOST))).toBe(true);
    expect(await isCommunityLeader(makeCtx(world(), MEMBER), id(HOST))).toBe(true);
    expect(await isCommunityLeader(makeCtx(world(), MEMBER), id(MEMBER))).toBe(false);
  });
});

// Applying for a community makes you its active host on the spot
// (communities.ts applyForCommunity), before an operator has said yes.
describe("isCommunityLeader — only a host of an open community leads", () => {
  const PENDING = "hostOrgs:pending";
  const DECLINED = "hostOrgs:declined";
  const ARCHIVED = "hostOrgs:archived";
  const PLATFORM = "hostOrgs:platform";
  const GONE = "hostOrgs:deleted";
  const withOrgs = () => {
    const w = world();
    w.hostOrgs.push(
      { _id: PENDING, kind: "community", name: "Applied", slug: "applied", status: "pending", ownerUserId: "users:applicant" } as any,
      { _id: DECLINED, kind: "community", name: "Declined", slug: "declined", status: "declined" } as any,
      { _id: ARCHIVED, kind: "community", name: "Archived", slug: "archived", status: "archived" } as any,
      { _id: PLATFORM, kind: "platform", name: "The Creative Exchange", slug: "creatives-exchange" } as any,
    );
    return w;
  };
  const leads = (w: ReturnType<typeof withOrgs>, user: string) => isCommunityLeader(makeCtx(w, null), id(user));

  it("a host of a community that is still pending is not a leader", async () => {
    const w = withOrgs();
    w.profiles.push(profile("users:applicant"));
    w.communityMembers.push(row(20, PENDING, "users:applicant", "host", "active"));
    expect(await leads(w, "users:applicant")).toBe(false);
  });

  it("nor is a host of a declined or an archived community", async () => {
    const w = withOrgs();
    w.communityMembers.push(row(21, DECLINED, "users:d", "host", "active"), row(22, ARCHIVED, "users:a", "host", "active"));
    expect(await leads(w, "users:d")).toBe(false);
    expect(await leads(w, "users:a")).toBe(false);
  });

  it("nor is a host of something that isn't a community (the platform row), or of one that is gone", async () => {
    const w = withOrgs();
    w.communityMembers.push(row(23, PLATFORM, "users:p", "host", "active"), row(24, GONE, "users:g", "host", "active"));
    expect(await leads(w, "users:p")).toBe(false);
    expect(await leads(w, "users:g")).toBe(false);
  });

  it("becomes a leader the moment the operator approves it", async () => {
    const w = withOrgs();
    w.communityMembers.push(row(25, PENDING, "users:applicant", "host", "active"));
    expect(await leads(w, "users:applicant")).toBe(false);
    (w.hostOrgs.find((o) => o._id === PENDING) as unknown as { status: string }).status = "active";
    expect(await leads(w, "users:applicant")).toBe(true);
  });

  it("a community with no status at all is open, as everywhere else hostOrgs is read", async () => {
    expect(await isCommunityLeader(ctx(), id(HOST))).toBe(true);
    expect(world().hostOrgs.every((o) => !("status" in o))).toBe(true);
  });

  it("leads if any one of their communities is open, whatever the others are", async () => {
    const w = withOrgs();
    w.communityMembers.push(row(26, PENDING, "users:both", "host", "active"), row(27, GARDEN, "users:both", "host", "active"));
    expect(await leads(w, "users:both")).toBe(true);
  });

  it("an admin leads whatever their communities are", async () => {
    const w = withOrgs();
    w.communityMembers.push(row(28, PENDING, ADMIN, "host", "active"));
    expect(await leads(w, ADMIN)).toBe(true);
  });

  it("a list agrees, and fetches each community once however many of its people are listed", async () => {
    const w = withOrgs();
    w.communityMembers.push(row(29, PENDING, "users:applicant", "host", "active"));
    const crowd = Array.from({ length: 30 }, (_, i) => `users:crowd${i}`);
    w.communityMembers.push(...crowd.map((u, i) => row(100 + i, i % 2 ? PENDING : GARDEN, u, "host", "active")));
    const c = makeCtx(w, null);
    const { scans } = checkIndexes(c);
    let fetches = 0;
    const get = c.db.get;
    c.db.get = async (x: string) => (fetches++, get(x));
    const leaders = await leaderUserIds(c, [...crowd, "users:applicant", HOST].map(id));
    // The 15 hosts of the open Garden, and HOST: not the 15 at the pending one, nor the applicant.
    expect(leaders.size).toBe(16);
    expect(leaders.has("users:applicant")).toBe(false);
    expect(leaders.has("users:crowd1")).toBe(false);
    expect(leaders.has("users:crowd0")).toBe(true);
    // Two communities in all (the Garden and the pending one), however many people: two reads.
    expect(fetches).toBe(2);
    expect(scans).toEqual([]);
  });
});

describe("isCommunityLeader — a profile the caller already has", () => {
  const admin = world().profiles[0] as any;
  const plain = world().profiles.find((p) => p.userId === MEMBER) as any;

  it("is read from it, with no second lookup of the profile", async () => {
    const c = ctx();
    const { scans } = checkIndexes(c);
    let profileReads = 0;
    const query = c.db.query;
    c.db.query = (table: string) => (table === "profiles" && profileReads++, query(table));
    expect(await isCommunityLeader(c, id(ADMIN), admin)).toBe(true);
    expect(await isCommunityLeader(c, id(MEMBER), plain)).toBe(false);
    expect(profileReads).toBe(0);
    expect(scans).toEqual([]);
  });

  it("null means they have none: not an admin, so only their memberships count", async () => {
    expect(await isCommunityLeader(ctx(), id(HOST), null)).toBe(true);
    expect(await isCommunityLeader(ctx(), id(MEMBER), null)).toBe(false);
  });

  it("an admin is a leader without reading a single membership", async () => {
    const c = ctx();
    let membershipReads = 0;
    const query = c.db.query;
    c.db.query = (table: string) => (table === "communityMembers" && membershipReads++, query(table));
    expect(await isCommunityLeader(c, id(ADMIN), admin)).toBe(true);
    expect(membershipReads).toBe(0);
  });
});

describe("leaderUserIds — a list of people at once", () => {
  const everyone = [ADMIN, HOST, OWNER, REMOVED_HOST, MODERATOR, PENDING_HOST, MEMBER, NO_PROFILE, HOST_NO_PROFILE, MIXED].map(id);

  it("is the leaders among them, as user ids", async () => {
    const leaders = await leaderUserIds(ctx(), everyone);
    expect([...leaders].sort()).toEqual([ADMIN, HOST, HOST_NO_PROFILE, OWNER].sort());
    expect(leaders.has(MEMBER)).toBe(false);
  });

  it("agrees with isCommunityLeader for every one of them", async () => {
    const leaders = await leaderUserIds(ctx(), everyone);
    for (const user of everyone) {
      expect(leaders.has(String(user)), user).toBe(await isCommunityLeader(ctx(), user));
    }
  });

  it("is empty for nobody, and reads nothing", async () => {
    const c = ctx();
    const { scans } = checkIndexes(c);
    let reads = 0;
    const query = c.db.query;
    c.db.query = (table: string) => (reads++, query(table));
    expect((await leaderUserIds(c, [])).size).toBe(0);
    expect(reads + scans.length).toBe(0);
  });

  it("reads each person once, however often they are listed", async () => {
    const c = ctx();
    let reads = 0;
    const query = c.db.query;
    c.db.query = (table: string) => (reads++, query(table));
    await leaderUserIds(c, [id(HOST), id(HOST), id(HOST), id(MEMBER), id(MEMBER)]);
    // A profile read and a memberships read for each of the two people.
    expect(reads).toBe(4);
  });

  it("reads by index only: no whole-table scan, however many people", async () => {
    const w = world();
    const crowd = Array.from({ length: 60 }, (_, i) => `users:crowd${i}`);
    w.profiles.push(...crowd.map((u) => profile(u)));
    w.communityMembers.push(...crowd.map((u, i) => row(100 + i, GARDEN, u, i % 10 === 0 ? "host" : "member", "active")));
    const c = makeCtx(w, null);
    const { scans } = checkIndexes(c);
    const leaders = await leaderUserIds(c, crowd.map(id));
    expect(leaders.size).toBe(6);
    expect(scans).toEqual([]);
  });
});

describe("isLeaderRole — where the rule lives", () => {
  it("is one function, whether imported from communityLookup or communities", () => {
    expect(fromCommunities).toBe(fromLookup);
  });

  it("counts a host and nothing else", () => {
    expect(fromLookup("host")).toBe(true);
    for (const role of ["moderator", "member", "", undefined]) expect(fromLookup(role)).toBe(false);
  });
});
