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
import { requireAdminCtx } from "./helpers";

/** Applications close at 23:59 Pacific on 2026-10-30 (= 2026-10-31T06:59Z;
    still PDT, UTC-7 — DST ends 2026-11-01). The date is also rendered on
    the page — both read this constant so the copy and the gate cannot
    drift apart.

    Deliberately late: a longer window maximizes total applications, which
    is the point of the whole call. The cost is that it leaves only seven
    days to the show, so selection is ROLLING — applications are read as
    they arrive and decisions go out continuously, rather than everything
    waiting on this date. The page says so; if this date moves again, the
    rolling language has to hold or applicants get told they've been
    selected after the night they were selected for. */
export const APPLICATIONS_CLOSE_AT = Date.parse("2026-10-31T06:59:00Z");

/** A deliberately permissive check: this is a marketing funnel, and a
    false negative here costs a real applicant. It rejects the obviously
    broken (no @, no dot, whitespace) and nothing else. */
function normalizeEmail(raw: string): string {
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
function clamp(value: string | undefined, max: number): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, max);
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

    // An Instagram handle arrives as "@name", "name", or a full profile URL
    // depending on where the person copied it from. Store the bare handle so
    // the jury sheet is scannable and two forms of the same person collapse.
    const instagram = clamp(args.instagram, 120)
      ?.replace(/^https?:\/\/(www\.)?instagram\.com\//i, "")
      .replace(/^@/, "")
      .replace(/\/.*$/, "");

    await ctx.db.patch(existing._id, {
      name: clamp(args.name, 120),
      city: clamp(args.city, 120),
      instagram: instagram || undefined,
      discipline: args.discipline,
      portfolioUrl: clamp(args.portfolioUrl, 500),
      workDescription: clamp(args.workDescription, 2000),
      // An empty selection is stored as undefined, not [], so "didn't
      // answer" and "answered none" don't look identical on the jury sheet.
      participation: args.participation?.length ? args.participation : undefined,
      answeredAt: Date.now(),
    });
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

export const adminList = query({
  args: {},
  handler: async (ctx) => {
    await requireAdminCtx(ctx);
    const rows = await ctx.db.query("showcaseApplications").collect();
    // Completed applications first, then newest — the jury reads the ones
    // with actual work attached before the bare email captures.
    return rows.sort((a, b) => {
      if (!!a.answeredAt !== !!b.answeredAt) return a.answeredAt ? -1 : 1;
      return b.createdAt - a.createdAt;
    });
  },
});

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
