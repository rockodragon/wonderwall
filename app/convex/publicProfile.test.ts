import { describe, expect, it } from "vitest";
import type { Doc, Id } from "./_generated/dataModel";
import { toPublicProfile } from "./profiles";

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
