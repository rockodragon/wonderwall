// One-off operator audit and backfill for upload claims (convex/uploads.ts).
//
// Claims started with #119. Files attached before then have none, and a row
// that already holds an id passes claimUpload without a claim. That leaves
// two things from before:
//   - files nobody has claimed. Once they're past UPLOAD_CLAIM_WINDOW_MS,
//     their owner can't attach them to anything new;
//   - rows that picked up someone else's file through the old hole. Their
//     owner can still replace or remove it, which deletes the file for the
//     other person too.
//
// This walks every place a stored-file id is held (STORED_FILE_FIELDS),
// works out who owns each holding row, and:
//   - claims each unclaimed file whose holders all have one owner;
//   - reports each file held by rows of different owners (a conflict) and
//     changes nothing about it; the operator decides;
//   - reports files it can't pin on one person (a row with no owner on
//     record, or an organization logo with several admins), and ids whose
//     file is gone.
//
// Sharing the app does on purpose is not a conflict. A Table's dates wear
// the Table's photo, a date migrated from a class wears the class's photo,
// and runTableAgain gives the new Table the old one's photo. Those rows
// count as the owner of the row they got the picture from.
//
// Dry run unless `apply: true`. Rerunning is safe: claimed files are
// skipped. Operator-only: run it from the dashboard or the CLI, see
// docs/runbooks/upload-claims-backfill.md.
//   npx convex run uploadClaimsBackfill:backfillUploadClaims '{}' --prod
//   npx convex run uploadClaimsBackfill:backfillUploadClaims '{"apply":true}' --prod

import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id, TableNames } from "./_generated/dataModel";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import { fail } from "./errors";
import { collectStorageIds, type RichDoc } from "./garden/richText";
import { positionsOfOrg } from "./organizations";
import { recordUploadClaim, uploadClaimOf } from "./uploads";

/** Who controls a row that holds a file. Usually one person; an
 * organization's logo can be any of its admins. Empty: nobody on record.
 * `via` says where the picture came from when the row wears another row's. */
export type RowOwner = { users: Id<"users">[]; via?: string };

type Shape = "one" | "many" | "richDoc";

type FieldSpec<T extends TableNames = TableNames> = {
  table: T;
  field: keyof Doc<T> & string;
  /** one id, an array of ids, or a rich-text body's pictures */
  shape: Shape;
  owner: (ctx: QueryCtx, row: Doc<T>, storageId: string) => Promise<RowOwner>;
};

const spec = <T extends TableNames>(s: FieldSpec<T>) => s as unknown as FieldSpec;

const person = (userId: Id<"users"> | null | undefined): RowOwner => ({ users: userId ? [userId] : [] });

async function profileOwner(ctx: QueryCtx, profileId: Id<"profiles">): Promise<RowOwner> {
  return person((await ctx.db.get(profileId))?.userId);
}

/** Who set an organization's logo isn't stored; any of its admins could
 * have (organizations.ts setLogo; platform admins too, but they aren't
 * counted). One admin is the owner; several leave it unresolved. */
async function orgAdmins(ctx: QueryCtx, organizationId: Id<"organizations">): Promise<RowOwner> {
  const admins = (await positionsOfOrg(ctx, organizationId)).filter((p) => p.isAdmin).map((p) => p.userId);
  return { users: [...new Set(admins)], via: "any of the organization's admins" };
}

/** A Table's host. A Table made by runTableAgain wears the photo of the
 * Table it was copied from, so the photo is that Table's (back to the first
 * one with it). */
async function tableOwner(ctx: QueryCtx, table: Doc<"gardenTables">): Promise<RowOwner> {
  let source = table;
  for (let hops = 0; source.previousTableId && hops < 100; hops++) {
    const previous = await ctx.db.get(source.previousTableId);
    if (!previous || previous.photoStorageId !== source.photoStorageId) break;
    source = previous;
  }
  const owner = person(source.hostUserId);
  return source._id === table._id ? owner : { ...owner, via: `run again from Table ${source._id}` };
}

/** An event's cover is its organizer's, unless the date wears its Table's
 * photo (garden/tables.ts insertTableOccurrence) or the photo of the class it
 * was migrated from (garden/tablesMigration.ts): then it's theirs. */
async function eventCoverOwner(ctx: QueryCtx, event: Doc<"events">, storageId: string): Promise<RowOwner> {
  if (event.tableId) {
    const table = await ctx.db.get(event.tableId);
    if (table && table.photoStorageId === storageId) {
      const owner = await tableOwner(ctx, table);
      const via = `its Table's photo (${table._id})`;
      return { users: owner.users, via: owner.via ? `${via}, ${owner.via}` : via };
    }
  }
  if (event.sourceOfferingId) {
    const offering = await ctx.db.get(event.sourceOfferingId);
    if (offering && offering.photoStorageId === storageId) {
      return { users: [offering.userId], via: `the photo of the class it came from (${offering._id})` };
    }
  }
  return person(event.organizerId);
}

/**
 * Every schema field that holds a stored-file id, and who owns the row. The
 * test beside this file fails when schema.ts gains a v.id("_storage") or
 * rich-text field that isn't listed here or in NOT_HOLDERS.
 */
export const STORED_FILE_FIELDS: readonly FieldSpec[] = [
  spec({ table: "profiles", field: "imageStorageId", shape: "one", owner: async (_ctx, p) => person(p.userId) }),
  spec({ table: "organizations", field: "logoStorageId", shape: "one", owner: (ctx, org) => orgAdmins(ctx, org._id) }),
  spec({ table: "artifacts", field: "mediaStorageId", shape: "one", owner: (ctx, a) => profileOwner(ctx, a.profileId) }),
  spec({ table: "artifacts", field: "coverStorageId", shape: "one", owner: (ctx, a) => profileOwner(ctx, a.profileId) }),
  spec({ table: "wonderings", field: "imageStorageId", shape: "one", owner: (ctx, w) => profileOwner(ctx, w.profileId) }),
  spec({ table: "events", field: "coverImageStorageId", shape: "one", owner: eventCoverOwner }),
  spec({ table: "events", field: "mediaPreviewStorageId", shape: "one", owner: async (_ctx, e) => person(e.organizerId) }),
  spec({ table: "events", field: "imageStorageIds", shape: "many", owner: async (_ctx, e) => person(e.organizerId) }),
  spec({ table: "projects", field: "photoStorageId", shape: "one", owner: async (_ctx, p) => person(p.userId) }),
  spec({ table: "projects", field: "mediaPreviewStorageId", shape: "one", owner: async (_ctx, p) => person(p.userId) }),
  spec({ table: "projects", field: "body", shape: "richDoc", owner: async (_ctx, p) => person(p.userId) }),
  spec({ table: "offerings", field: "photoStorageId", shape: "one", owner: async (_ctx, o) => person(o.userId) }),
  spec({ table: "gardenTables", field: "photoStorageId", shape: "one", owner: tableOwner }),
  spec({ table: "storyUpdates", field: "bodyDoc", shape: "richDoc", owner: async (_ctx, s) => person(s.authorUserId) }),
  spec({ table: "updates", field: "imageStorageId", shape: "one", owner: async (_ctx, u) => person(u.createdBy) }),
];

/** Schema fields with a stored-file id that don't hold a file for anyone. */
export const NOT_HOLDERS: Record<string, string> = {
  "uploadClaims.storageId": "the claims themselves",
};

const HOLDING_TABLES = [...new Set(STORED_FILE_FIELDS.map((f) => f.table))];

function idsIn(spec: FieldSpec, row: Record<string, unknown>): string[] {
  const value = row[spec.field];
  if (!value) return [];
  if (spec.shape === "one") return [value as string];
  if (spec.shape === "many") return [...new Set(value as string[])];
  return collectStorageIds(value as RichDoc);
}

/** One row holding one file. */
export type Holder = { storageId: string; table: string; id: string; field: string; owners: string[]; via?: string };
type HolderRow = Omit<Holder, "storageId">;

type ScanPage = { rows: number; holders: Holder[]; continueCursor: string; isDone: boolean };

/** One page of one table: every file id its rows hold, with each row's owner. */
export const scanPage = internalQuery({
  args: { table: v.string(), cursor: v.union(v.string(), v.null()), numItems: v.number() },
  handler: async (ctx, args): Promise<ScanPage> => {
    const fields = STORED_FILE_FIELDS.filter((f) => f.table === args.table);
    if (!fields.length) fail("invalid_input", `${args.table} holds no stored files.`);
    const page = await ctx.db
      .query(args.table as TableNames)
      .paginate({ cursor: args.cursor, numItems: args.numItems });
    const holders: Holder[] = [];
    for (const row of page.page) {
      for (const f of fields) {
        for (const storageId of idsIn(f, row as Record<string, unknown>)) {
          const owner = await f.owner(ctx, row as never, storageId);
          holders.push({
            storageId,
            table: f.table,
            id: row._id,
            field: f.field,
            owners: owner.users,
            ...(owner.via ? { via: owner.via } : {}),
          });
        }
      }
    }
    return { rows: page.page.length, holders, continueCursor: page.continueCursor, isDone: page.isDone };
  },
});

/** What we know about a held id: is the file there, when was it uploaded,
 * has anyone claimed it. */
export type FileFacts = { storageId: string; exists: boolean; createdAt: number | null; claimedBy: string | null };

export const inspectFiles = internalQuery({
  args: { storageIds: v.array(v.string()) },
  handler: async (ctx, args): Promise<FileFacts[]> => {
    const out: FileFacts[] = [];
    for (const storageId of args.storageIds) {
      const id = ctx.db.system.normalizeId("_storage", storageId);
      const file = id ? await ctx.db.system.get(id) : null;
      const claim = id ? await uploadClaimOf(ctx, id) : null;
      out.push({ storageId, exists: !!file, createdAt: file?._creationTime ?? null, claimedBy: claim?.userId ?? null });
    }
    return out;
  },
});

/** Claims each file for its owner, unless it was claimed or deleted since
 * the scan. */
export const insertClaims = internalMutation({
  args: { claims: v.array(v.object({ storageId: v.id("_storage"), userId: v.id("users") })) },
  handler: async (ctx, args): Promise<{ inserted: number }> => {
    let inserted = 0;
    for (const { storageId, userId } of args.claims) {
      if (await uploadClaimOf(ctx, storageId)) continue;
      if (!(await ctx.db.system.get(storageId))) continue;
      await recordUploadClaim(ctx, storageId, userId);
      inserted++;
    }
    return { inserted };
  },
});

export type Conflict = { storageId: string; createdAt: number | null; claimedBy: string | null; holders: HolderRow[] };
export type Unresolved = { storageId: string; reason: string; holders: HolderRow[] };
export type Missing = { storageId: string; holders: HolderRow[] };

type Verdict =
  | { kind: "owner"; userId: string }
  | { kind: "conflict" }
  | { kind: "unresolved"; reason: string };

/** The one person every holding row belongs to, if there is one. */
function soleOwner(holders: HolderRow[]): Verdict {
  const known = holders.filter((h) => h.owners.length > 0);
  // The people every row with an owner on record could belong to.
  let common: string[] = known[0]?.owners ?? [];
  for (const h of known.slice(1)) common = common.filter((u) => h.owners.includes(u));
  if (known.length > 0 && common.length === 0) return { kind: "conflict" };
  if (known.length < holders.length) return { kind: "unresolved", reason: "a row that holds it has no owner on record" };
  if (common.length === 1) return { kind: "owner", userId: common[0] };
  return { kind: "unresolved", reason: "several people could have attached it (an organization's admins)" };
}

/** Sorts every held file into: claim it for X, a conflict, unresolved, or
 * gone. Conflicts are reported whether or not the file is claimed;
 * unresolved files only when nobody has claimed them. */
export function classifyHeldFiles(held: Map<string, Holder[]>, facts: Map<string, FileFacts>) {
  const toClaim: { storageId: Id<"_storage">; userId: Id<"users"> }[] = [];
  const conflicts: Conflict[] = [];
  const unresolved: Unresolved[] = [];
  const missing: Missing[] = [];
  let alreadyClaimed = 0;
  for (const [storageId, rows] of held) {
    const holders = rows.map(({ storageId: _id, ...row }) => row);
    const fact = facts.get(storageId);
    if (!fact?.exists) {
      missing.push({ storageId, holders });
      continue;
    }
    if (fact.claimedBy) alreadyClaimed++;
    const verdict = soleOwner(holders);
    if (verdict.kind === "conflict") {
      conflicts.push({ storageId, createdAt: fact.createdAt, claimedBy: fact.claimedBy, holders });
    } else if (fact.claimedBy) {
      continue;
    } else if (verdict.kind === "unresolved") {
      unresolved.push({ storageId, reason: verdict.reason, holders });
    } else {
      toClaim.push({ storageId: storageId as Id<"_storage">, userId: verdict.userId as Id<"users"> });
    }
  }
  return { toClaim, conflicts, unresolved, missing, alreadyClaimed };
}

/** How many entries each list in the report shows; the counts are whole. */
export const REPORT_LIMIT = 200;
const PAGE_SIZE = 100;
const INSPECT_BATCH = 200;
const CLAIM_BATCH = 100;

export type BackfillReport = {
  apply: boolean;
  ranAt: number;
  rowsScanned: Record<string, number>;
  counts: {
    filesHeld: number;
    alreadyClaimed: number;
    /** unclaimed, one owner: what `apply` claims */
    claimable: number;
    /** claims written by this run (0 on a dry run) */
    claimed: number;
    conflicts: number;
    unresolved: number;
    missing: number;
  };
  conflicts: Conflict[];
  unresolved: Unresolved[];
  missing: Missing[];
  /** true when a list holds only its first REPORT_LIMIT entries */
  truncated: boolean;
};

const chunks = <T>(items: T[], size: number): T[][] =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, (i + 1) * size));

/**
 * The audit, and with `apply: true` the backfill. Reads each table a page at
 * a time and writes claims in small batches, so it stays inside Convex's
 * per-function read and write limits however big the tables get.
 */
export const backfillUploadClaims = internalAction({
  args: { apply: v.optional(v.boolean()), pageSize: v.optional(v.number()) },
  handler: async (ctx, args): Promise<BackfillReport> => {
    const apply = args.apply === true;
    const numItems = Math.min(500, Math.max(1, Math.floor(args.pageSize ?? PAGE_SIZE)));
    const ranAt = Date.now();

    const held = new Map<string, Holder[]>();
    const rowsScanned: Record<string, number> = {};
    for (const table of HOLDING_TABLES) {
      rowsScanned[table] = 0;
      let cursor: string | null = null;
      for (;;) {
        const page: ScanPage = await ctx.runQuery(internal.uploadClaimsBackfill.scanPage, { table, cursor, numItems });
        rowsScanned[table] += page.rows;
        for (const holder of page.holders) {
          const rows = held.get(holder.storageId) ?? [];
          rows.push(holder);
          held.set(holder.storageId, rows);
        }
        if (page.isDone) break;
        cursor = page.continueCursor;
      }
    }

    const facts = new Map<string, FileFacts>();
    for (const batch of chunks([...held.keys()], INSPECT_BATCH)) {
      const found: FileFacts[] = await ctx.runQuery(internal.uploadClaimsBackfill.inspectFiles, { storageIds: batch });
      for (const f of found) facts.set(f.storageId, f);
    }

    const sorted = classifyHeldFiles(held, facts);
    let claimed = 0;
    if (apply) {
      for (const batch of chunks(sorted.toClaim, CLAIM_BATCH)) {
        const result: { inserted: number } = await ctx.runMutation(internal.uploadClaimsBackfill.insertClaims, {
          claims: batch,
        });
        claimed += result.inserted;
      }
    }

    return {
      apply,
      ranAt,
      rowsScanned,
      counts: {
        filesHeld: held.size,
        alreadyClaimed: sorted.alreadyClaimed,
        claimable: sorted.toClaim.length,
        claimed,
        conflicts: sorted.conflicts.length,
        unresolved: sorted.unresolved.length,
        missing: sorted.missing.length,
      },
      conflicts: sorted.conflicts.slice(0, REPORT_LIMIT),
      unresolved: sorted.unresolved.slice(0, REPORT_LIMIT),
      missing: sorted.missing.slice(0, REPORT_LIMIT),
      truncated: [sorted.conflicts, sorted.unresolved, sorted.missing].some((list) => list.length > REPORT_LIMIT),
    };
  },
});
