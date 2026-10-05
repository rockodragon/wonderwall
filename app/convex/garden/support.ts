// Support widget (docs/the-exchange-v1-prd.md §9, revised 2026-08-30). Four
// types in one record: financial one-time/recurring, encouragement,
// resource.
//
// Real checkout has landed for the two FINANCIAL types: the Support modal
// (app/routes/projects.tsx) now calls garden/stripe.ts's
// createBackingCheckout, which writes its projectSupport row through
// startBacking below (status "pending") and lets the Stripe webhook confirm
// it (garden/stripeHandlers.ts's handleBackingCheckoutCompleted). Money
// really moves there. supportProject stays the path for encouragement and
// resource offers — no money, real the moment they're posted — and keeps its
// original financial branch for the operator/manual lane (confirmSupport).
//
// STATUS VOCABULARY (a real, pre-existing inconsistency, named here rather
// than papered over): schema.ts documents projectSupport.status as
// "pending" | "confirmed", supportProject writes "pledged" for financial
// intent, and VISIBLE_STATUSES below reads "confirmed" | "pledged". All
// three disagree. The new backing path deliberately uses the schema's own
// pair — "pending" until Stripe confirms, then "confirmed" — so an
// abandoned checkout shows up nowhere ("pending" is in neither
// VISIBLE_STATUSES nor garden/projects.ts's confirmed-only filter). Fixing
// the older "pledged" rows is a schema-owner call, not this file's.

import { v } from "convex/values";
import { mutation, query, internalMutation } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";
import { guestBackingThrottled } from "./stripeHandlers";
import { isHidden } from "../moderationRules";

const FINANCIAL_TYPES = new Set(["financial_one_time", "financial_recurring", "financial_annual"]);
const VALID_TYPES = new Set([...FINANCIAL_TYPES, "encouragement", "resource"]);

// ——— Telling the project's owner (cheers and offers of help) ———
//
// Backings tell their owner through memberships.ts's notifyBackingConfirmed;
// cheers and offers of help used to tell nobody. The pure notice is below,
// covered by support.test.ts; the email goes in the daily one
// (supportDigest.ts).

export type SupportNotice = {
  type: "encouragement" | "help_offered";
  title: string;
  message: string;
  relatedUserId?: Id<"users">;
};

/** A cheer shows the person's name only when they ticked "Show me as a
 * supporter"; otherwise it's "Someone". */
function cheererName(profileName: string | undefined, visible: boolean): string {
  return visible ? profileName || "Someone" : "Someone";
}

/** What the project's owner is told when someone cheers them on or offers
 * help. Null for their own project (nobody needs telling about themselves),
 * for money (backings tell through notifyBackingConfirmed), and for any type
 * this file doesn't know. */
export function supportNotice(input: {
  type: string;
  supporterUserId: Id<"users">;
  supporterName?: string;
  ownerUserId: Id<"users">;
  projectTitle: string;
  visible: boolean;
  message?: string;
  resourceDescription?: string;
}): SupportNotice | null {
  if (input.supporterUserId === input.ownerUserId) return null;

  if (input.type === "encouragement") {
    return {
      type: "encouragement",
      title: `${cheererName(input.supporterName, input.visible)} cheered on ${input.projectTitle}`,
      message: input.message?.trim() ?? "",
      ...(input.visible ? { relatedUserId: input.supporterUserId } : {}),
    };
  }

  if (input.type === "resource") {
    // An offer of help is always named, whatever the box says: the owner has
    // to be able to answer it. The checkbox only governs the public page.
    return {
      type: "help_offered",
      title: `${input.supporterName || "Someone"} offered help on ${input.projectTitle}`,
      message: input.resourceDescription?.trim() ?? "",
      relatedUserId: input.supporterUserId,
    };
  }

  return null;
}

export const supportProject = mutation({
  args: {
    projectId: v.id("projects"),
    type: v.string(),
    amountCents: v.optional(v.number()),
    message: v.optional(v.string()),
    resourceDescription: v.optional(v.string()),
    visible: v.boolean(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError({ code: "unauthenticated" });

    if (!VALID_TYPES.has(args.type)) {
      throw new ConvexError({ code: "invalid_type", reason: "Not a real support type." });
    }

    const project = await ctx.db.get(args.projectId);
    if (!project) throw new ConvexError({ code: "not_found", reason: "No such project." });

    if (FINANCIAL_TYPES.has(args.type)) {
      if (!args.amountCents || args.amountCents <= 0) {
        throw new ConvexError({ code: "invalid_amount", reason: "Needs a real amount." });
      }
    }
    if (args.type === "resource" && !args.resourceDescription?.trim()) {
      throw new ConvexError({ code: "missing_description", reason: "Say what you're offering." });
    }
    if (args.type === "encouragement" && !args.message?.trim()) {
      throw new ConvexError({ code: "missing_message", reason: "Write a word of encouragement." });
    }

    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();

    const supportId = await ctx.db.insert("projectSupport", {
      projectId: args.projectId,
      supporterUserId: userId,
      supporterName: profile?.name ?? "Someone",
      type: args.type,
      amountCents: args.amountCents,
      message: args.message?.trim() || undefined,
      resourceDescription: args.resourceDescription?.trim() || undefined,
      visible: args.visible,
      // Encouragement/resource are real the moment they're posted.
      // Financial here is the legacy/manual pledge lane only — real card
      // money now goes through startBacking below ("pending" → "confirmed"),
      // never this branch. "pledged" is kept verbatim so the rows written
      // before checkout existed keep reading the same in the modal.
      // (See this file's header: schema.ts says "pending" | "confirmed";
      // this value matches neither. Named, not silently changed.)
      status: FINANCIAL_TYPES.has(args.type) ? "pledged" : "confirmed",
      createdAt: Date.now(),
    });

    // Tell the owner about a cheer or an offer of help. Same link rule as
    // notifyBackingConfirmed: the public story when there is one. The email
    // waits for the daily one (supportDigest.ts).
    const notice = supportNotice({
      type: args.type,
      supporterUserId: userId,
      supporterName: profile?.name,
      ownerUserId: project.userId,
      projectTitle: project.title,
      visible: args.visible,
      message: args.message,
      resourceDescription: args.resourceDescription,
    });
    if (notice) {
      const linkUrl = project.storySlug ? `/story/${project.storySlug}` : `/projects/${project._id}`;
      await ctx.db.insert("notifications", {
        userId: project.userId,
        ...notice,
        linkUrl,
        projectId: project._id,
        createdAt: Date.now(),
      });
    }

    return { supportId };
  },
});

// ——— Backing checkout support (garden/stripe.ts's createBackingCheckout) ———

/** Validates the project and writes the "pending" projectSupport row a
 * backing checkout will confirm, in one round trip (an action has no ctx.db
 * of its own). Returns null — never throws — when the project is gone or
 * archived, so the action can raise its own ConvexError with a reason the
 * modal can show, exactly like memberships.ts's getProductForCheckout.
 *
 * The row is written BEFORE the redirect on purpose: it's what gives the
 * webhook a row id to converge on (projectSupport has no stripeRef column),
 * and it carries the message/visibility captured at intent time. An
 * abandoned checkout leaves a "pending" row that is visible nowhere and
 * counted nowhere — that's the whole reason "pending" is the right status
 * for it.
 *
 * `userId` is absent for a guest backing (bead wonderwall-uh90): the action
 * has already resolved the guest's display name (resolveGuestSupporterName)
 * and passes it as `guestName`. Guests are capped per project per hour here
 * — this is the step that can count rows — and the project's storySlug is
 * returned so the action can send a guest back to the public story page. */
export const startBacking = internalMutation({
  args: {
    projectId: v.id("projects"),
    userId: v.optional(v.id("users")),
    guestName: v.optional(v.string()),
    amountCents: v.number(),
    recurring: v.boolean(),
    visible: v.boolean(),
    message: v.optional(v.string()),
    tierId: v.optional(v.string()),
    tierName: v.optional(v.string()),
    interval: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project || project.status === "archived" || isHidden(project)) return null;

    let supporterName: string;
    if (args.userId) {
      const userId = args.userId;
      const profile = await ctx.db
        .query("profiles")
        .withIndex("by_userId", (q) => q.eq("userId", userId))
        .unique();
      supporterName = profile?.name ?? "Someone";
    } else {
      const hourAgo = Date.now() - 60 * 60 * 1000;
      const rows = await ctx.db
        .query("projectSupport")
        .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
        .collect();
      const guestCheckoutsLastHour = rows.filter(
        (r) => r.supporterUserId === undefined && r.status === "pending" && r.createdAt >= hourAgo,
      ).length;
      if (guestBackingThrottled(guestCheckoutsLastHour)) {
        throw new ConvexError({
          reason: "A lot of people are backing this right now. Give it a minute and try again.",
        });
      }
      supporterName = args.guestName ?? "Someone";
    }

    // Resolve patron tier if provided — the tier may have been deleted
    // between page load and checkout, so a missing or wrong-project tier
    // is silently ignored (the backing still proceeds without a tier).
    let resolvedTierId: undefined | Id<"patronTiers"> = undefined;
    let resolvedTierName: string | undefined = undefined;
    if (args.tierId) {
      const tier = await ctx.db.get(args.tierId as any);
      if (tier && (tier as any).projectId === args.projectId) {
        resolvedTierId = args.tierId as any;
        resolvedTierName = (tier as any).name;
      }
    }

    const supportId = await ctx.db.insert("projectSupport", {
      projectId: args.projectId,
      supporterUserId: args.userId,
      supporterName,
      type: args.recurring ? (args.interval === "year" ? "financial_annual" : "financial_recurring") : "financial_one_time",
      amountCents: args.amountCents,
      message: args.message?.trim() || undefined,
      visible: args.visible,
      status: "pending", // → "confirmed" when Stripe says the money moved
      createdAt: Date.now(),
      ...(resolvedTierId ? { tierId: resolvedTierId, tierName: resolvedTierName } : {}),
    });

    return { supportId, supporterName, projectTitle: project.title, storySlug: project.storySlug };
  },
});

const VISIBLE_STATUSES = new Set(["confirmed", "pledged"]);

type SupportRow = {
  _id: Id<"projectSupport">;
  projectId: Id<"projects">;
  type: string;
  amountCents?: number;
  message?: string;
  resourceDescription?: string;
  status: string;
  createdAt: number;
  tierId?: Id<"patronTiers">;
  tierName?: string;
  visible: boolean;
  supporterName: string;
  supporterUserId?: Id<"users">;
};

// One supporter as anyone may see them. Explicit allowlist, not a spread:
// someone who asked to give anonymously (visible: false) must not have
// their identity reach the client at all — a masked name alone still
// leaked supporterUserId to anyone who opened the Support modal. How much
// someone gave (the amount, or a tier that implies it) is for the project
// owner only: a public "$5" next to a name shames the small backer.
export function supporterView(e: SupportRow, viewerIsOwner: boolean) {
  return {
    _id: e._id,
    projectId: e.projectId,
    type: e.type,
    message: e.message,
    resourceDescription: e.resourceDescription,
    status: e.status,
    createdAt: e.createdAt,
    supporterName: e.visible ? e.supporterName : "Anonymous",
    ...(e.visible ? { supporterUserId: e.supporterUserId } : {}),
    ...(viewerIsOwner
      ? { amountCents: e.amountCents, tierId: e.tierId, tierName: e.tierName }
      : {}),
  };
}

export const listSupportForProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const viewer = await getAuthUserId(ctx);
    const project = await ctx.db.get(args.projectId);
    const viewerIsOwner = !!viewer && project?.userId === viewer;
    const entries = await ctx.db
      .query("projectSupport")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .collect();
    return entries
      .filter((e) => VISIBLE_STATUSES.has(e.status))
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((e) => supporterView(e, viewerIsOwner));
  },
});

export const listSupportByUser = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    const entries = await ctx.db
      .query("projectSupport")
      .withIndex("by_supporterUserId", (q: any) => q.eq("supporterUserId", userId))
      .collect();

    const visible = entries
      .filter((e) => VISIBLE_STATUSES.has(e.status))
      .sort((a, b) => b.createdAt - a.createdAt);

    const projectIds = [...new Set(visible.map((e) => e.projectId))];
    const projects = new Map<string, { title: string; photoUrl?: string }>();
    for (const pid of projectIds) {
      const p = await ctx.db.get(pid);
      if (p) projects.set(String(pid), { title: p.title, photoUrl: p.photoUrl });
    }

    return visible.map((e) => ({
      _id: e._id,
      projectId: e.projectId,
      projectTitle: projects.get(String(e.projectId))?.title ?? "Untitled",
      type: e.type,
      amountCents: e.amountCents,
      message: e.message,
      status: e.status,
      createdAt: e.createdAt,
      tierId: e.tierId,
      tierName: e.tierName,
    }));
  },
});

// ——— "Support you've given" (settings → Support tab) ———
//
// PRIVATE. What a person has given is shown to that person only: the query
// below takes no userId, reads the signed-in user, and returns null when
// signed out. Nothing here feeds the public profile (profiles.getProfile) —
// the profile only carries a link to the settings tab, on the owner's own
// view.

export type SupportKind = "money" | "cheer" | "resource";
export type SupportCadence = "one_time" | "monthly" | "yearly";

/** projectSupport.type → the three things a person can give. Null for a
 * type this file doesn't know (the row is left out rather than guessed at). */
export function supportKind(type: string): SupportKind | null {
  if (FINANCIAL_TYPES.has(type)) return "money";
  if (type === "encouragement") return "cheer";
  if (type === "resource") return "resource";
  return null;
}

/** How often a money backing repeats. Null for cheers and resources. */
export function supportCadence(type: string): SupportCadence | null {
  if (type === "financial_one_time") return "one_time";
  if (type === "financial_recurring") return "monthly";
  if (type === "financial_annual") return "yearly";
  return null;
}

/** Support the person has given, as listMySupportGiven lists it and the
 * Shortlist's Backing counts it (convex/shortlist.ts): a visible status —
 * "pending" is a checkout that never finished — and a kind this file knows. */
export function isGivenSupport(row: { status: string; type: string }): boolean {
  return VISIBLE_STATUSES.has(row.status) && supportKind(row.type) !== null;
}

// grantContributions rows that are the person's own money going to a fund:
// a contribution they made, or a ticket they bought (its price lands in the
// fund). Left out on purpose: dues_share (their membership dues — Billing
// covers it, and it would add a row every month) and adjustment / topup_in /
// sponsor_in / entry_fee_in (operator-entered ledger lines, never someone's
// own payment, and they carry no userId anyway).
export function fundMoneyKind(type: string): "contribution" | "ticket" | null {
  if (type === "contribution_in") return "contribution";
  if (type === "ticket_in") return "ticket";
  return null;
}

/** What the person actually paid across a backing's payments (the first
 * charge plus every renewal), in cents — backingPayments.grossCents, "what
 * the backer paid for the backing itself". */
export function totalPaidCents(payments: { grossCents: number }[]): number {
  return payments.reduce((sum, p) => sum + p.grossCents, 0);
}

export const listMySupportGiven = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;

    // Project backings, cheers and resource offers. Same status filter as
    // listSupportByUser: a "pending" row is a checkout that never finished.
    const entries = (
      await ctx.db
        .query("projectSupport")
        .withIndex("by_supporterUserId", (q) => q.eq("supporterUserId", userId))
        .collect()
    )
      .filter(isGivenSupport)
      .sort((a, b) => b.createdAt - a.createdAt);

    const projectCache = new Map<string, { title: string; userId: Id<"users"> } | null>();
    async function projectInfo(projectId: Id<"projects">) {
      const key = String(projectId);
      if (!projectCache.has(key)) {
        const p = await ctx.db.get(projectId);
        projectCache.set(key, p ? { title: p.title, userId: p.userId } : null);
      }
      return projectCache.get(key) ?? null;
    }

    const support = await Promise.all(
      entries.map(async (e) => {
        const kind = supportKind(e.type) as SupportKind;
        const project = await projectInfo(e.projectId);
        // A monthly backer pays many times; each payment is a
        // backingPayments row keyed back to this one by supportId.
        const paid =
          kind === "money"
            ? totalPaidCents(
                await ctx.db
                  .query("backingPayments")
                  .withIndex("by_supportId", (q) => q.eq("supportId", e._id))
                  .collect(),
              )
            : 0;
        return {
          id: e._id,
          projectId: e.projectId,
          projectTitle: project?.title ?? "Removed project",
          projectGone: project === null,
          kind,
          cadence: supportCadence(e.type) ?? undefined,
          amountCents: e.amountCents,
          totalPaidCents: paid,
          status: e.status,
          tierName: e.tierName,
          message: e.message,
          resourceDescription: e.resourceDescription,
          anonymous: !e.visible,
          createdAt: e.createdAt,
        };
      }),
    );

    // Money the person put into a fund.
    const contributions = (
      await ctx.db
        .query("grantContributions")
        .withIndex("by_userId", (q) => q.eq("userId", userId))
        .collect()
    )
      .filter((c) => fundMoneyKind(c.type) !== null && c.grossCents > 0)
      .sort((a, b) => b.createdAt - a.createdAt);
    const fundCache = new Map<string, { name: string; slug: string } | null>();
    const funds = await Promise.all(
      contributions.map(async (c) => {
        const key = String(c.hostOrgId);
        if (!fundCache.has(key)) {
          const org = await ctx.db.get(c.hostOrgId);
          fundCache.set(key, org ? { name: org.name, slug: org.slug } : null);
        }
        const fund = fundCache.get(key) ?? null;
        return {
          id: c._id,
          kind: fundMoneyKind(c.type) as "contribution" | "ticket",
          fundName: fund?.name ?? "A fund",
          fundSlug: fund?.slug,
          amountCents: c.grossCents,
          note: c.note,
          createdAt: c.createdAt,
        };
      }),
    );

    // Classes, coaching and workshops they run. Archived ones are gone from
    // every list, so they are left out here too.
    const offered = (
      await ctx.db
        .query("offerings")
        .withIndex("by_userId", (q) => q.eq("userId", userId))
        .collect()
    )
      .filter((o) => o.status !== "archived")
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((o) => ({ id: o._id, title: o.title, format: o.format, createdAt: o.createdAt }));

    // Projects they are on as a team member. The lead isn't a projectMembers
    // row, but a project they own is skipped anyway; a project that has been
    // deleted can't be linked to, so it is skipped too.
    const memberships = await ctx.db
      .query("projectMembers")
      .withIndex("by_userId_status", (q) => q.eq("userId", userId).eq("status", "accepted"))
      .collect();
    const helped: {
      id: Id<"projectMembers">;
      projectId: Id<"projects">;
      projectTitle: string;
      role: string;
      createdAt: number;
    }[] = [];
    for (const m of memberships) {
      const project = await projectInfo(m.projectId);
      if (!project || project.userId === userId) continue;
      helped.push({
        id: m._id,
        projectId: m.projectId,
        projectTitle: project.title,
        role: m.role,
        createdAt: m.respondedAt ?? m.createdAt,
      });
    }
    helped.sort((a, b) => b.createdAt - a.createdAt);

    return { support, funds, offered, helped };
  },
});

// Operator-only: mark a pending financial pledge as received. No Stripe
// webhook in V1 (PRD §9) — this is the manual confirmation step.
export const confirmSupport = mutation({
  args: { supportId: v.id("projectSupport") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError({ code: "unauthenticated" });

    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    if (!profile?.isAdmin) {
      throw new ConvexError({ code: "forbidden", reason: "Operator-only." });
    }

    const entry = await ctx.db.get(args.supportId);
    if (!entry) throw new ConvexError({ code: "not_found" });
    await ctx.db.patch(args.supportId, { status: "confirmed" });
    return { ok: true };
  },
});
