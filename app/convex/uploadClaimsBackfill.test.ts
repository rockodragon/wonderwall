// The one-off upload-claims audit and backfill (convex/uploadClaimsBackfill.ts),
// run on the in-memory ctx in test-support/. The action's runQuery and
// runMutation call this module's own functions on that ctx.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getFunctionName } from "convex/server";
import { describe, expect, it } from "vitest";
import { makeCtx, run, type Row } from "../test-support/convexContext";
import { checkIndexes } from "../test-support/indexChecks";
import * as backfill from "./uploadClaimsBackfill";
import { idsIn, NOT_HOLDERS, STORED_FILE_FIELDS, type BackfillReport } from "./uploadClaimsBackfill";
import { UPLOAD_CLAIM_WINDOW_MS } from "./uploads";

const NOW = Date.now();
const BEFORE_CLAIMS = NOW - UPLOAD_CLAIM_WINDOW_MS - 60 * 60 * 1000;

const ME = "users:me";
const VICTIM = "users:victim";
const HOST = "users:host";
const COHOST = "users:cohost";
const TEACHER = "users:teacher";
const ADMIN2 = "users:admin2";

const AVATAR = "_storage:avatar"; // my avatar, also on my piece and my event's gallery
const CLAIMED = "_storage:claimed"; // claimed by me already, on my wondering
const STOLEN = "_storage:stolen"; // the victim's piece, also on my project: the old hole
const THEIR_CLASS = "_storage:theirClass"; // the victim's class photo, also my event's cover (no link between them)
const TABLE_PHOTO = "_storage:table"; // a Table's photo, on its dates and on a co-host's run-again Table
const CLASS_PHOTO = "_storage:class"; // a class's photo, on the date migrated from it
const ORG_ONE = "_storage:orgOne"; // the logo of an organization I alone run
const ORG_MANY = "_storage:orgMany"; // the logo of an organization with two admins
const RICH = "_storage:rich"; // a picture in my project's body and in my story update
const UPDATE_IMG = "_storage:update"; // an Update's picture
const GONE = "_storage:gone"; // a row still points at it; the file was deleted

const file = (id: string): Row => ({ _id: id, _creationTime: BEFORE_CLAIMS });
const image = (storageId: string) => [{ type: "image", storageId }];

const world = (): Record<string, Row[]> => ({
  users: [ME, VICTIM, HOST, COHOST, TEACHER, ADMIN2].map((_id) => ({ _id })),
  _storage: [AVATAR, CLAIMED, STOLEN, THEIR_CLASS, TABLE_PHOTO, CLASS_PHOTO, ORG_ONE, ORG_MANY, RICH, UPDATE_IMG].map(file),
  uploadClaims: [{ _id: "uploadClaims:1", storageId: CLAIMED, userId: ME, claimedAt: NOW }],
  profiles: [
    { _id: "profiles:me", userId: ME, name: "Max", imageStorageId: AVATAR },
    { _id: "profiles:victim", userId: VICTIM, name: "Vee" },
    { _id: "profiles:admin2", userId: ADMIN2, name: "Ada" },
  ],
  artifacts: [
    { _id: "artifacts:mine", profileId: "profiles:me", type: "image", mediaStorageId: AVATAR, order: 0 },
    { _id: "artifacts:victim", profileId: "profiles:victim", type: "image", mediaStorageId: STOLEN, order: 0 },
  ],
  wonderings: [
    { _id: "wonderings:mine", profileId: "profiles:me", prompt: "Who paints?", imageStorageId: CLAIMED },
    { _id: "wonderings:victim", profileId: "profiles:victim", prompt: "Who sings?", imageStorageId: GONE },
  ],
  projects: [{ _id: "projects:mine", userId: ME, title: "A mural", photoStorageId: STOLEN, body: image(RICH) }],
  storyUpdates: [{ _id: "storyUpdates:mine", projectId: "projects:mine", authorUserId: ME, body: "Week one", bodyDoc: image(RICH) }],
  offerings: [
    { _id: "offerings:class", userId: TEACHER, title: "Drawing", photoStorageId: CLASS_PHOTO },
    { _id: "offerings:victim", userId: VICTIM, title: "Singing", photoStorageId: THEIR_CLASS },
  ],
  gardenTables: [
    { _id: "gardenTables:t", name: "Supper", hostUserId: HOST, photoStorageId: TABLE_PHOTO },
    // A co-host ran it again: their Table, the first Table's photo.
    { _id: "gardenTables:again", name: "Supper", hostUserId: COHOST, previousTableId: "gardenTables:t", photoStorageId: TABLE_PHOTO },
  ],
  events: [
    { _id: "events:mine", organizerId: ME, title: "Show", coverImageStorageId: THEIR_CLASS, imageStorageIds: [AVATAR] },
    { _id: "events:d1", organizerId: HOST, coHostIds: [COHOST], tableId: "gardenTables:t", coverImageStorageId: TABLE_PHOTO },
    { _id: "events:d2", organizerId: HOST, coHostIds: [COHOST], tableId: "gardenTables:t", coverImageStorageId: TABLE_PHOTO },
    { _id: "events:again", organizerId: COHOST, tableId: "gardenTables:again", coverImageStorageId: TABLE_PHOTO },
    // Migrated from the class; someone else organizes it now.
    { _id: "events:moved", organizerId: HOST, sourceOfferingId: "offerings:class", coverImageStorageId: CLASS_PHOTO },
  ],
  organizations: [
    { _id: "organizations:one", name: "Studio", logoStorageId: ORG_ONE },
    { _id: "organizations:many", name: "Collective", logoStorageId: ORG_MANY },
  ],
  orgPositions: [
    { _id: "orgPositions:1", organizationId: "organizations:one", userId: ME, profileId: "profiles:me", isAdmin: true },
    { _id: "orgPositions:2", organizationId: "organizations:many", userId: ME, profileId: "profiles:me", isAdmin: true },
    { _id: "orgPositions:3", organizationId: "organizations:many", userId: ADMIN2, profileId: "profiles:admin2", isAdmin: true },
    // Not an admin: doesn't count.
    { _id: "orgPositions:4", organizationId: "organizations:one", userId: VICTIM, profileId: "profiles:victim", isAdmin: false },
  ],
  updates: [{ _id: "updates:1", title: "Hello", body: "News", imageStorageId: UPDATE_IMG, createdBy: ME }],
});

/** The in-memory db, with index names checked against the schema, and an
 * action ctx whose runQuery / runMutation call this module on it. */
function setup(tables = world()) {
  const db = makeCtx(tables, null);
  const { scans } = checkIndexes(db);
  const call = (ref: unknown, args: Record<string, unknown>) => {
    const [module, name] = getFunctionName(ref as never).split(":");
    expect(module).toBe("uploadClaimsBackfill");
    return run((backfill as Record<string, unknown>)[name], db, args);
  };
  const action = { runQuery: call, runMutation: call };
  const backfillRun = (args: { apply?: boolean; pageSize?: number } = {}): Promise<BackfillReport> =>
    run(backfill.backfillUploadClaims, action, args);
  return { db, scans, backfillRun };
}

const claimsOf = (db: any, id: string) => db.store.uploadClaims.filter((c: Row) => c.storageId === id).map((c: Row) => c.userId);
const without = (report: BackfillReport) => ({ ...report, ranAt: 0 });

// Who apply claims each file for.
const CLAIMS = {
  [AVATAR]: ME,
  [TABLE_PHOTO]: HOST,
  [CLASS_PHOTO]: TEACHER,
  [ORG_ONE]: ME,
  [RICH]: ME,
  [UPDATE_IMG]: ME,
};

describe("dry run", () => {
  it("changes nothing and says what apply would do", async () => {
    const { db, backfillRun } = setup();
    const before = JSON.stringify(db.store);
    const report = await backfillRun();
    expect(JSON.stringify(db.store)).toBe(before);
    expect(report.apply).toBe(false);
    expect(report.counts).toEqual({
      filesHeld: 11,
      alreadyClaimed: 1,
      claimable: Object.keys(CLAIMS).length,
      claimed: 0,
      conflicts: 2,
      unresolved: 1,
      missing: 1,
    });
  });

  it("reads every table that holds a file, a page at a time", async () => {
    const { scans, backfillRun } = setup();
    const report = await backfillRun();
    expect(report.rowsScanned).toEqual({
      profiles: 3,
      organizations: 2,
      artifacts: 2,
      wonderings: 2,
      events: 5,
      projects: 1,
      offerings: 2,
      gardenTables: 2,
      storyUpdates: 1,
      updates: 1,
    });
    // Only the paged tables are read whole; owners are looked up by index.
    expect(new Set(scans)).toEqual(new Set(Object.keys(report.rowsScanned)));
    const small = await setup().backfillRun({ pageSize: 1 });
    expect(without(small)).toEqual(without(report));
  });
});

describe("apply", () => {
  it("claims each unclaimed file whose rows all have one owner", async () => {
    const { db, backfillRun } = setup();
    const report = await backfillRun({ apply: true });
    expect(report.counts.claimed).toBe(Object.keys(CLAIMS).length);
    for (const [storageId, userId] of Object.entries(CLAIMS)) expect(claimsOf(db, storageId), storageId).toEqual([userId]);
  });

  it("leaves a claimed file alone", async () => {
    const { db, backfillRun } = setup();
    await backfillRun({ apply: true });
    expect(db.store.uploadClaims.filter((c: Row) => c.storageId === CLAIMED)).toEqual([world().uploadClaims[0]]);
  });

  it("never claims a file rows of different owners hold, and reports each one", async () => {
    const { db, backfillRun } = setup();
    const report = await backfillRun({ apply: true });
    expect(claimsOf(db, STOLEN)).toEqual([]);
    expect(claimsOf(db, THEIR_CLASS)).toEqual([]);
    expect(report.conflicts).toEqual([
      {
        storageId: STOLEN,
        createdAt: BEFORE_CLAIMS,
        claimedBy: null,
        holders: [
          { table: "artifacts", id: "artifacts:victim", field: "mediaStorageId", owners: [VICTIM] },
          { table: "projects", id: "projects:mine", field: "photoStorageId", owners: [ME] },
        ],
      },
      {
        // A cover that is some class's photo, on an event not migrated from it.
        storageId: THEIR_CLASS,
        createdAt: BEFORE_CLAIMS,
        claimedBy: null,
        holders: [
          { table: "events", id: "events:mine", field: "coverImageStorageId", owners: [ME] },
          { table: "offerings", id: "offerings:victim", field: "photoStorageId", owners: [VICTIM] },
        ],
      },
    ]);
  });

  it("reports a conflict on a file that is already claimed, with who claimed it", async () => {
    const t = world();
    t.uploadClaims.push({ _id: "uploadClaims:2", storageId: STOLEN, userId: VICTIM, claimedAt: NOW });
    const { db, backfillRun } = setup(t);
    const report = await backfillRun({ apply: true });
    expect(report.conflicts.find((c) => c.storageId === STOLEN)?.claimedBy).toBe(VICTIM);
    expect(claimsOf(db, STOLEN)).toEqual([VICTIM]);
  });

  it("treats a Table's photo on its dates and on a run-again Table, and a class's photo on its migrated date, as the same owner's", async () => {
    const { backfillRun } = setup();
    const report = await backfillRun();
    const flagged = [...report.conflicts, ...report.unresolved].map((c) => c.storageId);
    expect(flagged).not.toContain(TABLE_PHOTO);
    expect(flagged).not.toContain(CLASS_PHOTO);
    // ...even though the run-again Table is the co-host's and the migrated
    // date has another organizer.
    const applied = await setup().backfillRun({ apply: true });
    expect(applied.counts.claimed).toBe(Object.keys(CLAIMS).length);
  });

  it("claims an organization's logo for its only admin, and leaves one with several admins unresolved", async () => {
    const { db, backfillRun } = setup();
    const report = await backfillRun({ apply: true });
    expect(claimsOf(db, ORG_ONE)).toEqual([ME]);
    expect(claimsOf(db, ORG_MANY)).toEqual([]);
    expect(report.unresolved).toEqual([
      {
        storageId: ORG_MANY,
        reason: "several people could have attached it (an organization's admins)",
        holders: [
          {
            table: "organizations",
            id: "organizations:many",
            field: "logoStorageId",
            owners: [ME, ADMIN2],
            via: "any of the organization's admins",
          },
        ],
      },
    ]);
  });

  it("claims a logo that is also one admin's avatar for that admin", async () => {
    const t = world();
    t.profiles[2].imageStorageId = ORG_MANY;
    const { db, backfillRun } = setup(t);
    await backfillRun({ apply: true });
    expect(claimsOf(db, ORG_MANY)).toEqual([ADMIN2]);
  });

  it("reports a row whose file is gone, and claims nothing for it", async () => {
    const { db, backfillRun } = setup();
    const report = await backfillRun({ apply: true });
    expect(report.missing).toEqual([
      { storageId: GONE, holders: [{ table: "wonderings", id: "wonderings:victim", field: "imageStorageId", owners: [VICTIM] }] },
    ]);
    expect(claimsOf(db, GONE)).toEqual([]);
  });

  it("leaves a file unresolved when a row that holds it has no owner on record", async () => {
    const t = world();
    t.gardenTables[0].hostUserId = undefined;
    const { db, backfillRun } = setup(t);
    const report = await backfillRun({ apply: true });
    expect(report.unresolved.map((u) => [u.storageId, u.reason])).toContainEqual([
      TABLE_PHOTO,
      "a row that holds it has no owner on record",
    ]);
    expect(claimsOf(db, TABLE_PHOTO)).toEqual([]);
  });

  it("running it twice is a no-op", async () => {
    const { db, backfillRun } = setup();
    await backfillRun({ apply: true });
    const after = JSON.stringify(db.store);
    const again = await backfillRun({ apply: true });
    expect(JSON.stringify(db.store)).toBe(after);
    expect(again.counts).toMatchObject({ claimable: 0, claimed: 0, alreadyClaimed: 1 + Object.keys(CLAIMS).length });
  });

  it("skips a file claimed or deleted between the scan and the write", async () => {
    const { db } = setup();
    const result = await run(backfill.insertClaims, db, {
      claims: [
        { storageId: CLAIMED, userId: VICTIM },
        { storageId: GONE, userId: VICTIM },
        { storageId: AVATAR, userId: ME },
      ],
    });
    expect(result).toEqual({ inserted: 1 });
    expect(claimsOf(db, CLAIMED)).toEqual([ME]);
    expect(claimsOf(db, GONE)).toEqual([]);
    expect(claimsOf(db, AVATAR)).toEqual([ME]);
  });
});

// ——————————————————————————————————————————————————————————————
// Every stored-file field in the schema is on the list
// ——————————————————————————————————————————————————————————————

/** A field's validator, comments and spaces gone, as its shape: one id, an
 * array of ids, ids somewhere inside an object (or a union...), a rich-text
 * body, or null when it holds no stored-file id. */
function shapeOf(validator: string): string | null {
  const s = validator.replace(/\/\/.*$/gm, "").replace(/\s+/g, "");
  if (s.includes("richDocValidator")) return "richDoc";
  if (!s.includes('v.id("_storage")')) return null;
  const peel = (x: string) => x.replace(/^(?:v\.optional\()+/, "");
  const top = peel(s);
  if (top.startsWith('v.id("_storage")')) return "one";
  if (top.startsWith("v.array(") && peel(top.slice("v.array(".length)).startsWith('v.id("_storage")')) return "many";
  return "nested";
}

/** `table.field` → its shape, for each field in a schema.ts text that holds
 * a stored-file id or a rich-text body. A field's text runs over every line
 * up to the next field or the table's end. */
function storedFileFieldsIn(text: string): Map<string, string> {
  const found = new Map<string, string>();
  let table: string | null = null;
  let field: { name: string; text: string } | null = null;
  const flush = () => {
    const shape = field && shapeOf(field.text);
    if (table && field && shape) found.set(`${table}.${field.name}`, shape);
    field = null;
  };
  for (const line of text.split("\n")) {
    const t = /^ {2}(\w+): defineTable\(/.exec(line);
    const f = /^ {4}(\w+):(.*)$/.exec(line);
    if (t || /^ {0,2}\S/.test(line)) {
      flush();
      if (t) table = t[1];
    } else if (f) {
      flush();
      field = { name: f[1], text: f[2] };
    } else if (field) {
      field.text += `\n${line}`;
    }
  }
  flush();
  return found;
}

describe("idsIn", () => {
  const isId = (s: string) => s.startsWith("_storage:");

  it("reads a field by what its value is, not what it's declared as", () => {
    expect(idsIn("_storage:a", isId)).toEqual(["_storage:a"]);
    // An array of optional ids: the gaps are skipped.
    expect(idsIn(["_storage:a", undefined, null, "_storage:b", "_storage:a"], isId)).toEqual(["_storage:a", "_storage:b"]);
    // An object: only the strings that are file ids, at any depth.
    expect(idsIn({ caption: "Opening night", stillId: "_storage:c", crop: { x: 1 }, more: [{ fileId: "_storage:d" }] }, isId)).toEqual([
      "_storage:c",
      "_storage:d",
    ]);
    expect(idsIn(undefined, isId)).toEqual([]);
    // A bad id where an id belongs is kept, so it's reported as missing.
    expect(idsIn("not-a-file", isId)).toEqual(["not-a-file"]);
  });
});

describe("STORED_FILE_FIELDS", () => {
  it("reads each field's whole validator from the schema text", () => {
    const sample = [
      "export default defineSchema({",
      "  things: defineTable({",
      "    name: v.string(),",
      '    photo: v.optional(v.id("_storage")), // a picture',
      "    gallery: v.optional(",
      '      v.array(v.optional(v.id("_storage"))),',
      "    ),",
      "    media: v.optional(",
      "      v.object({",
      "        caption: v.string(),",
      '        stillId: v.id("_storage"),',
      "      }),",
      "    ),",
      "    body: v.optional(richDocValidator),",
      '    // the next one is not a file: v.id("_storage") in a comment',
      "    note: v.optional(v.string()),",
      '  }).index("by_name", ["name"]),',
      "  others: defineTable({",
      '    fileId: v.id("_storage"),',
      "  }),",
      "});",
    ].join("\n");
    expect(Object.fromEntries(storedFileFieldsIn(sample))).toEqual({
      "things.photo": "one",
      "things.gallery": "many",
      "things.media": "nested",
      "things.body": "richDoc",
      "others.fileId": "one",
    });
  });

  it("covers every stored-file field in the schema", () => {
    const schema = storedFileFieldsIn(readFileSync(join(__dirname, "schema.ts"), "utf8"));
    expect(schema.size, "the schema parse found nothing; fix storedFileFieldsInSchema").toBeGreaterThan(10);
    const listed = new Map(STORED_FILE_FIELDS.map((f) => [`${f.table}.${f.field}`, f.shape as string]));
    const missing = [...schema.keys()].filter((k) => !listed.has(k) && !(k in NOT_HOLDERS));
    expect(
      missing,
      `schema.ts holds stored-file ids here, and convex/uploadClaimsBackfill.ts STORED_FILE_FIELDS doesn't list them (or NOT_HOLDERS, with why):\n  ${missing.join("\n  ")}`,
    ).toEqual([]);
    const stale = [...listed.keys(), ...Object.keys(NOT_HOLDERS)].filter((k) => !schema.has(k));
    expect(stale, "No longer a stored-file field in schema.ts: take it off the list.").toEqual([]);
    const wrongShape = [...listed].filter(([k, shape]) => schema.get(k) !== shape);
    expect(wrongShape, "The shape (one / many / nested / richDoc) doesn't match schema.ts.").toEqual([]);
  });
});
