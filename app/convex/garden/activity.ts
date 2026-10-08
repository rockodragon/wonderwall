// Operator activity feed (docs follow-up to reports.ts's money-only
// "recent"): who is joining communities and creating things — members,
// projects, classes, events, Tables. Read-only, admin-gated, newest first.
// Deliberately NOT the money ledger (reports.ts owns that) and deliberately
// NOT member-facing yet — broadcasting join times to other members is a
// separate, undecided privacy call.
//
// House style, same as reports.ts: pure core (sort/shape) at the top —
// unit-tested without Convex in activity.test.ts — a thin ctx.db wrapper
// below. Each source table is read with `.order("desc").take(n)` rather
// than a full collect: an activity feed only ever needs the newest rows,
// unlike reports.ts's cumulative totals which need every row.

import { ConvexError } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { query } from "../_generated/server";
import type { QueryCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { isAdminProfile } from "../helpers";

// ——————————————————————————————————————————————————————————————
// Pure core — no ctx. Unit-tested in activity.test.ts.
// ——————————————————————————————————————————————————————————————

export type ActivitySource =
  | "member_joined"
  | "project_created"
  | "class_created"
  | "table_created"
  | "event_created";

export interface ActivityItem {
  at: number;
  source: ActivitySource;
  actorName: string;
  actorProfileId?: string;
  description: string;
  hostOrgName?: string;
  href?: string;
}

/** Newest-first, capped — the operator activity feed across joins and
 * content creation. Pure sort/slice, same shape as reports.ts's buildRecent
 * for money events; callers build the ActivityItem[] up front. */
export function buildActivityFeed(items: ActivityItem[], cap = 50): ActivityItem[] {
  return [...items].sort((a, b) => b.at - a.at).slice(0, cap);
}

export function memberJoinedDescription(status: string, hostOrgName: string): string {
  return status === "pending" ? `Requested to join ${hostOrgName}` : `Joined ${hostOrgName}`;
}

export function projectCreatedDescription(title: string): string {
  return `Started a project — ${title}`;
}

export function classCreatedDescription(title: string): string {
  return `Posted a class — ${title}`;
}

export function tableCreatedDescription(name: string): string {
  return `Started a Table — ${name}`;
}

export function eventCreatedDescription(title: string): string {
  return `Hosting an event — ${title}`;
}

// ——————————————————————————————————————————————————————————————
// Convex wrapper
// ——————————————————————————————————————————————————————————————

// How many of each source's newest rows to pull before merging — generous
// relative to the final 50-item cap so a source with a recent burst (e.g. a
// wave of joins) can't crowd out a genuinely newer row from another source.
const PER_SOURCE_CAP = 40;

/** Same gate as reports.ts's requireOperator — every export in this file is
 * an operator-only read. Duplicated rather than imported, same convention
 * reports.ts itself follows against operator.ts's copy. */
async function requireOperator(ctx: QueryCtx): Promise<Id<"users">> {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new ConvexError({ code: "unauthenticated" });

  const profile = await ctx.db
    .query("profiles")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .unique();
  if (!isAdminProfile(profile)) {
    throw new ConvexError({
      code: "forbidden",
      reason: "This is an operator tool — this account doesn't have that access.",
    });
  }
  return userId;
}

export const getRecentActivity = query({
  args: {},
  handler: async (ctx) => {
    await requireOperator(ctx);

    const [members, projects, offerings, tables, events, hostOrgs] = await Promise.all([
      ctx.db.query("communityMembers").order("desc").take(PER_SOURCE_CAP),
      ctx.db.query("projects").order("desc").take(PER_SOURCE_CAP),
      ctx.db.query("offerings").order("desc").take(PER_SOURCE_CAP),
      ctx.db.query("gardenTables").order("desc").take(PER_SOURCE_CAP),
      ctx.db.query("events").order("desc").take(PER_SOURCE_CAP),
      ctx.db.query("hostOrgs").collect(),
    ]);
    const activeMembers = members.filter((m) => m.status !== "removed");

    const userIds = new Set<string>();
    for (const m of activeMembers) userIds.add(String(m.userId));
    for (const p of projects) userIds.add(String(p.userId));
    for (const o of offerings) userIds.add(String(o.userId));
    for (const t of tables) if (t.hostUserId) userIds.add(String(t.hostUserId));
    for (const e of events) userIds.add(String(e.organizerId));

    const profiles = await Promise.all(
      [...userIds].map((id) =>
        ctx.db
          .query("profiles")
          .withIndex("by_userId", (q) => q.eq("userId", id as Id<"users">))
          .unique(),
      ),
    );
    const profileByUserId = new Map(
      profiles.filter((p) => p !== null).map((p) => [String(p!.userId), p!]),
    );
    const nameFor = (userId: unknown) => profileByUserId.get(String(userId))?.name ?? "Someone";
    const profileIdFor = (userId: unknown) => {
      const p = profileByUserId.get(String(userId));
      return p ? String(p._id) : undefined;
    };

    const hostOrgById = new Map(hostOrgs.map((o) => [String(o._id), o]));
    const hostOrgNameFor = (id: unknown) => (id ? hostOrgById.get(String(id))?.name : undefined);
    const hostOrgSlugFor = (id: unknown) => (id ? hostOrgById.get(String(id))?.slug : undefined);

    const items: ActivityItem[] = [
      ...activeMembers.map((m): ActivityItem => {
        const hostOrgName = hostOrgNameFor(m.hostOrgId) ?? "a community";
        const slug = hostOrgSlugFor(m.hostOrgId);
        return {
          at: m.joinedAt,
          source: "member_joined",
          actorName: nameFor(m.userId),
          actorProfileId: profileIdFor(m.userId),
          description: memberJoinedDescription(m.status, hostOrgName),
          hostOrgName,
          href: slug ? `/communities/${slug}` : undefined,
        };
      }),
      ...projects.map((p): ActivityItem => ({
        at: p.createdAt,
        source: "project_created",
        actorName: nameFor(p.userId),
        actorProfileId: profileIdFor(p.userId),
        description: projectCreatedDescription(p.title),
        hostOrgName: hostOrgNameFor(p.hostOrgId),
        href: `/projects/${p._id}`,
      })),
      ...offerings.map((o): ActivityItem => ({
        at: o.createdAt,
        source: "class_created",
        actorName: nameFor(o.userId),
        actorProfileId: profileIdFor(o.userId),
        description: classCreatedDescription(o.title),
        hostOrgName: hostOrgNameFor(o.hostOrgId),
        href: `/offerings/${o._id}`,
      })),
      ...tables.map((t): ActivityItem => ({
        at: t.createdAt,
        source: "table_created",
        actorName: t.hostUserId ? nameFor(t.hostUserId) : "Someone",
        actorProfileId: t.hostUserId ? profileIdFor(t.hostUserId) : undefined,
        description: tableCreatedDescription(t.name),
        hostOrgName: hostOrgNameFor(t.hostOrgId),
        href: `/tables/${t.slug}`,
      })),
      ...events.map((e): ActivityItem => ({
        at: e.createdAt,
        source: "event_created",
        actorName: nameFor(e.organizerId),
        actorProfileId: profileIdFor(e.organizerId),
        description: eventCreatedDescription(e.title),
        hostOrgName: hostOrgNameFor(e.hostOrgId),
        href: `/events/${e._id}`,
      })),
    ];

    return buildActivityFeed(items, 50);
  },
});
