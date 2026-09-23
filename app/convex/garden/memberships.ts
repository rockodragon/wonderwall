// The only file that adapts stripeHandlers.ts's pure Db interface onto
// real ctx.db — plus the public/internal Convex surface for membership
// state: the webhook entry point, billing-customer bookkeeping used by
// stripe.ts's checkout action, and the client-facing getMyMembership query.
//
// NOTE (codegen): the generated DataModel in `_generated/` predates the
// Garden tables (memberships, billingCustomers, coverageCodes, hostOrgs) —
// `npx convex dev` hasn't run against this schema yet. Every ctx here is
// typed `any` and every index callback is `(q)`, exactly like
// garden/entitlements.ts, so this file doesn't fight the stale generated
// types. Once codegen catches up this can tighten to the generated types.

import { v } from "convex/values";
import { query, internalMutation, internalQuery } from "../_generated/server";
import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { auth } from "../auth";
import { internal } from "../_generated/api";
import { scheduleNotificationEmail } from "../emailHelpers";
import { escapeHtml } from "../email/template";
import {
  handleStripeEvent,
  type ClassPaymentDb,
  type Db,
  type StripeWebhookEvent,
} from "./stripeHandlers";

// ——— Backing-received email (docs/features live-booking-style pattern) ———
//
// Pure builder, same shape as gigs.ts's buildBookedEmail and projectTeam.ts's
// buildClaimEmail — subject/previewText/heading are plain text (the
// template escapes them itself), body is HTML with every user-typed value
// through escapeHtml. Covered by memberships.test.ts.

/** Class purchase notification to the teacher (memberships.ts's
 * insertClassPayment adapter). Same shape as buildBackingReceivedEmail. */
export function buildClassPurchasedEmail(input: {
  buyerName: string;
  classTitle: string;
  amountCents: number;
  linkUrl: string;
}): { subject: string; previewText: string; heading: string; body: string; ctaText: string; ctaUrl: string } {
  const name = escapeHtml(input.buyerName);
  const title = escapeHtml(input.classTitle);
  const amount = (input.amountCents / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return {
    subject: `${input.buyerName} signed up for ${input.classTitle}`,
    previewText: `${input.buyerName} signed up for ${input.classTitle} — $${amount}.`,
    heading: `${input.buyerName} signed up for ${input.classTitle}`,
    body: `<strong>${name}</strong> signed up for <strong>${title}</strong> and paid $${amount}.`,
    ctaText: "See the class",
    ctaUrl: input.linkUrl,
  };
}

export function buildBackingReceivedEmail(input: {
  supporterName: string;
  visible: boolean;
  projectTitle: string;
  amountCents: number;
  recurring: boolean;
  linkUrl: string;
}): { subject: string; previewText: string; heading: string; body: string; ctaText: string; ctaUrl: string } {
  const displayName = input.visible ? input.supporterName : "Someone";
  const name = escapeHtml(displayName);
  const title = escapeHtml(input.projectTitle);
  const amount = (input.amountCents / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const monthlyWord = input.recurring ? " a month" : "";
  return {
    subject: `${displayName} backed ${input.projectTitle}`,
    previewText: `${displayName} backed ${input.projectTitle} with $${amount}${monthlyWord}.`,
    heading: "New backing",
    body: `<strong>${name}</strong> backed <strong>${title}</strong> with $${amount}${monthlyWord}.`,
    ctaText: "See the project",
    ctaUrl: input.linkUrl,
  };
}

const ENTITLED_STATUSES = new Set(["active", "past_due"]);
const LEVEL_RANK: Record<string, number> = { seat: 1, five: 2, host: 3 };

// ——— ctx.db adapter for the pure stripeHandlers.Db interface ———

// Boundary adapter: the pure Db speaks plain strings; Convex speaks branded
// Ids. Casts live HERE and only here (the type seam). Typed to REQUIRE the
// class-payment methods, which the pure Db only lists as optional so a fake
// written before classes existed still satisfies it.
function makeConvexDb(ctx: MutationCtx): Db & ClassPaymentDb {
  return {
    async getBillingCustomerByStripeId(stripeCustomerId: string) {
      const row = await ctx.db
        .query("billingCustomers")
        .withIndex("by_stripeCustomerId", (q) => q.eq("stripeCustomerId", stripeCustomerId))
        .unique();
      return row
        ? { userId: String(row.userId), stripeCustomerId: row.stripeCustomerId, email: row.email }
        : null;
    },

    async upsertBillingCustomer(row) {
      const existing = await ctx.db
        .query("billingCustomers")
        .withIndex("by_userId", (q) => q.eq("userId", row.userId as Id<"users">))
        .unique();
      if (existing) {
        await ctx.db.patch(existing._id, {
          stripeCustomerId: row.stripeCustomerId,
          email: row.email,
        });
      } else {
        await ctx.db.insert("billingCustomers", {
          userId: row.userId as Id<"users">,
          stripeCustomerId: row.stripeCustomerId,
          email: row.email,
          createdAt: Date.now(),
        });
      }
    },

    async getMembershipBySubscription(stripeSubscriptionId: string) {
      const row = await ctx.db
        .query("memberships")
        .withIndex("by_stripeSubscriptionId", (q) =>
          q.eq("stripeSubscriptionId", stripeSubscriptionId),
        )
        .unique();
      if (!row) return null;
      return {
        id: String(row._id),
        userId: String(row.userId),
        level: row.level,
        status: row.status,
        // Optional — a seat is platform membership, not community
        // membership (community-groups.md §0); only covered/legacy rows
        // carry one.
        hostOrgId: row.hostOrgId ? String(row.hostOrgId) : undefined,
        stripeSubscriptionId: row.stripeSubscriptionId,
        stripePriceId: row.stripePriceId,
        currentPeriodEnd: row.currentPeriodEnd,
        coveredByCodeId: row.coveredByCodeId ? String(row.coveredByCodeId) : undefined,
      };
    },

    async upsertMembership(row) {
      const existing = await ctx.db
        .query("memberships")
        .withIndex("by_stripeSubscriptionId", (q) =>
          q.eq("stripeSubscriptionId", row.stripeSubscriptionId),
        )
        .unique();
      const patch = {
        userId: row.userId as Id<"users">,
        level: row.level,
        status: row.status,
        hostOrgId: row.hostOrgId as Id<"hostOrgs"> | undefined,
        stripeSubscriptionId: row.stripeSubscriptionId,
        stripePriceId: row.stripePriceId,
        currentPeriodEnd: row.currentPeriodEnd,
        coveredByCodeId: row.coveredByCodeId as Id<"coverageCodes"> | undefined,
        updatedAt: Date.now(),
      };
      if (existing) {
        await ctx.db.patch(existing._id, patch);
      } else {
        await ctx.db.insert("memberships", { ...patch, createdAt: Date.now() });
      }
    },

    async getCodeBySubscription(stripeSubscriptionId: string) {
      const row = await ctx.db
        .query("coverageCodes")
        .withIndex("by_stripeSubscriptionId", (q) =>
          q.eq("stripeSubscriptionId", stripeSubscriptionId),
        )
        .unique();
      if (!row) return null;
      return {
        hostOrgId: String(row.hostOrgId),
        code: row.code,
        seats: row.seats,
        stripeSubscriptionId: row.stripeSubscriptionId,
        status: row.status,
      };
    },

    async updateCode(stripeSubscriptionId: string, patch) {
      const existing = await ctx.db
        .query("coverageCodes")
        .withIndex("by_stripeSubscriptionId", (q) =>
          q.eq("stripeSubscriptionId", stripeSubscriptionId),
        )
        .unique();
      if (!existing) return;
      await ctx.db.patch(existing._id, patch);
    },

    async upsertTicketPurchase(row) {
      const existing = await ctx.db
        .query("ticketPurchases")
        .withIndex("by_stripeSessionId", (q) =>
          q.eq("stripeSessionId", row.stripeSessionId),
        )
        .unique();
      const patch = {
        eventId: row.eventId as Id<"events">,
        tierName: row.tierName,
        amountCents: row.amountCents,
        buyerEmail: row.buyerEmail,
        userId: row.userId as Id<"users"> | undefined,
        stripeSessionId: row.stripeSessionId,
        status: row.status,
        // Where this dollar settled (garden/ticketRouting.ts). Comes from
        // the checkout session's metadata, so it records what the checkout
        // decided rather than what the event says now.
        beneficiaryHostOrgId: row.beneficiaryHostOrgId as
          | Id<"hostOrgs">
          | undefined,
        destinationAccountId: row.destinationAccountId,
        beneficiaryTaxStatus: row.beneficiaryTaxStatus,
      };
      const isNew = !existing;
      if (existing) {
        await ctx.db.patch(existing._id, patch);
      } else {
        await ctx.db.insert("ticketPurchases", { ...patch, createdAt: Date.now() });
      }

      // The ticket itself. Sent once, on the insert only — Stripe retries
      // checkout.session.completed, and a buyer getting four copies of their
      // ticket is the most visible possible way to look amateur. Guests have
      // no account, so this goes to the address Stripe collected.
      if (isNew && row.buyerEmail) {
        const event = await ctx.db.get(row.eventId as Id<"events">);
        if (event) {
          await ctx.scheduler.runAfter(0, internal.emails.sendNotificationEmail, {
            to: row.buyerEmail,
            subject: `Your ticket — ${event.title}`,
            previewText: "You're in. Here are the details.",
            heading: "You're in.",
            body:
              `<p>You have a <strong>${escapeHtml(row.tierName)}</strong> ticket to ` +
              `<strong>${escapeHtml(event.title)}</strong>.</p>` +
              `<p>${escapeHtml(formatEventWhen(event.datetime))}` +
              (event.location ? `<br>${escapeHtml(event.location)}` : "") +
              `</p><p>This email is your ticket — bring it on your phone.</p>`,
            ctaText: "See the event",
            ctaUrl: `/events/${String(event._id)}`,
            category: "transactional",
          });
        }
      }
    },

    async getHostOrgIdBySlug(slug: string) {
      const row = await ctx.db
        .query("hostOrgs")
        .withIndex("by_slug", (q) => q.eq("slug", slug))
        .unique();
      return row ? String(row._id) : null;
    },

    async getContributionByStripeRef(stripeRef: string) {
      const row = await ctx.db
        .query("grantContributions")
        .withIndex("by_stripeRef", (q) => q.eq("stripeRef", stripeRef))
        .unique();
      return row ? { stripeRef: row.stripeRef as string } : null;
    },

    async insertContribution(row) {
      await ctx.db.insert("grantContributions", {
        hostOrgId: row.hostOrgId as Id<"hostOrgs">,
        type: row.type,
        grossCents: row.grossCents,
        platformCents: row.platformCents,
        poolCents: row.poolCents,
        userId: row.userId as Id<"users"> | undefined,
        payerName: row.payerName,
        membershipId: row.membershipId as Id<"memberships"> | undefined,
        stripeRef: row.stripeRef,
        period: row.period,
        note: row.note,
        createdAt: Date.now(),
      });
    },

    async getProductPurchaseByRef(stripeRef: string) {
      const row = await ctx.db
        .query("productPurchases")
        .withIndex("by_stripeRef", (q) => q.eq("stripeRef", stripeRef))
        .unique();
      return row ? { stripeRef: row.stripeRef as string } : null;
    },

    async insertProductPurchase(row) {
      const now = Date.now();
      await ctx.db.insert("productPurchases", {
        productId: row.productId as Id<"communityProducts">,
        hostOrgId: row.hostOrgId as Id<"hostOrgs">,
        userId: row.userId as Id<"users"> | undefined,
        buyerEmail: row.buyerEmail,
        grossCents: row.grossCents,
        platformCents: row.platformCents,
        hostCents: row.hostCents,
        billing: row.billing,
        status: row.status,
        stripeRef: row.stripeRef,
        stripeSubscriptionId: row.stripeSubscriptionId,
        currentPeriodEnd: row.currentPeriodEnd,
        period: row.period,
        createdAt: now,
        updatedAt: now,
      });
    },

    async getProjectSupportById(supportId: string) {
      const row = await ctx.db.get(supportId as Id<"projectSupport">);
      return row
        ? { id: String(row._id), status: row.status, amountCents: row.amountCents ?? 0, projectId: String(row.projectId) }
        : null;
    },

    async updateProjectSupport(supportId: string, patch) {
      const existing = await ctx.db.get(supportId as Id<"projectSupport">);
      if (!existing) return; // row deleted between checkout and webhook — no-op
      await ctx.db.patch(supportId as Id<"projectSupport">, patch);
    },

    async insertProjectSupport(row) {
      const id = await ctx.db.insert("projectSupport", {
        projectId: row.projectId as Id<"projects">,
        supporterUserId: row.supporterUserId as Id<"users"> | undefined,
        supporterName: row.supporterName,
        type: row.type,
        amountCents: row.amountCents,
        message: row.message,
        visible: row.visible,
        status: row.status,
        createdAt: Date.now(),
      });
      return String(id);
    },

    async incrementProjectRaisedCents(projectId: string, amountCents: number) {
      const project = await ctx.db.get(projectId as Id<"projects">);
      if (!project) return;
      await ctx.db.patch(projectId as Id<"projects">, {
        raisedCents: (project.raisedCents ?? 0) + amountCents,
        updatedAt: Date.now(),
      });
    },

    async getBackingPaymentByRef(stripeRef: string) {
      const row = await ctx.db
        .query("backingPayments")
        .withIndex("by_stripeRef", (q) => q.eq("stripeRef", stripeRef))
        .unique();
      return row ? { stripeRef: row.stripeRef } : null;
    },

    async insertBackingPayment(row) {
      await ctx.db.insert("backingPayments", {
        projectId: row.projectId as Id<"projects">,
        supportId: row.supportId as Id<"projectSupport"> | undefined,
        payeeUserId: row.payeeUserId as Id<"users"> | undefined,
        backerUserId: row.backerUserId as Id<"users"> | undefined,
        grossCents: row.grossCents,
        platformCents: row.platformCents,
        workCents: row.workCents,
        billing: row.billing,
        stripeRef: row.stripeRef,
        period: row.period,
        createdAt: Date.now(),
      });
    },

    async getProjectLeadUserId(projectId: string) {
      const id = ctx.db.normalizeId("projects", projectId);
      const project = id ? await ctx.db.get(id) : null;
      return project ? String(project.userId) : null;
    },

    async notifyBackingConfirmed(args) {
      const project = await ctx.db.get(args.projectId as Id<"projects">);
      if (!project) return;
      // Never notify a creator about their own backing.
      if (args.backerUserId && String(args.backerUserId) === String(project.userId)) return;

      const displayName = args.visible ? args.supporterName : "Someone";
      const amount = (args.amountCents / 100).toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
      const monthlyWord = args.recurring ? " a month" : "";
      const linkUrl = project.storySlug ? `/story/${project.storySlug}` : `/projects/${project._id}`;

      await ctx.db.insert("notifications", {
        userId: project.userId,
        type: "backing_received",
        title: `${displayName} backed ${project.title}`,
        message: `$${amount}${monthlyWord}`,
        linkUrl,
        relatedUserId: args.backerUserId as Id<"users"> | undefined,
        createdAt: Date.now(),
      });

      await scheduleNotificationEmail(ctx, {
        userId: project.userId,
        category: "activity",
        ...buildBackingReceivedEmail({
          supporterName: args.supporterName,
          visible: args.visible,
          projectTitle: project.title,
          amountCents: args.amountCents,
          recurring: args.recurring,
          linkUrl,
        }),
      });
    },

    async getClassPaymentByRef(stripeRef: string) {
      const row = await ctx.db
        .query("classPayments")
        .withIndex("by_stripeRef", (q) => q.eq("stripeRef", stripeRef))
        .unique();
      return row ? { stripeRef: row.stripeRef } : null;
    },

    async insertClassPayment(row) {
      await ctx.db.insert("classPayments", {
        offeringId: row.offeringId as Id<"offerings">,
        payeeUserId: row.payeeUserId as Id<"users"> | undefined,
        buyerUserId: row.buyerUserId as Id<"users">,
        grossCents: row.grossCents,
        platformCents: row.platformCents,
        teacherCents: row.teacherCents,
        stripeRef: row.stripeRef,
        period: row.period,
        createdAt: Date.now(),
      });

      // Notify the host — skip when the host is the buyer (shouldn't happen;
      // classCheckoutRefusal's "own_class" refuses that checkout, but this
      // stays defensive) and when the offering has no resolvable teacher.
      if (row.payeeUserId && String(row.payeeUserId) !== String(row.buyerUserId)) {
        const offering = await ctx.db.get(row.offeringId as Id<"offerings">);
        const buyerProfile = await ctx.db
          .query("profiles")
          .withIndex("by_userId", (q) => q.eq("userId", row.buyerUserId as Id<"users">))
          .unique();
        const buyerName = buyerProfile?.name || "Someone";
        const classTitle = offering?.title ?? "your class";
        const linkUrl = `/offerings/${row.offeringId}`;

        await ctx.db.insert("notifications", {
          userId: row.payeeUserId as Id<"users">,
          type: "class_purchased",
          title: `${buyerName} signed up for ${classTitle}`,
          message: `$${(row.grossCents / 100).toLocaleString("en-US", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}`,
          linkUrl,
          relatedUserId: row.buyerUserId as Id<"users">,
          createdAt: Date.now(),
        });

        await scheduleNotificationEmail(ctx, {
          userId: row.payeeUserId as Id<"users">,
          category: "activity",
          ...buildClassPurchasedEmail({
            buyerName,
            classTitle,
            amountCents: row.grossCents,
            linkUrl,
          }),
        });
      }
    },

    async getOfferingTeacherUserId(offeringId: string) {
      const id = ctx.db.normalizeId("offerings", offeringId);
      const offering = id ? await ctx.db.get(id) : null;
      return offering ? String(offering.userId) : null;
    },

    async confirmOfferingSignup(offeringId: string, userId: string) {
      const id = ctx.db.normalizeId("offerings", offeringId);
      if (!id) return;
      const existing = await ctx.db
        .query("offeringSignups")
        .withIndex("by_offeringId_userId", (q) =>
          q.eq("offeringId", id).eq("userId", userId as Id<"users">),
        )
        .unique();
      if (existing) {
        if (existing.status !== "confirmed") await ctx.db.patch(existing._id, { status: "confirmed" });
        return;
      }
      // Row gone (or never written): create it, but not for a class that no
      // longer exists — that sign-up would point at nothing.
      if (!(await ctx.db.get(id))) return;
      const profile = await ctx.db
        .query("profiles")
        .withIndex("by_userId", (q) => q.eq("userId", userId as Id<"users">))
        .unique();
      await ctx.db.insert("offeringSignups", {
        offeringId: id,
        userId: userId as Id<"users">,
        name: profile?.name ?? "Someone",
        status: "confirmed",
        createdAt: Date.now(),
      });
    },

    async getCodeByCode(code: string) {
      const row = await ctx.db
        .query("coverageCodes")
        .withIndex("by_code", (q) => q.eq("code", code))
        .unique();
      return row ? { code: row.code } : null;
    },

    async insertCoverageCode(row) {
      await ctx.db.insert("coverageCodes", {
        hostOrgId: row.hostOrgId as Id<"hostOrgs">,
        code: row.code,
        seats: row.seats,
        stripeSubscriptionId: row.stripeSubscriptionId,
        status: row.status,
        createdAt: Date.now(),
      });
    },

    async updateProductPurchasesBySubscription(stripeSubscriptionId, patch) {
      const rows = await ctx.db
        .query("productPurchases")
        .withIndex("by_stripeSubscriptionId", (q) =>
          q.eq("stripeSubscriptionId", stripeSubscriptionId),
        )
        .collect();
      const updatedAt = Date.now();
      for (const row of rows) {
        await ctx.db.patch(row._id, { ...patch, updatedAt });
      }
    },
  };
}

// ——— Webhook entry point (called from http.ts after signature verification) ———

/** "Friday, November 6 · 7:00 PM PT" for a ticket email. Pacific because
    every event this platform runs is, and a ticket that says a time in the
    server's zone is worse than one with no time at all. */
function formatEventWhen(ms: number): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Los_Angeles",
    timeZoneName: "short",
  }).format(new Date(ms));
}

export const applyStripeEvent = internalMutation({
  args: { event: v.any() },
  handler: async (ctx, args) => {
    const event = args.event as StripeWebhookEvent; // v.any() boundary — cast once here
    const db = makeConvexDb(ctx);
    await handleStripeEvent(event, db);
  },
});

// ——— Billing-customer bookkeeping used by stripe.ts's checkout action
//      (actions have no ctx.db — they call these via ctx.runQuery/runMutation) ———

export const getBillingCustomerForUser = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return ctx.db
      .query("billingCustomers")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .unique();
  },
});

/** The /coverage/success page's lookup, via garden/stripe.ts's
 * getCoverageBySession action: the code the webhook issued against this
 * subscription, plus the sponsoring org's name for the confirmation line. */
export const getCoverageCodeBySubscription = internalQuery({
  args: { stripeSubscriptionId: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("coverageCodes")
      .withIndex("by_stripeSubscriptionId", (q) =>
        q.eq("stripeSubscriptionId", args.stripeSubscriptionId),
      )
      .unique();
    if (!row) return null;
    const org = await ctx.db.get(row.hostOrgId);
    return { code: row.code, seats: row.seats, orgName: org?.name ?? null };
  },
});

export const saveBillingCustomer = internalMutation({
  args: { userId: v.id("users"), stripeCustomerId: v.string(), email: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const db = makeConvexDb(ctx);
    await db.upsertBillingCustomer(args);
  },
});

// Used by stripe.ts's createPoolContributionCheckout (a "use node" action,
// no ctx.db of its own) to resolve which pool a one-time contribution
// targets and validate its kind before building the Stripe session.
export const getHostOrgBySlug = internalQuery({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    return ctx.db
      .query("hostOrgs")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();
  },
});

// Used by stripe.ts's createCoverageCheckout (a "use node" action, no
// ctx.db of its own) to confirm the sponsoring org exists before building a
// seat subscription for it. Returns only what the action needs for the
// Stripe product line — never the whole row.
export const getHostOrgForCoverage = internalQuery({
  args: { hostOrgId: v.id("hostOrgs") },
  handler: async (ctx, args) => {
    const org = await ctx.db.get(args.hostOrgId);
    if (!org) return null;
    return { _id: org._id, name: org.name, slug: org.slug, kind: org.kind, status: org.status };
  },
});

// Used by stripe.ts's createProductCheckout (a "use node" action, no
// ctx.db of its own) to load a community product + its host org in one
// round trip before building the Stripe session. Null when either side is
// missing — never partial data the action would have to null-check twice.
export const getProductForCheckout = internalQuery({
  args: { productId: v.id("communityProducts") },
  handler: async (ctx, args) => {
    const product = await ctx.db.get(args.productId);
    if (!product) return null;
    const org = await ctx.db.get(product.hostOrgId);
    if (!org) return null;
    return {
      product: {
        _id: product._id,
        hostOrgId: product.hostOrgId,
        name: product.name,
        priceCents: product.priceCents,
        billing: product.billing,
        status: product.status,
      },
      org: {
        _id: org._id,
        slug: org.slug,
        name: org.name,
        kind: org.kind,
        status: org.status,
      },
    };
  },
});

// ——— Client-facing query ———

export const getMyMembership = query({
  args: {},
  handler: async (ctx) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) return null;

    const rows = await ctx.db
      .query("memberships")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect();

    let best: any = null;
    let bestRank = 0;
    for (const row of rows) {
      if (!ENTITLED_STATUSES.has(row.status)) continue;
      const rank = LEVEL_RANK[row.level] ?? 0;
      if (rank > bestRank) {
        bestRank = rank;
        best = row;
      }
    }
    return best;
  },
});

// Reconcile support: the nightly cron (garden/stripe.ts, "use node", lists
// Stripe subscriptions) calls `applyStripeEvent` above once per subscription
// with a synthetic "customer.subscription.updated" event — the exact same
// mutation and code path as the real webhook, so the backstop can't drift
// from the primary path by construction.
