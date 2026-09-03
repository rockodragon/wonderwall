// Operator seeding (idempotent). Run any of:
//   npx convex run garden/devSeed:seedHostOrg
//   npx convex run garden/devSeed:seedDevWorld
//   npx convex run garden/devSeed:seedApOrg [--prod]
//   npx convex run garden/devSeed:seedLaunchTables [--prod]
//   npx convex run garden/devSeed:seedFirstTableEvent '{"organizerUserId":"..."}' [--prod]
//   npx convex run garden/devSeed:seedCommunityLaunch [--prod]
// seedCommunityLaunch is the step-0 exit seed (docs/runbooks/step-0-go-live.md):
// it ensures the creatives.exchange platform row, re-kinds/patches
// "the-garden" to a community, and ensures "abiding-practice", all in one
// idempotent call — prefer it over seedHostOrg on a fresh deployment.
import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { COMMUNITY_KIND, PLATFORM_ORG_SLUG } from "./communities";

// Kept working for existing callers/scripts, but now creates "the-garden"
// as a community (not the platform default) with the same defaults
// seedCommunityLaunch uses — so a fresh deployment never gets a platform-
// kinded "the-garden" row, however it's seeded.
export const seedHostOrg = internalMutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db
      .query("hostOrgs")
      .withIndex("by_slug", (q) => q.eq("slug", "the-garden"))
      .unique();
    if (existing) return { ok: true, existed: true, id: existing._id };
    const id = await ctx.db.insert("hostOrgs", {
      name: "The Garden",
      slug: "the-garden",
      kind: COMMUNITY_KIND,
      tagline: "Kingdom creatives",
      status: "active",
      visibility: "public",
      joinPolicy: "open",
      createdAt: Date.now(),
    });
    return { ok: true, existed: false, id };
  },
});

// ————— Full dev-world seed (idempotent; dev deployment only by usage) —————
// Creates the demo cast as real rows so every Garden surface has data:
// users/profiles, memberships, projects w/ story slugs, a table w/ sessions,
// a coverage code, allocations, story updates. Run:
//   npx convex run garden/devSeed:seedDevWorld

export const seedDevWorld = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const out: Record<string, unknown> = {};

    const org = await ctx.db
      .query("hostOrgs")
      .withIndex("by_slug", (q) => q.eq("slug", "the-garden"))
      .unique();
    if (!org) throw new Error("Run garden/devSeed:seedHostOrg first — 'the-garden' hostOrg missing.");
    let apOrg = await ctx.db
      .query("hostOrgs")
      .withIndex("by_slug", (q) => q.eq("slug", "abiding-practice"))
      .unique();
    if (!apOrg) {
      const id = await ctx.db.insert("hostOrgs", {
        name: "Abiding Practice",
        slug: "abiding-practice",
        kind: "org",
        givingUrl: "https://abidingpractice.org/give",
        createdAt: now,
      });
      apOrg = await ctx.db.get(id);
    }
    if (!apOrg) throw new Error("hostOrgs insert failed unexpectedly.");

    async function ensureUser(name: string, email: string, extra: Record<string, unknown> = {}) {
      const existing = await ctx.db
        .query("profiles")
        .withIndex("by_name", (q) => q.eq("name", name))
        .first();
      if (existing) return { userId: existing.userId, profileId: existing._id };
      const userId = await ctx.db.insert("users", { name, email });
      const profileId = await ctx.db.insert("profiles", {
        userId,
        name,
        interests: ["Musician"],
        createdAt: now,
        updatedAt: now,
        ...extra,
      });
      return { userId, profileId };
    }

    const shua = await ensureUser("Shua (dev)", "shua@dev.garden");
    const marcus = await ensureUser("Marcus Reyes (dev)", "marcus@dev.garden");
    const diane = await ensureUser("Diane Okafor (dev)", "diane@dev.garden", { patronRole: true });
    out.users = { shua: shua.userId, marcus: marcus.userId, diane: diane.userId };

    // Coverage code (fake sub id — Stripe wiring comes later; dev only)
    let code = await ctx.db
      .query("coverageCodes")
      .withIndex("by_code", (q) => q.eq("code", "GRACE-FALL"))
      .unique();
    if (!code) {
      const id = await ctx.db.insert("coverageCodes", {
        hostOrgId: apOrg._id,
        code: "GRACE-FALL",
        seats: 10,
        stripeSubscriptionId: "sub_dev_coverage",
        status: "active",
        createdAt: now,
      });
      code = await ctx.db.get(id);
    }
    if (!code) throw new Error("coverageCodes insert failed unexpectedly.");

    // Shua: covered seat
    const shuaMemberships = await ctx.db
      .query("memberships")
      .withIndex("by_userId", (q) => q.eq("userId", shua.userId))
      .collect();
    if (shuaMemberships.length === 0) {
      await ctx.db.insert("memberships", {
        userId: shua.userId,
        level: "seat",
        status: "active",
        hostOrgId: org._id,
        stripeSubscriptionId: "sub_dev_coverage",
        coveredByCodeId: code._id,
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("coverageRedemptions", {
        codeId: code._id,
        userId: shua.userId,
        redeemedAt: now,
      });
    }
    // Marcus: host tier
    const marcusMemberships = await ctx.db
      .query("memberships")
      .withIndex("by_userId", (q) => q.eq("userId", marcus.userId))
      .collect();
    if (marcusMemberships.length === 0) {
      await ctx.db.insert("memberships", {
        userId: marcus.userId,
        level: "host",
        status: "active",
        hostOrgId: org._id,
        stripeSubscriptionId: "sub_dev_marcus",
        createdAt: now,
        updatedAt: now,
      });
    }

    // Shua's passion project + story updates
    let psalms = await ctx.db
      .query("projects")
      .withIndex("by_storySlug", (q) => q.eq("storySlug", "psalms-for-the-2am"))
      .unique();
    if (!psalms) {
      const id = await ctx.db.insert("projects", {
        userId: shua.userId,
        kind: "passion",
        title: "Psalms for the 2AM",
        blurb: "Five songs for the hours nobody writes worship music about.",
        goal: 500,
        raisedCents: 34000,
        status: "active",
        storySlug: "psalms-for-the-2am",
        createdAt: now,
        updatedAt: now,
      });
      psalms = await ctx.db.get(id);
      await ctx.db.insert("storyUpdates", {
        projectId: id,
        authorUserId: shua.userId,
        body: "Tracking day one — the back room at Folded Note. Two songs down.",
        createdAt: now,
      });
      await ctx.db.insert("allocations", {
        hostOrgId: apOrg._id,
        projectId: id,
        recipientName: "Shua",
        amountCents: 50000,
        period: "2026-08 · monthly",
        note: "Fellowship",
        createdAt: now,
      });
    }

    // Marcus's table + two sessions
    let table = await ctx.db
      .query("gardenTables")
      .withIndex("by_slug", (q) => q.eq("slug", "third-thursday"))
      .unique();
    if (!table) {
      const id = await ctx.db.insert("gardenTables", {
        name: "Third Thursday Songwriters",
        slug: "third-thursday",
        hostOrgId: org._id,
        hostUserId: marcus.userId,
        mode: "open",
        format: "Open mic",
        cadence: "3rd Thursdays",
        status: "active",
        createdAt: now,
      });
      table = await ctx.db.get(id);
      const week = 7 * 24 * 3600 * 1000;
      await ctx.db.insert("tableSessions", {
        tableId: id,
        startsAt: now + week,
        durationMins: 90,
        meetingUrl: "https://garden.daily.co/third-thursday-dev",
        createdAt: now,
      });
      await ctx.db.insert("tableSessions", {
        tableId: id,
        startsAt: now + 5 * week,
        durationMins: 90,
        createdAt: now,
      });
      await ctx.db.insert("tableMemberships", {
        tableId: id,
        userId: shua.userId,
        joinedAt: now,
      });
    }

    // The first platform event (guest-RSVP target)
    const existingEvent = await ctx.db
      .query("events")
      .withIndex("by_organizerId", (q) => q.eq("organizerId", marcus.userId))
      .first();
    if (!existingEvent) {
      await ctx.db.insert("events", {
        organizerId: marcus.userId,
        title: "A table for the ones making things (dev)",
        description: "An evening for San Diego creatives and the people who back them.",
        datetime: now + 30 * 24 * 3600 * 1000,
        location: "San Diego",
        tags: [],
        requiresApproval: false,
        status: "published",
        createdAt: now,
        updatedAt: now,
      });
    }

    out.ok = true;
    return out;
  },
});

// Prod-safe: real org config only (no fake users/projects). Run on any
// deployment: npx convex run garden/devSeed:seedApOrg [--prod]
export const seedApOrg = internalMutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db
      .query("hostOrgs")
      .withIndex("by_slug", (q) => q.eq("slug", "abiding-practice"))
      .unique();
    if (existing) return { ok: true, existed: true };
    await ctx.db.insert("hostOrgs", {
      name: "Abiding Practice",
      slug: "abiding-practice",
      kind: "org",
      givingUrl: "https://abidingpractice.org/give",
      createdAt: Date.now(),
    });
    return { ok: true, existed: false };
  },
});

// Prod-safe: the two REAL launch tables (actual partner programs, honest
// TBDs, zero roster). Run: npx convex run garden/devSeed:seedLaunchTables --prod
export const seedLaunchTables = internalMutation({
  args: {},
  handler: async (ctx) => {
    const garden = await ctx.db
      .query("hostOrgs")
      .withIndex("by_slug", (q) => q.eq("slug", "the-garden"))
      .unique();
    const ap = await ctx.db
      .query("hostOrgs")
      .withIndex("by_slug", (q) => q.eq("slug", "abiding-practice"))
      .unique();
    if (!garden || !ap) throw new Error("Seed hostOrgs first.");
    const now = Date.now();
    const results: string[] = [];
    for (const t of [
      {
        name: "Pathfinding — Fall Cohort",
        slug: "pathfinding-fall",
        hostOrgId: ap._id,
        mode: "cohort",
        format: "Class",
        program: "Pathfinding · Abiding Practice",
        cadence: "8 weeks · starts this fall · dates landing soon",
        blurb:
          "A season of spiritual creative formation with Abiding Practice — ending at the October showcase.",
        status: "active",
        createdAt: now,
      },
      {
        name: "Table Art Society",
        slug: "table-art-society",
        hostOrgId: garden._id,
        mode: "open",
        format: "Critique",
        cadence: "Monthly · San Diego · next date landing soon",
        blurb: "Working creatives around an actual table — bring a piece, leave with direction.",
        status: "active",
        createdAt: now,
      },
    ]) {
      const existing = await ctx.db
        .query("gardenTables")
        .withIndex("by_slug", (q) => q.eq("slug", t.slug))
        .unique();
      if (!existing) {
        await ctx.db.insert("gardenTables", t);
        results.push(t.slug);
      }
    }
    return { created: results };
  },
});

/** Publishes the first-table event as a REAL event row so the guest-RSVP
 * form replaces the mailto on the static /events/first-table page.
 * Details are intentionally the honest TBDs already published there; edit
 * them in the app once the date and venue are set (beads wonderwall-dne).
 * Idempotent by title. Run:
 *   npx convex run garden/devSeed:seedFirstTableEvent '{"organizerUserId":"..."}' --prod
 */
export const seedFirstTableEvent = internalMutation({
  args: { organizerUserId: v.id("users") },
  handler: async (ctx, args) => {
    const title = "A table for the ones making things";
    const existing = await ctx.db
      .query("events")
      .withIndex("by_status", (q) => q.eq("status", "published"))
      .collect();
    const already = existing.find((e) => e.title === title);
    if (already) return { ok: true, existed: true, eventId: already._id };

    const now = Date.now();
    // A Thursday this September — placeholder until the real date lands.
    const september = new Date("2026-09-24T19:00:00-07:00").getTime();
    const eventId = await ctx.db.insert("events", {
      organizerId: args.organizerUserId,
      title,
      description:
        "An evening for San Diego creatives and the people who support them — a real conversation about funding each other's work, hosted around an actual table. Bring something you made, or just bring your questions. Nobody performs; everybody shows.",
      datetime: september,
      location: "San Diego — venue being set",
      locationType: "city",
      tags: ["Garden"],
      requiresApproval: false,
      status: "published",
      createdAt: now,
      updatedAt: now,
    });
    return { ok: true, existed: false, eventId };
  },
});

// Step 0 exit seed (docs/runbooks/step-0-go-live.md, §4): the platform row,
// The Garden as the first community (not the platform default), and the
// Abiding Practice org — the three `hostOrgs` rows every deployment needs
// before checkout and the community routes work. Idempotent; safe on any
// deployment. Run:
//   npx convex run garden/devSeed:seedCommunityLaunch
//   npx convex run garden/devSeed:seedCommunityLaunch --prod
export const seedCommunityLaunch = internalMutation({
  // hostEmails: who runs The Garden. Defaults to every admin profile, so
  // the operator's own account becomes the first host with no extra step.
  //   npx convex run garden/devSeed:seedCommunityLaunch '{"hostEmails":["rick@example.com"]}'
  args: { hostEmails: v.optional(v.array(v.string())) },
  handler: async (ctx, args) => {
    const now = Date.now();
    const created: string[] = [];
    const found: string[] = [];

    // The platform row — never listed as a community (communities.ts).
    const platform = await ctx.db
      .query("hostOrgs")
      .withIndex("by_slug", (q) => q.eq("slug", PLATFORM_ORG_SLUG))
      .unique();
    if (!platform) {
      await ctx.db.insert("hostOrgs", {
        name: "creatives.exchange",
        slug: PLATFORM_ORG_SLUG,
        kind: "platform",
        visibility: "unlisted",
        status: "active",
        createdAt: now,
      });
      created.push(`hostOrgs:${PLATFORM_ORG_SLUG}`);
    } else {
      found.push(`hostOrgs:${PLATFORM_ORG_SLUG}`);
    }

    // The Garden — re-kind/patch in place if it already exists (e.g. from
    // an older seed that made it kind "platform"); only these fields move.
    const garden = await ctx.db
      .query("hostOrgs")
      .withIndex("by_slug", (q) => q.eq("slug", "the-garden"))
      .unique();
    const gardenPatch = {
      name: "The Garden",
      kind: COMMUNITY_KIND,
      tagline: "Kingdom creatives — the first community on creatives.exchange",
      description:
        "A community of Kingdom-minded creatives getting their work funded, finding collaborators, and gathering around real tables — in San Diego and wherever the next table opens. Free to join. Half of every seat funds another creative's project.",
      locationLabel: "San Diego · online",
      status: "active",
      visibility: "public",
      joinPolicy: "open",
    } as const;
    let gardenId;
    if (!garden) {
      gardenId = await ctx.db.insert("hostOrgs", { ...gardenPatch, slug: "the-garden", createdAt: now });
      created.push("hostOrgs:the-garden");
    } else {
      gardenId = garden._id;
      // Copy the community fields only where the row has none — a host who
      // has edited the page keeps their words; the structural fields
      // (kind/status/visibility/joinPolicy) always converge.
      await ctx.db.patch(garden._id, {
        name: garden.name || gardenPatch.name,
        kind: gardenPatch.kind,
        status: gardenPatch.status,
        visibility: gardenPatch.visibility,
        joinPolicy: garden.joinPolicy ?? gardenPatch.joinPolicy,
        tagline: garden.tagline ?? gardenPatch.tagline,
        description: garden.description ?? gardenPatch.description,
        locationLabel: garden.locationLabel ?? gardenPatch.locationLabel,
      });
      found.push("hostOrgs:the-garden");
    }

    // The Garden's hosts: the given emails, else every admin. Idempotent —
    // an existing member row is promoted to host, never duplicated.
    let hostUserIds: Id<"users">[] = [];
    if (args.hostEmails && args.hostEmails.length > 0) {
      for (const email of args.hostEmails) {
        const user = await ctx.db
          .query("users")
          .withIndex("email", (q) => q.eq("email", email.trim().toLowerCase()))
          .first();
        if (user) hostUserIds.push(user._id);
        else found.push(`no user for ${email}`);
      }
    } else {
      const admins = (await ctx.db.query("profiles").collect()).filter((p) => p.isAdmin === true);
      hostUserIds = admins.map((p) => p.userId);
    }
    for (const userId of hostUserIds) {
      const existing = await ctx.db
        .query("communityMembers")
        .withIndex("by_hostOrgId_userId", (q) => q.eq("hostOrgId", gardenId).eq("userId", userId))
        .unique();
      if (existing) {
        if (existing.role !== "host" || existing.status !== "active") {
          await ctx.db.patch(existing._id, { role: "host", status: "active" });
        }
        found.push(`host:${String(userId)}`);
      } else {
        await ctx.db.insert("communityMembers", {
          hostOrgId: gardenId,
          userId,
          role: "host",
          status: "active",
          joinedAt: now,
        });
        created.push(`host:${String(userId)}`);
      }
    }
    const gardenOrg = await ctx.db.get(gardenId);
    if (gardenOrg && !gardenOrg.ownerUserId && hostUserIds[0]) {
      await ctx.db.patch(gardenId, { ownerUserId: hostUserIds[0] });
    }

    // Abiding Practice — the one real org partner today.
    const ap = await ctx.db
      .query("hostOrgs")
      .withIndex("by_slug", (q) => q.eq("slug", "abiding-practice"))
      .unique();
    if (!ap) {
      await ctx.db.insert("hostOrgs", {
        name: "Abiding Practice",
        slug: "abiding-practice",
        kind: "org",
        givingUrl: "https://abidingpractice.org/give",
        createdAt: now,
      });
      created.push("hostOrgs:abiding-practice");
    } else {
      found.push("hostOrgs:abiding-practice");
    }

    return { ok: true, created, found };
  },
});
