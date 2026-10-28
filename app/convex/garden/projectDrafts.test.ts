// Project drafts (Rick, 2026-10-28): a passion project saved with "Save
// draft" and posted later. A draft is status "draft": only its lead (and an
// admin) sees it, nobody is told until publishProject, and no list, story
// page, Shortlist, cheer, backing or join request reaches it. discardDraft
// throws it away with its files.
//
// The pure rules first, then the handlers on the in-memory ctx in
// test-support (the same ctx and shapes as projects.test.ts and
// drift.garden.test.ts).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeCtx, run, type Row } from "../../test-support/convexContext";
import { isPostedProject as engagementIsPostedProject } from "../engagement/rules";
import { DRAFT_STATUS, isDraft, isPostedProject, isShownProject, VISIBLE_PROJECT_STATUSES } from "../moderationRules";
import {
  createPassionProject,
  discardDraft,
  getProject,
  listMyDrafts,
  listProjects,
  publishProject,
  updateProject,
  updateProjectStatus,
} from "./projects";
import { getProject as getPublicProject } from "./projectsPublic";
import { getStoryPage, listProjectUpdates, postStoryUpdate } from "./stories";
import { listSupportForProject, startBacking, supportProject } from "./support";
import { addRole, getTeam, inviteMember, listAffiliations, listRoles, requestToJoin } from "./projectTeam";
import { listTiers } from "./patronTiers";
import { getRecentActivity } from "./activity";
import { tallyCounts } from "./operatorCounts";

// startBacking and a financial supportProject refuse first while backing is
// off (FF_BACKING); open, so the draft check is the one that answers.
vi.mock("../../app/lib/featureFlags", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../app/lib/featureFlags")>()),
  FF_BACKING: true,
}));

// The first-cheer email walks the owner's projects with an async iterator the
// fake ctx doesn't have; it isn't what is under test.
vi.mock("../engagement/firstCheer", () => ({
  isFirstCheerReceived: async () => false,
  emailFirstCheer: async () => {},
}));

const LEAD = "users:lead";
const MEMBER = "users:member";
const ADMIN = "users:admin";
const FAN = "users:fan"; // follows the lead
const NOW = 1_800_000_000_000;
const DRAFT = "projects:d1";
const args = { projectId: DRAFT };

beforeEach(() => {
  vi.spyOn(Date, "now").mockReturnValue(NOW);
});
afterEach(() => {
  vi.restoreAllMocks();
});

const draftRow = (over: Record<string, unknown> = {}): Row => ({
  _id: DRAFT,
  userId: LEAD,
  kind: "passion",
  origin: "posted",
  title: "Harbor Mural",
  status: "draft",
  storySlug: "harbor-mural",
  createdAt: 1,
  updatedAt: 1,
  ...over,
});

function world(extra: Record<string, Row[]> = {}, projectOver: Record<string, unknown> = {}): Record<string, Row[]> {
  return {
    users: [{ _id: LEAD }, { _id: MEMBER }, { _id: ADMIN }, { _id: FAN }],
    profiles: [
      { _id: "profiles:lead", userId: LEAD, name: "Lena", interests: [] },
      { _id: "profiles:member", userId: MEMBER, name: "Mo", interests: [] },
      { _id: "profiles:admin", userId: ADMIN, name: "Ada", interests: [], isAdmin: true },
      { _id: "profiles:fan", userId: FAN, name: "Fay", interests: [] },
    ],
    favorites: [{ _id: "favorites:f1", userId: FAN, targetType: "profile", targetId: "profiles:lead" }],
    projects: [draftRow(projectOver)],
    ...extra,
  };
}

/** The error a handler throws: its {code, reason} payload. */
async function thrown(p: Promise<unknown>): Promise<any> {
  try {
    await p;
  } catch (e) {
    return (e as { data?: unknown }).data ?? e;
  }
  throw new Error("expected the handler to throw");
}

const stored = (ctx: any, id = DRAFT) => ctx.store.projects.find((p: Row) => p._id === id);

// ——————————————————————————————————————————————————————————————
// The pure rules
// ——————————————————————————————————————————————————————————————

describe("draft rules", () => {
  it("isDraft reads only the draft status", () => {
    expect(DRAFT_STATUS).toBe("draft");
    expect(isDraft({ status: "draft" })).toBe(true);
    for (const status of ["active", "hidden", "archived", "completed", undefined]) expect(isDraft({ status })).toBe(false);
    expect(isDraft(null)).toBe(false);
  });

  it("isShownProject is false for a draft, true for a live project", () => {
    expect(isShownProject({ status: "draft" })).toBe(false);
    for (const status of ["active", "in_progress", "completed"]) expect(isShownProject({ status })).toBe(true);
    expect(isShownProject({ status: "hidden" })).toBe(false);
    expect(isShownProject({ status: "archived" })).toBe(false);
  });

  it("isPostedProject is false for a draft; both copies are the one rule", () => {
    expect(isPostedProject({ origin: "posted", status: "draft" })).toBe(false);
    expect(isPostedProject({ status: "draft" })).toBe(false);
    expect(isPostedProject({ origin: "posted", status: "active" })).toBe(true);
    expect(isPostedProject({})).toBe(true);
    expect(isPostedProject({ origin: "portfolio", status: "active" })).toBe(false);
    // engagement/rules.ts re-exports it rather than keeping its own.
    expect(engagementIsPostedProject).toBe(isPostedProject);
    expect(engagementIsPostedProject({ origin: "posted", status: "draft" })).toBe(false);
  });

  it("no browse list allows a draft", () => {
    expect(VISIBLE_PROJECT_STATUSES.has("draft")).toBe(false);
  });
});

// ——————————————————————————————————————————————————————————————
// Saving a draft
// ——————————————————————————————————————————————————————————————

describe("createPassionProject({ draft: true })", () => {
  it("inserts a draft and tells nobody: no follower notice, no project_created", async () => {
    const ctx = makeCtx(world({}, {}), LEAD);
    ctx.store.projects = [];
    const out = await run(createPassionProject, ctx, { title: "Harbor Mural", draft: true });
    expect(out).toEqual({ projectId: expect.stringMatching(/^projects:/), storySlug: "harbor-mural" });
    expect(stored(ctx, out.projectId)).toMatchObject({ status: "draft", kind: "passion", origin: "posted", userId: LEAD });
    expect(ctx.store.notifications ?? []).toEqual([]);
    expect(ctx.store.productEvents ?? []).toEqual([]);
  });

  it("keeps the link-preview fetch for a pasted link", async () => {
    const ctx = makeCtx(world(), LEAD);
    ctx.store.projects = [];
    const runAfter = vi.fn(async (..._args: unknown[]) => {});
    ctx.scheduler.runAfter = runAfter;
    const out = await run(createPassionProject, ctx, {
      title: "Reel",
      draft: true,
      mediaUrl: "https://www.instagram.com/reel/C0FFEE12345/",
    });
    expect(stored(ctx, out.projectId)).toMatchObject({ status: "draft" });
    // The still is fetched for the draft, as for a posted project; the event
    // outbox is the only other thing scheduled, and a draft writes none.
    expect(runAfter.mock.calls.map((c) => c[2])).toEqual([
      expect.objectContaining({ target: "project", id: out.projectId }),
    ]);
  });

  it("still checks community membership and post-as when it's saved", async () => {
    const hostOrgs = [{ _id: "hostOrgs:c1", name: "Studio", slug: "studio", kind: "community", status: "active", visibility: "public", joinPolicy: "open", ownerUserId: MEMBER, createdAt: 1 }];
    const ctx = makeCtx(world({ hostOrgs }), LEAD);
    ctx.store.projects = [];
    expect(await thrown(run(createPassionProject, ctx, { title: "A", draft: true, hostOrgId: "hostOrgs:c1" }))).toMatchObject({ code: "not_a_member" });
    expect(await thrown(run(createPassionProject, ctx, { title: "A", draft: true, organizationId: "organizations:o1" }))).toMatchObject({ code: "not_in_org" });
    expect(ctx.store.projects).toEqual([]);
  });

  it("a project made without draft is still posted: notice and event, as before", async () => {
    const ctx = makeCtx(world(), LEAD);
    ctx.store.projects = [];
    const out = await run(createPassionProject, ctx, { title: "Harbor Mural" });
    expect(stored(ctx, out.projectId).status).toBe("active");
    expect(ctx.store.notifications).toEqual([
      expect.objectContaining({ userId: FAN, type: "followed_posted_project", title: "Lena posted Harbor Mural" }),
    ]);
    expect(ctx.store.productEvents).toEqual([
      expect.objectContaining({
        event: "project_created",
        userId: LEAD,
        properties: { kind: "passion", project_id: out.projectId, community_id: null },
      }),
    ]);
  });
});

// ——————————————————————————————————————————————————————————————
// Posting a draft
// ——————————————————————————————————————————————————————————————

describe("publishProject", () => {
  it("posts it: active, sorted as new, followers told, project_created with from_draft", async () => {
    const ctx = makeCtx(world({}, { createdAt: 1, updatedAt: 5 }), LEAD);
    expect(await run(publishProject, ctx, args)).toEqual({ projectId: DRAFT });
    expect(stored(ctx)).toMatchObject({ status: "active", createdAt: NOW, updatedAt: NOW });
    expect(ctx.store.notifications).toEqual([
      expect.objectContaining({
        userId: FAN,
        type: "followed_posted_project",
        title: "Lena posted Harbor Mural",
        linkUrl: `/projects/${DRAFT}`,
      }),
    ]);
    expect(ctx.store.productEvents).toEqual([
      expect.objectContaining({
        event: "project_created",
        userId: LEAD,
        properties: { kind: "passion", project_id: DRAFT, community_id: null, from_draft: true },
      }),
    ]);
  });

  it("then lists it, and it opens for everyone", async () => {
    const ctx = makeCtx(world(), LEAD);
    await run(publishProject, ctx, args);
    const visitor = makeCtx(ctx.store, null);
    expect((await run(listProjects, visitor, {})).map((p: Row) => p._id)).toEqual([DRAFT]);
    expect(await run(getProject, visitor, args)).toMatchObject({ title: "Harbor Mural", status: "active" });
    expect(await run(getStoryPage, visitor, { storySlug: "harbor-mural" })).not.toBeNull();
  });

  it("refuses a project that isn't a draft, and changes nothing", async () => {
    const ctx = makeCtx(world({}, { status: "active", createdAt: 1 }), LEAD);
    expect(await thrown(run(publishProject, ctx, args))).toEqual({ code: "not_draft", reason: "This project is already up." });
    expect(stored(ctx)).toMatchObject({ status: "active", createdAt: 1 });
    expect(ctx.store.notifications ?? []).toEqual([]);
    expect(ctx.store.productEvents ?? []).toEqual([]);
  });

  it("refuses someone who isn't the lead, an admin too, and signed out", async () => {
    for (const viewer of [MEMBER, ADMIN]) {
      const ctx = makeCtx(world(), viewer);
      expect(await thrown(run(publishProject, ctx, args))).toMatchObject({ code: "forbidden" });
      expect(stored(ctx).status).toBe("draft");
    }
    const out = makeCtx(world(), null);
    expect(await thrown(run(publishProject, out, args))).toMatchObject({ code: "unauthenticated" });
    expect(stored(out).status).toBe("draft");
  });

  it("checks again that they're still in the community and the organization", async () => {
    const hostOrgs = [{ _id: "hostOrgs:c1", name: "Studio", slug: "studio", kind: "community", status: "active", visibility: "public", joinPolicy: "open", ownerUserId: MEMBER, createdAt: 1 }];
    // Saved into a community they have since left.
    const left = makeCtx(world({ hostOrgs }, { hostOrgId: "hostOrgs:c1" }), LEAD);
    expect(await thrown(run(publishProject, left, args))).toMatchObject({ code: "not_a_member" });
    expect(stored(left).status).toBe("draft");
    // Saved as an organization that is no longer on their profile.
    const out = makeCtx(world({}, { organizationId: "organizations:o1" }), LEAD);
    expect(await thrown(run(publishProject, out, args))).toMatchObject({ code: "not_in_org" });
    expect(stored(out).status).toBe("draft");
    expect(left.store.notifications ?? []).toEqual([]);
  });

  it("posts into a community they're in; a hidden (test) community's followers aren't told, the event still counts", async () => {
    const hostOrgs = [{ _id: "hostOrgs:t", name: "_TeamTest", slug: "teamtest", kind: "community", status: "active", visibility: "public", joinPolicy: "open", ownerUserId: LEAD, createdAt: 1 }];
    const communityMembers = [{ _id: "communityMembers:1", hostOrgId: "hostOrgs:t", userId: LEAD, role: "member", status: "active", joinedAt: 0 }];
    const ctx = makeCtx(world({ hostOrgs, communityMembers }, { hostOrgId: "hostOrgs:t" }), LEAD);
    await run(publishProject, ctx, args);
    expect(stored(ctx).status).toBe("active");
    expect(ctx.store.notifications ?? []).toEqual([]);
    expect(ctx.store.productEvents).toHaveLength(1);
    expect(ctx.store.productEvents[0].properties).toMatchObject({ community_id: "hostOrgs:t", from_draft: true });
  });
});

// ——————————————————————————————————————————————————————————————
// Throwing a draft away
// ——————————————————————————————————————————————————————————————

describe("discardDraft", () => {
  const body = [
    { type: "text", text: "Sketches" },
    { type: "image", storageId: "_storage:body-img" },
  ];
  function fullDraft(): Record<string, Row[]> {
    return world(
      {
        projects: [
          draftRow({ photoStorageId: "_storage:photo", mediaPreviewStorageId: "_storage:still", body }),
          // Someone's other project, and the lead's posted one, are untouched.
          { _id: "projects:other", userId: LEAD, kind: "passion", origin: "posted", title: "Posted", status: "active", createdAt: 1, updatedAt: 1, photoStorageId: "_storage:other-photo" },
        ],
        projectRoles: [
          { _id: "projectRoles:r1", projectId: DRAFT, title: "Painter", status: "open", createdAt: 1 },
          { _id: "projectRoles:other", projectId: "projects:other", title: "Painter", status: "open", createdAt: 1 },
        ],
        patronTiers: [
          { _id: "patronTiers:t1", projectId: DRAFT, name: "Friend", priceCents: 500, isActive: true, sortOrder: 0 },
          { _id: "patronTiers:other", projectId: "projects:other", name: "Friend", priceCents: 500, isActive: true, sortOrder: 0 },
        ],
        _storage: [
          { _id: "_storage:photo" },
          { _id: "_storage:still" },
          { _id: "_storage:body-img" },
          { _id: "_storage:other-photo" },
        ],
      },
    );
  }

  it("deletes the row, its child rows and its files, and nothing else", async () => {
    const ctx = makeCtx(fullDraft(), LEAD);
    expect(await run(discardDraft, ctx, args)).toEqual({ ok: true });
    expect(ctx.store.projects.map((p: Row) => p._id)).toEqual(["projects:other"]);
    expect(ctx.store.projectRoles.map((r: Row) => r._id)).toEqual(["projectRoles:other"]);
    expect(ctx.store.patronTiers.map((t: Row) => t._id)).toEqual(["patronTiers:other"]);
    expect([...ctx.deletedFiles].sort()).toEqual(["_storage:body-img", "_storage:photo", "_storage:still"]);
    expect(ctx.store.notifications ?? []).toEqual([]);
  });

  it("is gone from the lead's drafts list and from getProject", async () => {
    const ctx = makeCtx(fullDraft(), LEAD);
    await run(discardDraft, ctx, args);
    expect(await run(listMyDrafts, ctx, {})).toEqual([]);
    expect(await run(getProject, ctx, args)).toBeNull();
  });

  it("refuses a project that isn't a draft, and deletes nothing", async () => {
    const ctx = makeCtx(world({}, { status: "active", photoStorageId: "_storage:photo" }), LEAD);
    expect(await thrown(run(discardDraft, ctx, args))).toEqual({ code: "not_draft", reason: "Only a draft can be discarded." });
    expect(ctx.store.projects).toHaveLength(1);
    expect(ctx.deletedFiles).toEqual([]);
  });

  it("refuses someone who isn't the lead, an admin too, and signed out", async () => {
    for (const viewer of [MEMBER, ADMIN]) {
      const ctx = makeCtx(fullDraft(), viewer);
      expect(await thrown(run(discardDraft, ctx, args))).toMatchObject({ code: "forbidden" });
      expect(ctx.store.projects).toHaveLength(2);
      expect(ctx.deletedFiles).toEqual([]);
    }
    expect(await thrown(run(discardDraft, makeCtx(fullDraft(), null), args))).toMatchObject({ code: "unauthenticated" });
  });

  it("would not erase money on record, as the admin's Delete wouldn't (none can reach a draft)", async () => {
    const projectSupport = [
      { _id: "projectSupport:1", projectId: DRAFT, supporterName: "B", type: "financial_one_time", amountCents: 500, visible: true, status: "confirmed", createdAt: 0 },
    ];
    const ctx = makeCtx(world({ projectSupport }), LEAD);
    expect(await thrown(run(discardDraft, ctx, args))).toMatchObject({ code: "has_money" });
    expect(ctx.store.projects).toHaveLength(1);
  });
});

// ——————————————————————————————————————————————————————————————
// The lead's drafts list
// ——————————————————————————————————————————————————————————————

describe("listMyDrafts", () => {
  const rows = (): Record<string, Row[]> =>
    world({
      projects: [
        draftRow({ _id: "projects:old", title: "Older", updatedAt: 10 }),
        draftRow({ _id: "projects:new", title: "Newer", updatedAt: 30, photoUrl: "https://img.example/a.jpg" }),
        draftRow({ _id: "projects:mid", title: "Middle", updatedAt: 20 }),
        // Not drafts, or not theirs.
        draftRow({ _id: "projects:posted", title: "Posted", status: "active", updatedAt: 99 }),
        draftRow({ _id: "projects:hidden", title: "Hidden", status: "hidden", updatedAt: 98 }),
        draftRow({ _id: "projects:theirs", title: "Mo's draft", userId: MEMBER, updatedAt: 97 }),
      ],
    });

  it("returns only your own drafts, newest updatedAt first, in the shape the list draws", async () => {
    const out = await run(listMyDrafts, makeCtx(rows(), LEAD), {});
    expect(out).toEqual([
      { _id: "projects:new", title: "Newer", updatedAt: 30, photoUrl: "https://img.example/a.jpg" },
      { _id: "projects:mid", title: "Middle", updatedAt: 20, photoUrl: null },
      { _id: "projects:old", title: "Older", updatedAt: 10, photoUrl: null },
    ]);
    expect((await run(listMyDrafts, makeCtx(rows(), MEMBER), {})).map((d: Row) => d._id)).toEqual(["projects:theirs"]);
  });

  it("is empty when signed out, or when you have none", async () => {
    expect(await run(listMyDrafts, makeCtx(rows(), null), {})).toEqual([]);
    expect(await run(listMyDrafts, makeCtx(rows(), FAN), {})).toEqual([]);
  });

  it("editing a draft moves it to the top", async () => {
    const ctx = makeCtx(rows(), LEAD);
    await run(updateProject, ctx, { projectId: "projects:old", title: "Older, edited" });
    const out = await run(listMyDrafts, ctx, {});
    expect(out[0]).toMatchObject({ _id: "projects:old", title: "Older, edited", updatedAt: NOW });
  });
});

// ——————————————————————————————————————————————————————————————
// Who sees a draft
// ——————————————————————————————————————————————————————————————

describe("who sees a draft", () => {
  const tables = (): Record<string, Row[]> =>
    world({
      storyUpdates: [{ _id: "storyUpdates:u1", projectId: DRAFT, authorUserId: LEAD, body: "Day one.", createdAt: 2 }],
      projectSupport: [
        { _id: "projectSupport:s1", projectId: DRAFT, type: "encouragement", status: "confirmed", visible: true, supporterName: "Mo", supporterUserId: MEMBER, createdAt: 3 },
      ],
      patronTiers: [{ _id: "patronTiers:t1", projectId: DRAFT, name: "Friend", priceCents: 500, isActive: true, sortOrder: 0 }],
      projectRoles: [{ _id: "projectRoles:r1", projectId: DRAFT, title: "Painter", status: "open", createdAt: 1 }],
    });

  it.each([
    ["someone signed out", null],
    ["another member", MEMBER],
    ["a follower", FAN],
  ])("is not found to %s, on the page or in anything the page reads", async (_label, viewer) => {
    const ctx = () => makeCtx(tables(), viewer);
    expect(await run(getProject, ctx(), args)).toBeNull();
    expect(await run(listProjectUpdates, ctx(), args)).toEqual([]);
    expect(await run(listSupportForProject, ctx(), args)).toEqual([]);
    expect(await run(listTiers, ctx(), args)).toEqual([]);
    expect(await run(listRoles, ctx(), args)).toEqual([]);
    expect(await run(getTeam, ctx(), args)).toBeNull();
  });

  it.each([
    ["its lead", LEAD],
    ["an admin", ADMIN],
  ])("opens for %s, as a draft", async (_label, viewer) => {
    const ctx = () => makeCtx(tables(), viewer);
    expect(await run(getProject, ctx(), args)).toMatchObject({ title: "Harbor Mural", status: "draft" });
    expect(await run(listProjectUpdates, ctx(), args)).toHaveLength(1);
    expect(await run(listTiers, ctx(), args)).toHaveLength(1);
    expect(await run(listRoles, ctx(), args)).toHaveLength(1);
    expect(await run(getTeam, ctx(), args)).not.toBeNull();
  });

  it("gives the lead the exact place on their draft", async () => {
    const place = { location: "Harbor Studio, Oakland", locationType: "venue", address: { street: "12 Dock St", city: "Oakland" }, coordinates: { lat: 1, lng: 2 }, placeId: "p" };
    const project = await run(getProject, makeCtx(world({}, place), LEAD), args);
    expect(project).toMatchObject({ address: place.address, coordinates: place.coordinates });
  });

  it.each([
    ["someone signed out", null],
    ["another member", MEMBER],
    ["a follower", FAN],
    ["its lead", LEAD],
    ["an admin", ADMIN],
  ])("is in no browse list or profile for %s", async (_label, viewer) => {
    const ctx = () => makeCtx(tables(), viewer);
    expect(await run(listProjects, ctx(), {})).toEqual([]);
    expect(await run(listAffiliations, ctx(), { profileId: "profiles:lead" })).toEqual([]);
  });

  it.each([
    ["someone signed out", null],
    ["another member", MEMBER],
    ["its lead", LEAD],
    ["an admin", ADMIN],
  ])("has no story page for %s, and no legacy page", async (_label, viewer) => {
    expect(await run(getStoryPage, makeCtx(tables(), viewer), { storySlug: "harbor-mural" })).toBeNull();
    expect(await run(getPublicProject, makeCtx(tables(), viewer), args)).toBeNull();
  });

  it("the same reads do show a posted project, so the nulls above are the draft's", async () => {
    const posted = () => makeCtx(world({}, { status: "active" }), null);
    expect(await run(getStoryPage, posted(), { storySlug: "harbor-mural" })).not.toBeNull();
    expect(await run(getPublicProject, posted(), args)).not.toBeNull();
    expect(await run(getProject, posted(), args)).not.toBeNull();
    expect(await run(listProjects, posted(), {})).toHaveLength(1);
    expect(await run(listAffiliations, posted(), { profileId: "profiles:lead" })).toHaveLength(1);
  });

  it("a lead can set up roles on a draft", async () => {
    const ctx = makeCtx(world(), LEAD);
    await run(addRole, ctx, { projectId: DRAFT, title: "Painter" });
    expect(ctx.store.projectRoles).toEqual([expect.objectContaining({ projectId: DRAFT, title: "Painter", status: "open" })]);
  });

  it("an admin's activity feed doesn't announce a draft as a project", async () => {
    const out = await run(getRecentActivity, makeCtx(world(), ADMIN), {});
    expect(out.filter((i: { source: string }) => i.source === "project_created")).toEqual([]);
    const posted = await run(getRecentActivity, makeCtx(world({}, { status: "active" }), ADMIN), {});
    expect(posted.filter((i: { source: string }) => i.source === "project_created")).toHaveLength(1);
  });

  it("the operator's counts don't count a draft as a project or as a shared work", () => {
    const base = { userId: LEAD, kind: "passion", stage: "planning", createdAt: NOW };
    const counts = tallyCounts(
      {
        profiles: [],
        communityMembers: [],
        memberships: [],
        waitlist: [],
        events: [],
        projects: [
          { ...base, status: "draft", origin: "posted" },
          { ...base, status: "active", origin: "posted" },
          { ...base, status: "active", origin: "portfolio" },
        ],
      },
      NOW,
    );
    const rowOf = (label: string) => counts.groups.flatMap((g: any) => g.rows).find((r: any) => r.label === label);
    expect(rowOf("All projects").all).toBe(1);
    expect(rowOf("Made a project").all).toBe(1);
    expect(rowOf("Works shared from a portfolio").all).toBe(1);
  });
});

// ——————————————————————————————————————————————————————————————
// What a draft refuses
// ——————————————————————————————————————————————————————————————

describe("a draft refuses what needs a posted project", () => {
  const draftRefusal = { code: "draft" };
  const untouched = (ctx: any) => {
    expect(ctx.store.projectSupport ?? []).toEqual([]);
    expect(ctx.store.projectMembers ?? []).toEqual([]);
    expect(ctx.store.storyUpdates ?? []).toEqual([]);
    expect(ctx.store.notifications ?? []).toEqual([]);
  };

  it("cheers, offers and pledges", async () => {
    for (const input of [
      { type: "encouragement", message: "Go!", visible: true },
      { type: "resource", resourceDescription: "A ladder", visible: true },
      { type: "financial_one_time", amountCents: 2000, visible: true },
    ]) {
      const ctx = makeCtx(world(), MEMBER);
      expect(await thrown(run(supportProject, ctx, { projectId: DRAFT, ...input }))).toMatchObject(draftRefusal);
      untouched(ctx);
    }
  });

  it("a backing checkout (startBacking reads it as not taking support)", async () => {
    const ctx = makeCtx(world(), MEMBER);
    const out = await run(startBacking, ctx, { projectId: DRAFT, userId: MEMBER, amountCents: 2500, recurring: false, visible: true });
    expect(out).toBeNull();
    untouched(ctx);
  });

  it("a cheer works once it's posted", async () => {
    const ctx = makeCtx(world({}, { status: "active" }), MEMBER);
    await run(supportProject, ctx, { projectId: DRAFT, type: "encouragement", message: "Go!", visible: true });
    expect(ctx.store.projectSupport).toHaveLength(1);
  });

  it("asking to join, even for the lead's own open role", async () => {
    const projectRoles = [{ _id: "projectRoles:r1", projectId: DRAFT, title: "Painter", status: "open", createdAt: 1 }];
    const ctx = makeCtx(world({ projectRoles }), MEMBER);
    expect(await thrown(run(requestToJoin, ctx, { projectId: DRAFT, role: "Painter" }))).toMatchObject(draftRefusal);
    expect(await thrown(run(requestToJoin, ctx, { projectId: DRAFT, role: "Painter", roleId: "projectRoles:r1" }))).toMatchObject(draftRefusal);
    untouched(ctx);
  });

  it("an invite from its own lead", async () => {
    const ctx = makeCtx(world(), LEAD);
    expect(await thrown(run(inviteMember, ctx, { projectId: DRAFT, userId: MEMBER, role: "Painter" }))).toMatchObject(draftRefusal);
    untouched(ctx);
  });

  it("an update from its own lead", async () => {
    const ctx = makeCtx(world(), LEAD);
    expect(await thrown(run(postStoryUpdate, ctx, { projectId: DRAFT, body: "Day one." }))).toMatchObject(draftRefusal);
    untouched(ctx);
  });

  it("any status change, for its lead or an admin, and setting draft on a posted project", async () => {
    for (const viewer of [LEAD, ADMIN]) {
      for (const status of ["active", "completed", "archived", "draft"]) {
        const ctx = makeCtx(world(), viewer);
        expect(await thrown(run(updateProjectStatus, ctx, { projectId: DRAFT, status }))).toMatchObject(draftRefusal);
        expect(stored(ctx).status).toBe("draft");
      }
    }
    const posted = makeCtx(world({}, { status: "active" }), LEAD);
    expect(await thrown(run(updateProjectStatus, posted, { projectId: DRAFT, status: "draft" }))).toMatchObject({ code: "invalid_status" });
    expect(stored(posted).status).toBe("active");
    await run(updateProjectStatus, posted, { projectId: DRAFT, status: "completed" });
    expect(stored(posted).status).toBe("completed");
  });

  it("the lead can still edit a draft, and it stays a draft", async () => {
    const ctx = makeCtx(world(), LEAD);
    await run(updateProject, ctx, { projectId: DRAFT, title: "Harbor Mural, bigger" });
    expect(stored(ctx)).toMatchObject({ title: "Harbor Mural, bigger", status: "draft", updatedAt: NOW });
  });
});
