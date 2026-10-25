// Addresses (handles.ts): claiming, the ways a claim is refused, changing
// with the old address forwarding, the search switch, and what a signed-out
// visitor sees of a page by address. Run on the in-memory ctx in
// test-support/.

import { describe, expect, it } from "vitest";
import { makeCtx, run } from "../test-support/convexContext";
import { HANDLE_FORWARD_MS } from "./handleRules";
import { checkHandle, claimHandle, handleRefusal, profileForHandle, setHideFromSearch } from "./handles";
import { getProfileByHandle } from "./profiles";

const ANA = "users:ana";
const BEN = "users:ben";
const NOW = Date.now();

function world(extra: Record<string, unknown[]> = {}) {
  return {
    users: [{ _id: ANA, email: "ana@example.com" }, { _id: BEN, email: "ben@example.com" }],
    profiles: [
      {
        _id: "profiles:ana",
        userId: ANA,
        name: "Ana Reyes",
        bio: "Photographer.\nSan Diego, mostly film.",
        interests: ["Photography"],
        location: "San Diego, CA",
        address: { street: "12 Palm St", city: "San Diego" },
        coordinates: { lat: 32.71573, lng: -117.16109 },
        payoutHandles: { venmo: "ana-pays" },
        stripeConnectAccountId: "acct_123",
        inviteSlug: "ana-reyes",
        adminCode: "ANAX42",
        isAdmin: true,
        createdAt: 1,
        updatedAt: 1,
      },
      { _id: "profiles:ben", userId: BEN, name: "Ben Ito", interests: [], handle: "ben", createdAt: 1, updatedAt: 1 },
    ],
    hostOrgs: [{ _id: "hostOrgs:sd", slug: "sd", name: "The Creative Exchange San Diego", kind: "community", createdAt: 1 }],
    ...extra,
  };
}

describe("claimHandle", () => {
  it("stores the address lowercase, without the @", async () => {
    const ctx = makeCtx(world(), ANA);
    expect(await run(claimHandle, ctx, { handle: "@Ana.Reyes" })).toEqual({ handle: "ana.reyes" });
    expect(ctx.store.profiles[0].handle).toBe("ana.reyes");
    expect(ctx.store.handleForwards ?? []).toHaveLength(0);
  });

  it("refuses one someone else holds, whatever the case", async () => {
    const ctx = makeCtx(world(), ANA);
    await expect(run(claimHandle, ctx, { handle: "BEN" })).rejects.toMatchObject({
      data: { code: "handle_taken", reason: "That address is taken." },
    });
    expect(ctx.store.profiles[0].handle).toBeUndefined();
  });

  it("refuses the site's own names and a community's address", async () => {
    const ctx = makeCtx(world(), ANA);
    await expect(run(claimHandle, ctx, { handle: "settings" })).rejects.toMatchObject({
      data: { code: "handle_reserved", reason: "That address is reserved." },
    });
    // A community's /sd is its address; a hyphenated one (the-garden) never
    // passes the rules in the first place.
    await expect(run(claimHandle, ctx, { handle: "SD" })).rejects.toMatchObject({
      data: { code: "handle_reserved", reason: "That address is reserved." },
    });
  });

  it("refuses one that breaks the rules, in words", async () => {
    const ctx = makeCtx(world(), ANA);
    await expect(run(claimHandle, ctx, { handle: "ana reyes" })).rejects.toMatchObject({
      data: { code: "handle_characters", reason: "Use letters, numbers, periods and underscores." },
    });
    await expect(run(claimHandle, ctx, { handle: "ana..reyes" })).rejects.toMatchObject({
      data: { code: "handle_periods" },
    });
    await expect(run(claimHandle, ctx, { handle: "" })).rejects.toMatchObject({ data: { code: "handle_empty" } });
  });

  it("refuses someone signed out", async () => {
    await expect(run(claimHandle, makeCtx(world(), null), { handle: "ana" })).rejects.toMatchObject({
      data: { code: "unauthenticated" },
    });
  });

  it("is a no-op for the address they already have", async () => {
    const ctx = makeCtx(world(), BEN);
    expect(await run(claimHandle, ctx, { handle: "Ben" })).toEqual({ handle: "ben" });
    expect(ctx.store.handleForwards ?? []).toHaveLength(0);
  });

  it("keeps the old address forwarding for 90 days after a change", async () => {
    const ctx = makeCtx(world(), BEN);
    await run(claimHandle, ctx, { handle: "ben.ito" });
    expect(ctx.store.profiles[1].handle).toBe("ben.ito");
    const [forward] = ctx.store.handleForwards;
    expect(forward).toMatchObject({ handle: "ben", profileId: "profiles:ben" });
    expect(forward.expiresAt).toBeGreaterThanOrEqual(NOW + HANDLE_FORWARD_MS);
    expect(forward.expiresAt).toBeLessThan(NOW + HANDLE_FORWARD_MS + 60_000);

    // The old address still opens Ben's page …
    expect((await profileForHandle(ctx, "ben"))?._id).toBe("profiles:ben");
    // … and nobody else can take it in the window.
    await expect(run(claimHandle, makeCtx({ ...world(), profiles: ctx.store.profiles, handleForwards: ctx.store.handleForwards }, ANA), { handle: "ben" })).rejects.toMatchObject({
      data: { code: "handle_taken" },
    });
  });

  it("frees the old address once the forward has run out", async () => {
    const expired = makeCtx(
      world({ handleForwards: [{ _id: "handleForwards:1", handle: "old", profileId: "profiles:ben", expiresAt: NOW - 1 }] }),
      ANA,
    );
    expect(await profileForHandle(expired, "old")).toBeNull();
    expect(await run(claimHandle, expired, { handle: "old" })).toEqual({ handle: "old" });
    // The spent forward is gone, so /@old is Ana's alone.
    expect(expired.store.handleForwards).toHaveLength(0);
  });

  it("lets a person take their own old address back", async () => {
    const ctx = makeCtx(world(), BEN);
    await run(claimHandle, ctx, { handle: "ben.ito" });
    await run(claimHandle, ctx, { handle: "ben" });
    expect(ctx.store.profiles[1].handle).toBe("ben");
    // Now "ben.ito" is the one forwarding, and "ben" no longer is.
    expect(ctx.store.handleForwards.map((f: { handle: string }) => f.handle)).toEqual(["ben.ito"]);
  });
});

describe("checkHandle", () => {
  it("answers as a person types: free, taken, theirs already", async () => {
    const ctx = makeCtx(world(), ANA);
    expect(await run(checkHandle, ctx, { handle: "Ana" })).toEqual({ handle: "ana", ok: true, current: false, reason: null });
    expect(await run(checkHandle, ctx, { handle: "ben" })).toMatchObject({ ok: false, reason: "That address is taken." });
    expect(await run(checkHandle, ctx, { handle: "ana!" })).toMatchObject({ ok: false, reason: "Use letters, numbers, periods and underscores." });
    expect(await run(checkHandle, makeCtx(world(), BEN), { handle: "@BEN" })).toEqual({ handle: "ben", ok: true, current: true, reason: null });
  });

  it("is for the signed-in form only", async () => {
    await expect(run(checkHandle, makeCtx(world(), null), { handle: "ana" })).rejects.toMatchObject({
      data: { code: "unauthenticated" },
    });
  });
});

describe("handleRefusal", () => {
  it("has nothing against a free, valid address", async () => {
    const ctx = makeCtx(world(), ANA);
    expect(await handleRefusal(ctx, ctx.store.profiles[0], "ana")).toBeNull();
  });
});

describe("setHideFromSearch", () => {
  it("flips the switch on the signed-in person's own profile", async () => {
    const ctx = makeCtx(world(), BEN);
    expect(await run(setHideFromSearch, ctx, { hide: true })).toEqual({ hide: true });
    expect(ctx.store.profiles[1].hideFromSearch).toBe(true);
    await run(setHideFromSearch, ctx, { hide: false });
    expect(ctx.store.profiles[1].hideFromSearch).toBe(false);
    expect(ctx.store.profiles[0].hideFromSearch).toBeUndefined();
  });

  it("refuses someone signed out", async () => {
    await expect(run(setHideFromSearch, makeCtx(world(), null), { hide: true })).rejects.toMatchObject({
      data: { code: "unauthenticated" },
    });
  });
});

describe("getProfileByHandle, signed out", () => {
  it("shows the public page only — no email, payout, Stripe, street or exact spot", async () => {
    const ctx = makeCtx(world(), null);
    await run(claimHandle, makeCtx(world(), ANA), { handle: "ana" });
    ctx.store.profiles[0].handle = "ana";
    const page = await run(getProfileByHandle, ctx, { handle: "@ANA" });
    expect(page).toMatchObject({
      _id: "profiles:ana",
      name: "Ana Reyes",
      handle: "ana",
      bio: "Photographer.\nSan Diego, mostly film.",
      interests: ["Photography"],
      location: "San Diego, CA",
      coordinates: { lat: 32.72, lng: -117.16 },
      links: [],
      artifacts: [],
      organizations: [],
    });
    for (const secret of ["email", "payoutHandles", "stripeConnectAccountId", "address", "inviteSlug", "adminCode", "isAdmin", "placeId"]) {
      expect(page, secret).not.toHaveProperty(secret);
    }
  });

  it("answers an old address with the current one, and nothing for an unknown or broken one", async () => {
    const ctx = makeCtx(
      world({ handleForwards: [{ _id: "handleForwards:1", handle: "benito", profileId: "profiles:ben", expiresAt: NOW + 1000 }] }),
      null,
    );
    expect(await run(getProfileByHandle, ctx, { handle: "benito" })).toMatchObject({ _id: "profiles:ben", handle: "ben" });
    expect(await run(getProfileByHandle, ctx, { handle: "nobody" })).toBeNull();
    expect(await run(getProfileByHandle, ctx, { handle: "no body" })).toBeNull();
    expect(await run(getProfileByHandle, ctx, { handle: "" })).toBeNull();
  });
});
