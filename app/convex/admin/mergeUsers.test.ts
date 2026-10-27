// mergeUsers (operator CLI, and the duplicates page behind its admin check).
// Real handler, in-memory ctx. What the duplicates page needed from it
// (2026-10-26): every field that points at an account is moved, followers
// and organizations included, and the kept profile is filled even when the
// other copy has nothing else.

import { describe, expect, it } from "vitest";
import { makeCtx, run, type Row } from "../../test-support/convexContext";
import { schemaFieldsPointingAt } from "../../test-support/schemaFields";
import { mergeUsers, PROFILE_ID_FIELDS, profileFill, signInFate, USER_ID_FIELDS } from "./mergeUsers";

describe("the lists name every field that points at an account", () => {
  it("v.id(\"users\")", () => {
    // profiles.userId is the profile itself (mergeProfiles); eventCoHosts
    // mirrors events.coHostIds and is re-synced from it.
    const handledElsewhere = ["profiles.userId", "eventCoHosts.userId"];
    const listed = USER_ID_FIELDS.map((f) => `${f.table}.${f.field}`);
    expect([...new Set([...listed, ...handledElsewhere])].sort()).toEqual(schemaFieldsPointingAt("users"));
  });

  it("v.id(\"profiles\"), and the follows that hold a profile id as text", () => {
    const listed = PROFILE_ID_FIELDS.map((f) => `${f.table}.${f.field}`);
    expect(listed.filter((k) => k !== "favorites.targetId").sort()).toEqual(schemaFieldsPointingAt("profiles"));
    expect(listed).toContain("favorites.targetId");
  });
});

const SRC = "users:src";
const TGT = "users:tgt";
const FAN = "users:fan";
const FAN2 = "users:fan2";
const P_SRC = "profiles:src";
const P_TGT = "profiles:tgt";

function world(extra: Record<string, Row[]> = {}) {
  return makeCtx(
    {
      users: [{ _id: SRC, email: "sarah@old.example" }, { _id: TGT, email: "sarah@example.com" }, { _id: FAN }, { _id: FAN2 }],
      profiles: [
        { _id: P_SRC, userId: SRC, name: "Sarah Shreves", bio: "Painter.", interests: ["Art"], handle: "sarahpaints", createdAt: 1, updatedAt: 1 },
        { _id: P_TGT, userId: TGT, name: "New User", interests: [], imageStorageId: "_storage:face", handle: "sarah", createdAt: 2, updatedAt: 2 },
        { _id: "profiles:fan", userId: FAN, name: "Fan", interests: [], createdAt: 3, updatedAt: 3 },
        { _id: "profiles:fan2", userId: FAN2, name: "Fan Two", interests: [], createdAt: 3, updatedAt: 3 },
      ],
      favorites: [
        { _id: "favorites:1", userId: FAN, targetType: "profile", targetId: P_SRC },
        { _id: "favorites:2", userId: FAN, targetType: "profile", targetId: P_TGT },
        { _id: "favorites:3", userId: FAN2, targetType: "profile", targetId: P_SRC },
        // The two copies following each other: following yourself, after.
        { _id: "favorites:4", userId: SRC, targetType: "profile", targetId: P_TGT },
      ],
      organizations: [
        { _id: "organizations:grove", name: "The Grove", slug: "the-grove", createdByUserId: SRC },
        { _id: "organizations:ap", name: "Abiding Practice", slug: "abiding-practice", createdByUserId: FAN },
      ],
      orgPositions: [
        { _id: "orgPositions:src-grove", organizationId: "organizations:grove", userId: SRC, profileId: P_SRC, isAdmin: true, order: 0, createdAt: 1 },
        { _id: "orgPositions:src-ap", organizationId: "organizations:ap", userId: SRC, profileId: P_SRC, isAdmin: false, order: 1, createdAt: 1 },
        { _id: "orgPositions:tgt-ap", organizationId: "organizations:ap", userId: TGT, profileId: P_TGT, isAdmin: false, order: 0, createdAt: 2 },
      ],
      events: [
        {
          _id: "events:1",
          organizerId: FAN,
          displayHosts: [{ kind: "user", userId: SRC }, { kind: "org", organizationId: "organizations:ap" }, { kind: "user", userId: TGT }],
        },
      ],
      uploadClaims: [{ _id: "uploadClaims:1", storageId: "_storage:old", userId: SRC, claimedAt: 1 }],
      handleForwards: [],
      authAccounts: [
        { _id: "authAccounts:src-google", userId: SRC, provider: "google", providerAccountId: "1234" },
        { _id: "authAccounts:src-pw", userId: SRC, provider: "password", providerAccountId: "sarah@old.example" },
        { _id: "authAccounts:tgt-pw", userId: TGT, provider: "password", providerAccountId: "sarah@example.com" },
      ],
      authSessions: [{ _id: "authSessions:src", userId: SRC }],
      ...extra,
    },
    null,
  );
}

// The in-memory ctx creates an empty table the first time one is read.
const rows = (store: Record<string, Row[]>) =>
  JSON.stringify(Object.fromEntries(Object.entries(store).filter(([, r]) => r.length > 0)));

const merge = (ctx: any, dryRun = false) =>
  run(mergeUsers, ctx, { targetUserId: TGT, sourceUserIds: [SRC], dryRun, moveContent: true });

describe("mergeUsers with moveContent", () => {
  it("the dry run counts the new references and changes nothing", async () => {
    const ctx = world();
    const before = rows(ctx.store);
    const { results } = await merge(ctx, true);
    expect(results[0]).toMatchObject({
      dryRun: true,
      blockers: {
        "favorites.targetId": 2,
        "orgPositions.userId": 2,
        "orgPositions.profileId": 2,
        "organizations.createdByUserId": 1,
        "events.displayHosts": 1,
        "uploadClaims.userId": 1,
      },
    });
    expect(rows(ctx.store)).toBe(before);
  });

  it("moves the other copy's followers, once each, and drops following yourself", async () => {
    const ctx = world();
    await merge(ctx);
    expect(ctx.store.favorites.map((f: Row) => [f.userId, f.targetId]).sort()).toEqual([
      [FAN, P_TGT],
      [FAN2, P_TGT],
    ]);
  });

  it("moves its organizations, one place each, after the kept account's own", async () => {
    const ctx = world();
    await merge(ctx);
    expect(ctx.store.orgPositions.map((p: Row) => [p._id, p.userId, p.profileId, p.order])).toEqual([
      ["orgPositions:src-grove", TGT, P_TGT, 1],
      ["orgPositions:tgt-ap", TGT, P_TGT, 0],
    ]);
    expect(ctx.store.organizations[0].createdByUserId).toBe(TGT);
    const kept = ctx.store.profiles.find((p: Row) => p._id === P_TGT);
    expect(kept.orgName).toBe("Abiding Practice");
  });

  it("swaps the other copy for the kept one in an event's hosts, listed once", async () => {
    const ctx = world();
    await merge(ctx);
    expect(ctx.store.events[0].displayHosts).toEqual([
      { kind: "user", userId: TGT },
      { kind: "org", organizationId: "organizations:ap" },
    ]);
  });

  it("fills the kept profile's empty fields, a placeholder name included, and keeps its own", async () => {
    const ctx = world();
    const { results } = await merge(ctx);
    const kept = ctx.store.profiles.find((p: Row) => p._id === P_TGT);
    expect(kept).toMatchObject({ name: "Sarah Shreves", bio: "Painter.", interests: ["Art"], imageStorageId: "_storage:face", handle: "sarah" });
    expect(results[0].contentMoved.profileFieldsFilled.sort()).toEqual(["bio", "interests", "name"]);
    expect(ctx.store.profiles.some((p: Row) => p._id === P_SRC)).toBe(false);
  });

  it("the other copy's @address forwards to the kept profile", async () => {
    const ctx = world();
    await merge(ctx);
    expect(ctx.store.handleForwards).toEqual([
      expect.objectContaining({ handle: "sarahpaints", profileId: P_TGT }),
    ]);
  });

  it("moves its sign-ins, except a password the kept account already has", async () => {
    const ctx = world();
    await merge(ctx);
    expect(ctx.store.authAccounts.map((a: Row) => [a._id, a.userId])).toEqual([
      ["authAccounts:src-google", TGT],
      ["authAccounts:tgt-pw", TGT],
    ]);
    expect(ctx.store.authSessions).toEqual([]);
    expect(ctx.store.uploadClaims[0].userId).toBe(TGT);
    expect(ctx.store.users.map((u: Row) => u._id)).toEqual([TGT, FAN, FAN2]);
  });

  it("fills the profile even when the other copy has nothing else", async () => {
    const ctx = makeCtx(
      {
        users: [{ _id: SRC }, { _id: TGT }],
        profiles: [
          { _id: P_SRC, userId: SRC, name: "Rick Moy", bio: "Founder.", imageUrl: "https://x/face.jpg", interests: [], createdAt: 1, updatedAt: 1 },
          { _id: P_TGT, userId: TGT, name: "Rick Moy", interests: [], createdAt: 2, updatedAt: 2 },
        ],
      },
      null,
    );
    await merge(ctx);
    expect(ctx.store.profiles).toEqual([expect.objectContaining({ _id: P_TGT, bio: "Founder.", imageUrl: "https://x/face.jpg" })]);
  });
});

describe("profileFill / signInFate", () => {
  it("the target's own values win; empty ones are filled", () => {
    expect(profileFill({ name: "A", bio: "x", interests: ["Art"], location: "SD" }, { name: "B", bio: "", interests: [] })).toEqual({
      bio: "x",
      interests: ["Art"],
      location: "SD",
    });
  });
  it("a placeholder name never replaces a real one", () => {
    expect(profileFill({ name: "New User" }, { name: "" })).toEqual({});
    expect(profileFill({ name: "Rick Moy" }, { name: "new user" })).toEqual({ name: "Rick Moy" });
  });
  it("a second password is dropped, everything else moves", () => {
    expect(signInFate("password", true)).toBe("dropped");
    expect(signInFate("password", false)).toBe("moved");
    expect(signInFate("google", true)).toBe("moved");
    expect(signInFate("phone", true)).toBe("moved");
  });
});
