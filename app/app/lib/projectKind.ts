// What a project card says it is, in its first line: "Job", "Recurring gig ·
// Fridays 8–10pm", "Role on Harbor Mural · Paid", "Volunteer". The /projects
// card and the desk's card (kicker and opened card) read the same words from
// here. Pure.
//
// Rick's words: "recurring gigs" for a live-booking series, "jobs and gigs"
// when the two are named together. Code keeps `gig`.

import { budgetAmountLabel, budgetKindLabel, type BudgetDeclaration } from "./budgetLabel";

/** An open role as api.garden.projects.listProjects sends it. */
export type OpenRoleLike = {
  title: string;
  budgetType?: string | null;
  budget?: number | null;
  budgetMax?: number | null;
};

/** The gig summary a project row carries (convex/garden/gigSummary.ts). */
export type GigLike = {
  status: string;
  /** "Every Friday" */
  cadence?: string | null;
  /** "8–10pm" */
  timeRange?: string | null;
  /** "Every Friday · 8–10pm" */
  schedule?: string | null;
};

export type KindSource = BudgetDeclaration & {
  kind: string;
  title?: string;
  gig?: GigLike | null;
  openRoles?: readonly OpenRoleLike[] | null;
};

/** The pay on a role, as the card prints it ("$200", "$300–600", "Open to
 * proposals"). Null for a volunteer role, and for a role that never declared
 * anything: the role has to say so, we don't guess "Paid" for a blank. */
export function rolePay(role: OpenRoleLike): string | null {
  if (!role.budgetType) return null;
  const declared: BudgetDeclaration = {
    budgetType: role.budgetType,
    budget: role.budget ?? undefined,
    budgetMax: role.budgetMax ?? undefined,
  };
  if (budgetKindLabel(declared) !== "Paid") return null;
  return budgetAmountLabel(declared) ?? "Paid";
}

export function isPaidRole(role: OpenRoleLike): boolean {
  return rolePay(role) !== null;
}

/** The open roles that pay, in the order the server gave them. */
export function paidRoles<R extends OpenRoleLike>(roles: readonly R[] | null | undefined): R[] {
  return (roles ?? []).filter(isPaidRole);
}

const WEEKDAY = /^Every (Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)$/;

/** "Fridays 8–10pm": the schedule of a recurring gig in a few words. "Every
 * Friday" becomes "Fridays"; "Every other Friday" and "Fridays and Saturdays"
 * stay as they are. Null when the row carries no schedule. */
export function gigPhrase(gig: GigLike | null | undefined): string | null {
  if (!gig) return null;
  const [scheduleDays, scheduleTime] = (gig.schedule ?? "").split(" · ");
  const cadence = (gig.cadence ?? scheduleDays ?? "").trim().replace(WEEKDAY, "$1s");
  const time = (gig.timeRange ?? scheduleTime ?? "").trim();
  return [cadence, time].filter(Boolean).join(" ") || null;
}

/** "Job": paid work done once. A volunteer posting is "Volunteer", whatever
 * shape it takes; an unpaid ask never passes itself off as a job. */
export function isJob(p: KindSource): boolean {
  return p.kind === "paid" && !p.gig && budgetKindLabel(p) !== "Volunteer";
}

/** The paid roles a passion project is shown under Jobs and gigs for, or none
 * when this is not the Jobs and gigs list or the project has none. */
export function leadRoles(p: KindSource, onJobsAndGigs: boolean): OpenRoleLike[] {
  return onJobsAndGigs && p.kind === "passion" ? paidRoles(p.openRoles) : [];
}

/**
 * The first line of a card.
 *
 *   Volunteer                          an unpaid posting
 *   Recurring gig · Fridays 8–10pm     a live-booking series
 *   Job                                one piece of paid work
 *   Role on Harbor Mural · Paid        a project, shown for its paid role
 *   Seeking funding / Project          a project
 *
 * `onJobsAndGigs` says the card is in the Jobs and gigs list, which is what
 * makes a project lead with its role. `raising` is the caller's isRaising(p):
 * a project asking for backers reads "Seeking funding" — an attribute, not
 * the stage beside it (Rick, 2026-10-01).
 */
export function projectKindLabel(
  p: KindSource,
  opts: { onJobsAndGigs?: boolean; raising?: boolean } = {},
): string {
  if (p.kind === "paid") {
    if (budgetKindLabel(p) === "Volunteer") return "Volunteer";
    if (p.gig) {
      const when = gigPhrase(p.gig);
      return when ? `Recurring gig · ${when}` : "Recurring gig";
    }
    return "Job";
  }
  if (leadRoles(p, opts.onJobsAndGigs ?? false).length > 0) return `Role on ${p.title ?? "a project"} · Paid`;
  return opts.raising ? "Seeking funding" : "Project";
}
