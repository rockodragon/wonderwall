// Internal-only tool: merges one or more "source" accounts into a "target"
// account. Built for the situation Part 1 of the Google/password linking
// work can't fully resolve on its own — two users already exist for the
// same person (e.g. they signed up with a password, then years later with
// Google under a *different* verified email that later turned out to be
// the same person, or a support case needs to combine two accounts by
// hand). The internalMutation is never callable from a client: it runs from
// the Convex dashboard or `npx convex run` by an operator. The admin
// duplicates page (admin/duplicates.ts) calls the same handler,
// runMergeUsers, behind its own admin check.
import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { swapDisplayHost, syncCoHosts } from "../eventHosts";
import { getProfileByUserId } from "../helpers";
import { HANDLE_FORWARD_MS } from "../handleRules";
import { hasRealName } from "../names";
import { syncProfileOrgCache } from "../organizations";
import { isCurrent } from "../organizationRules";
import { maskPhone } from "../phone";

/** A field that points at an account: one id, a list of ids (`array`), or
 * an event's "shown as host" list (`hostRefs`, events.displayHosts).
 * `index` is the table's index that starts with the field (after `where`'s
 * fixed fields), so a merge reads only the rows that point at an account. A
 * table with a field that has none is read whole, once per merge
 * (MergeReads), and then all its fields are read from that copy: an index
 * would save nothing there. mergeUsers.test.ts checks every index named
 * here, and pins the tables read whole, so a new one gets noticed. */
export type RefField = {
  table: string;
  field: string;
  array?: boolean;
  hostRefs?: boolean;
  index?: string;
  where?: Record<string, string>;
  /** Read more than once in a merge: the first answer is kept (MergeReads). */
  remember?: boolean;
};

// Every table with a `v.id("users")` field whose rows count as "real
// content" on an account (i.e. NOT just the account's own empty profile or
// its auth plumbing). Regenerate by grepping `v.id("users")` in
// convex/schema.ts — kept as an explicit, reviewable list rather than
// introspecting the schema's validator tree at runtime; mergeUsers.test.ts
// fails when the schema has one this list doesn't name. eventCoHosts isn't
// here: it mirrors events.coHostIds, and repoint re-syncs it from that.
export const USER_ID_FIELDS: RefField[] = [
  { table: "wonderingResponses", field: "responderId", index: "by_responderId" },
  { table: "events", field: "organizerId" },
  { table: "events", field: "coHostIds", array: true },
  { table: "eventApplications", field: "applicantId", index: "by_applicantId" },
  { table: "invites", field: "inviterId", index: "by_inviterId" },
  { table: "invites", field: "usedBy", index: "by_usedBy" },
  { table: "profileViews", field: "viewerId", index: "by_viewerId" },
  { table: "profileLikes", field: "userId", index: "by_userId" },
  { table: "artifactLikes", field: "userId", index: "by_userId" },
  { table: "favorites", field: "userId", index: "by_userId" },
  { table: "waitlist", field: "approvedBy" },
  { table: "showcaseApplications", field: "decidedBy" },
  { table: "showcaseVotes", field: "userId", index: "by_userId" },
  { table: "jobs", field: "posterId", index: "by_posterId" },
  { table: "jobInterests", field: "userId" },
  { table: "conversations", field: "participants", array: true },
  { table: "messages", field: "senderId", index: "by_senderId" },
  { table: "blocks", field: "blockerId", index: "by_blockerId" },
  { table: "blocks", field: "blockedId", index: "by_blockedId" },
  // Also read for the notices that open a conversation (noticesOpening).
  { table: "notifications", field: "userId", index: "by_userId", remember: true },
  { table: "notifications", field: "relatedUserId", index: "by_relatedUserId" },
  { table: "reports", field: "reporterId" },
  { table: "reports", field: "reportedUserId" },
  { table: "reports", field: "reviewedBy" },
  { table: "crawlerRuns", field: "triggeredBy" },
  { table: "hostOrgs", field: "ownerUserId", index: "by_ownerUserId" },
  { table: "communityMembers", field: "userId", index: "by_userId" },
  { table: "billingCustomers", field: "userId", index: "by_userId" },
  { table: "memberships", field: "userId", index: "by_userId" },
  { table: "coverageRedemptions", field: "userId", index: "by_userId" },
  { table: "projects", field: "userId", index: "by_userId" },
  { table: "projectMembers", field: "userId", index: "by_userId_status" },
  { table: "projectMembers", field: "invitedByUserId", index: "by_invitedByUserId" },
  { table: "projectSupport", field: "supporterUserId", index: "by_supporterUserId" },
  { table: "offerings", field: "userId" },
  { table: "offerings", field: "pausedBy" },
  { table: "offeringReports", field: "reporterId" },
  { table: "offeringReports", field: "resolvedBy" },
  { table: "offeringSignups", field: "userId", index: "by_userId" },
  { table: "gardenTables", field: "hostUserId" },
  { table: "tableMemberships", field: "userId", index: "by_userId" },
  { table: "sessionRsvps", field: "userId", index: "by_userId" },
  { table: "eventRsvps", field: "userId", index: "by_userId" },
  { table: "ticketPurchases", field: "userId", index: "by_userId" },
  { table: "grantContributions", field: "userId", index: "by_userId" },
  { table: "externalTicketExceptions", field: "resolvedByUserId" },
  { table: "grantProposals", field: "userId" },
  { table: "grantProposals", field: "decidedByUserId" },
  { table: "productPurchases", field: "userId", index: "by_userId" },
  { table: "backingPayments", field: "payeeUserId", index: "by_payeeUserId" },
  { table: "backingPayments", field: "backerUserId", index: "by_backerUserId" },
  { table: "classPayments", field: "payeeUserId", index: "by_payeeUserId" },
  { table: "classPayments", field: "buyerUserId", index: "by_buyerUserId" },
  { table: "creativePayouts", field: "payeeUserId" },
  { table: "creativePayouts", field: "recordedByUserId" },
  { table: "storyUpdates", field: "authorUserId" },
  { table: "announcements", field: "senderUserId" },
  { table: "announcementRecipients", field: "userId", index: "by_userId" },
  { table: "gigSeries", field: "hostUserId" },
  { table: "gigSlots", field: "bookedUserId", index: "by_bookedUserId_startsAt" },
  { table: "gigResponses", field: "userId" },
  { table: "emailPreferences", field: "userId", index: "by_userId" },
  { table: "phoneLinkCodes", field: "userId", index: "by_userId" },
  { table: "phoneLinkStarts", field: "userId", index: "by_userId_startedAt" },
  // Missing until the duplicates page (2026-10-26): a merge left these
  // pointing at the deleted account — its organizations, the Tables it
  // hosts, its gifts, the events that show it as a host, its uploads.
  { table: "events", field: "displayHosts", hostRefs: true },
  { table: "eventWaitlist", field: "userId", index: "by_userId" },
  { table: "organizations", field: "createdByUserId" },
  { table: "orgPositions", field: "userId", index: "by_userId" },
  { table: "gardenTables", field: "coHostIds", array: true },
  { table: "gardenTables", field: "pausedByUserId" },
  { table: "tableMembershipHistory", field: "userId" },
  { table: "tableMembershipHistory", field: "recordedByUserId" },
  { table: "tableCheckoutHolds", field: "userId" },
  { table: "tableCheckoutHolds", field: "payeeUserId" },
  { table: "tableAttendance", field: "userId" },
  { table: "tableAttendance", field: "recordedByUserId" },
  { table: "apGiftSubscriptions", field: "userId" },
  { table: "memberGifts", field: "userId", index: "by_userId" },
  { table: "memberGifts", field: "recipientUserId", index: "by_recipientUserId" },
  { table: "giftPayments", field: "payeeUserId", index: "by_payeeUserId" },
  { table: "giftPayments", field: "giverUserId", index: "by_giverUserId" },
  { table: "updates", field: "createdBy" },
  { table: "updateReads", field: "userId", index: "by_userId_updateId" },
  { table: "engagementLoops", field: "updatedBy" },
  { table: "nudgeLog", field: "userId", index: "by_userId_at" },
  // Who uploaded a file (uploads.ts): the kept account can replace the
  // pictures it now holds.
  { table: "uploadClaims", field: "userId", index: "by_userId" },
  { table: "duplicateDismissals", field: "dismissedByUserId" },
];

// Tables that reference the source's PROFILE id rather than their user id
// directly — resolved via the source's own `profiles` row.
export const PROFILE_ID_FIELDS: RefField[] = [
  { table: "attributes", field: "profileId", index: "by_profileId" },
  { table: "links", field: "profileId", index: "by_profileId" },
  { table: "artifacts", field: "profileId", index: "by_profileId" },
  { table: "wonderings", field: "profileId", index: "by_profileId" },
  { table: "profileViews", field: "profileId", index: "by_profileId" },
  { table: "profileLikes", field: "profileId", index: "by_profileId" },
  { table: "jobs", field: "profileId", index: "by_profileId" },
  { table: "jobInterests", field: "profileId" },
  { table: "gigResponses", field: "profileId" },
  { table: "orgPositions", field: "profileId", index: "by_profileId" },
  { table: "handleForwards", field: "profileId", index: "by_profileId" },
  // A "profile" favorite is a follow, and its targetId is the followed
  // person's profile id (only a profile favorite can hold one): the
  // source's followers.
  { table: "favorites", field: "targetId", index: "by_target", where: { targetType: "profile" } },
];

/** Whether `row` points at `value` through `ref`. */
export function refersTo(row: any, ref: Pick<RefField, "field" | "array" | "hostRefs">, value: unknown): boolean {
  const cell = row[ref.field];
  if (ref.hostRefs) return Array.isArray(cell) && cell.some((h: any) => h?.kind === "user" && h.userId === value);
  if (ref.array) return Array.isArray(cell) && cell.includes(value);
  return cell === value;
}

type Row = Record<string, any> & { _id: string };

/** Whether `row` is one `ref` finds for `value`: its fixed fields, then the
 * field itself. */
function matches(row: Row, ref: RefField, value: string): boolean {
  for (const [key, fixed] of Object.entries(ref.where ?? {})) if (row[key] !== fixed) return false;
  return refersTo(row, ref, value);
}

/** What one merge reads and writes, kept inside Convex's limit on what a
 * mutation may read: a field with an index reads just the rows that point at
 * an account; a table with a field that has none is read whole once per
 * merge. Every write of the merge's own goes through here, so that copy stays
 * in step.
 *
 * In a dry run nothing reaches the database: a write is only planned, and
 * every later read sees it, so a dry run of several copies moves, drops and
 * combines exactly what the merge itself would. */
export class MergeReads {
  private readonly whole = new Map<string, Row[]>();
  /** A dry run's writes: table → id → the row after them, or null for a
   * deleted one. */
  private readonly planned = new Map<string, Map<string, Row | null>>();
  /** Reads asked to be remembered (`remember`), kept in step by the writes. */
  private readonly remembered = new Map<string, { ref: RefField; value: string; rows: Row[] }>();

  constructor(
    private readonly ctx: MutationCtx,
    readonly dryRun = false,
  ) {}

  /** The rows of `ref.table` whose `ref.field` points at `value`. With
   * `remember`, the answer is kept for the rest of the merge. */
  async pointingAt(ref: RefField, value: string, { remember = ref.remember ?? false } = {}): Promise<Row[]> {
    const key = JSON.stringify([ref.table, ref.index ?? null, ref.field, ref.where ?? {}, value]);
    const known = this.remembered.get(key);
    if (known) return [...known.rows];
    let rows: Row[];
    if (ref.index) {
      const found = (await this.ctx.db
        .query(ref.table as any)
        .withIndex(ref.index as any, (q: any) => {
          let range = q;
          for (const [k, fixed] of Object.entries(ref.where ?? {})) range = range.eq(k, fixed);
          return range.eq(ref.field, value);
        })
        .collect()) as Row[];
      rows = this.afterPlan(ref.table, found).filter((row) => matches(row, ref, value));
      // Rows a dry run planned to point here, which the index can't know of.
      for (const row of this.planned.get(ref.table)?.values() ?? []) {
        if (row && matches(row, ref, value) && !rows.some((r) => r._id === row._id)) rows.push(row);
      }
    } else {
      rows = (await this.table(ref.table)).filter((row) => matches(row, ref, value));
    }
    if (remember) this.remembered.set(key, { ref, value, rows: [...rows] });
    return rows;
  }

  /** A whole table, read the first time it's asked for. */
  async table(table: string): Promise<Row[]> {
    let rows = this.whole.get(table);
    if (!rows) {
      rows = this.afterPlan(table, (await this.ctx.db.query(table as any).collect()) as Row[]);
      this.whole.set(table, rows);
    }
    return rows;
  }

  async patch(table: string, row: Row, fields: Record<string, unknown>): Promise<void> {
    const current = this.planned.get(table)?.get(row._id) ?? row;
    const next = { ...current, ...fields } as Row;
    if (this.dryRun) this.plannedFor(table).set(row._id, next);
    else await this.ctx.db.patch(row._id as any, fields as any);
    const kept = this.whole.get(table)?.find((r) => r._id === row._id);
    if (kept) Object.assign(kept, fields);
    for (const m of this.remembered.values()) {
      if (m.ref.table !== table) continue;
      m.rows = m.rows.filter((r) => r._id !== row._id);
      if (matches(next, m.ref, m.value)) m.rows.push(next);
    }
  }

  async delete(table: string, id: string): Promise<void> {
    if (this.dryRun) this.plannedFor(table).set(id, null);
    else await this.ctx.db.delete(id as any);
    const rows = this.whole.get(table);
    if (rows) {
      const at = rows.findIndex((r) => r._id === id);
      if (at >= 0) rows.splice(at, 1);
    }
    for (const m of this.remembered.values()) {
      if (m.ref.table === table) m.rows = m.rows.filter((r) => r._id !== id);
    }
  }

  private plannedFor(table: string): Map<string, Row | null> {
    let p = this.planned.get(table);
    if (!p) this.planned.set(table, (p = new Map()));
    return p;
  }

  /** Rows read from the database, as a dry run's planned writes leave them. */
  private afterPlan(table: string, rows: Row[]): Row[] {
    const p = this.planned.get(table);
    if (!p) return rows;
    return rows.flatMap((r) => {
      if (!p.has(r._id)) return [r];
      const after = p.get(r._id);
      return after ? [after] : [];
    });
  }
}

/** Everything beyond a source account's own (possibly nonexistent) empty
 * profile and its auth plumbing. Returns a `{ "table.field": count }` map
 * of every non-empty reference found — an empty map means the account is
 * safe to merge without `force`. */
async function scanForContent(
  ctx: MutationCtx,
  reads: MergeReads,
  userId: Id<"users">,
): Promise<{ profile: Doc<"profiles"> | null; blockers: Record<string, number> }> {
  const blockers: Record<string, number> = {};

  for (const ref of USER_ID_FIELDS) {
    const count = (await reads.pointingAt(ref, userId)).length;
    if (count > 0) blockers[`${ref.table}.${ref.field}`] = count;
  }

  const profile = await getProfileByUserId(ctx, userId);

  if (profile) {
    for (const ref of PROFILE_ID_FIELDS) {
      const count = (await reads.pointingAt(ref, profile._id)).length;
      if (count > 0) blockers[`${ref.table}.${ref.field}`] = count;
    }
  }

  return { profile, blockers };
}

// For `moveContent`: tables where one person should hold at most one row
// per key. When the target already has a row with the same key, the
// source's copy is dropped instead of moved (two memberships in the same
// community, two likes on the same piece). Keyed by "table.field" — the
// field being re-pointed — so profileLikes can dedupe differently on its
// user side and its profile side.
const DEDUPE_KEYS: Record<string, string[]> = {
  "communityMembers.userId": ["hostOrgId"],
  "favorites.userId": ["targetType", "targetId"],
  "profileLikes.userId": ["profileId"],
  "profileLikes.profileId": ["userId"],
  "artifactLikes.userId": ["artifactId"],
  "showcaseVotes.userId": ["applicationId"],
  "tableMemberships.userId": ["tableId"],
  "emailPreferences.userId": [],
  "projectMembers.userId": ["projectId"],
  "jobInterests.userId": ["jobId"],
  "sessionRsvps.userId": ["sessionId"],
  "eventRsvps.userId": ["eventId"],
  "gigResponses.userId": ["slotId"],
  "offeringSignups.userId": ["offeringId"],
  "announcementRecipients.userId": ["announcementId"],
  // Followed by both copies: one follow of the kept one.
  "favorites.targetId": ["userId", "targetType"],
  // Listed at an organization from both copies: the kept copy's place.
  "orgPositions.userId": ["organizationId"],
  "orgPositions.profileId": ["organizationId"],
  "eventWaitlist.userId": ["eventId"],
  "tableAttendance.userId": ["eventId"],
  "updateReads.userId": ["updateId"],
};

// One Stripe customer per account: two can't be combined by re-pointing,
// so a merge where both sides have one stops and says so.
const ONE_PER_ACCOUNT_BLOCKING = USER_ID_FIELDS.filter((f) => f.table === "billingCustomers");

/** Re-points every row whose `ref.field` is `from` to `to`, dropping rows
 * that would duplicate one the target already has. Returns [moved,
 * dropped]. */
async function repoint(
  ctx: MutationCtx,
  reads: MergeReads,
  ref: RefField,
  from: string,
  to: string,
): Promise<[number, number]> {
  const { table, field, array, hostRefs } = ref;
  const rows = [...(await reads.pointingAt(ref, from))];
  if (rows.length === 0) return [0, 0];
  const dedupe = DEDUPE_KEYS[`${table}.${field}`];
  // The target's own rows, and each one moved in this pass: what a moved
  // row would repeat.
  const theirs = dedupe ? [...(await reads.pointingAt(ref, to))] : [];
  let moved = 0;
  let dropped = 0;
  for (const row of rows) {
    if (hostRefs) {
      const next = swapDisplayHost(row[field], "user", from, to);
      if (!next) continue;
      await reads.patch(table, row, { [field]: next });
      moved++;
      continue;
    }
    if (array) {
      const next = [...new Set((row[field] as string[]).map((x) => (x === from ? to : x)))];
      await reads.patch(table, row, { [field]: next });
      // A co-host list carries its eventCoHosts rows with it (eventHosts.ts).
      if (table === "events" && field === "coHostIds" && !reads.dryRun) {
        await syncCoHosts(ctx, row._id as Id<"events">, next as Id<"users">[]);
      }
      moved++;
      continue;
    }
    if (dedupe && theirs.some((other) => dedupe.every((k) => other[k] === row[k]))) {
      await reads.delete(table, row._id);
      dropped++;
      continue;
    }
    await reads.patch(table, row, { [field]: to });
    theirs.push({ ...row, [field]: to });
    moved++;
  }
  return [moved, dropped];
}

/** What a merge does with the other copy's conversations: one with the kept
 * account, or with another copy in the same merge, is a conversation with
 * yourself, so it goes, its messages with it;
 * one with someone the kept account also talks to is combined into the kept
 * account's, which takes the older start and every message. */
type ConversationPlan = {
  withEachOther: Doc<"conversations">[];
  combine: { keep: Doc<"conversations">; drop: Doc<"conversations"> }[];
};

async function planConversations(
  reads: MergeReads,
  sourceUserId: Id<"users">,
  targetUserId: Id<"users">,
  merging: ReadonlySet<string>,
): Promise<ConversationPlan> {
  // participants is a list, so the table is read whole (once per merge).
  const all = (await reads.table("conversations")) as Doc<"conversations">[];
  const plan: ConversationPlan = { withEachOther: [], combine: [] };
  const used = new Set<string>();
  for (const c of all.filter((x) => x.participants.includes(sourceUserId))) {
    const others = c.participants.filter((p) => !merging.has(p));
    if (others.length === 0) {
      plan.withEachOther.push(c);
      continue;
    }
    const same = (x: Doc<"conversations">) =>
      x._id !== c._id &&
      !used.has(x._id) &&
      x.participants.includes(targetUserId) &&
      !x.participants.includes(sourceUserId) &&
      others.every((o) => x.participants.includes(o)) &&
      x.participants.length === c.participants.length;
    const theirs = all.find(same);
    if (!theirs) continue;
    used.add(theirs._id);
    used.add(c._id);
    plan.combine.push({ keep: theirs, drop: c });
  }
  return plan;
}

const MESSAGES_IN: RefField = { table: "messages", field: "conversationId", index: "by_conversationId" };
const NOTICES_OF = USER_ID_FIELDS.find((f) => f.table === "notifications" && f.field === "userId")!;

/** The notices that open one of `conversationIds` (messaging.ts links them
 * to /messages/<id>), among those of `userIds`. Each person's notices are
 * read once per merge (remembered, and kept in step by its writes). */
async function noticesOpening(reads: MergeReads, userIds: readonly string[], conversationIds: readonly string[]) {
  const links = new Map(conversationIds.map((id) => [`/messages/${id}`, id]));
  const out: { notice: Row; conversationId: string }[] = [];
  for (const userId of new Set(userIds)) {
    for (const notice of await reads.pointingAt(NOTICES_OF, userId)) {
      const conversationId = notice.linkUrl ? links.get(notice.linkUrl) : undefined;
      if (conversationId) out.push({ notice, conversationId });
    }
  }
  return out;
}

async function applyConversationPlan(
  reads: MergeReads,
  plan: ConversationPlan,
  sourceUserId: Id<"users">,
  targetUserId: Id<"users">,
): Promise<void> {
  if (plan.withEachOther.length === 0 && plan.combine.length === 0) return;
  const people = new Set<string>([sourceUserId, targetUserId]);
  for (const { keep, drop } of plan.combine) for (const p of [...keep.participants, ...drop.participants]) people.add(p);
  const keptFor = new Map(plan.combine.map(({ keep, drop }) => [drop._id as string, keep._id as string]));
  const notices = await noticesOpening(reads, [...people], [
    ...plan.withEachOther.map((c) => c._id),
    ...keptFor.keys(),
  ]);

  for (const c of plan.withEachOther) {
    for (const m of await reads.pointingAt(MESSAGES_IN, c._id)) await reads.delete("messages", m._id);
    await reads.delete("conversations", c._id);
  }
  for (const { keep, drop } of plan.combine) {
    for (const m of await reads.pointingAt(MESSAGES_IN, drop._id)) {
      await reads.patch("messages", m, { conversationId: keep._id });
    }
    await reads.patch("conversations", keep, {
      lastMessageAt: Math.max(keep.lastMessageAt, drop.lastMessageAt),
      createdAt: Math.min(keep.createdAt, drop.createdAt),
    });
    await reads.delete("conversations", drop._id);
  }
  for (const { notice, conversationId } of notices) {
    const kept = keptFor.get(conversationId);
    if (kept) await reads.patch("notifications", notice, { linkUrl: `/messages/${kept}` });
    else await reads.delete("notifications", notice._id);
  }
}

// Profile fields never copied between accounts: identity and bookkeeping.
const PROFILE_FIELDS_NOT_COPIED = new Set(["_id", "_creationTime", "userId", "createdAt", "updatedAt"]);

// Fields that only make sense together. A group is filled from the source
// only when the target has none of it, and then as a whole: a photo is an
// upload or a pasted link (the upload wins where both are set, so filling
// just one would replace the target's own photo), a location is its text
// and its map data, a payout account is its id and its status, the
// organization shown with the name is its name and its link, an invite
// link is its slug and its count.
const PROFILE_FILL_GROUPS: readonly (readonly string[])[] = [
  ["imageStorageId", "imageUrl"],
  ["location", "locationType", "address", "coordinates", "placeId"],
  ["stripeConnectAccountId", "stripeConnectPayoutsEnabled", "stripeConnectDetailsSubmitted", "stripeConnectUpdatedAt"],
  ["orgName", "orgUrl"],
  ["inviteSlug", "inviteUsageCount"],
];

const isEmptyValue = (value: unknown) =>
  value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0);

/** The fields the target's profile leaves empty that the source's has, with
 * the source's values: what mergeProfiles writes, and what the duplicates
 * page's preview lists. The target's own values always win, a group of
 * fields (PROFILE_FILL_GROUPS) as one. A name that is still the sign-up
 * placeholder (names.ts) counts as empty. */
export function profileFill(
  sourceProfile: Record<string, unknown>,
  targetProfile: Record<string, unknown>,
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  const grouped = new Set(PROFILE_FILL_GROUPS.flat());
  for (const group of PROFILE_FILL_GROUPS) {
    if (!group.every((key) => isEmptyValue(targetProfile[key]))) continue;
    for (const key of group) if (!isEmptyValue(sourceProfile[key])) patch[key] = sourceProfile[key];
  }
  for (const [key, value] of Object.entries(sourceProfile)) {
    if (PROFILE_FIELDS_NOT_COPIED.has(key) || grouped.has(key)) continue;
    const current = targetProfile[key];
    const empty = isEmptyValue(current) || (key === "name" && !hasRealName(current as string));
    if (key === "name" && !hasRealName(value as string)) continue;
    if (empty && value !== undefined) patch[key] = value;
  }
  return patch;
}

/** Fills fields the target's profile leaves empty from the source's, so
 * nothing the person wrote on either account is lost (profileFill). Creates
 * the target's profile from the source's if it has none. When both had an
 * @address, the source's forwards to the kept profile for
 * HANDLE_FORWARD_DAYS, like an address someone changed (handles.ts). Returns
 * the target profile id and which fields were filled. */
async function mergeProfiles(
  ctx: MutationCtx,
  sourceProfile: Doc<"profiles">,
  targetUserId: Id<"users">,
): Promise<{ targetProfileId: Id<"profiles">; filled: string[] }> {
  const targetProfile = await getProfileByUserId(ctx, targetUserId);
  if (!targetProfile) {
    await ctx.db.patch(sourceProfile._id, { userId: targetUserId, updatedAt: Date.now() });
    return { targetProfileId: sourceProfile._id, filled: ["(whole profile moved)"] };
  }
  const patch = profileFill(sourceProfile, targetProfile);
  if (Object.keys(patch).length > 0) {
    await ctx.db.patch(targetProfile._id, { ...patch, updatedAt: Date.now() } as any);
  }
  if (sourceProfile.handle && targetProfile.handle && sourceProfile.handle !== targetProfile.handle) {
    await ctx.db.insert("handleForwards", {
      handle: sourceProfile.handle,
      profileId: targetProfile._id,
      expiresAt: Date.now() + HANDLE_FORWARD_MS,
    });
  }
  return { targetProfileId: targetProfile._id, filled: Object.keys(patch) };
}

type SignIn = { provider: string; providerAccountId: string };

/** What a merge does with one of the source's sign-ins. Most move to the
 * target and open the kept account from then on: @convex-dev/auth finds a
 * sign-in by its provider and account (the providerAndAccountId index),
 * never by its user, so the kept account can hold two passwords for two
 * addresses, or two Google accounts. Two are dropped instead:
 *   - "repeat": one the target already has, the same provider and account;
 *   - "kept_address": a password for the target's own email. The kept
 *     account's owner already controls that address, and a password sign-up
 *     never proves its address, so it may be someone else's: kept, it would
 *     open the kept account for good. */
export function signInFate(
  account: SignIn,
  targetAccounts: readonly SignIn[],
  targetEmail: string | null | undefined,
): "moved" | "repeat" | "kept_address" {
  const same = targetAccounts.some(
    (t) => t.provider === account.provider && t.providerAccountId === account.providerAccountId,
  );
  if (same) return "repeat";
  const address = (x: string) => x.trim().toLowerCase();
  if (account.provider === "password" && targetEmail && address(account.providerAccountId) === address(targetEmail)) {
    return "kept_address";
  }
  return "moved";
}

export type SourceReport =
  | { sourceUserId: Id<"users">; skipped: string }
  | { sourceUserId: Id<"users">; blocked: true; blockers: Record<string, number> }
  | {
      sourceUserId: Id<"users">;
      dryRun: true;
      blockers: Record<string, number>;
      wouldMerge: boolean;
      /** With moveContent: what the merge would move, drop and combine. */
      wouldMove?: {
        moved: Record<string, number>;
        droppedDuplicates: Record<string, number>;
        conversations: ConversationCounts;
      };
    }
  | {
      sourceUserId: Id<"users">;
      merged: true;
      movedAccountCount: number;
      copiedEmailVerification: boolean;
      movedPhoneMasked: string | null;
      forced: boolean;
      contentMoved?: {
        moved: Record<string, number>;
        droppedDuplicates: Record<string, number>;
        profileFieldsFilled: string[];
        conversations: ConversationCounts;
      };
    };

/** With moveContent: conversations between the two copies deleted, and
 * pairs with the same person combined into one. */
export type ConversationCounts = { withEachOther: number; combined: number };

const conversationCounts = (plan: ConversationPlan): ConversationCounts => ({
  withEachOther: plan.withEachOther.length,
  combined: plan.combine.length,
});

type ContentMoved = NonNullable<Extract<SourceReport, { merged: true }>["contentMoved"]>;
type PlannedTarget = { profileId: Id<"profiles"> | null };

/** Everything moveContent moves for one source, in order. Writes the merge
 * makes beside MergeReads (co-host rows, the kept profile, the order of its
 * organizations) happen only in a real merge; they change no count. */
async function moveContentOf(
  ctx: MutationCtx,
  reads: MergeReads,
  sourceUserId: Id<"users">,
  targetUserId: Id<"users">,
  profile: Doc<"profiles"> | null,
  planned: PlannedTarget,
  merging: ReadonlySet<string>,
): Promise<ContentMoved> {
  const dryRun = reads.dryRun;
  const moved: Record<string, number> = {};
  const droppedDuplicates: Record<string, number> = {};
  const note = (key: string, [m, d]: [number, number]) => {
    if (m) moved[key] = (moved[key] ?? 0) + m;
    if (d) droppedDuplicates[key] = (droppedDuplicates[key] ?? 0) + d;
  };
  // The kept account's own organizations, before any move in.
  const ownPositionRows = await ctx.db
    .query("orgPositions")
    .withIndex("by_userId", (q) => q.eq("userId", targetUserId))
    .collect();
  const ownPositions = new Set(ownPositionRows.map((p) => p._id));
  // Listed at one organization from both copies: the kept place stays
  // (repoint drops the other), an admin there if either was, with the
  // other's title and start year when it has none.
  if (!dryRun) {
    for (const sp of await ctx.db
      .query("orgPositions")
      .withIndex("by_userId", (q) => q.eq("userId", sourceUserId))
      .collect()) {
      const tp = ownPositionRows.find((p) => p.organizationId === sp.organizationId);
      if (!tp) continue;
      const patch: Partial<Doc<"orgPositions">> = {};
      if (sp.isAdmin && !tp.isAdmin) patch.isAdmin = true;
      if (!tp.title && sp.title) patch.title = sp.title;
      if (!tp.startYear && sp.startYear) patch.startYear = sp.startYear;
      if (Object.keys(patch).length > 0) await ctx.db.patch(tp._id, patch);
    }
  }
  // Before the lists move: a conversation between the two copies, or two
  // with the same person (planConversations).
  const conversations = await planConversations(reads, sourceUserId, targetUserId, merging);
  await applyConversationPlan(reads, conversations, sourceUserId, targetUserId);
  for (const ref of USER_ID_FIELDS) {
    note(`${ref.table}.${ref.field}`, await repoint(ctx, reads, ref, sourceUserId, targetUserId));
  }
  let profileFieldsFilled: string[] = [];
  if (profile) {
    let targetProfileId: Id<"profiles">;
    if (dryRun) {
      // The target takes the source's whole profile when it has none.
      targetProfileId = planned.profileId ?? profile._id;
    } else {
      const merged = await mergeProfiles(ctx, profile, targetUserId);
      targetProfileId = merged.targetProfileId;
      profileFieldsFilled = merged.filled;
    }
    planned.profileId = targetProfileId;
    if (targetProfileId !== profile._id) {
      for (const ref of PROFILE_ID_FIELDS) {
        note(`${ref.table}.${ref.field}`, await repoint(ctx, reads, ref, profile._id, targetProfileId));
      }
    }
    // Following or liking the other copy is now following or liking
    // yourself; drop it.
    for (const f of await reads.pointingAt(
      { table: "favorites", field: "targetId", index: "by_userId_target", where: { userId: targetUserId, targetType: "profile" } },
      targetProfileId,
    )) {
      await reads.delete("favorites", f._id);
    }
    for (const l of await reads.pointingAt(
      { table: "profileLikes", field: "userId", index: "by_profileId_userId", where: { profileId: targetProfileId } },
      targetUserId,
    )) {
      await reads.delete("profileLikes", l._id);
    }
    // Organizations that moved in go after the kept account's own, so the
    // one shown with the name stays its own (organizations.ts).
    if (!dryRun && (moved["orgPositions.userId"] || moved["orgPositions.profileId"])) {
      const current = (
        await ctx.db
          .query("orgPositions")
          .withIndex("by_profileId", (q) => q.eq("profileId", targetProfileId))
          .collect()
      )
        .filter(isCurrent)
        .sort(
          (a, b) =>
            Number(!ownPositions.has(a._id)) - Number(!ownPositions.has(b._id)) ||
            a.order - b.order ||
            a.createdAt - b.createdAt,
        );
      for (let i = 0; i < current.length; i++) {
        if (current[i].order !== i) await ctx.db.patch(current[i]._id, { order: i });
      }
      await syncProfileOrgCache(ctx, targetProfileId);
    }
  }
  // A block between the two accounts is now a person blocking themselves;
  // drop it.
  for (const b of await reads.pointingAt(
    { table: "blocks", field: "blockedId", index: "by_blocker_blocked", where: { blockerId: targetUserId } },
    targetUserId,
  )) {
    await reads.delete("blocks", b._id);
  }
  return { moved, droppedDuplicates, profileFieldsFilled, conversations: conversationCounts(conversations) };
}

export type MergeUsersArgs = {
  targetUserId: Id<"users">;
  sourceUserIds: Id<"users">[];
  dryRun: boolean;
  force?: boolean;
  moveContent?: boolean;
};

export const mergeUsers = internalMutation({
  args: {
    targetUserId: v.id("users"),
    sourceUserIds: v.array(v.id("users")),
    dryRun: v.boolean(),
    force: v.optional(v.boolean()),
    // Move the source's content (projects, work, memberships, messages…)
    // onto the target instead of refusing. Unlike `force`, nothing is left
    // pointing at the deleted account.
    moveContent: v.optional(v.boolean()),
  },
  handler: (ctx, args) => runMergeUsers(ctx, args),
});

/** mergeUsers' handler. A caller other than the operator CLI checks who is
 * calling first (admin/duplicates.ts). */
export async function runMergeUsers(
  ctx: MutationCtx,
  { targetUserId, sourceUserIds, dryRun, force, moveContent }: MergeUsersArgs,
): Promise<{ targetUserId: Id<"users">; results: SourceReport[] }> {
  const results: SourceReport[] = [];
  const reads = new MergeReads(ctx, dryRun);
  // A dry run's own record of whose profile the target ends up with.
  const planned: PlannedTarget = { profileId: (await getProfileByUserId(ctx, targetUserId))?._id ?? null };
  // Everyone in this merge: a conversation among them is one with yourself.
  const merging = new Set<string>([targetUserId, ...sourceUserIds]);

  for (const sourceUserId of sourceUserIds) {
    if (sourceUserId === targetUserId) {
      results.push({ sourceUserId, skipped: "same as target" });
      continue;
    }

    const { profile, blockers } = await scanForContent(ctx, reads, sourceUserId);
    const hasContent = Object.keys(blockers).length > 0;

    if (hasContent && !force && !moveContent) {
      results.push({ sourceUserId, blocked: true, blockers });
      continue;
    }

    if (moveContent) {
      const clashes: Record<string, number> = {};
      for (const ref of ONE_PER_ACCOUNT_BLOCKING) {
        const [source, target] = await Promise.all([
          reads.pointingAt(ref, sourceUserId),
          reads.pointingAt(ref, targetUserId),
        ]);
        if (source.length > 0 && target.length > 0) clashes[`${ref.table} (both accounts have one)`] = 1;
      }
      if (Object.keys(clashes).length > 0) {
        results.push({ sourceUserId, blocked: true, blockers: clashes });
        continue;
      }
    }

    // With moveContent a dry run walks the same moves as the merge, against
    // MergeReads' plan instead of the database, so what it reports for
    // several copies is what the merge would do, copy after copy.
    let contentMoved: ContentMoved | undefined;
    if (moveContent) {
      contentMoved = await moveContentOf(ctx, reads, sourceUserId, targetUserId, profile, planned, merging);
    }

    if (dryRun) {
      results.push({
        sourceUserId,
        dryRun: true,
        blockers,
        wouldMerge: true,
        ...(contentMoved
          ? { wouldMove: { moved: contentMoved.moved, droppedDuplicates: contentMoved.droppedDuplicates, conversations: contentMoved.conversations } }
          : {}),
      });
      continue;
    }

    const targetAccounts = await ctx.db
      .query("authAccounts")
      .withIndex("userIdAndProvider", (q) => q.eq("userId", targetUserId))
      .collect();
    const [sourceUser, targetUser] = await Promise.all([ctx.db.get(sourceUserId), ctx.db.get(targetUserId)]);

    const sourceAccounts = await ctx.db
      .query("authAccounts")
      .withIndex("userIdAndProvider", (q) => q.eq("userId", sourceUserId))
      .collect();

    let movedPhone: string | null = null;

    for (const account of sourceAccounts) {
      // Clean up verification codes tied to this account before it's
      // either moved (codes stay valid, harmless to leave — but we drop
      // them anyway since a merge invalidates any in-flight sign-in) or
      // deleted (would otherwise orphan).
      const codes = await ctx.db
        .query("authVerificationCodes")
        .withIndex("accountId", (q) => q.eq("accountId", account._id))
        .collect();
      for (const code of codes) await ctx.db.delete(code._id);

      if (signInFate(account, targetAccounts, targetUser?.email) !== "moved") {
        // One the target already has, or a password for the target's own
        // address (signInFate): dropped rather than moved.
        await ctx.db.delete(account._id);
        continue;
      }

      await ctx.db.patch(account._id, { userId: targetUserId });
      if (account.provider === "phone") {
        movedPhone = account.providerAccountId;
      }
    }

    // Carry the source's verified email over when it's the same address
    // as the target's. Read from the source's users row, not the moved
    // account: Convex Auth leaves authAccounts.emailVerified empty for
    // Google sign-ins, so checking the account never fired.
    const targetPatch: Record<string, unknown> = {};
    const copiedEmailVerification = Boolean(
      sourceUser?.emailVerificationTime &&
        !targetUser?.emailVerificationTime &&
        sourceUser.email &&
        sourceUser.email.toLowerCase() === targetUser?.email?.toLowerCase(),
    );
    if (copiedEmailVerification) {
      targetPatch.emailVerificationTime = sourceUser!.emailVerificationTime;
    }
    // The moved phone sign-in's number, only where the target has none of
    // its own (or has this one, unverified): a phone sign-in works by its
    // account either way.
    if (movedPhone && (!targetUser?.phone || targetUser.phone === movedPhone)) {
      targetPatch.phone = movedPhone;
      if (!targetUser?.phoneVerificationTime) targetPatch.phoneVerificationTime = Date.now();
    }
    if (Object.keys(targetPatch).length > 0) {
      await ctx.db.patch(targetUserId, targetPatch);
    }

    // Delete the source's auth sessions (and each session's refresh
    // tokens) and its profile, then the user row itself.
    const sessions = await ctx.db
      .query("authSessions")
      .withIndex("userId", (q) => q.eq("userId", sourceUserId))
      .collect();
    for (const session of sessions) {
      const refreshTokens = await ctx.db
        .query("authRefreshTokens")
        .withIndex("sessionId", (q) => q.eq("sessionId", session._id))
        .collect();
      for (const token of refreshTokens) await ctx.db.delete(token._id);
      await ctx.db.delete(session._id);
    }

    const profileNow = profile ? await ctx.db.get(profile._id) : null;
    if (profileNow && profileNow.userId === sourceUserId) {
      await ctx.db.delete(profileNow._id);
    }

    await ctx.db.delete(sourceUserId);

    results.push({
      sourceUserId,
      merged: true,
      movedAccountCount: sourceAccounts.length,
      copiedEmailVerification,
      movedPhoneMasked: movedPhone ? maskPhone(movedPhone) : null,
      forced: hasContent && !moveContent,
      ...(contentMoved ? { contentMoved } : {}),
    });
  }

  return { targetUserId, results };
}

/**
 * Sign-in records whose user no longer exists (accounts deleted before
 * deletion cleaned these up). Someone trying one of those emails gets an
 * error instead of a sign-up, so they're removed along with anything that
 * hangs off them. Internal only; `dryRun` reports without deleting. Reports
 * provider and creation date — never the email.
 */
export const deleteOrphanAuthAccounts = internalMutation({
  args: { dryRun: v.boolean() },
  handler: async (ctx, { dryRun }) => {
    const accounts = await ctx.db.query("authAccounts").collect();
    const orphans: Doc<"authAccounts">[] = [];
    for (const account of accounts) {
      if (!(await ctx.db.get(account.userId))) orphans.push(account);
    }
    let codes = 0;
    if (!dryRun) {
      for (const account of orphans) {
        const pending = await ctx.db
          .query("authVerificationCodes")
          .withIndex("accountId", (q) => q.eq("accountId", account._id))
          .collect();
        for (const code of pending) {
          await ctx.db.delete(code._id);
          codes++;
        }
        await ctx.db.delete(account._id);
      }
    }
    return {
      dryRun,
      orphanCount: orphans.length,
      verificationCodesDeleted: codes,
      orphans: orphans.map((a) => ({
        provider: a.provider,
        created: new Date(a._creationTime).toISOString().slice(0, 10),
      })),
    };
  },
});
