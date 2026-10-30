// Refiling a project someone posted as themselves (refileProject.ts): into an
// organization with the lead on it, or into the lead's profile bio. Real
// handlers, in-memory ctx.

import { ConvexError } from "convex/values";
import { describe, expect, it } from "vitest";
import { makeCtx, run, type Row } from "../../test-support/convexContext";
import { restoredStatus } from "../moderationRules";
import { toOrganization, toProfileBio } from "./refileProject";

const MICAH = "users:micah";
const PROJECT = "projects:elyon";

function world(extra: Record<string, Row[]> = {}, project: Record<string, unknown> = {}) {
  return makeCtx(
    {
      users: [{ _id: MICAH }, { _id: "users:jo" }],
      profiles: [
        { _id: "profiles:micah", userId: MICAH, name: "Micah Lyle", interests: [], createdAt: 1, updatedAt: 1 },
        { _id: "profiles:jo", userId: "users:jo", name: "Jo", interests: [], createdAt: 1, updatedAt: 1 },
      ],
      projects: [
        {
          _id: PROJECT,
          userId: MICAH,
          kind: "passion",
          title: "Elyon Technologies",
          blurb: "A boutique consultancy.",
          body: [{ type: "text", text: "We help small teams ship software." }],
          photoStorageId: "_storage:elyon",
          status: "active",
          createdAt: 1,
          updatedAt: 1,
          ...project,
        },
      ],
      ...extra,
    },
    null,
  );
}

const args = (dryRun?: boolean) => ({ projectId: PROJECT, ...(dryRun === undefined ? {} : { dryRun }) });
// The in-memory ctx creates an empty table the first time one is read.
const rows = (store: Record<string, Row[]>) =>
  JSON.stringify(Object.fromEntries(Object.entries(store).filter(([, r]) => r.length > 0)));

async function refusal(fn: unknown, ctx: unknown, a: Record<string, unknown> = args(false)) {
  try {
    await run(fn, ctx, a);
  } catch (err) {
    expect(err).toBeInstanceOf(ConvexError);
    return (err as ConvexError<any>).data as { code: string; reason: string };
  }
  throw new Error("expected a refusal");
}

describe("toOrganization", () => {
  it("makes the organization, puts the lead on it as Founder, and hides the project", async () => {
    const ctx = world();
    const result = await run(toOrganization, ctx, args());
    const s = ctx.store;
    expect(s.organizations).toHaveLength(1);
    const org = s.organizations[0];
    expect(org).toMatchObject({
      name: "Elyon Technologies",
      slug: "elyon-technologies",
      createdByUserId: MICAH,
      tagline: "A boutique consultancy.",
      mission: "A boutique consultancy.\n\nWe help small teams ship software.",
      logoStorageId: "_storage:elyon",
    });
    expect(s.orgPositions).toEqual([
      expect.objectContaining({ organizationId: org._id, userId: MICAH, profileId: "profiles:micah", title: "Founder", isAdmin: true }),
    ]);
    // Micah's profile shows it.
    expect(s.profiles[0].orgName).toBe("Elyon Technologies");
    expect(s.projects[0]).toMatchObject({ status: "hidden", statusBeforeHidden: "active" });
    expect(s.projects[0].hiddenAt).toEqual(expect.any(Number));
    // An admin's Unhide puts it back as it was.
    expect(restoredStatus(s.projects[0], "active")).toBe("active");
    expect(result).toMatchObject({
      organizationId: org._id,
      slug: "elyon-technologies",
      created: true,
      projectStatus: "hidden",
      leadAdded: true,
    });
  });

  it("a blurb that is part of the story is not said twice", async () => {
    const ctx = world({}, { blurb: "A boutique consultancy.", body: [{ type: "text", text: "A boutique consultancy. We ship." }] });
    await run(toOrganization, ctx, args());
    expect(ctx.store.organizations[0]).toMatchObject({ tagline: "A boutique consultancy.", mission: "A boutique consultancy. We ship." });
  });

  it("a one-line project with no story is a tagline only", async () => {
    const ctx = world({}, { body: undefined });
    await run(toOrganization, ctx, args());
    expect(ctx.store.organizations[0].tagline).toBe("A boutique consultancy.");
    expect(ctx.store.organizations[0].mission).toBeUndefined();
  });

  it("a dry run says what it would do and changes nothing", async () => {
    const ctx = world();
    const before = rows(ctx.store);
    expect(await run(toOrganization, ctx, args(true))).toEqual({
      dryRun: true,
      organizationId: null,
      slug: null,
      created: true,
      leadAdded: true,
      filled: ["logo", "tagline", "about"],
      projectStatus: "hidden",
    });
    expect(rows(ctx.store)).toBe(before);
  });

  it("finds an organization that already has the name, keeps what it says, and does not make another", async () => {
    const ctx = world({
      organizations: [
        {
          _id: "organizations:elyon",
          name: "Elyon  Technologies",
          nameKey: "elyon technologies",
          slug: "elyon",
          tagline: "Our own line.",
          createdByUserId: "users:jo",
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      orgPositions: [
        { _id: "orgPositions:jo", organizationId: "organizations:elyon", userId: "users:jo", profileId: "profiles:jo", isAdmin: true, order: 0, createdAt: 1 },
      ],
    });
    const dry = await run(toOrganization, ctx, args(true));
    expect(dry).toMatchObject({ organizationId: "organizations:elyon", slug: "elyon", created: false, filled: ["logo", "about"] });
    const result = await run(toOrganization, ctx, args(false));
    const s = ctx.store;
    expect(result).toMatchObject({ organizationId: "organizations:elyon", created: false });
    expect(s.organizations).toHaveLength(1);
    expect(s.organizations[0]).toMatchObject({ tagline: "Our own line.", logoStorageId: "_storage:elyon" });
    expect(s.orgPositions.find((p: any) => p.userId === MICAH)).toMatchObject({ title: "Founder", isAdmin: false });
  });

  it("keeps the title a lead already has there, and running it twice changes nothing more", async () => {
    const ctx = world({
      organizations: [
        { _id: "organizations:elyon", name: "Elyon Technologies", nameKey: "elyon technologies", slug: "elyon-technologies", createdByUserId: MICAH, createdAt: 1, updatedAt: 1 },
      ],
      orgPositions: [
        { _id: "orgPositions:m", organizationId: "organizations:elyon", userId: MICAH, profileId: "profiles:micah", title: "CEO", isAdmin: true, order: 0, createdAt: 1 },
      ],
    });
    expect(await run(toOrganization, ctx, args(true))).toMatchObject({ leadAdded: false });
    await run(toOrganization, ctx, args(false));
    expect(ctx.store.orgPositions).toEqual([expect.objectContaining({ title: "CEO" })]);
    const hiddenAt = ctx.store.projects[0].hiddenAt;
    const again = await run(toOrganization, ctx, args(false));
    expect(again).toMatchObject({ created: false, leadAdded: false, filled: [] });
    expect(ctx.store.orgPositions).toHaveLength(1);
    // Hidden once: the status to put back is still the original, not "hidden".
    expect(ctx.store.projects[0]).toMatchObject({ status: "hidden", statusBeforeHidden: "active", hiddenAt });
  });

  it("a team row of the lead's own does not block it", async () => {
    const ctx = world({
      projectMembers: [{ _id: "projectMembers:self", projectId: PROJECT, userId: MICAH, name: "Micah", role: "Lead", status: "accepted" }],
    });
    expect(await run(toOrganization, ctx, args(true))).toMatchObject({ created: true });
  });

  it("refuses a project another person is on, and says so, in a dry run too", async () => {
    const ctx = world({
      projectMembers: [{ _id: "projectMembers:jo", projectId: PROJECT, userId: "users:jo", name: "Jo", role: "Designer", status: "accepted" }],
    });
    const before = rows(ctx.store);
    for (const a of [args(true), args(false), args()]) {
      const data = await refusal(toOrganization, ctx, a);
      expect(data.code).toBe("needs_a_decision");
      expect(data.reason).toContain("1 accepted team member");
    }
    expect(rows(ctx.store)).toBe(before);
  });

  it.each([
    ["pending team request", { projectMembers: [{ _id: "projectMembers:p", projectId: PROJECT, userId: "users:jo", name: "Jo", role: "Mixer", status: "pending" }] }],
    ["open role", { projectRoles: [{ _id: "projectRoles:1", projectId: PROJECT, title: "Director", status: "open" }] }],
    ["update", { storyUpdates: [{ _id: "storyUpdates:1", projectId: PROJECT, authorUserId: MICAH, body: "Hi", createdAt: 1 }] }],
    ["supporter", { projectSupport: [{ _id: "projectSupport:1", projectId: PROJECT, supporterName: "Jo", type: "encouragement", visible: true, status: "confirmed", createdAt: 1 }] }],
    ["backing payment", { backingPayments: [{ _id: "backingPayments:1", projectId: PROJECT }] }],
    ["recurring gig", { gigSeries: [{ _id: "gigSeries:1", projectId: PROJECT, hostUserId: MICAH }] }],
  ])("refuses a project with a %s", async (noun, extra) => {
    const ctx = world(extra as Record<string, Row[]>);
    for (const fn of [toOrganization, toProfileBio]) {
      const data = await refusal(fn, ctx, args(true));
      expect(data.code).toBe("needs_a_decision");
      expect(data.reason).toContain(`1 ${noun}`);
    }
  });

  it("a filled role or a left team member does not block it", async () => {
    const ctx = world({
      projectRoles: [{ _id: "projectRoles:1", projectId: PROJECT, title: "Director", status: "filled" }],
      projectMembers: [{ _id: "projectMembers:l", projectId: PROJECT, userId: "users:jo", name: "Jo", role: "Mixer", status: "left" }],
    });
    expect(await run(toOrganization, ctx, args(true))).toMatchObject({ created: true });
  });

  it("refuses a project that isn't there, or a lead with no profile", async () => {
    expect((await refusal(toOrganization, world(), { projectId: "projects:gone" })).code).toBe("not_found");
    const ctx = world();
    ctx.store.profiles = [];
    expect((await refusal(toOrganization, ctx, args(false))).code).toBe("lead_has_no_profile");
  });
});

describe("toProfileBio", () => {
  const BIO_PROJECT = { title: "Artist | Pastor | Creative Director", blurb: "I make things and pray.", body: undefined };

  it("fills an empty bio and hides the project", async () => {
    const ctx = world({}, BIO_PROJECT);
    expect(await run(toProfileBio, ctx, args(false))).toEqual({
      dryRun: false,
      profileId: "profiles:micah",
      bioSet: true,
      bioKept: false,
      projectStatus: "hidden",
    });
    expect(ctx.store.profiles[0].bio).toBe("I make things and pray.");
    expect(ctx.store.projects[0]).toMatchObject({ status: "hidden", statusBeforeHidden: "active" });
  });

  it("puts the story after the blurb, and a blank bio counts as empty", async () => {
    const ctx = world(
      { profiles: [{ _id: "profiles:micah", userId: MICAH, name: "Micah Lyle", bio: "  \n ", interests: [], createdAt: 1, updatedAt: 1 }] },
      { blurb: "I make things.", body: [{ type: "text", text: "And I pray." }] },
    );
    await run(toProfileBio, ctx, args(false));
    expect(ctx.store.profiles.find((p: any) => p._id === "profiles:micah").bio).toBe("I make things.\n\nAnd I pray.");
  });

  it("a dry run says what it would do and changes nothing", async () => {
    const ctx = world({}, BIO_PROJECT);
    const before = rows(ctx.store);
    expect(await run(toProfileBio, ctx, args(true))).toEqual({
      dryRun: true,
      profileId: "profiles:micah",
      bioSet: true,
      bioKept: false,
      projectStatus: "hidden",
    });
    expect(rows(ctx.store)).toBe(before);
  });

  it("keeps a bio that has text, and leaves the project alone for Rick to decide", async () => {
    const ctx = world(
      { profiles: [{ _id: "profiles:micah", userId: MICAH, name: "Micah Lyle", bio: "Already written.", interests: [], createdAt: 1, updatedAt: 1 }] },
      BIO_PROJECT,
    );
    const before = rows(ctx.store);
    for (const dryRun of [true, false]) {
      expect(await run(toProfileBio, ctx, args(dryRun))).toMatchObject({ bioSet: false, bioKept: true, projectStatus: "active" });
    }
    expect(rows(ctx.store)).toBe(before);
  });

  it("refuses a project with no words to move", async () => {
    const ctx = world({}, { blurb: undefined, body: undefined });
    expect((await refusal(toProfileBio, ctx, args(false))).code).toBe("nothing_to_move");
  });
});
