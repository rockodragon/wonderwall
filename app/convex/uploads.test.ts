// Stored-file ownership (convex/uploads.ts). Storage ids are public, and
// before this any host could delete any file through removeEventGalleryImage,
// and anyone could attach someone else's file to a row of their own and then
// replace or remove it, which deleted the file. Run on the in-memory ctx in
// test-support/.

import { ConvexError } from "convex/values";
import { describe, expect, it } from "vitest";
import { makeCtx, run, type Row } from "../test-support/convexContext";
import { checkIndexes } from "../test-support/indexChecks";
import * as artifacts from "./artifacts";
import * as files from "./files";
import * as linkPreview from "./linkPreview";
import * as projects from "./garden/projects";
import * as stories from "./garden/stories";
import * as tables from "./garden/tables";
import * as moderation from "./moderation";
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

// ——————————————————————————————————————————————————————————————
// A Table's dates share its photo (deleteEventCover)
// ——————————————————————————————————————————————————————————————

describe("an event cover something else still shows is kept", () => {
  const HOST = "users:host";
  const TABLE_PHOTO = "_storage:table";
  const CLASS_PHOTO = "_storage:class";
  const SHARED = "_storage:shared";
  // I co-host the Table's dates; the host made the Table.
  const tableWorld = (): Record<string, Row[]> => {
    const t = world();
    t.users.push({ _id: HOST });
    t.profiles.push({ _id: "profiles:admin", userId: HOST, name: "Hana", isAdmin: true });
    t._storage.push(fresh(TABLE_PHOTO), fresh(CLASS_PHOTO), fresh(SHARED));
    t.gardenTables = [{ _id: "gardenTables:t", name: "Supper", hostUserId: HOST, photoStorageId: TABLE_PHOTO }];
    const date = (id: string, cover: string): Row => ({
      _id: id,
      organizerId: HOST,
      coHostIds: [ME],
      title: "Supper",
      tableId: "gardenTables:t",
      coverImageStorageId: cover,
    });
    t.events.push(
      date("events:d1", TABLE_PHOTO),
      date("events:d2", TABLE_PHOTO),
      // Two dates whose cover isn't the Table's photo but is shared between them.
      date("events:d3", SHARED),
      date("events:d4", SHARED),
      // A date that got its own cover.
      date("events:d5", MINE2),
      // A date carried over from a class: it wears the class photo.
      { _id: "events:moved", organizerId: ME, title: "Drawing", sourceOfferingId: "offerings:class", coverImageStorageId: CLASS_PHOTO },
    );
    t.offerings.push({ _id: "offerings:class", userId: ME, title: "Drawing", format: "class", status: "active", photoStorageId: CLASS_PHOTO });
    return t;
  };

  it("a co-host replacing one date's cover leaves the Table's photo", async () => {
    const ctx = makeCtx(tableWorld(), ME);
    await run(files.saveEventCoverImage, ctx, { eventId: "events:d1", storageId: MINE });
    expect(row(ctx, "events", "events:d1").coverImageStorageId).toBe(MINE);
    expect(row(ctx, "events", "events:d2").coverImageStorageId).toBe(TABLE_PHOTO);
    expect(ctx.deletedFiles).toEqual([]);
    expect(fileExists(ctx, TABLE_PHOTO)).toBe(true);
  });

  it("a co-host removing one date's cover leaves the Table's photo", async () => {
    const ctx = makeCtx(tableWorld(), ME);
    await run(files.deleteEventCoverImage, ctx, { eventId: "events:d1" });
    expect(row(ctx, "events", "events:d1").coverImageStorageId).toBeUndefined();
    expect(ctx.deletedFiles).toEqual([]);
  });

  it("a cover another date of the Table still wears is kept", async () => {
    const ctx = makeCtx(tableWorld(), ME);
    await run(files.saveEventCoverImage, ctx, { eventId: "events:d3", storageId: MINE });
    expect(ctx.deletedFiles).toEqual([]);
    expect(row(ctx, "events", "events:d4").coverImageStorageId).toBe(SHARED);
  });

  it("a date moved over from a class keeps the class's photo", async () => {
    const ctx = makeCtx(tableWorld(), ME);
    await run(files.deleteEventCoverImage, ctx, { eventId: "events:moved" });
    expect(ctx.deletedFiles).toEqual([]);
    expect(row(ctx, "offerings", "offerings:class").photoStorageId).toBe(CLASS_PHOTO);
  });

  it("a date's own cover, and a normal event's, are still deleted when replaced or removed", async () => {
    const ctx = makeCtx(tableWorld(), ME);
    await run(files.saveEventCoverImage, ctx, { eventId: "events:d5", storageId: MINE });
    expect(ctx.deletedFiles).toEqual([MINE2]);
    await run(files.deleteEventCoverImage, ctx, { eventId: "events:mine" });
    expect(ctx.deletedFiles).toEqual([MINE2, KEPT]);
    expect(row(ctx, "events", "events:mine").coverImageStorageId).toBeUndefined();
  });

  it("an admin deleting one date leaves the Table's photo", async () => {
    const ctx = makeCtx(tableWorld(), HOST);
    await run(moderation.deleteEvent, ctx, { eventId: "events:d1" });
    expect(row(ctx, "events", "events:d1")).toBeUndefined();
    expect(ctx.deletedFiles).toEqual([]);
    expect(fileExists(ctx, TABLE_PHOTO)).toBe(true);
  });
});

// ——————————————————————————————————————————————————————————————
// A class shares its photo with what was migrated from it (deleteClassPhoto)
// ——————————————————————————————————————————————————————————————

describe("a class photo the date or Table migrated from it still shows is kept", () => {
  const CLASS_PHOTO = "_storage:class";
  // Convex's address for a stored file, as storage.getUrl gives it.
  const urlOf = (id: string) => `https://test-123.convex.cloud/api/storage/${id.split(":")[1]}`;
  // The class was migrated (garden/tablesMigration.ts): the Table keeps the
  // photo's address, the date wears the photo as its cover.
  const classWorld = (
    { date = true, tablePhotoUrl = urlOf(CLASS_PHOTO) }: { date?: boolean; tablePhotoUrl?: string } = {},
  ): Record<string, Row[]> => {
    const t = world();
    t._storage.push(fresh(CLASS_PHOTO));
    t.uploadClaims.push({ _id: "uploadClaims:class", storageId: CLASS_PHOTO, userId: ME, claimedAt: NOW });
    t.offerings.push({ _id: "offerings:class", userId: ME, title: "Drawing", format: "class", status: "active", photoStorageId: CLASS_PHOTO });
    t.gardenTables = [
      { _id: "gardenTables:moved", name: "Drawing", hostUserId: ME, sourceOfferingId: "offerings:class", photoUrl: tablePhotoUrl },
    ];
    if (date) {
      t.events.push({
        _id: "events:moved",
        organizerId: ME,
        title: "Drawing",
        tableId: "gardenTables:moved",
        sourceOfferingId: "offerings:class",
        coverImageStorageId: CLASS_PHOTO,
      });
    }
    return t;
  };
  const setup = (t: Record<string, Row[]>) => {
    const ctx = makeCtx(t, ME);
    checkIndexes(ctx);
    ctx.storage.getUrl = async (id: string) => (fileExists(ctx, id) ? urlOf(id) : null);
    return ctx;
  };
  const edit = (photoStorageId?: string) => ({ offeringId: "offerings:class", title: "Drawing", format: "class", photoStorageId });
  const replace = (ctx: unknown) => run(offerings.updateOffering, ctx, edit(MINE));
  const remove = (ctx: unknown) => run(offerings.updateOffering, ctx, edit());
  const deleteClass = (ctx: unknown) => run(offerings.deleteOffering, ctx, { offeringId: "offerings:class" });
  const changes: [string, (ctx: unknown) => Promise<unknown>][] = [
    ["replacing the photo", replace],
    ["removing the photo", remove],
    ["deleting the class", deleteClass],
  ];

  it.each(changes)("%s keeps it while the migrated date wears it", async (_name, change) => {
    const ctx = setup(classWorld({ tablePhotoUrl: "https://example.com/elsewhere.jpg" }));
    await change(ctx);
    expect(ctx.deletedFiles).toEqual([]);
    expect(fileExists(ctx, CLASS_PHOTO)).toBe(true);
    expect(row(ctx, "events", "events:moved").coverImageStorageId).toBe(CLASS_PHOTO);
  });

  it.each(changes)("%s keeps it while the migrated Table shows its address", async (_name, change) => {
    for (const address of [urlOf(CLASS_PHOTO), "https://thecreative.exchange/media/class"]) {
      const ctx = setup(classWorld({ date: false, tablePhotoUrl: address }));
      await change(ctx);
      expect(ctx.deletedFiles, address).toEqual([]);
    }
  });

  it.each(changes)("%s deletes it when nothing else shows it", async (_name, change) => {
    const ctx = setup(classWorld({ date: false, tablePhotoUrl: "https://example.com/elsewhere.jpg" }));
    await change(ctx);
    expect(ctx.deletedFiles).toEqual([CLASS_PHOTO]);
  });

  // A class that picked up someone else's file before claims existed.
  const claimedBy = (userId: string | null) => {
    const t = classWorld({ date: false, tablePhotoUrl: "https://example.com/elsewhere.jpg" });
    t.uploadClaims = t.uploadClaims.filter((c) => c.storageId !== CLASS_PHOTO);
    if (userId) t.uploadClaims.push({ _id: "uploadClaims:class", storageId: CLASS_PHOTO, userId, claimedAt: NOW });
    return t;
  };

  it.each(changes)("%s keeps a photo another member claimed", async (_name, change) => {
    const ctx = setup(claimedBy(VICTIM));
    await change(ctx);
    expect(ctx.deletedFiles).toEqual([]);
    expect(fileExists(ctx, CLASS_PHOTO)).toBe(true);
  });

  it.each(changes)("%s deletes an unclaimed photo nothing else shows", async (_name, change) => {
    const ctx = setup(claimedBy(null));
    await change(ctx);
    expect(ctx.deletedFiles).toEqual([CLASS_PHOTO]);
  });

  it("a class never migrated still loses its old photo, as before", async () => {
    const t = classWorld({ date: false });
    t.gardenTables = [];
    const ctx = setup(t);
    await replace(ctx);
    expect(ctx.deletedFiles).toEqual([CLASS_PHOTO]);
    expect(row(ctx, "offerings", "offerings:class").photoStorageId).toBe(MINE);
  });

  it("sending the same photo back deletes nothing", async () => {
    const ctx = setup(classWorld({ date: false, tablePhotoUrl: "https://example.com/elsewhere.jpg" }));
    await run(offerings.updateOffering, ctx, edit(CLASS_PHOTO));
    expect(ctx.deletedFiles).toEqual([]);
  });

  it("the migrated date's cover, once the class has a new photo, is kept while the Table shows it", async () => {
    const ctx = setup(classWorld());
    await replace(ctx);
    await run(files.saveEventCoverImage, ctx, { eventId: "events:moved", storageId: MINE2 });
    expect(ctx.deletedFiles).toEqual([]);
    expect(fileExists(ctx, CLASS_PHOTO)).toBe(true);
  });

  it("the migrated date's cover goes once nothing else shows it", async () => {
    const ctx = setup(classWorld({ tablePhotoUrl: "https://example.com/elsewhere.jpg" }));
    await replace(ctx);
    expect(ctx.deletedFiles).toEqual([]);
    await run(files.deleteEventCoverImage, ctx, { eventId: "events:moved" });
    expect(ctx.deletedFiles).toEqual([CLASS_PHOTO]);
  });
});

// ——————————————————————————————————————————————————————————————
// A still the server stores for a pasted link is claimed (linkPreview.apply)
// ——————————————————————————————————————————————————————————————

describe("a link preview's still is claimed for the row's owner", () => {
  const STILL = "_storage:still";
  const REEL = "https://www.instagram.com/p/abc/";
  const previewWorld = (): Record<string, Row[]> => {
    const t = world();
    t._storage.push(fresh(STILL));
    for (const table of ["events", "projects", "artifacts"]) t[table] = t[table].map((r) => ({ ...r, mediaUrl: REEL }));
    t.artifacts.push({ _id: "artifacts:victimReel", profileId: "profiles:victim", type: "video", mediaUrl: REEL, order: 1 });
    return t;
  };
  const rows: [string, string, string, string][] = [
    ["an event's", "event", "events:mine", ME],
    ["a project's", "project", "projects:mine", ME],
    ["a piece's cover", "artifact", "artifacts:mine", ME],
    ["another person's piece cover", "artifact", "artifacts:victimReel", VICTIM],
  ];

  it.each(rows)("%s still", async (_name, target, id, owner) => {
    const ctx = makeCtx(previewWorld(), ME);
    await run(linkPreview.apply, ctx, {
      target,
      id,
      sourceUrl: REEL,
      canonicalUrl: REEL,
      imageUrl: "https://test-123.convex.cloud/api/storage/still",
      imageStorageId: STILL,
    });
    expect(claimsOf(ctx, STILL).map((c: Row) => c.userId)).toEqual([owner]);
    // Someone else who reads the id can't take it, so can't delete it.
    const other = makeCtx({ ...ctx.store }, owner === ME ? VICTIM : ME);
    expect(await refused(run(files.saveProfileImage, other, { storageId: STILL }))).toEqual(BELONGS);
    expect(other.deletedFiles).toEqual([]);
  });

  it("a still for a link that changed meanwhile is dropped, not claimed", async () => {
    const ctx = makeCtx(previewWorld(), ME);
    await run(linkPreview.apply, ctx, {
      target: "event",
      id: "events:mine",
      sourceUrl: "https://www.instagram.com/p/old/",
      canonicalUrl: "https://www.instagram.com/p/old/",
      imageUrl: "https://test-123.convex.cloud/api/storage/still",
      imageStorageId: STILL,
    });
    expect(claimsOf(ctx, STILL)).toEqual([]);
    expect(ctx.deletedFiles).toEqual([STILL]);
  });
});

// ——————————————————————————————————————————————————————————————
// A file that's already gone doesn't fail the call (deleteStoredFile)
// ——————————————————————————————————————————————————————————————

describe("replacing or removing a file that's already gone", () => {
  // Rows still pointing at a file that was deleted (the hole this fixes left
  // some behind). A storage that refuses to delete a missing file, as a
  // stricter Convex might.
  const goneWorld = (): Record<string, Row[]> => {
    const t = world();
    t.profiles = t.profiles.map((p) => (p.userId === ME ? { ...p, imageStorageId: GONE } : p));
    t.events = [{ _id: "events:mine", organizerId: ME, title: "Show", coverImageStorageId: GONE, imageStorageIds: [GONE] }];
    t.artifacts = [{ _id: "artifacts:mine", profileId: "profiles:me", type: "image", mediaStorageId: GONE, order: 0 }];
    t.offerings = [{ _id: "offerings:mine", userId: ME, title: "Drawing", format: "class", status: "active", photoStorageId: GONE }];
    t.organizations = [{ _id: "organizations:mine", name: "Studio", slug: "studio", logoStorageId: GONE }];
    return t;
  };
  const strict = (ctx: any) => {
    ctx.storage.delete = async (id: string) => {
      if (!fileExists(ctx, id)) throw new Error(`no file ${id}`);
      ctx.deletedFiles.push(id);
    };
    return ctx;
  };

  const calls: [string, unknown, Record<string, unknown>][] = [
    ["files.saveProfileImage", files.saveProfileImage, { storageId: MINE }],
    ["files.deleteProfileImage", files.deleteProfileImage, {}],
    ["files.saveProfileImageUrl", files.saveProfileImageUrl, { imageUrl: "https://example.com/a.jpg" }],
    ["files.saveEventCoverImage", files.saveEventCoverImage, { eventId: "events:mine", storageId: MINE }],
    ["files.deleteEventCoverImage", files.deleteEventCoverImage, { eventId: "events:mine" }],
    ["files.removeEventGalleryImage", files.removeEventGalleryImage, { eventId: "events:mine", storageId: GONE }],
    ["artifacts.update", artifacts.update, { artifactId: "artifacts:mine", mediaStorageId: MINE }],
    ["artifacts.remove", artifacts.remove, { artifactId: "artifacts:mine" }],
    [
      "offerings.updateOffering",
      offerings.updateOffering,
      { offeringId: "offerings:mine", title: "Drawing", format: "class", photoStorageId: MINE },
    ],
    ["organizations.setLogo", organizations.setLogo, { organizationId: "organizations:mine", storageId: MINE }],
  ];

  it.each(calls)("%s still goes through", async (_name, fn, args) => {
    const ctx = strict(makeCtx(goneWorld(), ME));
    await run(fn, ctx, args); // throws if the missing file fails it
    expect(ctx.deletedFiles).toEqual([]);
  });
});
