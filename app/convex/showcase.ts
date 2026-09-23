// The November 6 showcase open call — the public application flow behind
// /showcase (app/routes/showcase.tsx).
//
// Why this is an OPEN CALL and not a "join the community" form: a juried
// call converts far better than a membership pitch on cold traffic. It has
// a deadline, it confers status, it costs nothing to enter, and the account
// with a portfolio is the BYPRODUCT of applying rather than the ask. See
// docs/marketing/showcase-open-call.md §1.
//
// Two steps, deliberately — the same shape waitlist.ts already uses:
//   1. `apply` takes the email alone and stores it. Nothing else is
//      required, because the email is the one thing we cannot afford to
//      lose. Instagram can delete the audience overnight; it cannot delete
//      the list. Every abandoned form still leaves us a contactable person.
//   2. `answerApplication` fills in the rest. An application that stops
//      after step 1 is still a lead, just an unrankable one.
//
// `apply` ALSO writes the email into the waitlist table, for the same
// reason: the showcase is a campaign with an end date, the waitlist is the
// standing list. An applicant who is never selected should still be
// someone we can email in January.
//
// Selection is manual. There is no scoring here on purpose — a jury of
// people reads these. `status` is the only thing an admin sets, and
// `decidedBy` records who set it.

import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { requireAdminCtx } from "./helpers";

/** Applications close at 23:59 Pacific on Thursday 2026-10-22 (=
    2026-10-23T06:59Z; still PDT, UTC-7 — DST ends 2026-11-01). The date is
    also rendered on the page — both read this constant so the copy and the
    gate cannot drift apart.

    Two weeks of collection, then two weeks to mount the show. Selection
    stays ROLLING regardless of where this date sits — applications are read
    as they arrive and decisions go out continuously, which converts better
    than one far-off deadline and keeps the promise honest if the date moves
    again. */
export const APPLICATIONS_CLOSE_AT = Date.parse("2026-10-23T06:59:00Z");

/** A deliberately permissive check: this is a marketing funnel, and a
    false negative here costs a real applicant. It rejects the obviously
    broken (no @, no dot, whitespace) and nothing else.
    Exported for showcase.test.ts — house pure-logic testing style. */
export function normalizeEmail(raw: string): string {
  const email = raw.toLowerCase().trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("That doesn't look like an email address.");
  }
  if (email.length > 254) throw new Error("That email address is too long.");
  return email;
}

/** Free-text fields are trimmed and capped rather than validated — an
    unauthenticated public endpoint should never store an unbounded string,
    but it also shouldn't lecture someone about their own bio. */
export function clamp(value: string | undefined, max: number): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, max);
}

/** An Instagram handle arrives as "@name", "name", "instagram.com/name",
    or a full profile URL with a trailing path or query, depending on where
    the applicant copied it from. Reduce all of those to the bare handle so
    the jury sheet is scannable and two forms of the same person collapse to
    one. Returns undefined for anything that reduces to nothing. */
export function normalizeInstagram(raw: string | undefined): string | undefined {
  const handle = clamp(raw, 120)
    ?.replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/^instagram\.com\//i, "")
    .replace(/^@/, "")
    // Everything from the first /, ? or # on is path or tracking, not handle.
    .replace(/[/?#].*$/, "")
    .trim();
  return handle || undefined;
}

/** Jury sheet order: applications with actual work attached first, then the
    ones the jury likes best, then newest. A bare email capture has nothing
    to read, so it sorts last however enthusiastic nobody has been about it.
    A "yes" counts double a "maybe"; a "no" doesn't subtract, because a
    single dissent shouldn't bury a piece nobody else has looked at yet. */
export type JurySortable = {
  answeredAt?: number;
  createdAt: number;
  tally: { yes: number; maybe: number; no: number };
};

export function compareForJury(a: JurySortable, b: JurySortable): number {
  if (!!a.answeredAt !== !!b.answeredAt) return a.answeredAt ? -1 : 1;
  const score = (row: JurySortable) => row.tally.yes * 2 + row.tally.maybe;
  if (score(a) !== score(b)) return score(b) - score(a);
  return b.createdAt - a.createdAt;
}

const disciplineValidator = v.union(
  v.literal("apparel"),
  v.literal("visual"),
  v.literal("music"),
  v.literal("photography"),
  v.literal("film"),
  v.literal("writing"),
  v.literal("design"),
  v.literal("other"),
);

const participationValidator = v.union(
  v.literal("exhibit"),
  v.literal("perform"),
  v.literal("vend"),
  v.literal("document"),
);

// ————— Step 1: the email —————

export const apply = mutation({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const email = normalizeEmail(args.email);
    const now = Date.now();

    // The standing list, always — see the file header. Written first and
    // separately from the application so a duplicate application never
    // costs us the list entry.
    const onWaitlist = await ctx.db
      .query("waitlist")
      .withIndex("by_email", (q) => q.eq("email", email))
      .first();
    if (!onWaitlist) {
      await ctx.db.insert("waitlist", {
        email,
        createdAt: now,
        priorityScore: 0,
        hearAboutUs: "Showcase open call",
      });
    }

    const existing = await ctx.db
      .query("showcaseApplications")
      .withIndex("by_email", (q) => q.eq("email", email))
      .first();
    if (existing) {
      // Re-applying is not an error. Someone who comes back to finish the
      // form should land on step 2, not on a rejection.
      return { alreadyApplied: true, answered: existing.answeredAt != null };
    }

    await ctx.db.insert("showcaseApplications", {
      email,
      createdAt: now,
      status: "new",
    });
    return { alreadyApplied: false, answered: false };
  },
});

// ————— Step 2: the work —————

export const answerApplication = mutation({
  args: {
    email: v.string(),
    name: v.optional(v.string()),
    city: v.optional(v.string()),
    instagram: v.optional(v.string()),
    discipline: v.optional(disciplineValidator),
    portfolioUrl: v.optional(v.string()),
    workDescription: v.optional(v.string()),
    participation: v.optional(v.array(participationValidator)),
  },
  handler: async (ctx, args) => {
    const email = normalizeEmail(args.email);
    const existing = await ctx.db
      .query("showcaseApplications")
      .withIndex("by_email", (q) => q.eq("email", email))
      .first();
    if (!existing) {
      throw new Error("We couldn't find that application. Start at step one.");
    }

    const instagram = normalizeInstagram(args.instagram);

    await ctx.db.patch(existing._id, {
      name: clamp(args.name, 120),
      city: clamp(args.city, 120),
      instagram,
      discipline: args.discipline,
      portfolioUrl: clamp(args.portfolioUrl, 500),
      workDescription: clamp(args.workDescription, 2000),
      // An empty selection is stored as undefined, not [], so "didn't
      // answer" and "answered none" don't look identical on the jury sheet.
      participation: args.participation?.length ? args.participation : undefined,
      answeredAt: Date.now(),
    });

    // Confirmation goes out on the FIRST completed application only, not on
    // every revision — someone who comes back to swap in better photos
    // shouldn't get a second "we got it." `apply` (step one) sends nothing:
    // at that point we hold an email and no work, and confirming an
    // application they haven't made yet would be a lie.
    //
    // Transactional, so no unsubscribe token and no preference lookup: this
    // is the receipt for a thing they just did. The applicant has no account
    // (that's the whole design), so this schedules the action directly with
    // an address rather than going through emailHelpers' userId path.
    if (!existing.confirmationSentAt) {
      await ctx.db.patch(existing._id, { confirmationSentAt: Date.now() });
      const firstName = clamp(args.name, 120)?.split(/\s+/)[0];
      await ctx.scheduler.runAfter(0, internal.emails.sendNotificationEmail, {
        to: email,
        subject: "We've got your showcase application",
        previewText: "Selection is rolling — you'll hear back within a few days.",
        // `heading` is plain text by the template's contract — it escapes
        // this itself, so the applicant's own name must NOT be pre-escaped.
        // `body` below is trusted HTML and interpolates nothing they typed.
        heading: firstName ? `Thanks, ${firstName}.` : "Application received.",
        body:
          `<p>Your application for the November 6 showcase is in, and a real person reads every one.</p>` +
          `<p>We review applications as they arrive rather than waiting for the deadline, so you'll hear back within a few days either way — and by October 26 at the latest.</p>` +
          `<p>Want to add or change what you sent? Just reply to this email.</p>`,
        ctaText: "See what's being made",
        ctaUrl: "/opportunities",
        category: "transactional",
      });
    }

    return { success: true };
  },
});

// ————— Public read —————

/** Applications received, for the counter on the page. A count only — no
    names, no emails, nothing that identifies an applicant. Social proof on
    an open call is worth real conversion, but not at the cost of leaking
    who applied and was passed over. Returns null below a floor so an early
    visitor doesn't read "2 applications" and assume the thing is dead; the
    page renders nothing at all in that case. */
export const publicStats = query({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("showcaseApplications").collect();
    const total = all.length;
    return {
      total: total >= 10 ? total : null,
      closesAt: APPLICATIONS_CLOSE_AT,
      isOpen: Date.now() < APPLICATIONS_CLOSE_AT,
    };
  },
});

// ————— Admin —————

/** The jury sheet. Every application, each with its vote tally, who voted
    which way, and the caller's own vote so the UI can show it selected.

    O(applications x votes) with a profile lookup per voter — fine at the
    scale this runs at (one showcase, hundreds of applications, a handful of
    admins) and not worth a denormalized counter that could drift from the
    votes themselves. */
export const adminList = query({
  args: {},
  handler: async (ctx) => {
    const me = await requireAdminCtx(ctx);

    const rows = await ctx.db.query("showcaseApplications").collect();
    const votes = await ctx.db.query("showcaseVotes").collect();

    // One profile read per DISTINCT voter, not per vote.
    const voterNames = new Map<string, string>();
    for (const userId of new Set(votes.map((vote) => vote.userId))) {
      const profile = await ctx.db
        .query("profiles")
        .withIndex("by_userId", (q) => q.eq("userId", userId))
        .first();
      voterNames.set(userId, profile?.name ?? "An admin");
    }

    const byApplication = new Map<string, typeof votes>();
    for (const vote of votes) {
      const list = byApplication.get(vote.applicationId) ?? [];
      list.push(vote);
      byApplication.set(vote.applicationId, list);
    }

    const withVotes = rows.map((row) => {
      const cast = byApplication.get(row._id) ?? [];
      return {
        ...row,
        tally: {
          yes: cast.filter((vote) => vote.vote === "yes").length,
          maybe: cast.filter((vote) => vote.vote === "maybe").length,
          no: cast.filter((vote) => vote.vote === "no").length,
        },
        votes: cast.map((vote) => ({
          userId: vote.userId,
          voter: voterNames.get(vote.userId) ?? "An admin",
          vote: vote.vote,
          note: vote.note,
        })),
        myVote: cast.find((vote) => vote.userId === me)?.vote ?? null,
      };
    });

    return withVotes.sort(compareForJury);
  },
});

/** Cast or change one admin's vote. Upsert keyed on (application, admin),
    so voting twice revises rather than stacking. Any admin may vote —
    "whoever's admin in the Garden," same gate as every other admin
    surface. */
export const castVote = mutation({
  args: {
    applicationId: v.id("showcaseApplications"),
    vote: v.union(v.literal("yes"), v.literal("maybe"), v.literal("no")),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireAdminCtx(ctx);

    const application = await ctx.db.get(args.applicationId);
    if (!application) throw new Error("That application no longer exists.");

    const existing = await ctx.db
      .query("showcaseVotes")
      .withIndex("by_application_and_user", (q) =>
        q.eq("applicationId", args.applicationId).eq("userId", userId),
      )
      .first();

    const note = clamp(args.note, 1000);
    const now = Date.now();

    if (existing) {
      await ctx.db.patch(existing._id, { vote: args.vote, note, updatedAt: now });
    } else {
      await ctx.db.insert("showcaseVotes", {
        applicationId: args.applicationId,
        userId,
        vote: args.vote,
        note,
        createdAt: now,
        updatedAt: now,
      });
    }
    return { success: true };
  },
});

/** Withdraw the caller's own vote. An admin can only clear their own —
    there is no path here to delete someone else's. */
export const clearVote = mutation({
  args: { applicationId: v.id("showcaseApplications") },
  handler: async (ctx, args) => {
    const userId = await requireAdminCtx(ctx);
    const existing = await ctx.db
      .query("showcaseVotes")
      .withIndex("by_application_and_user", (q) =>
        q.eq("applicationId", args.applicationId).eq("userId", userId),
      )
      .first();
    if (!existing) return { cleared: false };
    await ctx.db.delete(existing._id);
    return { cleared: true };
  },
});

/** The decision itself, which stays separate from the vote tally — see the
    showcaseVotes comment in schema.ts. */
export const setStatus = mutation({
  args: {
    id: v.id("showcaseApplications"),
    status: v.union(
      v.literal("new"),
      v.literal("shortlisted"),
      v.literal("selected"),
      v.literal("declined"),
    ),
  },
  handler: async (ctx, args) => {
    const adminId = await requireAdminCtx(ctx);
    await ctx.db.patch(args.id, {
      status: args.status,
      decidedAt: Date.now(),
      decidedBy: adminId,
    });
    return { success: true };
  },
});
