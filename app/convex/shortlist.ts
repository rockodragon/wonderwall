// The Shortlist (docs/handoff/favorites-redesign/README.md): everything the
// signed-in member put their hand up for, set aside, leads or hosts, as one
// ShortlistData — the contract in app/lib/shortlist/types.ts. Only what the
// member did themselves; nothing here is suggested.
//
// House style (projectTeam.ts, offerings.ts): a pure core at the top —
// relation mapping, pay, backing, dedupe — unit-tested in shortlist.test.ts;
// the reads below it. Every read is indexed on the member or on one of their
// projects or events. These lists are small per member, so nothing pages.
// The rules shared with other surfaces — which projects are posted, which
// support counts, when a project is finished — are imported from their
// homes, not copied.
//
// Closed holds anything that has ended for the member (Rick's rule): a team
// row that ended, a project they lead that finished, and a saved role that
// was filled, closed, or whose project finished.
//
// stage.ts and projectPick.ts are imported at runtime from app/lib, the way
// garden/devSeed.ts imports app/constants: both are pure, and Convex bundles
// them. So the Shortlist's stage and cover are the frontend's own rules, not
// twins of them.

import { getAuthUserId } from "@convex-dev/auth/server";
import { query, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { BudgetDeclaration } from "../app/lib/budgetLabel";
import { coverOf } from "../app/lib/projectPick";
import { resolveStage } from "../app/lib/stage";
import type {
  ClosedReason,
  EventRelation,
  ProjectRelation,
  ShortlistData,
  ShortlistEvent,
  ShortlistFollow,
  ShortlistPerson,
  ShortlistProject,
  ShortlistRequest,
} from "../app/lib/shortlist/types";
import { countGoing } from "./events";
import { isEventHost } from "./eventHosts";
import { eventVisibilityChecker } from "./garden/eventVisibility";
import { isProjectFinished, resolveImageUrl } from "./garden/projectTeam";
import { projectKind } from "./garden/projectsPublic";
import { isGivenSupport, supportCadence, supportKind } from "./garden/support";
import { isHidden, isPostedProject } from "./moderationRules";

// ——————————————————————————————————————————————————————————————
// Pure core
// ——————————————————————————————————————————————————————————————

type MemberStatus = Doc<"projectMembers">["status"];
type RoleStatus = Doc<"projectRoles">["status"];

const LIVE_RELATION = { invited: "invited", accepted: "team", pending: "waiting" } as const;

/** The member's own projectMembers status as a relation. A live row on a
 * finished project closes as "finished"; a row that had already ended keeps
 * its own reason, since it ended for them first. */
export function memberRelation(
  status: MemberStatus,
  projectFinished: boolean,
): { relation: ProjectRelation; closedReason?: ClosedReason } {
  switch (status) {
    case "invited":
    case "accepted":
    case "pending":
      return projectFinished ? { relation: "closed", closedReason: "finished" } : { relation: LIVE_RELATION[status] };
    default:
      return { relation: "closed", closedReason: status };
  }
}

type Priced = { budgetType?: string; budget?: number; budgetMax?: number };

/** The role's pay when it declared one, else the project's for a paid
 * project (a passion project's money is a goal, not pay), else none. */
export function payFor(role: Priced | null, project: Priced & { kind: string }): BudgetDeclaration | null {
  const source = role?.budgetType ? role : project.kind === "paid" ? project : null;
  return source && { budgetType: source.budgetType, budget: source.budget, budgetMax: source.budgetMax };
}

function isRecurring(type: string): boolean {
  const cadence = supportCadence(type);
  return cadence === "monthly" || cadence === "yearly";
}

/** One backing row from everything the member gave one project: since the
 * first, showing the backing that says the most — recurring money, then any
 * money, then a cheer or resource — the newest of its kind. */
export function summarizeBacking(rows: { type: string; amountCents?: number; createdAt: number }[]): {
  since: number;
  backing: { amountCents: number | null; recurring: boolean };
} {
  const weight = (type: string) => (isRecurring(type) ? 2 : supportKind(type) === "money" ? 1 : 0);
  const [shown] = [...rows].sort((a, b) => weight(b.type) - weight(a.type) || b.createdAt - a.createdAt);
  return {
    since: Math.min(...rows.map((r) => r.createdAt)),
    backing: { amountCents: shown.amountCents ?? null, recurring: isRecurring(shown.type) },
  };
}

/** A saved role once it can't be applied to: filled, or closed by the lead,
 * reads "filled"; an opening on a project that finished reads "finished".
 * A role that ended before its project did keeps its own reason, as in
 * memberRelation. */
export function savedRoleRelation(
  roleStatus: RoleStatus,
  projectFinished: boolean,
): { relation: ProjectRelation; closedReason?: ClosedReason } {
  if (roleStatus !== "open") return { relation: "closed", closedReason: "filled" };
  return projectFinished ? { relation: "closed", closedReason: "finished" } : { relation: "saved" };
}

const PROJECT_ORDER: readonly ProjectRelation[] = ["invited", "leading", "team", "waiting", "backing", "saved", "closed"];
const EVENT_ORDER: readonly EventRelation[] = ["hosting", "going", "requested", "saved"];

/** Per thing, the row whose relation comes first in `order`. */
function keepFirst<T extends { relation: string }>(rows: T[], thing: (row: T) => string, order: readonly string[]): T[] {
  const kept = new Map<string, T>();
  for (const row of rows) {
    const held = kept.get(thing(row));
    if (!held || order.indexOf(row.relation) < order.indexOf(held.relation)) kept.set(thing(row), row);
  }
  return [...kept.values()];
}

/** One row per thing (types.ts's header): per project role — or the project
 * itself, for a row about no posted role — the first relation in
 * PROJECT_ORDER wins, and a saved project with no role drops out once
 * anything else is left for that project. Returned in group order, newest
 * first within a group. */
export function dedupeProjects(rows: ShortlistProject[]): ShortlistProject[] {
  const kept = keepFirst(rows, (r) => `${r.projectId}:${r.role?.id ?? ""}`, PROJECT_ORDER);
  const isBareSave = (r: ShortlistProject) => r.relation === "saved" && r.role === null;
  const covered = new Set(kept.filter((r) => !isBareSave(r)).map((r) => r.projectId));
  return kept
    .filter((r) => !(isBareSave(r) && covered.has(r.projectId)))
    .sort((a, b) => PROJECT_ORDER.indexOf(a.relation) - PROJECT_ORDER.indexOf(b.relation) || b.since - a.since);
}

/** One row per event, the first relation in EVENT_ORDER. Returned in group
 * order, soonest first within a group. */
export function dedupeEvents(rows: ShortlistEvent[]): ShortlistEvent[] {
  return keepFirst(rows, (r) => r.eventId, EVENT_ORDER).sort(
    (a, b) => EVENT_ORDER.indexOf(a.relation) - EVENT_ORDER.indexOf(b.relation) || a.datetime - b.datetime,
  );
}

// ——————————————————————————————————————————————————————————————
// Reads
// ——————————————————————————————————————————————————————————————

const isPresent = <T>(value: T | null): value is T => value !== null;

/** Memoize a read for one query call: a project, event or person reached
 * through several relations is read once. */
function once<K extends string, V>(load: (key: K) => Promise<V>): (key: K) => Promise<V> {
  const cache = new Map<K, Promise<V>>();
  return (key) => {
    let hit = cache.get(key);
    if (!hit) cache.set(key, (hit = load(key)));
    return hit;
  };
}

/** A person, their picture resolved as everywhere else (resolveImageUrl):
 * the stored file wins over the legacy URL. */
async function toPerson(ctx: QueryCtx, profile: Doc<"profiles">): Promise<ShortlistPerson> {
  return {
    profileId: profile._id,
    name: profile.name,
    imageUrl: await resolveImageUrl(ctx, profile),
    interests: profile.interests,
  };
}

/** The desk's picture for a project (coverOf): its photo, a pasted link's
 * still, then its first image artifact, each resolved the way listProjects
 * resolves it. Artifacts are read only when the first two are missing. */
async function projectCoverUrl(ctx: QueryCtx, project: Doc<"projects">): Promise<string | null> {
  const resolvedPhotoUrl = project.photoStorageId
    ? await ctx.storage.getUrl(project.photoStorageId)
    : project.photoUrl || null;
  const cover = { resolvedPhotoUrl, mediaPreviewUrl: project.mediaPreviewUrl };
  const quick = coverOf({ ...cover, media: [] });
  if (quick !== null) return quick;
  const artifacts = await ctx.db
    .query("artifacts")
    .withIndex("by_projectId", (q) => q.eq("projectId", project._id))
    .collect();
  const media = await Promise.all(
    artifacts
      .filter((a) => a.type === "image")
      .map(async (a) => ({
        type: a.type,
        resolvedMediaUrl: a.mediaStorageId ? await ctx.storage.getUrl(a.mediaStorageId) : a.mediaUrl || null,
      })),
  );
  return coverOf({ ...cover, media });
}

/** The desk's picture for an event: its cover, else its first gallery image
 * (resolved as favorites.getMyFavorites does), else a pasted link's still. */
async function eventCoverUrl(ctx: QueryCtx, event: Doc<"events">): Promise<string | null> {
  const storageId = event.coverImageStorageId ?? event.imageStorageIds?.[0];
  const stored = storageId ? await ctx.storage.getUrl(storageId) : null;
  return stored || event.mediaPreviewUrl || null;
}

/** Accepted applications plus member RSVPs, one person once (countGoing,
 * events.ts). Guest RSVPs and ticket purchases are left out: the contract
 * counts members. */
async function memberGoingCount(ctx: QueryCtx, eventId: Id<"events">): Promise<number> {
  const [accepted, rsvps] = await Promise.all([
    ctx.db
      .query("eventApplications")
      .withIndex("by_eventId_status", (q) => q.eq("eventId", eventId).eq("status", "accepted"))
      .collect(),
    ctx.db
      .query("eventRsvps")
      .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
      .collect(),
  ]);
  return countGoing({
    acceptedApplicantIds: accepted.map((a) => a.applicantId),
    rsvps: rsvps.filter((r) => r.userId),
    paidPurchases: [],
  });
}

function readers(ctx: QueryCtx) {
  const project = once((id: Id<"projects">) => ctx.db.get(id));
  const event = once((id: Id<"events">) => ctx.db.get(id));
  return {
    project,
    event,
    role: once((id: Id<"projectRoles">) => ctx.db.get(id)),
    person: once(async (userId: Id<"users">) => {
      const profile = await ctx.db
        .query("profiles")
        .withIndex("by_userId", (q) => q.eq("userId", userId))
        .first();
      return profile && toPerson(ctx, profile);
    }),
    projectCover: once(async (id: Id<"projects">) => {
      const doc = await project(id);
      return doc && projectCoverUrl(ctx, doc);
    }),
    eventCover: once(async (id: Id<"events">) => {
      const doc = await event(id);
      return doc && eventCoverUrl(ctx, doc);
    }),
    goingCount: once((id: Id<"events">) => memberGoingCount(ctx, id)),
  };
}

export const getMine = query({
  args: {},
  handler: async (ctx): Promise<ShortlistData> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return { projects: [], requests: [], events: [], people: [] };
    const read = readers(ctx);

    const saved = (targetType: "project" | "role" | "event" | "profile") =>
      ctx.db
        .query("favorites")
        .withIndex("by_userId_type", (q) => q.eq("userId", userId).eq("targetType", targetType))
        .collect();
    const [memberRows, led, support, savedProjects, savedRoles, savedEvents, follows, hosted, applications, rsvps] =
      await Promise.all([
        ctx.db
          .query("projectMembers")
          .withIndex("by_userId_status", (q) => q.eq("userId", userId))
          .collect(),
        ctx.db
          .query("projects")
          .withIndex("by_userId", (q) => q.eq("userId", userId))
          .collect(),
        ctx.db
          .query("projectSupport")
          .withIndex("by_supporterUserId", (q) => q.eq("supporterUserId", userId))
          .collect(),
        saved("project"),
        saved("role"),
        saved("event"),
        saved("profile"),
        ctx.db
          .query("events")
          .withIndex("by_organizerId", (q) => q.eq("organizerId", userId))
          .collect(),
        ctx.db
          .query("eventApplications")
          .withIndex("by_applicantId", (q) => q.eq("applicantId", userId))
          .collect(),
        // Guest RSVPs that match the member only by email (no userId) are out
        // of scope: nothing links them to the account.
        ctx.db
          .query("eventRsvps")
          .withIndex("by_userId", (q) => q.eq("userId", userId))
          .collect(),
      ]);

    // Visibility, as the pages themselves decide it. A project page reads as
    // not-found once an admin hides it (getProject), except to its lead; an
    // event page shows to its hosts, and to everyone else while it's public
    // (events.get: not hidden, and a ticketed one only while its organizer
    // can sell tickets).
    const ownsProject = (project: Doc<"projects">) => project.userId === userId;
    const canOpenProject = (project: Doc<"projects">) => ownsProject(project) || !isHidden(project);
    const isPublic = eventVisibilityChecker(ctx);
    const canOpenEvent = async (event: Doc<"events">) => isEventHost(event, userId) || (await isPublic(event));

    async function projectRow(
      project: Doc<"projects">,
      relation: ProjectRelation,
      since: number,
      role: { posting: Doc<"projectRoles"> | null; title: string } | null,
      extra: Pick<ShortlistProject, "pendingRequests" | "backing" | "closedReason"> = {},
    ): Promise<ShortlistProject> {
      const [lead, coverUrl] = await Promise.all([read.person(project.userId), read.projectCover(project._id)]);
      const roleId = role?.posting?._id ?? null;
      return {
        key: roleId ? `${relation}:${project._id}:${roleId}` : `${relation}:${project._id}`,
        relation,
        kind: projectKind(project.kind),
        projectId: project._id,
        title: project.title,
        stage: resolveStage(project),
        lead: { name: lead?.name ?? "Someone", profileId: lead?.profileId ?? null },
        coverUrl,
        role: role && { id: roleId, title: role.posting?.title ?? role.title, neededBy: role.posting?.neededBy ?? null },
        pay: payFor(role?.posting ?? null, project),
        since,
        ...extra,
      };
    }

    async function eventRow(
      event: Doc<"events">,
      relation: EventRelation,
      since: number,
      extra: Pick<ShortlistEvent, "pendingRequests"> = {},
    ): Promise<ShortlistEvent> {
      const [coverUrl, goingCount] = await Promise.all([read.eventCover(event._id), read.goingCount(event._id)]);
      return {
        key: `${relation}:${event._id}`,
        relation,
        eventId: event._id,
        title: event.title,
        datetime: event.datetime,
        location: event.location ?? null,
        coverUrl,
        goingCount,
        cancelled: event.status === "cancelled",
        since,
        ...extra,
      };
    }

    // ——— Projects you lead, and the join requests waiting on you ———
    // A finished one closes, and its requests drop with it: the people who
    // asked already see theirs closed as finished (memberRelation).
    const leading = Promise.all(
      led.filter(isPostedProject).map(async (project) => {
        if (isProjectFinished(project)) {
          const row = await projectRow(project, "closed", project.createdAt, null, { closedReason: "finished" });
          return { row, requests: [] };
        }
        const pending = await ctx.db
          .query("projectMembers")
          .withIndex("by_projectId_status", (q) => q.eq("projectId", project._id).eq("status", "pending"))
          .collect();
        const requests = await Promise.all(
          pending.map(async (row): Promise<ShortlistRequest> => {
            const posting = row.roleId ? await read.role(row.roleId) : null;
            const person = row.userId ? await read.person(row.userId) : null;
            return {
              key: `request:project:${row._id}`,
              requestId: row._id,
              on: {
                type: "project",
                id: project._id,
                title: project.title,
                kind: projectKind(project.kind),
                roleTitle: posting?.title ?? row.role,
                pay: payFor(posting, project),
              },
              person: person ?? { profileId: null, name: row.name, imageUrl: null, interests: [] },
              message: row.message ?? null,
              at: row.createdAt,
            };
          }),
        );
        const row = await projectRow(project, "leading", project.createdAt, null, { pendingRequests: pending.length });
        return { row, requests };
      }),
    );

    // ——— Invited, on the team, waiting, closed: the member's team rows ———
    // since: respondedAt is when the row last changed (joined, or ended); a
    // live invite or request has none, so it's when that was made.
    const teamRows = memberRows.map(async (row) => {
      const project = await read.project(row.projectId);
      if (!project || !canOpenProject(project)) return null;
      const posting = row.roleId ? await read.role(row.roleId) : null;
      const { relation, ...extra } = memberRelation(row.status, isProjectFinished(project));
      return projectRow(project, relation, row.respondedAt ?? row.createdAt, { posting, title: row.role }, extra);
    });

    // ——— Backing: one row per project, from all the member gave it ———
    const given = new Map<Id<"projects">, Doc<"projectSupport">[]>();
    for (const entry of support.filter(isGivenSupport)) {
      given.set(entry.projectId, [...(given.get(entry.projectId) ?? []), entry]);
    }
    const backingRows = [...given].map(async ([projectId, entries]) => {
      const project = await read.project(projectId);
      if (!project || !canOpenProject(project)) return null;
      const { since, backing } = summarizeBacking(entries);
      return projectRow(project, "backing", since, null, { backing });
    });

    // ——— Saved projects and roles ———
    const savedProjectRows = savedProjects.map(async (fav) => {
      const id = ctx.db.normalizeId("projects", fav.targetId);
      const project = id && (await read.project(id));
      if (!project || !canOpenProject(project)) return null;
      return projectRow(project, "saved", fav.createdAt, null);
    });
    const savedRoleRows = savedRoles.map(async (fav) => {
      const id = ctx.db.normalizeId("projectRoles", fav.targetId);
      const posting = id && (await read.role(id));
      const project = posting && (await read.project(posting.projectId));
      if (!posting || !project || !canOpenProject(project)) return null;
      const { relation, ...extra } = savedRoleRelation(posting.status, isProjectFinished(project));
      return projectRow(project, relation, fav.createdAt, { posting, title: posting.title }, extra);
    });

    // ——— Events you host, and the requests to attend waiting on you ———
    // Co-hosts (events.coHostIds) have no index, so only the organizer hosts here.
    // A cancelled event's requests drop: there's nothing left to approve.
    const hosting = Promise.all(
      hosted.map(async (event) => {
        const pending =
          event.status === "cancelled"
            ? []
            : await ctx.db
                .query("eventApplications")
                .withIndex("by_eventId_status", (q) => q.eq("eventId", event._id).eq("status", "pending"))
                .collect();
        const requests = await Promise.all(
          pending.map(async (app): Promise<ShortlistRequest> => ({
            key: `request:event:${app._id}`,
            requestId: app._id,
            on: { type: "event", id: event._id, title: event.title, datetime: event.datetime },
            person: (await read.person(app.applicantId)) ?? {
              profileId: null,
              name: "Someone",
              imageUrl: null,
              interests: [],
            },
            message: app.message ?? null,
            at: app.createdAt,
          })),
        );
        const row = await eventRow(event, "hosting", event.createdAt, { pendingRequests: pending.length });
        return { row, requests };
      }),
    );

    // ——— Going, requested, saved ———
    // Going is an accepted application or the member's own RSVP; since is
    // the earlier of when they were accepted and when they RSVP'd.
    const goingSince = new Map<Id<"events">, number>();
    const noteGoing = (eventId: Id<"events">, at: number) =>
      goingSince.set(eventId, Math.min(at, goingSince.get(eventId) ?? at));
    for (const app of applications) if (app.status === "accepted") noteGoing(app.eventId, app.updatedAt);
    for (const rsvp of rsvps) noteGoing(rsvp.eventId, rsvp.createdAt);

    const attending: { id: Id<"events"> | null; relation: EventRelation; since: number }[] = [
      ...[...goingSince].map(([id, since]) => ({ id, relation: "going" as const, since })),
      ...applications
        .filter((app) => app.status === "pending")
        .map((app) => ({ id: app.eventId, relation: "requested" as const, since: app.createdAt })),
      ...savedEvents.map((fav) => ({
        id: ctx.db.normalizeId("events", fav.targetId),
        relation: "saved" as const,
        since: fav.createdAt,
      })),
    ];
    const attendingRows = attending.map(async ({ id, relation, since }) => {
      const event = id && (await read.event(id));
      if (!event || !(await canOpenEvent(event))) return null;
      return eventRow(event, relation, since);
    });

    // ——— People you follow ———
    const people = follows.map(async (fav): Promise<ShortlistFollow | null> => {
      const id = ctx.db.normalizeId("profiles", fav.targetId);
      const profile = id && (await ctx.db.get(id));
      if (!profile) return null;
      return { ...(await toPerson(ctx, profile)), profileId: profile._id, since: fav.createdAt };
    });

    const [leads, hosts, teams, backings, savedProjectList, savedRoleList, attendingList, peopleList] = await Promise.all([
      leading,
      hosting,
      Promise.all(teamRows),
      Promise.all(backingRows),
      Promise.all(savedProjectRows),
      Promise.all(savedRoleRows),
      Promise.all(attendingRows),
      Promise.all(people),
    ]);

    return {
      projects: dedupeProjects([
        ...leads.map((l) => l.row),
        ...[...teams, ...backings, ...savedProjectList, ...savedRoleList].filter(isPresent),
      ]),
      requests: [...leads, ...hosts].flatMap((l) => l.requests).sort((a, b) => b.at - a.at),
      events: dedupeEvents([...hosts.map((h) => h.row), ...attendingList.filter(isPresent)]),
      people: peopleList.filter(isPresent).sort((a, b) => b.since - a.since),
    };
  },
});
