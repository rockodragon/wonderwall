// The one operator gate (requireOperator) and the two older admin checks
// that now sit on it, plus the ownership rule requireOwner and the lead /
// venue checks share. Run on the in-memory ctx in test-support/.

import { ConvexError } from "convex/values";
import { describe, expect, it } from "vitest";
import { makeCtx } from "../test-support/convexContext";
import {
  currentUserId,
  displayNameOf,
  getProfileByUserId,
  isAdmin,
  isOwnerOrAdmin,
  requireAdmin,
  requireAdminCtx,
  requireOperator,
  requireOwnProfileRow,
  requireOwner,
  requireProfile,
  requireUserId,
} from "./helpers";

const ADMIN = "users:admin";
const MEMBER = "users:member";
const OTHER = "users:other";

const world = () => ({
  profiles: [
    { _id: "profiles:admin", userId: ADMIN, name: "Ada", isAdmin: true },
    { _id: "profiles:member", userId: MEMBER, name: "Max" },
    { _id: "profiles:other", userId: OTHER, name: "Olu", isAdmin: false },
  ],
  projects: [{ _id: "projects:p1", userId: MEMBER, title: "A project" }],
});

async function thrown(p: Promise<unknown>): Promise<ConvexError<any>> {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(ConvexError);
    return e as ConvexError<any>;
  }
  throw new Error("expected a throw");
}

describe("requireOperator", () => {
  it("refuses someone who isn't signed in", async () => {
    const err = await thrown(requireOperator(makeCtx(world(), null)));
    expect(err.data.code).toBe("unauthenticated");
    expect(err.data.reason).toBeTruthy();
  });

  it("refuses a signed-in person who isn't an admin", async () => {
    const err = await thrown(requireOperator(makeCtx(world(), MEMBER)));
    expect(err.data.code).toBe("forbidden");
    expect(err.data.reason).toMatch(/operator tool/);
  });

  it("refuses an admin flag set to false", async () => {
    const err = await thrown(requireOperator(makeCtx(world(), OTHER)));
    expect(err.data.code).toBe("forbidden");
  });

  it("refuses someone with no profile at all", async () => {
    const err = await thrown(requireOperator(makeCtx(world(), "users:ghost")));
    expect(err.data.code).toBe("forbidden");
  });

  it("lets an admin through, with their id and profile", async () => {
    const got = await requireOperator(makeCtx(world(), ADMIN));
    expect(got.userId).toBe(ADMIN);
    expect(got.profile.name).toBe("Ada");
  });
});

describe("requireAdmin / requireAdminCtx (the older callers)", () => {
  it("requireAdminCtx throws the same readable errors", async () => {
    expect((await thrown(requireAdminCtx(makeCtx(world(), null)))).data.code).toBe("unauthenticated");
    expect((await thrown(requireAdminCtx(makeCtx(world(), MEMBER)))).data.code).toBe("forbidden");
  });

  it("requireAdminCtx hands back just the admin's id", async () => {
    expect(await requireAdminCtx(makeCtx(world(), ADMIN))).toBe(ADMIN);
  });

  it("requireAdmin checks a user you already have", async () => {
    const ctx = makeCtx(world(), null);
    await expect(requireAdmin(ctx, ADMIN as any)).resolves.toBeUndefined();
    expect((await thrown(requireAdmin(ctx, MEMBER as any))).data.code).toBe("forbidden");
  });
});

describe("isOwnerOrAdmin / requireOwner", () => {
  it("the owner passes, an admin passes, anyone else doesn't", async () => {
    const ctx = makeCtx(world(), null);
    expect(await isOwnerOrAdmin(ctx, MEMBER as any, MEMBER as any)).toBe(true);
    expect(await isOwnerOrAdmin(ctx, MEMBER as any, ADMIN as any)).toBe(true);
    expect(await isOwnerOrAdmin(ctx, MEMBER as any, OTHER as any)).toBe(false);
  });

  it("requireOwner lets an admin in only when asked", async () => {
    const asAdmin = makeCtx(world(), ADMIN);
    expect((await thrown(requireOwner(asAdmin, "projects", "projects:p1" as any))).data.code).toBe("forbidden");
    const got = await requireOwner(asAdmin, "projects", "projects:p1" as any, { orAdmin: true });
    expect(got.userId).toBe(ADMIN);
    expect(got.row.title).toBe("A project");
  });

  it("requireOwner lets the owner in either way", async () => {
    const ctx = makeCtx(world(), MEMBER);
    expect((await requireOwner(ctx, "projects", "projects:p1" as any)).userId).toBe(MEMBER);
    expect((await requireOwner(ctx, "projects", "projects:p1" as any, { orAdmin: true })).userId).toBe(MEMBER);
  });
});

describe("currentUserId / requireUserId", () => {
  it("hands back the signed-in person's id", async () => {
    expect(await currentUserId(makeCtx(world(), MEMBER))).toBe(MEMBER);
    expect(await requireUserId(makeCtx(world(), MEMBER))).toBe(MEMBER);
  });

  it("is null when signed out, for queries that show nothing", async () => {
    expect(await currentUserId(makeCtx(world(), null))).toBeNull();
  });

  it("refuses a signed-out caller with a readable ConvexError", async () => {
    const err = await thrown(requireUserId(makeCtx(world(), null)));
    expect(err.data).toEqual({ code: "unauthenticated", reason: "Sign in first." });
  });

  it("requireOwner's signed-out refusal now says why", async () => {
    const err = await thrown(requireOwner(makeCtx(world(), null), "projects", "projects:p1" as any));
    expect(err.data).toEqual({ code: "unauthenticated", reason: "Sign in first." });
  });
});

describe("getProfileByUserId / displayNameOf", () => {
  const twoProfiles = () => ({
    profiles: [
      { _id: "profiles:a", userId: MEMBER, name: "Max", isAdmin: true },
      { _id: "profiles:b", userId: MEMBER, name: "Max again" },
      { _id: "profiles:blank", userId: OTHER, name: "" },
    ],
  });

  it("finds a person's profile, or null", async () => {
    const ctx = makeCtx(world(), null);
    expect((await getProfileByUserId(ctx, MEMBER as any))?._id).toBe("profiles:member");
    expect(await getProfileByUserId(ctx, "users:ghost" as any)).toBeNull();
  });

  it("still finds one when a person has two profiles (no throw)", async () => {
    const ctx = makeCtx(twoProfiles(), null);
    expect((await getProfileByUserId(ctx, MEMBER as any))?._id).toBe("profiles:a");
    expect(await isAdmin(ctx, MEMBER as any)).toBe(true);
  });

  it("names a person, falling back for no profile or a blank name", async () => {
    const ctx = makeCtx(twoProfiles(), null);
    expect(await displayNameOf(ctx, MEMBER as any)).toBe("Max");
    expect(await displayNameOf(ctx, OTHER as any)).toBe("Someone");
    expect(await displayNameOf(ctx, "users:ghost" as any, "A member")).toBe("A member");
  });
});

describe("requireOwnProfileRow", () => {
  const rows = () => ({
    ...world(),
    links: [{ _id: "links:l1", profileId: "profiles:member", url: "https://example.com" }],
  });

  it("hands back the row on the signed-in person's own profile", async () => {
    const got = await requireOwnProfileRow(makeCtx(rows(), MEMBER), "links", "links:l1" as any);
    expect(got.userId).toBe(MEMBER);
    expect(got.profile._id).toBe("profiles:member");
  });

  it("refuses with readable ConvexErrors, not plain Errors", async () => {
    expect((await thrown(requireOwnProfileRow(makeCtx(rows(), null), "links", "links:l1" as any))).data.code).toBe(
      "unauthenticated",
    );
    expect((await thrown(requireOwnProfileRow(makeCtx(rows(), MEMBER), "links", "links:none" as any))).data).toEqual({
      code: "not_found",
      reason: "Link not found",
    });
    expect((await thrown(requireOwnProfileRow(makeCtx(rows(), OTHER), "links", "links:l1" as any))).data.code).toBe(
      "forbidden",
    );
  });
});

describe("requireProfile", () => {
  it("hands back the person's profile", async () => {
    expect((await requireProfile(makeCtx(world(), null), MEMBER as any))._id).toBe("profiles:member");
  });

  it("refuses someone with no profile yet, readably", async () => {
    const err = await thrown(requireProfile(makeCtx(world(), null), "users:ghost" as any));
    expect(err.data).toEqual({ code: "no_profile", reason: "Finish your profile first." });
  });
});
