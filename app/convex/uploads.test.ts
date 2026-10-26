// Stored-file ownership (convex/uploads.ts). Storage ids are public, and
// before this any host could delete any file through removeEventGalleryImage,
// and anyone could attach someone else's file to a row of their own and then
// replace or remove it, which deleted the file. Run on the in-memory ctx in
// test-support/.

import { ConvexError } from "convex/values";
import { describe, expect, it } from "vitest";
import { makeCtx, run, type Row } from "../test-support/convexContext";
import * as artifacts from "./artifacts";
import * as files from "./files";
import * as projects from "./garden/projects";
import * as stories from "./garden/stories";
import * as tables from "./garden/tables";
import * as offerings from "./offerings";
import * as organizations from "./organizations";
import * as updates from "./updates";
import { UPLOAD_CLAIM_WINDOW_MS } from "./uploads";
import * as wonderings from "./wonderings";

const ME = "users:me";
const VICTIM = "users:victim";
const NOW = Date.now();

const AVATAR = "_storage:avatar"; // the victim's avatar: uploaded today, claimed by them
const OLD = "_storage:old"; // the victim's piece from before claims existed: unclaimed, past the window
const MINE = "_storage:mine"; // what I just uploaded, not attached yet
const MINE2 = "_storage:mine2";
const KEPT = "_storage:kept"; // already on my rows from before claims existed: unclaimed, past the window
const GONE = "_storage:gone"; // no such file

const fresh = (id: string): Row => ({ _id: id, _creationTime: NOW });
const stale = (id: string): Row => ({ _id: id, _creationTime: NOW - UPLOAD_CLAIM_WINDOW_MS - 60_000 });

const world = (): Record<string, Row[]> => ({
  users: [{ _id: ME }, { _id: VICTIM }],
  profiles: [
    { _id: "profiles:me", userId: ME, name: "Max", interests: [], plan: "free", imageStorageId: KEPT },
    { _id: "profiles:victim", userId: VICTIM, name: "Vee", interests: [], plan: "free", imageStorageId: AVATAR },
  ],
  _storage: [fresh(AVATAR), stale(OLD), fresh(MINE), fresh(MINE2), stale(KEPT)],
  uploadClaims: [{ _id: "uploadClaims:1", storageId: AVATAR, userId: VICTIM, claimedAt: NOW }],
  artifacts: [
    { _id: "artifacts:victim", profileId: "profiles:victim", type: "image", mediaStorageId: OLD, order: 0 },
    { _id: "artifacts:mine", profileId: "profiles:me", type: "image", mediaStorageId: KEPT, order: 0 },
  ],
  events: [
    { _id: "events:mine", organizerId: ME, title: "Show", coverImageStorageId: KEPT, imageStorageIds: [KEPT] },
  ],
  projects: [{ _id: "projects:mine", userId: ME, title: "A mural", body: [{ type: "image", storageId: KEPT }] }],
  storyUpdates: [
    {
      _id: "storyUpdates:mine",
      projectId: "projects:mine",
      authorUserId: ME,
      body: "Week one",
      bodyDoc: [{ type: "image", storageId: KEPT }],
    },
  ],
  wonderings: [{ _id: "wonderings:mine", profileId: "profiles:me", prompt: "Who paints?", isActive: false, imageStorageId: KEPT }],
  offerings: [
    { _id: "offerings:mine", userId: ME, title: "Drawing", format: "class", status: "active", photoStorageId: KEPT },
  ],
  organizations: [{ _id: "organizations:mine", name: "Studio", slug: "studio", logoStorageId: KEPT }],
  orgPositions: [{ _id: "orgPositions:1", organizationId: "organizations:mine", profileId: "profiles:me", isAdmin: true }],
});

/** The ConvexError payload the call was refused with. */
async function refused(p: Promise<unknown>): Promise<{ code: string; reason: string }> {
  try {
    await p;
  } catch (err) {
    expect(err, "expected a ConvexError the page can read").toBeInstanceOf(ConvexError);
    return (err as ConvexError<{ code: string; reason: string }>).data;
  }
  throw new Error("expected the call to be refused");
}

const BELONGS = { code: "forbidden", reason: "That file belongs to someone else." };
const fileExists = (ctx: any, id: string) => ctx.store._storage.some((f: Row) => f._id === id);
const claimsOf = (ctx: any, id: string) => (ctx.store.uploadClaims ?? []).filter((c: Row) => c.storageId === id);
const row = (ctx: any, table: string, id: string) => ctx.store[table].find((r: Row) => r._id === id);

// ——————————————————————————————————————————————————————————————
// removeEventGalleryImage
// ——————————————————————————————————————————————————————————————

describe("removeEventGalleryImage", () => {
  it("refuses an id that isn't in the event's gallery and deletes nothing", async () => {
    const ctx = makeCtx(world(), ME);
    expect(await refused(run(files.removeEventGalleryImage, ctx, { eventId: "events:mine", storageId: AVATAR }))).toEqual({
      code: "not_found",
      reason: "That picture isn't in this event's gallery.",
    });
    expect(ctx.deletedFiles).toEqual([]);
    expect(fileExists(ctx, AVATAR)).toBe(true);
    expect(row(ctx, "events", "events:mine").imageStorageIds).toEqual([KEPT]);
  });

  it("deletes a picture that is in the gallery", async () => {
    const ctx = makeCtx(world(), ME);
    await run(files.removeEventGalleryImage, ctx, { eventId: "events:mine", storageId: KEPT });
    expect(ctx.deletedFiles).toEqual([KEPT]);
    expect(row(ctx, "events", "events:mine").imageStorageIds).toBeUndefined();
  });
});

// ——————————————————————————————————————————————————————————————
// claimUpload, through saveProfileImage
// ——————————————————————————————————————————————————————————————

describe("attaching a stored file", () => {
  it("refuses another person's claimed file", async () => {
    const ctx = makeCtx(world(), ME);
    expect(await refused(run(files.saveProfileImage, ctx, { storageId: AVATAR }))).toEqual(BELONGS);
    expect(row(ctx, "profiles", "profiles:me").imageStorageId).toBe(KEPT);
    expect(claimsOf(ctx, AVATAR).map((c: Row) => c.userId)).toEqual([VICTIM]);
  });

  it("refuses an unclaimed file older than the window", async () => {
    const ctx = makeCtx(world(), ME);
    expect(await refused(run(files.saveProfileImage, ctx, { storageId: OLD }))).toEqual({
      code: "invalid_upload",
      reason: "That upload is too old to use. Pick the file again.",
    });
    expect(claimsOf(ctx, OLD)).toEqual([]);
    expect(row(ctx, "profiles", "profiles:me").imageStorageId).toBe(KEPT);
  });

  it("refuses a file that isn't there", async () => {
    const ctx = makeCtx(world(), ME);
    expect(await refused(run(files.saveProfileImage, ctx, { storageId: GONE }))).toMatchObject({ code: "not_found" });
  });

  it("claims a fresh unclaimed file for the person attaching it", async () => {
    const ctx = makeCtx(world(), ME);
    await run(files.saveProfileImage, ctx, { storageId: MINE });
    expect(row(ctx, "profiles", "profiles:me").imageStorageId).toBe(MINE);
    expect(claimsOf(ctx, MINE)).toMatchObject([{ storageId: MINE, userId: ME }]);
    // The old picture was this profile's, so it goes.
    expect(ctx.deletedFiles).toEqual([KEPT]);
  });

  it("lets the same person attach their own file again, without a second claim", async () => {
    const ctx = makeCtx(world(), ME);
    await run(files.saveProfileImage, ctx, { storageId: MINE });
    await run(files.saveWonderingImage, ctx, { wonderingId: "wonderings:mine", storageId: MINE });
    expect(row(ctx, "wonderings", "wonderings:mine").imageStorageId).toBe(MINE);
    // Saving the same picture again keeps it.
    await run(files.saveProfileImage, ctx, { storageId: MINE });
    expect(row(ctx, "profiles", "profiles:me").imageStorageId).toBe(MINE);
    expect(fileExists(ctx, MINE)).toBe(true);
    expect(claimsOf(ctx, MINE)).toHaveLength(1);
  });

  it("refuses a file someone else claimed first, even while it's fresh", async () => {
    const ctx = makeCtx(world(), ME);
    await run(files.saveProfileImage, ctx, { storageId: MINE });
    const theirs = makeCtx({ ...ctx.store }, VICTIM);
    expect(await refused(run(files.saveProfileImage, theirs, { storageId: MINE }))).toEqual(BELONGS);
    expect(row(theirs, "profiles", "profiles:victim").imageStorageId).toBe(AVATAR);
  });
});

// ——————————————————————————————————————————————————————————————
// The attack: attach someone else's file, then replace it
// ——————————————————————————————————————————————————————————————

describe("attach-then-replace no longer deletes someone else's file", () => {
  const attacks: [string, unknown, Record<string, unknown>][] = [
    ["saveProfileImage", files.saveProfileImage, {}],
    ["saveEventCoverImage", files.saveEventCoverImage, { eventId: "events:mine" }],
    ["saveProjectImage", files.saveProjectImage, { projectId: "projects:mine" }],
  ];

  it.each(attacks)("%s", async (_name, fn, base) => {
    for (const victimFile of [AVATAR, OLD]) {
      const ctx = makeCtx(world(), ME);
      // Step 1: attach the victim's file. Refused.
      await refused(run(fn, ctx, { ...base, storageId: victimFile }));
      // Step 2: replace it with a file of my own. Only my row's old file goes.
      await run(fn, ctx, { ...base, storageId: MINE });
      expect(ctx.deletedFiles).not.toContain(victimFile);
      expect(fileExists(ctx, victimFile)).toBe(true);
    }
  });

  it("artifacts.update: a piece can't take someone else's file", async () => {
    const ctx = makeCtx(world(), ME);
    await refused(run(artifacts.update, ctx, { artifactId: "artifacts:mine", mediaStorageId: OLD }));
    await run(artifacts.update, ctx, { artifactId: "artifacts:mine", mediaStorageId: MINE });
    expect(ctx.deletedFiles).toEqual([KEPT]);
    expect(fileExists(ctx, OLD)).toBe(true);
  });

  it("artifacts.update: sending the piece's own file back keeps it", async () => {
    const ctx = makeCtx(world(), ME);
    await run(artifacts.update, ctx, { artifactId: "artifacts:mine", mediaStorageId: KEPT });
    expect(ctx.deletedFiles).toEqual([]);
    expect(row(ctx, "artifacts", "artifacts:mine").mediaStorageId).toBe(KEPT);
  });
});

// ——————————————————————————————————————————————————————————————
// Every public mutation that attaches a file
// ——————————————————————————————————————————————————————————————

const image = (storageId: string) => [{ type: "image", storageId }];
const asAdmin = (t: Record<string, Row[]>): Record<string, Row[]> => ({
  ...t,
  profiles: t.profiles.map((p) => (p.userId === ME ? { ...p, isAdmin: true } : p)),
});
const UPDATE = { title: "Hello", body: "News", audience: "everyone", startsAt: NOW, order: 1 };

type Attach = [string, unknown, (id: string) => Record<string, unknown>, ((t: Record<string, Row[]>) => Record<string, Row[]>)?];

const ATTACHES: Attach[] = [
  ["files.saveProfileImage", files.saveProfileImage, (id) => ({ storageId: id })],
  ["files.saveWonderingImage", files.saveWonderingImage, (id) => ({ wonderingId: "wonderings:mine", storageId: id })],
  ["files.saveProjectImage", files.saveProjectImage, (id) => ({ projectId: "projects:mine", storageId: id })],
  ["files.saveEventCoverImage", files.saveEventCoverImage, (id) => ({ eventId: "events:mine", storageId: id })],
  ["files.addEventGalleryImage", files.addEventGalleryImage, (id) => ({ eventId: "events:mine", storageId: id })],
  ["artifacts.create (the work)", artifacts.create, (id) => ({ type: "image", mediaStorageId: id })],
  ["artifacts.create (a cover)", artifacts.create, (id) => ({ type: "video", mediaUrl: "https://vimeo.com/1", coverStorageId: id })],
  ["artifacts.update", artifacts.update, (id) => ({ artifactId: "artifacts:mine", mediaStorageId: id })],
  ["wonderings.create", wonderings.create, (id) => ({ prompt: "Who sings?", imageStorageId: id })],
  ["wonderings.update", wonderings.update, (id) => ({ wonderingId: "wonderings:mine", prompt: "Who sings?", imageStorageId: id })],
  ["offerings.createOffering", offerings.createOffering, (id) => ({ title: "Drawing", format: "class", photoStorageId: id })],
  [
    "offerings.updateOffering",
    offerings.updateOffering,
    (id) => ({ offeringId: "offerings:mine", title: "Drawing", format: "class", photoStorageId: id }),
  ],
  ["organizations.setLogo", organizations.setLogo, (id) => ({ organizationId: "organizations:mine", storageId: id })],
  ["updates.save (new)", updates.save, (id) => ({ ...UPDATE, imageStorageId: id }), asAdmin],
  [
    "garden.tables.createTable",
    tables.createTable,
    (id) => ({
      name: "Supper",
      description: "A long table.",
      scheduleType: "one_time",
      membershipRequired: false,
      access: "open",
      allowsExternalGuests: false,
      pricingType: "free",
      events: [{ title: "Supper", datetime: NOW + 7 * 24 * 60 * 60 * 1000 }],
      photoStorageId: id,
    }),
  ],
  ["garden.projects.updateProject (body)", projects.updateProject, (id) => ({ projectId: "projects:mine", body: image(id) })],
  ["garden.stories.postStoryUpdate", stories.postStoryUpdate, (id) => ({ projectId: "projects:mine", bodyDoc: image(id) })],
  ["garden.stories.editStoryUpdate", stories.editStoryUpdate, (id) => ({ storyUpdateId: "storyUpdates:mine", bodyDoc: image(id) })],
];

describe("every mutation that attaches a stored file checks who uploaded it", () => {
  it.each(ATTACHES)("%s refuses someone else's file", async (_name, fn, args, tweak) => {
    const tablesNow = (tweak ?? ((t) => t))(world());
    const ctx = makeCtx(tablesNow, ME);
    expect(await refused(run(fn, ctx, args(AVATAR)))).toEqual(BELONGS);
    const before = makeCtx(tablesNow, ME).store;
    // Nothing was written: the call is one transaction and it threw.
    for (const table of ["profiles", "events", "artifacts", "wonderings", "offerings", "organizations", "projects", "storyUpdates"]) {
      expect(JSON.stringify(ctx.store[table])).toBe(JSON.stringify(before[table]));
    }
    expect(ctx.deletedFiles).toEqual([]);
  });

  it.each(ATTACHES)("%s refuses an old unclaimed file", async (_name, fn, args, tweak) => {
    const ctx = makeCtx((tweak ?? ((t) => t))(world()), ME);
    expect(await refused(run(fn, ctx, args(OLD)))).toMatchObject({ code: "invalid_upload" });
    expect(ctx.deletedFiles).toEqual([]);
  });

  it.each(ATTACHES)("%s takes a file I just uploaded, and claims it", async (_name, fn, args, tweak) => {
    const ctx = makeCtx((tweak ?? ((t) => t))(world()), ME);
    await run(fn, ctx, args(MINE));
    expect(claimsOf(ctx, MINE)).toMatchObject([{ userId: ME }]);
    expect(ctx.deletedFiles).not.toContain(MINE);
  });
});

// ——————————————————————————————————————————————————————————————
// Edit forms send the row's own file back
// ——————————————————————————————————————————————————————————————

describe("an edit that sends back a file the row already holds", () => {
  it("offerings.updateOffering keeps an old photo without claiming it", async () => {
    const ctx = makeCtx(world(), ME);
    await run(offerings.updateOffering, ctx, { offeringId: "offerings:mine", title: "Drawing 2", format: "class", photoStorageId: KEPT });
    expect(row(ctx, "offerings", "offerings:mine")).toMatchObject({ title: "Drawing 2", photoStorageId: KEPT });
    expect(ctx.deletedFiles).toEqual([]);
    expect(claimsOf(ctx, KEPT)).toEqual([]);
  });

  it("organizations.setLogo and wonderings.update keep theirs too", async () => {
    const ctx = makeCtx(world(), ME);
    await run(organizations.setLogo, ctx, { organizationId: "organizations:mine", storageId: KEPT });
    await run(wonderings.update, ctx, { wonderingId: "wonderings:mine", prompt: "Who dances?", imageStorageId: KEPT });
    expect(row(ctx, "organizations", "organizations:mine").logoStorageId).toBe(KEPT);
    expect(row(ctx, "wonderings", "wonderings:mine").imageStorageId).toBe(KEPT);
    expect(ctx.deletedFiles).toEqual([]);
  });

  it("updates.save keeps the Update's own picture on an edit", async () => {
    const t = asAdmin(world());
    t.updates = [{ _id: "updates:1", ...UPDATE, imageStorageId: KEPT, status: "draft", createdBy: VICTIM, createdAt: NOW, updatedAt: NOW }];
    const ctx = makeCtx(t, ME);
    await run(updates.save, ctx, { ...UPDATE, updateId: "updates:1", title: "Renamed", imageStorageId: KEPT });
    expect(row(ctx, "updates", "updates:1")).toMatchObject({ title: "Renamed", imageStorageId: KEPT });
    expect(ctx.deletedFiles).toEqual([]);
  });

  it("a project body re-saved with its old pictures, plus one new upload, claims only the new one", async () => {
    const ctx = makeCtx(world(), ME);
    await run(projects.updateProject, ctx, { projectId: "projects:mine", body: [...image(KEPT), ...image(MINE)] });
    expect(row(ctx, "projects", "projects:mine").body).toEqual([...image(KEPT), ...image(MINE)]);
    expect(claimsOf(ctx, KEPT)).toEqual([]);
    expect(claimsOf(ctx, MINE)).toMatchObject([{ userId: ME }]);
    expect(ctx.deletedFiles).toEqual([]);
  });

  it("a project body can't pick up someone else's picture next to its own", async () => {
    const ctx = makeCtx(world(), ME);
    expect(
      await refused(run(projects.updateProject, ctx, { projectId: "projects:mine", body: [...image(KEPT), ...image(OLD)] })),
    ).toMatchObject({ code: "invalid_upload" });
    expect(row(ctx, "projects", "projects:mine").body).toEqual(image(KEPT));
  });

  it("a story update edited with its old picture keeps it; a body id that isn't a file is refused", async () => {
    const ctx = makeCtx(world(), ME);
    await run(stories.editStoryUpdate, ctx, { storyUpdateId: "storyUpdates:mine", bodyDoc: [...image(KEPT), { type: "text", text: "More" }] });
    expect(ctx.deletedFiles).toEqual([]);
    expect(
      await refused(run(stories.editStoryUpdate, ctx, { storyUpdateId: "storyUpdates:mine", bodyDoc: image("kg2-not-a-storage-id") })),
    ).toMatchObject({ code: "not_found" });
  });
});
