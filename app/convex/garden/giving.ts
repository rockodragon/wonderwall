// Member-directed giving (docs/features/member-directed-giving.md).
//
// Half of a member's dues already funds grants (the pool share of each
// membership invoice, written as a dues_share row by stripeHandlers.ts).
// This file hands that share back to the member for a month: the webhook
// opens a memberGifts row next to the dues_share row (openMemberGift, called
// from memberships.ts's adapter), the member decides on /give (decideGift),
// and a daily sweep defaults what nobody directed to the fund
// (defaultOpenGifts). The money never moves on the gift row itself: a
// creative-directed gift is owed on giftPayments, a project-directed one on
// backingPayments, and the fund keeps the rest. Stripe Connect transfers
// what is owed (garden/connect.ts).
//
// The plus-up is the metric. A plus-up (createGiftCheckout, a backing
// checkout started from /give, or a Sophia Fund link carrying the gift ref)
// records memberGiftId, and computeGivingReport turns that into the
// behavior-change table on /admin/ledger.
//
// Same split as allocations.ts: a pure core first (unit-tested in
// giving.test.ts with no Convex), thin Convex wrappers after.
//
// Money words: "give", "back", "your half", "the grant fund". Never "gift"
// or "donate" in anything a member reads — those words belong to the
// Sophia Fund's own tax-deductible links. "gift" here is only the row name.

import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { internalMutation, internalQuery, mutation, query } from "../_generated/server";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { getAuthUserId } from "@convex-dev/auth/server";
import { internal } from "../_generated/api";
import { scheduleNotificationEmail } from "../emailHelpers";
import { escapeHtml } from "../email/template";
import { isAdminProfile } from "../helpers";
import { SPLITS } from "./capabilities";
import { getCommunityMember } from "./communities";

// ——————————————————————————————————————————————————————————————
// Pure core
// ——————————————————————————————————————————————————————————————

/** An open gift that nobody directed goes to the fund this many days after
 * it opened, or when the next gift opens for the same membership, whichever
 * is first (spec, "The default"). */
export const GIFT_DEFAULT_AFTER_DAYS = 35;
export const GIFT_NOTE_MAX = 200;
/** Decided minimum before a creative's owed balance is transferred
 * (backing-payouts.md): covers Stripe's $2 active-account month. */
export const MIN_TRANSFER_CENTS = 5000;

export type GiftStatus = "open" | "creative" | "project" | "fund";
export type GiftTarget = "creative" | "project" | "fund";

/** Server twins of the member-directed claims in app/app/constants/
 * claims.ts (convex/ can't import from app/). claims.test.ts checks these
 * match word for word, the same way it checks SPLITS.duesSentence. */
export const GIVING_SENTENCES = {
  memberDirected: "Each month you pick which creative gets your half, or leave it in the grant fund.",
  memberDirectedDefault: "If you don't pick by your next payment, it stays in the grant fund.",
  memberDirectedFull: "What you give this way goes to them in full.",
} as const;

/** The pool share of a dues invoice is the member's to direct. A community
 * with no pool share opens nothing. */
export function allowanceForDuesShare(poolCents: number): number {
  return Number.isInteger(poolCents) && poolCents > 0 ? poolCents : 0;
}

export interface GiftDecisionInput {
  giftStatus: string;
  giverUserId: string;
  target: GiftTarget;
  recipientUserId?: string;
  /** Whether the recipient is an active member of the gift's community. */
  recipientIsMember?: boolean;
  projectOwnerUserId?: string;
  projectStatus?: string;
  projectKind?: string;
  note?: string;
}

/** The plain-words reason a decision is refused, or null when it's fine.
 * Rules (spec, "Rules"): only an open gift; never to yourself or your own
 * project; a creative must be an active member of the community; a project
 * must be an active passion project; a note is at most GIFT_NOTE_MAX. */
export function giftDecisionProblem(input: GiftDecisionInput): string | null {
  if (input.giftStatus !== "open") return "This month's amount has already been decided.";
  if (input.note !== undefined && input.note.length > GIFT_NOTE_MAX) {
    return `Keep the note under ${GIFT_NOTE_MAX} characters.`;
  }
  if (input.target === "creative") {
    if (!input.recipientUserId) return "Pick a creative first.";
    if (input.recipientUserId === input.giverUserId) return "You can't give this to yourself.";
    if (!input.recipientIsMember) return "That person isn't a member of this community.";
    return null;
  }
  if (input.target === "project") {
    if (!input.projectOwnerUserId) return "Pick a project first.";
    if (input.projectOwnerUserId === input.giverUserId) return "You can't give this to your own project.";
    if (input.projectKind !== "passion") return "Only passion projects can take this.";
    if (input.projectStatus !== "active" && input.projectStatus !== "in_progress") {
      return "That project isn't taking support right now.";
    }
    return null;
  }
  return null; // fund — always allowed
}

/** Whether an open gift should now default to the fund. */
export function giftDefaultDue(args: { openedAt: number; now: number; newerGiftExists: boolean }): boolean {
  if (args.newerGiftExists) return true;
  return args.now - args.openedAt >= GIFT_DEFAULT_AFTER_DAYS * 24 * 60 * 60 * 1000;
}

/** When an open gift will default if nothing happens — for the page. */
export function giftDefaultAt(openedAt: number): number {
  return openedAt + GIFT_DEFAULT_AFTER_DAYS * 24 * 60 * 60 * 1000;
}

/** "YYYY-MM" the month before. */
export function previousPeriod(period: string): string {
  const [y, m] = period.split("-").map(Number);
  if (!y || !m) return period;
  const d = new Date(Date.UTC(y, m - 2, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function periodFromMs(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function formatCents(cents: number): string {
  const dollars = cents / 100;
  return Number.isInteger(dollars)
    ? `$${dollars.toLocaleString("en-US")}`
    : `$${dollars.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ——— Row shapes the decision writes (pure, so the amounts are pinned) ———

export interface AllowanceGiftPaymentRow {
  memberGiftId: string;
  payeeUserId: string;
  giverUserId: string;
  giverName?: string;
  visible: boolean;
  source: "allowance";
  grossCents: number;
  platformCents: 0;
  workCents: number;
  billing: "allowance";
  stripeRef: string;
  period: string;
}

/** A member directed their share to a creative: the whole amount is owed,
 * no platform share (the 10% came out of the dues). */
export function buildAllowanceGiftPayment(args: {
  memberGiftId: string;
  payeeUserId: string;
  giverUserId: string;
  giverName?: string;
  visible: boolean;
  amountCents: number;
  period: string;
}): AllowanceGiftPaymentRow {
  return {
    memberGiftId: args.memberGiftId,
    payeeUserId: args.payeeUserId,
    giverUserId: args.giverUserId,
    giverName: args.visible ? args.giverName : undefined,
    visible: args.visible,
    source: "allowance",
    grossCents: args.amountCents,
    platformCents: 0,
    workCents: args.amountCents,
    billing: "allowance",
    stripeRef: `allowance:${args.memberGiftId}`,
    period: args.period,
  };
}

export interface AllowanceBackingPaymentRow {
  projectId: string;
  supportId?: string;
  payeeUserId?: string;
  backerUserId: string;
  grossCents: number;
  platformCents: 0;
  workCents: number;
  billing: "allowance";
  stripeRef: string;
  period: string;
  memberGiftId: string;
}

/** A member directed their share to a project: same shape a backing
 * payment has, with no platform share. */
export function buildAllowanceBackingPayment(args: {
  memberGiftId: string;
  projectId: string;
  supportId?: string;
  payeeUserId?: string;
  backerUserId: string;
  amountCents: number;
  period: string;
}): AllowanceBackingPaymentRow {
  return {
    projectId: args.projectId,
    ...(args.supportId ? { supportId: args.supportId } : {}),
    ...(args.payeeUserId ? { payeeUserId: args.payeeUserId } : {}),
    backerUserId: args.backerUserId,
    grossCents: args.amountCents,
    platformCents: 0,
    workCents: args.amountCents,
    billing: "allowance",
    stripeRef: `allowance:${args.memberGiftId}`,
    period: args.period,
    memberGiftId: args.memberGiftId,
  };
}

export interface MemberGiftOutRow {
  hostOrgId: string;
  type: "member_gift_out";
  grossCents: 0;
  platformCents: 0;
  poolCents: number; // negative
  userId: string;
  memberGiftId: string;
  period: string;
  note: string;
}

/** The pool loses what the member directed away from it. */
export function buildMemberGiftOutContribution(args: {
  communityId: string;
  memberGiftId: string;
  userId: string;
  amountCents: number;
  period: string;
  target: "creative" | "project";
}): MemberGiftOutRow {
  return {
    hostOrgId: args.communityId,
    type: "member_gift_out",
    grossCents: 0,
    platformCents: 0,
    poolCents: -args.amountCents,
    userId: args.userId,
    memberGiftId: args.memberGiftId,
    period: args.period,
    note: args.target === "creative" ? "Directed to a creative by a member" : "Directed to a project by a member",
  };
}

// ——— Transfers (Stripe Connect) ———

export interface TransferableRow {
  table: "giftPayments" | "backingPayments";
  rowId: string;
  payeeUserId: string;
  workCents: number;
}

export interface PayeeTransferPlan {
  payeeUserId: string;
  totalCents: number;
  rows: TransferableRow[];
}

/** Groups owed rows by payee and keeps the payees whose total has reached
 * the minimum (or every payee when the minimum is waived, e.g. someone
 * leaving). Rows with nothing owed are dropped. Order: largest first, the
 * order an operator reads. */
export function planTransfers(
  rows: TransferableRow[],
  opts: { minCents?: number; ignoreMinimum?: boolean } = {},
): PayeeTransferPlan[] {
  const min = opts.minCents ?? MIN_TRANSFER_CENTS;
  const byPayee = new Map<string, TransferableRow[]>();
  for (const r of rows) {
    if (!Number.isInteger(r.workCents) || r.workCents <= 0) continue;
    const arr = byPayee.get(r.payeeUserId) ?? [];
    arr.push(r);
    byPayee.set(r.payeeUserId, arr);
  }
  const plans: PayeeTransferPlan[] = [];
  for (const [payeeUserId, payeeRows] of byPayee) {
    const totalCents = payeeRows.reduce((s, r) => s + r.workCents, 0);
    if (!opts.ignoreMinimum && totalCents < min) continue;
    plans.push({ payeeUserId, totalCents, rows: payeeRows });
  }
  return plans.sort((a, b) => b.totalCents - a.totalCents);
}

// ——— The behavior-change report ———

export interface GiftLike {
  id: string;
  userId: string;
  period: string;
  status: string;
  decidedBy?: string;
  openedAt: number;
  decidedAt?: number;
  recipientUserId?: string;
  projectId?: string;
  amountCents: number;
}

/** A plus-up attributed to a gift: a giftPayments plus_up row, a
 * backingPayments row with memberGiftId, or an Abiding Practice
 * contribution carrying the gift ref. `billing` "first" means a monthly
 * plus-up started; "renewal" is a later month of one. */
export interface PlusUpLike {
  memberGiftId: string;
  giverUserId?: string;
  grossCents: number;
  billing: string; // "one_time" | "first" | "renewal" | "fund"
}

export interface GivingPeriodRow {
  period: string;
  opened: number;
  toCreative: number;
  toProject: number;
  fundChosen: number;
  defaulted: number;
  stillOpen: number;
  directedCents: number;
  decidedWithin7Days: number;
  distinctRecipients: number;
  plusUps: number; // plus-up payments, renewals excluded
  plusUpCents: number; // every plus-up dollar, renewals included
  monthlyPlusUpsStarted: number;
  giftsWithPlusUp: number;
  /** giftsWithPlusUp ÷ (toCreative + toProject), 0 when nothing directed. */
  plusUpRate: number;
  repeatGivers: number;
  repeatPlusUps: number;
}

export interface GivingMemberRow {
  userId: string;
  giftsOpened: number;
  giftsDirected: number;
  monthsDirectedInARow: number;
  plusUpCount: number;
  plusUpCents: number;
  lastPeriod: string;
}

export interface GivingReport {
  byPeriod: GivingPeriodRow[]; // newest first
  members: GivingMemberRow[]; // most plussed-up first
  totals: {
    opened: number;
    directed: number;
    directedCents: number;
    plusUpCents: number;
    giftsWithPlusUp: number;
  };
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export function computeGivingReport(gifts: GiftLike[], plusUps: PlusUpLike[]): GivingReport {
  const plusUpsByGift = new Map<string, PlusUpLike[]>();
  for (const p of plusUps) {
    const arr = plusUpsByGift.get(p.memberGiftId) ?? [];
    arr.push(p);
    plusUpsByGift.set(p.memberGiftId, arr);
  }

  const periods = new Map<string, GiftLike[]>();
  for (const g of gifts) {
    const arr = periods.get(g.period) ?? [];
    arr.push(g);
    periods.set(g.period, arr);
  }

  // Who directed / plussed up in each period, for the repeat columns.
  const directedBy = new Map<string, Set<string>>();
  const plussedBy = new Map<string, Set<string>>();
  for (const g of gifts) {
    if (g.status === "creative" || g.status === "project") {
      const s = directedBy.get(g.period) ?? new Set<string>();
      s.add(g.userId);
      directedBy.set(g.period, s);
    }
    if ((plusUpsByGift.get(g.id) ?? []).some((p) => p.billing !== "renewal")) {
      const s = plussedBy.get(g.period) ?? new Set<string>();
      s.add(g.userId);
      plussedBy.set(g.period, s);
    }
  }

  const byPeriod: GivingPeriodRow[] = [];
  for (const [period, rows] of periods) {
    const prev = previousPeriod(period);
    const row: GivingPeriodRow = {
      period,
      opened: rows.length,
      toCreative: 0,
      toProject: 0,
      fundChosen: 0,
      defaulted: 0,
      stillOpen: 0,
      directedCents: 0,
      decidedWithin7Days: 0,
      distinctRecipients: 0,
      plusUps: 0,
      plusUpCents: 0,
      monthlyPlusUpsStarted: 0,
      giftsWithPlusUp: 0,
      plusUpRate: 0,
      repeatGivers: 0,
      repeatPlusUps: 0,
    };
    const recipients = new Set<string>();
    for (const g of rows) {
      if (g.status === "creative") {
        row.toCreative++;
        row.directedCents += g.amountCents;
        if (g.recipientUserId) recipients.add(`u:${g.recipientUserId}`);
      } else if (g.status === "project") {
        row.toProject++;
        row.directedCents += g.amountCents;
        if (g.projectId) recipients.add(`p:${g.projectId}`);
      } else if (g.status === "fund") {
        if (g.decidedBy === "default") row.defaulted++;
        else row.fundChosen++;
      } else {
        row.stillOpen++;
      }
      if (g.decidedBy === "member" && g.decidedAt !== undefined && g.decidedAt - g.openedAt <= SEVEN_DAYS_MS) {
        row.decidedWithin7Days++;
      }
      const ups = plusUpsByGift.get(g.id) ?? [];
      let any = false;
      for (const p of ups) {
        row.plusUpCents += p.grossCents;
        if (p.billing === "renewal") continue;
        row.plusUps++;
        any = true;
        if (p.billing === "first") row.monthlyPlusUpsStarted++;
      }
      if (any) row.giftsWithPlusUp++;
    }
    row.distinctRecipients = recipients.size;
    const directed = row.toCreative + row.toProject;
    row.plusUpRate = directed === 0 ? 0 : row.giftsWithPlusUp / directed;
    const prevDirected = directedBy.get(prev) ?? new Set<string>();
    for (const u of directedBy.get(period) ?? []) if (prevDirected.has(u)) row.repeatGivers++;
    const prevPlussed = plussedBy.get(prev) ?? new Set<string>();
    for (const u of plussedBy.get(period) ?? []) if (prevPlussed.has(u)) row.repeatPlusUps++;
    byPeriod.push(row);
  }
  byPeriod.sort((a, b) => (a.period < b.period ? 1 : a.period > b.period ? -1 : 0));

  // Per member.
  const byMember = new Map<string, GiftLike[]>();
  for (const g of gifts) {
    const arr = byMember.get(g.userId) ?? [];
    arr.push(g);
    byMember.set(g.userId, arr);
  }
  const members: GivingMemberRow[] = [];
  for (const [userId, rows] of byMember) {
    const sorted = [...rows].sort((a, b) => (a.period < b.period ? 1 : a.period > b.period ? -1 : 0));
    // Months directed in a row, ending at the latest decided month. A
    // still-open current month doesn't break the streak — nothing has been
    // decided yet — so it is skipped, not counted.
    let streak = 0;
    let expect = sorted[0]?.period;
    for (const g of sorted) {
      if (g.period !== expect) break;
      expect = previousPeriod(g.period);
      if (g.status === "open" && streak === 0) continue;
      if (g.status !== "creative" && g.status !== "project") break;
      streak++;
    }
    let plusUpCount = 0;
    let plusUpCents = 0;
    for (const g of rows) {
      for (const p of plusUpsByGift.get(g.id) ?? []) {
        plusUpCents += p.grossCents;
        if (p.billing !== "renewal") plusUpCount++;
      }
    }
    members.push({
      userId,
      giftsOpened: rows.length,
      giftsDirected: rows.filter((g) => g.status === "creative" || g.status === "project").length,
      monthsDirectedInARow: streak,
      plusUpCount,
      plusUpCents,
      lastPeriod: sorted[0]?.period ?? "",
    });
  }
  members.sort((a, b) => b.plusUpCents - a.plusUpCents || b.monthsDirectedInARow - a.monthsDirectedInARow);

  const totals = byPeriod.reduce(
    (t, r) => ({
      opened: t.opened + r.opened,
      directed: t.directed + r.toCreative + r.toProject,
      directedCents: t.directedCents + r.directedCents,
      plusUpCents: t.plusUpCents + r.plusUpCents,
      giftsWithPlusUp: t.giftsWithPlusUp + r.giftsWithPlusUp,
    }),
    { opened: 0, directed: 0, directedCents: 0, plusUpCents: 0, giftsWithPlusUp: 0 },
  );

  return { byPeriod, members, totals };
}

// ——— Emails (pure builders, same shape as memberships.ts's) ———

export interface BuiltEmail {
  subject: string;
  previewText: string;
  heading: string;
  body: string;
  ctaText: string;
  ctaUrl: string;
}

/** "You have $5 to give this month" — to the member when a gift opens. */
export function buildGiftOpenedEmail(input: { amountCents: number; communityName: string; linkUrl: string }): BuiltEmail {
  const amount = formatCents(input.amountCents);
  const community = escapeHtml(input.communityName);
  // The default rule sits in the first two lines (spec, "The notice"), so a
  // member who reads nothing else still knows what happens if they wait.
  return {
    subject: `You have ${amount} to give this month`,
    previewText: `${amount} of your membership is yours to give. ${GIVING_SENTENCES.memberDirectedDefault}`,
    heading: `You have ${amount} to give this month.`,
    body:
      `${amount} of your membership in ${community} is yours to give. ${GIVING_SENTENCES.memberDirectedDefault} ` +
      `${SPLITS.duesSentence} Pick a creative, pick a project, or leave it in the grant fund.`,
    ctaText: "Pick who gets it",
    ctaUrl: input.linkUrl,
  };
}

/** "Dana gave you $5" — to the recipient. `connected` decides the CTA: not
 * connected sends them to Get paid; connected sends them to /give. */
export function buildGiftReceivedEmail(input: {
  giverName?: string;
  visible: boolean;
  amountCents: number;
  source: "allowance" | "plus_up";
  recurring: boolean;
  note?: string;
  connected: boolean;
  projectTitle?: string;
}): BuiltEmail {
  const displayName = input.visible && input.giverName ? input.giverName : "Someone";
  const name = escapeHtml(displayName);
  const amount = formatCents(input.amountCents);
  const monthly = input.recurring ? " a month" : "";
  const what = input.projectTitle ? ` toward <strong>${escapeHtml(input.projectTitle)}</strong>` : "";
  const verb = input.source === "allowance" ? "gave you" : "backed you with";
  const from = input.source === "allowance" ? " from their membership" : "";
  const note = input.note ? ` They wrote: &ldquo;${escapeHtml(input.note)}&rdquo;` : "";
  const connect = input.connected
    ? ""
    : " Connect your bank in Settings to get it. It waits for you until you do.";
  return {
    subject: `${displayName} ${input.source === "allowance" ? "gave you" : "backed you with"} ${amount}${monthly}`,
    previewText: `${displayName} ${verb} ${amount}${monthly}${input.projectTitle ? ` toward ${input.projectTitle}` : ""}.`,
    heading: `${displayName} ${verb} ${amount}${monthly}`,
    body: `<strong>${name}</strong> ${verb} ${amount}${monthly}${what}${from}.${note}${connect}`,
    ctaText: input.connected ? "See what you've been given" : "Get paid",
    ctaUrl: input.connected ? "/give" : "/settings?tab=money",
  };
}

// ——————————————————————————————————————————————————————————————
// Convex wrappers
// ——————————————————————————————————————————————————————————————

async function profileFor(ctx: QueryCtx | MutationCtx, userId: Id<"users">) {
  return ctx.db
    .query("profiles")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .unique();
}

async function insertNotification(
  ctx: MutationCtx,
  args: { userId: Id<"users">; type: string; title: string; message: string; linkUrl: string; relatedUserId?: Id<"users"> },
) {
  await ctx.db.insert("notifications", { ...args, createdAt: Date.now() });
}

/** Opens a member's gift for one paid membership invoice. Called by the
 * Stripe adapter (memberships.ts) right after the dues_share row; idempotent
 * on the invoice id. Sends the "you have $5 to give" notice. */
export async function openMemberGift(
  ctx: MutationCtx,
  args: {
    userId: Id<"users">;
    communityId: Id<"hostOrgs">;
    membershipId?: Id<"memberships">;
    sourceStripeRef: string;
    period: string;
    amountCents: number;
  },
): Promise<Id<"memberGifts"> | null> {
  const amountCents = allowanceForDuesShare(args.amountCents);
  if (amountCents === 0) return null;
  const existing = await ctx.db
    .query("memberGifts")
    .withIndex("by_sourceStripeRef", (q) => q.eq("sourceStripeRef", args.sourceStripeRef))
    .unique();
  if (existing) return existing._id;

  const now = Date.now();
  const giftId = await ctx.db.insert("memberGifts", {
    userId: args.userId,
    communityId: args.communityId,
    membershipId: args.membershipId,
    sourceStripeRef: args.sourceStripeRef,
    period: args.period,
    amountCents,
    status: "open",
    openedAt: now,
  });

  const community = await ctx.db.get(args.communityId);
  const communityName = community?.name ?? "your community";
  const amount = formatCents(amountCents);
  await insertNotification(ctx, {
    userId: args.userId,
    type: "gift_opened",
    title: `You have ${amount} to give this month.`,
    message: `Pick a creative, pick a project, or leave it in the grant fund. ${GIVING_SENTENCES.memberDirectedDefault}`,
    linkUrl: "/give",
  });
  await scheduleNotificationEmail(ctx, {
    userId: args.userId,
    category: "activity",
    ...buildGiftOpenedEmail({ amountCents, communityName, linkUrl: "/give" }),
  });
  return giftId;
}

/** Tells a creative money is waiting, with the Connect nudge when they
 * haven't set up payouts. Used for allowance gifts here and plus-ups by
 * the Stripe adapter. Never notifies someone about their own money. */
export async function notifyGiftReceived(
  ctx: MutationCtx,
  args: {
    payeeUserId: Id<"users">;
    giverUserId?: Id<"users">;
    giverName?: string;
    visible: boolean;
    amountCents: number;
    source: "allowance" | "plus_up";
    recurring: boolean;
    note?: string;
    projectTitle?: string;
  },
) {
  if (args.giverUserId && String(args.giverUserId) === String(args.payeeUserId)) return;
  const payeeProfile = await profileFor(ctx, args.payeeUserId);
  const connected = payeeProfile?.stripeConnectPayoutsEnabled === true;
  const email = buildGiftReceivedEmail({
    giverName: args.giverName,
    visible: args.visible,
    amountCents: args.amountCents,
    source: args.source,
    recurring: args.recurring,
    note: args.note,
    connected,
    projectTitle: args.projectTitle,
  });
  await insertNotification(ctx, {
    userId: args.payeeUserId,
    type: args.source === "allowance" ? "gift_received" : "backing_received",
    title: email.heading,
    message: connected ? (args.note ?? "") : "Connect your bank in Settings to get it.",
    linkUrl: email.ctaUrl,
    relatedUserId: args.visible ? args.giverUserId : undefined,
  });
  await scheduleNotificationEmail(ctx, { userId: args.payeeUserId, category: "activity", ...email });
}

/** Kicks the Connect transfer sweep for one payee (garden/connect.ts). A
 * no-op when the payee has no connected account yet — the nightly sweep
 * and the return from Stripe onboarding pick it up later. */
export async function scheduleTransferFor(ctx: MutationCtx, payeeUserId: Id<"users">) {
  const profile = await profileFor(ctx, payeeUserId);
  if (!profile?.stripeConnectPayoutsEnabled) return;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await ctx.scheduler.runAfter(0, (internal as any).garden.connect.transferOwed, {
    payeeUserId: String(payeeUserId),
  });
}

const PICKER_LIMIT = 20;

function pickProfileCard(p: Doc<"profiles">) {
  return {
    userId: p.userId,
    profileId: p._id,
    name: p.name,
    imageUrl: p.imageUrl,
    interests: p.interests.slice(0, 3),
    location: p.location,
  };
}

/** Everything /give shows: the open gift(s), history, what this person has
 * been given, and their Connect state. */
export const getMyGiving = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;

    const [gifts, received, receivedBackings, profile] = await Promise.all([
      ctx.db
        .query("memberGifts")
        .withIndex("by_userId", (q) => q.eq("userId", userId))
        .collect(),
      ctx.db
        .query("giftPayments")
        .withIndex("by_payeeUserId", (q) => q.eq("payeeUserId", userId))
        .collect(),
      ctx.db
        .query("backingPayments")
        .withIndex("by_payeeUserId", (q) => q.eq("payeeUserId", userId))
        .collect(),
      profileFor(ctx, userId),
    ]);

    const communityIds = [...new Set(gifts.map((g) => String(g.communityId)))];
    const communities = await Promise.all(communityIds.map((id) => ctx.db.get(id as Id<"hostOrgs">)));
    const communityName = new Map(communities.filter(Boolean).map((c) => [String(c!._id), c!.name]));

    const recipientIds = [...new Set(gifts.map((g) => g.recipientUserId).filter(Boolean))] as Id<"users">[];
    const recipientProfiles = await Promise.all(recipientIds.map((id) => profileFor(ctx, id)));
    const recipientName = new Map(
      recipientProfiles.filter(Boolean).map((p) => [String(p!.userId), { name: p!.name, profileId: p!._id }]),
    );
    const projectIds = [...new Set(gifts.map((g) => g.projectId).filter(Boolean))] as Id<"projects">[];
    const projects = await Promise.all(projectIds.map((id) => ctx.db.get(id)));
    const projectInfo = new Map(
      projects.filter(Boolean).map((p) => [String(p!._id), { title: p!.title, storySlug: p!.storySlug }]),
    );

    // Plus-ups per gift, for the history rows.
    const plusUpsByGift = new Map<string, number>();
    for (const g of gifts) {
      const [ups, backs, fund] = await Promise.all([
        ctx.db
          .query("giftPayments")
          .withIndex("by_memberGiftId", (q) => q.eq("memberGiftId", g._id))
          .collect(),
        ctx.db
          .query("backingPayments")
          .withIndex("by_memberGiftId", (q) => q.eq("memberGiftId", g._id))
          .collect(),
        ctx.db
          .query("grantContributions")
          .withIndex("by_memberGiftId", (q) => q.eq("memberGiftId", g._id))
          .collect(),
      ]);
      const cents =
        ups.filter((u) => u.source === "plus_up").reduce((s, u) => s + u.grossCents, 0) +
        backs.filter((b) => b.billing !== "allowance").reduce((s, b) => s + b.grossCents, 0) +
        fund.filter((f) => f.type !== "member_gift_out").reduce((s, f) => s + f.grossCents, 0);
      plusUpsByGift.set(String(g._id), cents);
    }

    const shaped = gifts
      .sort((a, b) => b.openedAt - a.openedAt)
      .map((g) => ({
        giftId: g._id,
        communityId: g.communityId,
        communityName: communityName.get(String(g.communityId)) ?? "your community",
        period: g.period,
        amountCents: g.amountCents,
        status: g.status as GiftStatus,
        decidedBy: g.decidedBy,
        openedAt: g.openedAt,
        decidedAt: g.decidedAt,
        defaultAt: giftDefaultAt(g.openedAt),
        recipient: g.recipientUserId ? (recipientName.get(String(g.recipientUserId)) ?? null) : null,
        recipientUserId: g.recipientUserId,
        project: g.projectId ? (projectInfo.get(String(g.projectId)) ?? null) : null,
        projectId: g.projectId,
        visible: g.visible,
        note: g.note,
        plusUpCents: plusUpsByGift.get(String(g._id)) ?? 0,
      }));

    const owedGiftCents = received.filter((r) => !r.transferId).reduce((s, r) => s + r.workCents, 0);
    const owedBackingCents = receivedBackings.filter((r) => !r.transferId).reduce((s, r) => s + r.workCents, 0);

    return {
      open: shaped.filter((g) => g.status === "open"),
      history: shaped.filter((g) => g.status !== "open"),
      received: received
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, 50)
        .map((r) => ({
          id: r._id,
          giverName: r.visible && r.giverName ? r.giverName : "Someone",
          amountCents: r.workCents,
          source: r.source,
          billing: r.billing,
          period: r.period,
          transferred: Boolean(r.transferId),
          createdAt: r.createdAt,
        })),
      owedCents: owedGiftCents + owedBackingCents,
      connect: {
        started: Boolean(profile?.stripeConnectAccountId),
        payoutsEnabled: profile?.stripeConnectPayoutsEnabled === true,
        detailsSubmitted: profile?.stripeConnectDetailsSubmitted === true,
      },
    };
  },
});

/** People a gift can go to: active members of the gift's community, not
 * the giver, matched on name. */
export const searchRecipients = query({
  args: { giftId: v.id("memberGifts"), query: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const gift = await ctx.db.get(args.giftId);
    if (!gift || gift.userId !== userId) return [];

    const members = await ctx.db
      .query("communityMembers")
      .withIndex("by_hostOrgId", (q) => q.eq("hostOrgId", gift.communityId))
      .collect();
    const memberIds = members
      .filter((m) => m.status === "active" && String(m.userId) !== String(userId))
      .map((m) => m.userId);

    const needle = (args.query ?? "").trim().toLowerCase();
    const profiles = await Promise.all(memberIds.map((id) => profileFor(ctx, id)));
    return profiles
      .filter((p): p is Doc<"profiles"> => Boolean(p) && p!.name !== "New User")
      .filter((p) => !needle || p.name.toLowerCase().includes(needle) || p.interests.some((i) => i.toLowerCase().includes(needle)))
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, PICKER_LIMIT)
      .map(pickProfileCard);
  },
});

/** Passion projects a gift can go to: active, posted, not the giver's. */
export const listProjectsForGift = query({
  args: { giftId: v.id("memberGifts"), query: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const gift = await ctx.db.get(args.giftId);
    if (!gift || gift.userId !== userId) return [];

    const rows = await ctx.db
      .query("projects")
      .withIndex("by_kind_status", (q) => q.eq("kind", "passion").eq("status", "active"))
      .collect();
    const needle = (args.query ?? "").trim().toLowerCase();
    const mine = String(userId);
    const visible = rows
      .filter((p) => String(p.userId) !== mine)
      .filter((p) => !needle || p.title.toLowerCase().includes(needle))
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, PICKER_LIMIT);
    const owners = await Promise.all(visible.map((p) => profileFor(ctx, p.userId)));
    return visible.map((p, i) => ({
      projectId: p._id,
      title: p.title,
      blurb: p.blurb,
      photoUrl: p.photoUrl,
      storySlug: p.storySlug,
      ownerName: owners[i]?.name ?? "A creative",
      raisedCents: p.raisedCents ?? 0,
    }));
  },
});

/** The member decides where this month's share goes. Writes the owed rows
 * and the pool's member_gift_out, notifies the recipient, and kicks a
 * transfer when the recipient is connected. */
export const decideGift = mutation({
  args: {
    giftId: v.id("memberGifts"),
    target: v.union(v.literal("creative"), v.literal("project"), v.literal("fund")),
    recipientUserId: v.optional(v.id("users")),
    projectId: v.optional(v.id("projects")),
    note: v.optional(v.string()),
    visible: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError({ code: "unauthenticated", reason: "Sign in first." });
    const gift = await ctx.db.get(args.giftId);
    if (!gift || gift.userId !== userId) {
      throw new ConvexError({ code: "not_found", reason: "That month's amount isn't here." });
    }

    const note = args.note?.trim() || undefined;
    const visible = args.visible ?? true;

    let recipientIsMember = false;
    let recipientProfile: Doc<"profiles"> | null = null;
    if (args.target === "creative" && args.recipientUserId) {
      const member = await getCommunityMember(ctx, gift.communityId, args.recipientUserId);
      recipientIsMember = member?.status === "active";
      recipientProfile = await profileFor(ctx, args.recipientUserId);
      if (!recipientProfile) recipientIsMember = false;
    }
    let project: Doc<"projects"> | null = null;
    if (args.target === "project" && args.projectId) {
      project = await ctx.db.get(args.projectId);
    }

    const problem = giftDecisionProblem({
      giftStatus: gift.status,
      giverUserId: String(userId),
      target: args.target,
      recipientUserId: args.recipientUserId ? String(args.recipientUserId) : undefined,
      recipientIsMember,
      projectOwnerUserId: project ? String(project.userId) : undefined,
      projectStatus: project?.status,
      projectKind: project?.kind,
      note,
    });
    if (problem) throw new ConvexError({ code: "refused", reason: problem });

    const now = Date.now();
    const giver = await profileFor(ctx, userId);
    const giverName = giver?.name ?? "A member";

    if (args.target === "fund") {
      await ctx.db.patch(gift._id, { status: "fund", decidedBy: "member", decidedAt: now });
      return { ok: true as const, target: "fund" as const };
    }

    if (args.target === "creative") {
      const recipientUserId = args.recipientUserId!;
      const row = buildAllowanceGiftPayment({
        memberGiftId: String(gift._id),
        payeeUserId: String(recipientUserId),
        giverUserId: String(userId),
        giverName,
        visible,
        amountCents: gift.amountCents,
        period: gift.period,
      });
      const dup = await ctx.db
        .query("giftPayments")
        .withIndex("by_stripeRef", (q) => q.eq("stripeRef", row.stripeRef))
        .unique();
      if (!dup) {
        await ctx.db.insert("giftPayments", {
          memberGiftId: gift._id,
          payeeUserId: recipientUserId,
          giverUserId: userId,
          giverName: row.giverName,
          visible,
          source: "allowance",
          grossCents: row.grossCents,
          platformCents: 0,
          workCents: row.workCents,
          billing: "allowance",
          stripeRef: row.stripeRef,
          period: row.period,
          createdAt: now,
        });
      }
      const out = buildMemberGiftOutContribution({
        communityId: String(gift.communityId),
        memberGiftId: String(gift._id),
        userId: String(userId),
        amountCents: gift.amountCents,
        period: gift.period,
        target: "creative",
      });
      await ctx.db.insert("grantContributions", {
        hostOrgId: gift.communityId,
        type: out.type,
        grossCents: 0,
        platformCents: 0,
        poolCents: out.poolCents,
        userId,
        memberGiftId: gift._id,
        period: out.period,
        note: out.note,
        createdAt: now,
      });
      await ctx.db.patch(gift._id, {
        status: "creative",
        decidedBy: "member",
        decidedAt: now,
        recipientUserId,
        visible,
        note,
      });
      await notifyGiftReceived(ctx, {
        payeeUserId: recipientUserId,
        giverUserId: userId,
        giverName,
        visible,
        amountCents: gift.amountCents,
        source: "allowance",
        recurring: false,
        note,
      });
      await scheduleTransferFor(ctx, recipientUserId);
      return {
        ok: true as const,
        target: "creative" as const,
        recipientUserId,
        recipientName: recipientProfile?.name ?? "them",
      };
    }

    // project
    const projectId = args.projectId!;
    const supportId = await ctx.db.insert("projectSupport", {
      projectId,
      supporterUserId: userId,
      supporterName: giverName,
      type: "financial_one_time",
      amountCents: gift.amountCents,
      message: note,
      visible,
      status: "confirmed",
      createdAt: now,
    });
    const backing = buildAllowanceBackingPayment({
      memberGiftId: String(gift._id),
      projectId: String(projectId),
      supportId: String(supportId),
      payeeUserId: String(project!.userId),
      backerUserId: String(userId),
      amountCents: gift.amountCents,
      period: gift.period,
    });
    const dup = await ctx.db
      .query("backingPayments")
      .withIndex("by_stripeRef", (q) => q.eq("stripeRef", backing.stripeRef))
      .unique();
    if (!dup) {
      await ctx.db.insert("backingPayments", {
        projectId,
        supportId,
        payeeUserId: project!.userId,
        backerUserId: userId,
        grossCents: backing.grossCents,
        platformCents: 0,
        workCents: backing.workCents,
        billing: "allowance",
        stripeRef: backing.stripeRef,
        period: backing.period,
        memberGiftId: gift._id,
        createdAt: now,
      });
      await ctx.db.patch(projectId, {
        raisedCents: (project!.raisedCents ?? 0) + gift.amountCents,
        updatedAt: now,
      });
    }
    const out = buildMemberGiftOutContribution({
      communityId: String(gift.communityId),
      memberGiftId: String(gift._id),
      userId: String(userId),
      amountCents: gift.amountCents,
      period: gift.period,
      target: "project",
    });
    await ctx.db.insert("grantContributions", {
      hostOrgId: gift.communityId,
      type: out.type,
      grossCents: 0,
      platformCents: 0,
      poolCents: out.poolCents,
      userId,
      memberGiftId: gift._id,
      period: out.period,
      note: out.note,
      createdAt: now,
    });
    await ctx.db.patch(gift._id, {
      status: "project",
      decidedBy: "member",
      decidedAt: now,
      projectId,
      supportId,
      visible,
      note,
    });
    await notifyGiftReceived(ctx, {
      payeeUserId: project!.userId,
      giverUserId: userId,
      giverName,
      visible,
      amountCents: gift.amountCents,
      source: "allowance",
      recurring: false,
      note,
      projectTitle: project!.title,
    });
    await scheduleTransferFor(ctx, project!.userId);
    return {
      ok: true as const,
      target: "project" as const,
      projectId,
      projectTitle: project!.title,
      storySlug: project!.storySlug,
    };
  },
});

/** Daily sweep: open gifts past GIFT_DEFAULT_AFTER_DAYS, or with a newer
 * gift for the same member and community, go to the fund. Nothing to write
 * on the ledger — the money never left the pool. */
export const defaultOpenGifts = internalMutation({
  args: { now: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const now = args.now ?? Date.now();
    const open = await ctx.db
      .query("memberGifts")
      .withIndex("by_status", (q) => q.eq("status", "open"))
      .take(500);
    let defaulted = 0;
    for (const g of open) {
      const newer = open.some(
        (o) =>
          o._id !== g._id &&
          String(o.userId) === String(g.userId) &&
          String(o.communityId) === String(g.communityId) &&
          o.openedAt > g.openedAt,
      );
      if (!giftDefaultDue({ openedAt: g.openedAt, now, newerGiftExists: newer })) continue;
      await ctx.db.patch(g._id, { status: "fund", decidedBy: "default", decidedAt: now });
      defaulted++;
    }
    return { scanned: open.length, defaulted };
  },
});

/** The behavior-change report (spec, "What we measure"). Operator only. */
export const getGivingReport = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError({ code: "unauthenticated" });
    const me = await profileFor(ctx, userId);
    if (!isAdminProfile(me)) {
      throw new ConvexError({ code: "forbidden", reason: "This is an operator tool — this account doesn't have that access." });
    }

    const [gifts, giftPayments, backingPayments, contributions] = await Promise.all([
      ctx.db.query("memberGifts").collect(),
      ctx.db.query("giftPayments").collect(),
      ctx.db.query("backingPayments").collect(),
      ctx.db.query("grantContributions").collect(),
    ]);

    const plusUps: PlusUpLike[] = [
      ...giftPayments
        .filter((p) => p.source === "plus_up" && p.memberGiftId)
        .map((p) => ({
          memberGiftId: String(p.memberGiftId),
          giverUserId: p.giverUserId ? String(p.giverUserId) : undefined,
          grossCents: p.grossCents,
          billing: p.billing,
        })),
      ...backingPayments
        .filter((b) => b.memberGiftId && b.billing !== "allowance")
        .map((b) => ({
          memberGiftId: String(b.memberGiftId),
          giverUserId: b.backerUserId ? String(b.backerUserId) : undefined,
          grossCents: b.grossCents,
          billing: b.billing,
        })),
      ...contributions
        .filter((c) => c.memberGiftId && c.type !== "member_gift_out")
        .map((c) => ({
          memberGiftId: String(c.memberGiftId),
          giverUserId: c.userId ? String(c.userId) : undefined,
          grossCents: c.grossCents,
          billing: c.note?.startsWith("Monthly") ? (c.stripeRef?.startsWith("ap:in_") ? "renewal" : "first") : "one_time",
        })),
    ];

    const report = computeGivingReport(
      gifts.map((g) => ({
        id: String(g._id),
        userId: String(g.userId),
        period: g.period,
        status: g.status,
        decidedBy: g.decidedBy,
        openedAt: g.openedAt,
        decidedAt: g.decidedAt,
        recipientUserId: g.recipientUserId ? String(g.recipientUserId) : undefined,
        projectId: g.projectId ? String(g.projectId) : undefined,
        amountCents: g.amountCents,
      })),
      plusUps,
    );

    const memberProfiles = await Promise.all(
      report.members.slice(0, 100).map((m) => profileFor(ctx, m.userId as Id<"users">)),
    );
    return {
      generatedAt: Date.now(),
      ...report,
      members: report.members.slice(0, 100).map((m, i) => ({
        ...m,
        name: memberProfiles[i]?.name ?? "Unknown member",
        profileId: memberProfiles[i]?._id ?? null,
      })),
    };
  },
});

/** For createGiftCheckout (garden/stripe.ts): the recipient's display name
 * and whether the gift (if any) belongs to the giver. */
export const getRecipientForCheckout = internalQuery({
  args: { recipientUserId: v.id("users"), giverUserId: v.id("users"), memberGiftId: v.optional(v.id("memberGifts")) },
  handler: async (ctx, args) => {
    if (String(args.recipientUserId) === String(args.giverUserId)) {
      return { ok: false as const, reason: "You can't back yourself." };
    }
    const [recipient, giver] = await Promise.all([
      profileFor(ctx, args.recipientUserId),
      profileFor(ctx, args.giverUserId),
    ]);
    if (!recipient) return { ok: false as const, reason: "That person isn't here." };
    if (args.memberGiftId) {
      const gift = await ctx.db.get(args.memberGiftId);
      if (!gift || String(gift.userId) !== String(args.giverUserId)) {
        return { ok: false as const, reason: "That month's amount isn't yours." };
      }
    }
    return {
      ok: true as const,
      recipientName: recipient.name,
      giverName: giver?.name ?? "A member",
    };
  },
});
