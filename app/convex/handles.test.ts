// Addresses (handles.ts): claiming, the ways a claim is refused, changing
// with the old address forwarding, held names (heldHandles.ts) and the
// operator giving one, the founder alias, the search switch, and what a
// signed-out visitor sees of a page by address. Run on the in-memory ctx in
// test-support/.

import { describe, expect, it } from "vitest";
import { makeCtx, run } from "../test-support/convexContext";
import { HANDLE_FORWARD_MS } from "./handleRules";
import { checkHandle, claimHandle, giveHeldHandle, handleRefusal, profileForHandle, setHideFromSearch } from "./handles";
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
      world({ handleForwards: [{ _id: "handleForwards:1", handle: "oldname", profileId: "profiles:ben", expiresAt: NOW - 1 }] }),
      ANA,
    );
    expect(await profileForHandle(expired, "oldname")).toBeNull();
    expect(await run(claimHandle, expired, { handle: "oldname" })).toEqual({ handle: "oldname" });
    // The spent forward is gone, so /@oldname is Ana's alone.
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
    expect(await run(checkHandle, ctx, { handle: "Ana.R" })).toEqual({ handle: "ana.r", ok: true, current: false, code: null, reason: null });
    expect(await run(checkHandle, ctx, { handle: "ben" })).toMatchObject({ ok: false, code: "handle_taken", reason: "That address is taken." });
    expect(await run(checkHandle, ctx, { handle: "ana!" })).toMatchObject({ ok: false, reason: "Use letters, numbers, periods and underscores." });
    expect(await run(checkHandle, makeCtx(world(), BEN), { handle: "@BEN" })).toEqual({ handle: "ben", ok: true, current: true, code: null, reason: null });
  });

  it("says why a held name is held, with the code the page branches on", async () => {
    const ctx = makeCtx(world(), ANA);
    expect(await run(checkHandle, ctx, { handle: "Instagram" })).toMatchObject({
      ok: false,
      code: "handle_org",
      reason: "This name is held for the brand. It comes with an Organization account.",
    });
    expect(await run(checkHandle, ctx, { handle: "sandiego" })).toMatchObject({
      ok: false,
      code: "handle_held",
      reason: "This name is held for its owner. Write to us at hello@thecreative.exchange to claim it.",
    });
    expect(await run(checkHandle, ctx, { handle: "abc" })).toMatchObject({
      ok: false,
      code: "handle_premium",
      reason: "Names of 3 characters or fewer come with a membership.",
    });
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
    expect(await handleRefusal(ctx, ctx.store.profiles[0], "ana.reyes")).toBeNull();
  });
});

describe("held names", () => {
  const membership = (status: string) => ({
    memberships: [{ _id: "memberships:1", userId: ANA, level: "seat", status, stripeSubscriptionId: "sub_1", createdAt: 1, updatedAt: 1 }],
  });

  it("refuses each category with its own code", async () => {
    const ctx = makeCtx(world(), ANA);
    const refused = async (handle: string) => {
      try {
        await run(claimHandle, ctx, { handle });
      } catch (err) {
        return (err as { data: { code: string } }).data.code;
      }
      return "claimed";
    };
    expect(await refused("staff")).toBe("handle_reserved");
    expect(await refused("rickmoy")).toBe("handle_held");
    expect(await refused("losangeles")).toBe("handle_held");
    expect(await refused("adobe")).toBe("handle_org");
    expect(await refused("painter")).toBe("handle_reserved");
    expect(await refused("q")).toBe("handle_reserved");
    expect(await refused("ab")).toBe("handle_reserved");
    expect(await refused("abc")).toBe("handle_premium");
    expect(ctx.store.profiles[0].handle).toBeUndefined();
    expect(await refused("abcd")).toBe("claimed");
  });

  it("gives a 3-character name to a paid member, a covered or past-due seat included", async () => {
    for (const status of ["active", "past_due"]) {
      const ctx = makeCtx(world(membership(status)), ANA);
      expect(await run(claimHandle, ctx, { handle: "ana" }), status).toEqual({ handle: "ana" });
    }
    const covered = makeCtx(world({ memberships: [{ ...membership("active").memberships[0], coveredByCodeId: "coverageCodes:1" }] }), ANA);
    expect(await run(claimHandle, covered, { handle: "ana" })).toEqual({ handle: "ana" });
    for (const status of ["canceled", "incomplete"]) {
      await expect(run(claimHandle, makeCtx(world(membership(status)), ANA), { handle: "ana" }), status).rejects.toMatchObject({
        data: { code: "handle_premium" },
      });
    }
  });

  it("still holds a 1–2 character name and the lists from a paid member", async () => {
    const ctx = makeCtx(world(membership("active")), ANA);
    await expect(run(claimHandle, ctx, { handle: "ab" })).rejects.toMatchObject({ data: { code: "handle_reserved" } });
    await expect(run(claimHandle, ctx, { handle: "nyc" })).rejects.toMatchObject({ data: { code: "handle_held" } });
  });

  it("never takes one from the person who holds it, or their own old one", async () => {
    // Ben claimed "paris" before it was held: it stays his.
    const ctx = makeCtx(world(), BEN);
    ctx.store.profiles[1].handle = "paris";
    expect(await run(checkHandle, ctx, { handle: "Paris" })).toMatchObject({ ok: true, current: true });
    expect(await run(claimHandle, ctx, { handle: "paris" })).toEqual({ handle: "paris" });
    // He moves on, and can still take it back while it forwards to him …
    await run(claimHandle, ctx, { handle: "ben.ito" });
    expect(await run(checkHandle, ctx, { handle: "paris" })).toMatchObject({ ok: true, current: false });
    await run(claimHandle, ctx, { handle: "paris" });
    expect(ctx.store.profiles[1].handle).toBe("paris");
    // … and to anyone else it's taken, not held.
    const ana = makeCtx({ ...world(), profiles: ctx.store.profiles }, ANA);
    expect(await run(checkHandle, ana, { handle: "paris" })).toMatchObject({ ok: false, code: "handle_taken" });
  });
});

describe("giveHeldHandle (operator)", () => {
  it("gives a founder name to its person, and the old address forwards", async () => {
    const ctx = makeCtx(world(), null);
    expect(await run(giveHeldHandle, ctx, { profileId: "profiles:ben", handle: "@RickMoy" })).toEqual({ handle: "rickmoy" });
    expect(ctx.store.profiles[1].handle).toBe("rickmoy");
    expect(ctx.store.handleForwards).toMatchObject([{ handle: "ben", profileId: "profiles:ben" }]);
  });

  it("gives a short name or a brand, but not a system name or an art-form word", async () => {
    const ctx = makeCtx(world(), null);
    expect(await run(giveHeldHandle, ctx, { profileId: "profiles:ana", handle: "ab" })).toEqual({ handle: "ab" });
    await expect(run(giveHeldHandle, ctx, { profileId: "profiles:ana", handle: "staff" })).rejects.toThrow("system");
    await expect(run(giveHeldHandle, ctx, { profileId: "profiles:ana", handle: "poetry" })).rejects.toThrow("discipline");
  });

  it("can't take a name someone holds or a community's address", async () => {
    const ctx = makeCtx(world(), null);
    await expect(run(giveHeldHandle, ctx, { profileId: "profiles:ana", handle: "ben" })).rejects.toThrow("taken");
    await expect(run(giveHeldHandle, ctx, { profileId: "profiles:ana", handle: "sd" })).rejects.toThrow("reserved");
    expect(ctx.store.profiles[0].handle).toBeUndefined();
  });
});

describe("the founder alias", () => {
  it("opens @rickmoy's page at /@rick, for good", async () => {
    const ctx = makeCtx(world(), null);
    ctx.store.profiles[1].handle = "rickmoy";
    // Long past any 90-day window: an alias doesn't run out.
    const later = NOW + 10 * HANDLE_FORWARD_MS;
    expect((await profileForHandle(ctx, "@Rick", later))?._id).toBe("profiles:ben");
    expect(await run(getProfileByHandle, ctx, { handle: "rick" })).toMatchObject({ _id: "profiles:ben", handle: "rickmoy" });
  });

  it("follows @rickmoy while it forwards after a change", async () => {
    const ctx = makeCtx(
      world({ handleForwards: [{ _id: "handleForwards:1", handle: "rickmoy", profileId: "profiles:ben", expiresAt: NOW + 1000 }] }),
      null,
    );
    expect((await profileForHandle(ctx, "rick"))?.handle).toBe("ben");
  });

  it("is the 404 while rickmoy is unclaimed", async () => {
    const ctx = makeCtx(world(), null);
    expect(await profileForHandle(ctx, "rick")).toBeNull();
    expect(await run(getProfileByHandle, ctx, { handle: "rick" })).toBeNull();
  });

  it("yields to a person who holds rick itself", async () => {
    const ctx = makeCtx(world(), null);
    ctx.store.profiles[0].handle = "rick";
    ctx.store.profiles[1].handle = "rickmoy";
    expect((await profileForHandle(ctx, "rick"))?._id).toBe("profiles:ana");
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
