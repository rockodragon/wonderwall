// The admin duplicates page's server side (admin/duplicates.ts): admins
// only, groups with what each copy holds, "Not duplicates" remembered, a
// dry run that changes nothing, merges through mergeUsers and
// mergeOrganizations, and refusals a person can read.

import { ConvexError } from "convex/values";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeCtx, run, type Row } from "../../test-support/convexContext";
import { checkIndexes } from "../../test-support/indexChecks";
import { expectSignedOutRefusal } from "../../test-support/signedOut";
import {
  dismissDuplicates,
  findDuplicates,
  mergeOrgs,
  mergePeople,
  previewOrgMerge,
  previewPeopleMerge,
} from "./duplicates";
import { runMergeUsers } from "./mergeUsers";

// The real mergeUsers, watched: the page must go through it, not a copy.
vi.mock("./mergeUsers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./mergeUsers")>();
  return { ...actual, runMergeUsers: vi.fn(actual.runMergeUsers) };
});

const RICK = "users:rick"; // the admin using the page
const RICK2 = "users:rick2";
const SARAH_OLD = "users:sarah-old";
const SARAH = "users:sarah";
const ZEKE = "users:zeke";
const ZEKE2 = "users:zeke2";
const FAN = "users:fan";
const MEMBER = "users:member";
const GROVE_SHORT = "organizations:grove-short";
const GROVE = "organizations:grove";

const profile = (id: string, userId: string, name: string, extra: Record<string, unknown> = {}) => ({
  _id: id,
  userId,
  name,
  interests: [],
  createdAt: 1,
  updatedAt: 1,
  ...extra,
});

function tables(extra: Record<string, Row[]> = {}): Record<string, Row[]> {
  return {
    users: [
      { _id: RICK, email: "rick@example.com", _creationTime: 1 },
      { _id: RICK2, email: "rick@other.example", _creationTime: 2 },
      { _id: SARAH_OLD, email: "sarah@old.example", _creationTime: 3 },
      { _id: SARAH, email: "sarah@example.com", phone: "+16195550100", _creationTime: 4 },
      { _id: ZEKE, _creationTime: 5 },
      { _id: ZEKE2, _creationTime: 6 },
      { _id: FAN, _creationTime: 7 },
      { _id: MEMBER, _creationTime: 8 },
    ],
    profiles: [
      profile("profiles:rick", RICK, "Rick Moy", { isAdmin: true, imageUrl: "https://x/rick.jpg" }),
      profile("profiles:rick2", RICK2, "Rick Moy"),
      profile("profiles:sarah-old", SARAH_OLD, "Sarah Shreves", {
        bio: "Painter in San Diego.",
        interests: ["Art", "other:zines"],
        handle: "sarahpaints",
        createdAt: 10,
      }),
      profile("profiles:sarah", SARAH, "sarah  shreves", { imageUrl: "https://x/sarah.jpg", handle: "sarah", createdAt: 20 }),
      profile("profiles:zeke", ZEKE, "Ezekiel Pugal / ezthetics"),
      profile("profiles:zeke2", ZEKE2, "Ezekiel Pugal"),
      profile("profiles:fan", FAN, "A Fan"),
      profile("profiles:member", MEMBER, "Member Person"),
    ],
    projects: [{ _id: "projects:1", userId: SARAH_OLD, title: "Mural" }],
    favorites: [
      { _id: "favorites:1", userId: FAN, targetType: "profile", targetId: "profiles:sarah-old" },
      { _id: "favorites:2", userId: MEMBER, targetType: "profile", targetId: "profiles:sarah-old" },
    ],
    organizations: [
      { _id: GROVE_SHORT, name: "The Grove Center for", nameKey: "the grove center for", slug: "the-grove-center-for", createdByUserId: SARAH_OLD, createdAt: 1, updatedAt: 1 },
      { _id: GROVE, name: "The Grove Center for the Arts & Media", nameKey: "x", slug: "the-grove", category: "Nonprofit", createdByUserId: FAN, createdAt: 2, updatedAt: 2 },
      { _id: "organizations:ap", name: "Abiding Practice", nameKey: "abiding practice", slug: "abiding-practice", createdByUserId: FAN, createdAt: 3, updatedAt: 3 },
    ],
    orgPositions: [
      { _id: "orgPositions:1", organizationId: GROVE_SHORT, userId: SARAH_OLD, profileId: "profiles:sarah-old", isAdmin: true, order: 0, createdAt: 1 },
      { _id: "orgPositions:2", organizationId: GROVE, userId: FAN, profileId: "profiles:fan", isAdmin: true, order: 0, createdAt: 1 },
    ],
    authAccounts: [
      { _id: "authAccounts:1", userId: SARAH_OLD, provider: "google", providerAccountId: "g-123" },
      { _id: "authAccounts:2", userId: SARAH_OLD, provider: "password", providerAccountId: "sarah@old.example" },
      { _id: "authAccounts:3", userId: SARAH, provider: "password", providerAccountId: "sarah@example.com" },
      { _id: "authAccounts:4", userId: RICK, provider: "google", providerAccountId: "g-rick" },
      { _id: "authAccounts:5", userId: RICK2, provider: "phone", providerAccountId: "+16195550199" },
    ],
    authSessions: [{ _id: "authSessions:1", userId: SARAH_OLD, _creationTime: 50 }],
    ...extra,
  };
}

const asAdmin = (extra?: Record<string, Row[]>) => makeCtx(tables(extra), RICK);
const asMember = () => makeCtx(tables(), MEMBER);

async function refusal(call: Promise<unknown>): Promise<{ code: string; reason: string }> {
  try {
    await call;
  } catch (err) {
    expect(err).toBeInstanceOf(ConvexError);
    return (err as ConvexError<any>).data;
  }
  throw new Error("expected the call to be refused");
}

// The in-memory ctx creates an empty table the first time one is read.
const rows = (store: Record<string, Row[]>) =>
  JSON.stringify(Object.fromEntries(Object.entries(store).filter(([, r]) => r.length > 0)));

const PUBLIC: [string, unknown, Record<string, unknown>][] = [
  ["findDuplicates", findDuplicates, {}],
  ["previewPeopleMerge", previewPeopleMerge, { keepUserId: SARAH, mergeUserIds: [SARAH_OLD] }],
  ["mergePeople", mergePeople, { keepUserId: SARAH, mergeUserIds: [SARAH_OLD] }],
  ["previewOrgMerge", previewOrgMerge, { keepId: GROVE, mergeIds: [GROVE_SHORT] }],
  ["mergeOrgs", mergeOrgs, { keepId: GROVE, mergeIds: [GROVE_SHORT] }],
  ["dismissDuplicates", dismissDuplicates, { kind: "person", ids: [SARAH, SARAH_OLD] }],
];

describe("admins only", () => {
  for (const [name, fn, args] of PUBLIC) {
    it(`${name}: signed out is refused`, async () => {
      await expectSignedOutRefusal(fn, args, tables());
    });
    it(`${name}: a member who isn't an admin is refused, and nothing changes`, async () => {
      const ctx = asMember();
      const before = rows(ctx.store);
      expect((await refusal(run(fn, ctx, args))).code).toBe("forbidden");
      expect(rows(ctx.store)).toBe(before);
    });
  }
});

describe("findDuplicates", () => {
  it("groups people and organizations, with what each copy holds", async () => {
    const ctx = asAdmin();
    checkIndexes(ctx);
    const found = await run(findDuplicates, ctx);
    expect(found.checked).toEqual({ people: 8, organizations: 3 });
    expect(found.people.map((g: any) => [g.reasons, g.members.map((m: any) => m.userId)])).toEqual([
      [["Same name"], [RICK, RICK2]],
      [["Same name"], [SARAH_OLD, SARAH]],
      [["Same name before the “/”"], [ZEKE, ZEKE2]],
    ]);
    expect(found.organizations.map((g: any) => [g.reasons, g.members.map((m: any) => m.organizationId)])).toEqual([
      [["One name starts the other"], [GROVE_SHORT, GROVE]],
    ]);

    const [oldSarah, sarah] = found.people[1].members;
    expect(oldSarah).toMatchObject({
      name: "Sarah Shreves",
      handle: "sarahpaints",
      bio: "Painter in San Diego.",
      email: "sarah@old.example",
      imageUrl: null,
      unfinished: false,
      isYou: false,
      signIns: ["Google", "Password"],
      organizations: ["The Grove Center for"],
      lastActiveAt: 50,
      counts: { projects: 1, followers: 2, organizations: 1, pieces: 0, messages: 0 },
    });
    expect(sarah).toMatchObject({ phone: "+16195550100", imageUrl: "https://x/sarah.jpg", signIns: ["Password"] });
    expect(found.people[0].members[0]).toMatchObject({ isYou: true, isAdmin: true });

    const [short] = found.organizations[0].members;
    expect(short).toMatchObject({
      name: "The Grove Center for",
      slug: "the-grove-center-for",
      createdByName: "Sarah Shreves",
      members: [{ name: "Sarah Shreves", isAdmin: true, current: true, title: null }],
    });
  });

  it("“Not duplicates” puts a group away for good", async () => {
    const ctx = asAdmin();
    expect(await run(dismissDuplicates, ctx, { kind: "person", ids: [SARAH, SARAH_OLD] })).toEqual({ dismissed: 1 });
    expect(await run(dismissDuplicates, ctx, { kind: "person", ids: [SARAH_OLD, SARAH] })).toEqual({ dismissed: 0 });
    await run(dismissDuplicates, ctx, { kind: "organization", ids: [GROVE, GROVE_SHORT] });
    const found = await run(findDuplicates, ctx);
    expect(found.people.map((g: any) => g.members[0].name)).toEqual(["Rick Moy", "Ezekiel Pugal / ezthetics"]);
    expect(found.organizations).toEqual([]);
  });

  it("“Not duplicates” refuses ids that aren't there", async () => {
    expect(await refusal(run(dismissDuplicates, asAdmin(), { kind: "person", ids: [SARAH, "users:ghost"] }))).toMatchObject({
      code: "not_found",
    });
    expect(await refusal(run(dismissDuplicates, asAdmin(), { kind: "person", ids: [SARAH] }))).toMatchObject({
      code: "invalid_input",
    });
  });
});

describe("merging people", () => {
  beforeEach(() => {
    vi.mocked(runMergeUsers).mockClear();
  });

  it("the preview is mergeUsers' dry run, in plain words, and changes nothing", async () => {
    const ctx = asAdmin();
    const before = rows(ctx.store);
    const plan = await run(previewPeopleMerge, ctx, { keepUserId: SARAH, mergeUserIds: [SARAH_OLD] });
    expect(rows(ctx.store)).toBe(before);
    expect(runMergeUsers).toHaveBeenCalledWith(ctx, {
      targetUserId: SARAH,
      sourceUserIds: [SARAH_OLD],
      dryRun: true,
      moveContent: true,
    });
    expect(plan).toEqual({
      keep: { name: "sarah  shreves", contact: "sarah@example.com" },
      lines: [
        "Moves 1 project, 2 followers and 1 organization to sarah  shreves (sarah@example.com).",
        "Fills sarah  shreves's empty bio and interests from the other copy. Everything sarah  shreves's copy already had stays as it is.",
        "Deletes the other account.",
      ],
      signIn: [
        "sarah  shreves's own sign-in stays as it is: password (sarah@example.com).",
        "The other copy's sign-in, Google (sarah@old.example), moves over: it keeps working, and opens sarah  shreves's account from now on.",
        "The other copy's password (sarah@old.example) stops working, because sarah  shreves's account already has a password.",
        "Anyone signed in as the other copy right now is signed out.",
      ],
      warnings: ["This can't be undone."],
    });
  });

  it("the merge goes through mergeUsers with moveContent, and says what it did", async () => {
    const ctx = asAdmin();
    const plan = await run(mergePeople, ctx, { keepUserId: SARAH, mergeUserIds: [SARAH_OLD] });
    expect(runMergeUsers).toHaveBeenCalledWith(ctx, {
      targetUserId: SARAH,
      sourceUserIds: [SARAH_OLD],
      dryRun: false,
      moveContent: true,
    });
    expect(plan.lines[0]).toMatch(/^Moved 1 project, 2 followers and 1 organization to sarah {2}shreves/);
    expect(plan.lines[2]).toBe("Deleted the other account.");
    const s = ctx.store;
    expect(s.users.some((u: Row) => u._id === SARAH_OLD)).toBe(false);
    expect(s.projects[0].userId).toBe(SARAH);
    expect(s.favorites.map((f: Row) => f.targetId)).toEqual(["profiles:sarah", "profiles:sarah"]);
    expect(s.orgPositions[0]).toMatchObject({ userId: SARAH, profileId: "profiles:sarah" });
    expect(s.authAccounts.filter((a: Row) => a.userId === SARAH).map((a: Row) => a._id)).toEqual([
      "authAccounts:1",
      "authAccounts:3",
    ]);
  });

  it("a refusal from mergeUsers comes back as a reason, and nothing changes", async () => {
    const ctx = asAdmin({
      billingCustomers: [
        { _id: "billingCustomers:1", userId: SARAH, stripeCustomerId: "cus_1" },
        { _id: "billingCustomers:2", userId: SARAH_OLD, stripeCustomerId: "cus_2" },
      ],
    });
    const before = rows(ctx.store);
    expect(await refusal(run(mergePeople, ctx, { keepUserId: SARAH, mergeUserIds: [SARAH_OLD] }))).toEqual({
      code: "cannot_merge",
      reason:
        "Both copies have their own billing account with Stripe, so they can't be combined here. One of the two has to be closed in Stripe first; ask for help with that.",
    });
    expect(rows(ctx.store)).toBe(before);
  });

  it("won't take away the admin's own access", async () => {
    // The other copy was made "not an admin" on purpose, so it isn't filled.
    const ctx = asAdmin();
    ctx.store.profiles.find((p: Row) => p.userId === RICK2).isAdmin = false;
    expect(await refusal(run(mergePeople, ctx, { keepUserId: RICK2, mergeUserIds: [RICK] }))).toMatchObject({
      code: "would_lose_admin",
    });
    expect(ctx.store.users.some((u: Row) => u._id === RICK)).toBe(true);
  });

  it("warns an admin merging away the account they're signed in with", async () => {
    // The kept copy gets admin access from the other one (its own is unset).
    const plan = await run(previewPeopleMerge, asAdmin(), { keepUserId: RICK2, mergeUserIds: [RICK] });
    expect(plan.lines[1]).toContain("photo");
    expect(plan.lines[1]).toContain("admin access");
    expect(plan.warnings[0]).toBe(
      "You're signed in as the copy that goes away. You'll be signed out; sign in again the same way and you'll be in Rick Moy's account.",
    );
    expect(plan.signIn[0]).toBe("Rick Moy's own sign-in stays as it is: text-message code (•••• 0199).");
  });

  it("refuses picking the same copy twice, or one that's gone", async () => {
    expect(await refusal(run(previewPeopleMerge, asAdmin(), { keepUserId: SARAH, mergeUserIds: [SARAH] }))).toEqual({
      code: "same_account",
      reason: "Pick a different copy to merge in.",
    });
    expect(
      await refusal(run(previewPeopleMerge, asAdmin(), { keepUserId: "users:ghost", mergeUserIds: [SARAH] })),
    ).toMatchObject({ code: "not_found" });
  });
});

describe("merging organizations", () => {
  it("the preview says what would happen and changes nothing", async () => {
    const ctx = asAdmin();
    const before = rows(ctx.store);
    const plan = await run(previewOrgMerge, ctx, { keepId: GROVE, mergeIds: [GROVE_SHORT] });
    expect(rows(ctx.store)).toBe(before);
    expect(plan).toEqual({
      keep: { name: "The Grove Center for the Arts & Media", contact: "/orgs/the-grove" },
      lines: [
        "Moves 1 person (Sarah Shreves) to The Grove Center for the Arts & Media (/orgs/the-grove).",
        "Nothing to fill in: The Grove Center for the Arts & Media already has everything the other copy has.",
        "Deletes the other copy, The Grove Center for. Its old address, /orgs/the-grove-center-for, keeps working and opens The Grove Center for the Arts & Media.",
      ],
      signIn: [],
      warnings: ["This can't be undone."],
    });
  });

  it("the merge moves its people and deletes it", async () => {
    const ctx = asAdmin();
    const plan = await run(mergeOrgs, ctx, { keepId: GROVE, mergeIds: [GROVE_SHORT] });
    expect(plan.lines[0]).toBe("Moved 1 person (Sarah Shreves) to The Grove Center for the Arts & Media (/orgs/the-grove).");
    expect(ctx.store.organizations.map((o: Row) => o._id)).toEqual([GROVE, "organizations:ap"]);
    expect(ctx.store.orgPositions.map((p: Row) => p.organizationId)).toEqual([GROVE, GROVE]);
  });

  it("refuses the same organization twice", async () => {
    expect(await refusal(run(previewOrgMerge, asAdmin(), { keepId: GROVE, mergeIds: [GROVE] }))).toMatchObject({
      code: "same_organization",
    });
  });
});
