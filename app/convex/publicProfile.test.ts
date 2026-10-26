import { describe, expect, it } from "vitest";
import { makeCtx, run } from "../test-support/convexContext";
import type { Doc, Id } from "./_generated/dataModel";
import { canSeeProfile, getProfile, getProfileByHandle, toPublicProfile } from "./profiles";

const profile = {
  _id: "p1" as Id<"profiles">,
  _creationTime: 0,
  userId: "u1" as Id<"users">,
  name: "Dana Reyes",
  bio: "Painter",
  interests: ["Art"],
  location: "San Diego, CA",
  address: "123 Elm St, San Diego, CA",
  placeId: "ChIJxyz",
  coordinates: { lat: 32.715736, lng: -117.161087 },
  payoutHandles: { venmo: "dana-r" },
  adminCode: "ADMIN1",
  isAdmin: true,
  inviteSlug: "K7M4QD",
  inviteUsageCount: 2,
  unlimitedInvites: true,
  lastLikeNotifiedAt: 5,
  plan: "free",
  stripeConnectAccountId: "acct_123",
  stripeConnectPayoutsEnabled: true,
  stripeConnectDetailsSubmitted: true,
  stripeConnectUpdatedAt: 3,
  createdAt: 1,
  updatedAt: 2,
} as unknown as Doc<"profiles">;

describe("toPublicProfile", () => {
  it("drops payout handles, address, and invite/admin bookkeeping", () => {
    const pub = toPublicProfile(profile) as Record<string, unknown>;
    for (const key of [
      "payoutHandles",
      "address",
      "placeId",
      "adminCode",
      "isAdmin",
      "inviteSlug",
      "inviteUsageCount",
      "unlimitedInvites",
      "lastLikeNotifiedAt",
      "plan",
      "stripeConnectAccountId",
      "stripeConnectPayoutsEnabled",
      "stripeConnectDetailsSubmitted",
      "stripeConnectUpdatedAt",
    ]) {
      expect(pub).not.toHaveProperty(key);
    }
  });

  it("keeps what the profile and People pages show", () => {
    const pub = toPublicProfile(profile);
    expect(pub.name).toBe("Dana Reyes");
    expect(pub.bio).toBe("Painter");
    expect(pub.location).toBe("San Diego, CA");
    expect(pub.interests).toEqual(["Art"]);
  });

  it("rounds coordinates to about a kilometer", () => {
    expect(toPublicProfile(profile).coordinates).toEqual({ lat: 32.72, lng: -117.16 });
    const noCoords = { ...profile, coordinates: undefined } as Doc<"profiles">;
    expect(toPublicProfile(noCoords).coordinates).toBeUndefined();
  });

  it("keeps fields added later private by default (e.g. Stripe payout ids)", () => {
    const withNew = {
      ...profile,
      stripeConnectAccountId: "acct_123",
      stripeConnectPayoutsEnabled: true,
    } as unknown as Doc<"profiles">;
    const pub = toPublicProfile(withNew) as Record<string, unknown>;
    expect(pub).not.toHaveProperty("stripeConnectAccountId");
    expect(pub).not.toHaveProperty("stripeConnectPayoutsEnabled");
  });
});

// Someone who signed in but never named themselves (convex/names.ts) has no
// page for other members: only they and an admin see it.
describe("unnamed accounts are hidden from other members", () => {
  const ADMIN = "users:admin";
  const OWNER = "users:ghost";
  const MEMBER = "users:member";

  const world = () => ({
    profiles: [
      { _id: "profiles:admin", userId: ADMIN, name: "Ada Admin", isAdmin: true, interests: [], handle: "ada" },
      { _id: "profiles:ghost", userId: OWNER, name: "New User", interests: [], handle: "ghostly" },
      { _id: "profiles:blank", userId: "users:blank", name: "  ", interests: [], handle: "blankly" },
      { _id: "profiles:named", userId: MEMBER, name: "Dana Reyes", interests: ["Art"], handle: "dana" },
    ],
  });
  const as = (viewer: string | null) => makeCtx(world(), viewer);
  const profileOf = (id: string) => world().profiles.find((p) => p._id === id) as unknown as Doc<"profiles">;

  describe("canSeeProfile", () => {
    it("lets everyone see a named profile, signed in or not", async () => {
      expect(await canSeeProfile(as(null), profileOf("profiles:named"))).toBe(true);
      expect(await canSeeProfile(as(OWNER), profileOf("profiles:named"))).toBe(true);
    });

    it("hides an unnamed profile from a signed-out viewer and from another member", async () => {
      expect(await canSeeProfile(as(null), profileOf("profiles:ghost"))).toBe(false);
      expect(await canSeeProfile(as(MEMBER), profileOf("profiles:ghost"))).toBe(false);
    });

    it("shows an unnamed profile to its owner and to an admin", async () => {
      expect(await canSeeProfile(as(OWNER), profileOf("profiles:ghost"))).toBe(true);
      expect(await canSeeProfile(as(ADMIN), profileOf("profiles:ghost"))).toBe(true);
    });

    it("treats a blank name like the placeholder", async () => {
      expect(await canSeeProfile(as(MEMBER), profileOf("profiles:blank"))).toBe(false);
      expect(await canSeeProfile(as(ADMIN), profileOf("profiles:blank"))).toBe(true);
    });
  });

  describe("getProfile", () => {
    it("returns the page of a named profile to everyone", async () => {
      for (const viewer of [null, OWNER, MEMBER]) {
        const page = await run(getProfile, as(viewer), { profileId: "profiles:named" });
        expect(page?.name).toBe("Dana Reyes");
      }
    });

    it("returns null for an unnamed profile to a signed-out viewer and another member", async () => {
      expect(await run(getProfile, as(null), { profileId: "profiles:ghost" })).toBeNull();
      expect(await run(getProfile, as(MEMBER), { profileId: "profiles:ghost" })).toBeNull();
    });

    it("returns the unnamed profile to its owner and to an admin", async () => {
      for (const viewer of [OWNER, ADMIN]) {
        const page = await run(getProfile, as(viewer), { profileId: "profiles:ghost" });
        expect(page?._id).toBe("profiles:ghost");
      }
    });
  });

  describe("getProfileByHandle", () => {
    it("returns a named profile to everyone, and null for a handle nobody holds", async () => {
      expect((await run(getProfileByHandle, as(null), { handle: "dana" }))?.name).toBe("Dana Reyes");
      expect(await run(getProfileByHandle, as(null), { handle: "nobody" })).toBeNull();
    });

    it("returns null for an unnamed profile to a signed-out viewer and another member", async () => {
      expect(await run(getProfileByHandle, as(null), { handle: "ghostly" })).toBeNull();
      expect(await run(getProfileByHandle, as(MEMBER), { handle: "ghostly" })).toBeNull();
    });

    it("returns the unnamed profile to its owner and to an admin", async () => {
      for (const viewer of [OWNER, ADMIN]) {
        expect((await run(getProfileByHandle, as(viewer), { handle: "ghostly" }))?._id).toBe("profiles:ghost");
      }
    });
  });
});
