// Pure rules behind admin moderation of projects and events (convex/
// moderation.ts holds the mutations; components/AdminMenu.tsx is the ⋮ menu
// an admin sees in the top-right of /projects/:id and /events/:id), and the
// browse lists' own rules for which projects show, which a hide works
// through. No Convex imports, so the read paths that must respect a hide —
// garden/eventVisibility.ts, garden/projects.ts, garden/stories.ts,
// garden/projectTeam.ts — can use it without a module cycle.
//
// Hide is a status, not a flag. Every browse surface already lists events
// only when "published" and projects only when active / in_progress /
// completed (VISIBLE_PROJECT_STATUSES below), so status "hidden" takes a row
// off all of them with no change there. The direct-link reads, which don't
// filter on status, call isHidden. The owner still sees their own hidden
// page, with a notice; admins see everything; only an admin can unhide.

export const HIDDEN_STATUS = "hidden";

export function isHidden(row: { status?: string } | null | undefined): boolean {
  return row?.status === HIDDEN_STATUS;
}

/** The project statuses a browse list shows: both listProjects, a
 * community's page, the stats strip, the operator's allocation picker, and
 * what a member may save. "pending" isn't used yet; "archived" is a
 * deliberate take-down by the creator or an operator; "hidden" is an
 * admin's. */
export const VISIBLE_PROJECT_STATUSES: ReadonlySet<string> = new Set(["active", "in_progress", "completed"]);

/** Whether a project was posted, rather than made by artifacts.create as the
 * side effect of a quick single-artifact share (origin "portfolio"). Those
 * have a home at /works, so they stay off the browse lists and aren't
 * projects anyone leads. Only an explicit "portfolio" counts: a row with no
 * origin predates the field (projectOriginMigration.ts), so real projects
 * never vanish defensively. */
export function isPostedProject(project: { origin?: string }): boolean {
  return project.origin !== "portfolio";
}

/** The status Unhide puts back: whatever the row had when it was hidden,
 * else `fallback` (a row hidden before statusBeforeHidden existed, or one
 * whose remembered status is somehow "hidden" itself). */
export function restoredStatus(
  row: { statusBeforeHidden?: string },
  fallback: string,
): string {
  const prior = row.statusBeforeHidden;
  return prior && prior !== HIDDEN_STATUS ? prior : fallback;
}

function plural(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}

function joinList(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** Why Delete must refuse, or null when it may go ahead. Delete is
 * permanent; money records point at their project or event by id, and the
 * ledger (admin.ledger.tsx, garden/reports.ts) and any reissued receipt
 * read them through it. So a row with money on record is hidden, never
 * deleted. `records` maps a singular noun ("ticket sale") to how many such
 * rows exist. */
export function deleteBlocker(
  kind: "project" | "event",
  records: Record<string, number>,
): string | null {
  const present = Object.entries(records)
    .filter(([, n]) => n > 0)
    .map(([noun, n]) => plural(n, noun));
  if (present.length === 0) return null;
  return `This ${kind} has ${joinList(present)} on record, which the ledger keeps. Hide it instead.`;
}
