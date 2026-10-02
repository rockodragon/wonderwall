// Which projects the home screens show, and which picture stands for one.
// Moved out of routes/today.tsx so the Today page and the desk pick the same
// way. Pure, so both can test against it.

import { budgetAmountLabel, budgetKindLabel, type BudgetDeclaration } from "./budgetLabel";

/** The picture fields of a projects.listProjects row. */
export type CoverSource = {
  resolvedPhotoUrl?: string | null;
  mediaPreviewUrl?: string | null;
  media: readonly { resolvedMediaUrl?: string | null; type?: string }[];
};

/** The first picture a project has: its photo, a pasted link's still, then
 * its first image artifact. */
export function coverOf(p: CoverSource): string | null {
  return (
    p.resolvedPhotoUrl ??
    p.mediaPreviewUrl ??
    p.media.find((m) => m.resolvedMediaUrl && m.type === "image")?.resolvedMediaUrl ??
    null
  );
}

/** The fields the picking rule reads. */
export type PickableProject = CoverSource &
  BudgetDeclaration & {
    _id: string;
    kind: string;
    status: string;
    goal?: number | null;
    gig?: { status: string } | null;
  };

/**
 * The featured project, the other open passion projects, and the open paid
 * ones. Passion: anything not completed. Paid: not completed, a real pay
 * state (not "Volunteer"), and, for a recurring gig, still open.
 *
 * The featured one is the first passion project with a goal and a picture,
 * else the first project of either kind with a picture, else the first
 * passion project, else the first paid one.
 */
export function pickProjects<P extends PickableProject>(projects: readonly P[]): { featured: P | null; open: P[]; gigs: P[] } {
  const passion = projects.filter((p) => p.kind === "passion" && p.status !== "completed");
  const paid = projects.filter(
    (p) =>
      p.kind === "paid" &&
      p.status !== "completed" &&
      budgetKindLabel(p) === "Paid" &&
      (!p.gig || p.gig.status === "open"),
  );
  const featured =
    passion.find((p) => (p.goal ?? 0) > 0 && coverOf(p)) ??
    [...passion, ...paid].find((p) => coverOf(p)) ??
    passion[0] ??
    paid[0] ??
    null;
  return {
    featured,
    open: passion.filter((p) => p._id !== featured?._id),
    gigs: paid.filter((p) => p._id !== featured?._id),
  };
}

/** The fields a passion project's funding line reads. */
export type FundingSource = { kind: string; goal?: number | null; raisedCents?: number | null };

/**
 * What a passion project has raised against its goal, as the Today page and
 * the desk both print it ("$320 of $1,000 raised"). `money` is the app's own
 * formatter (garden/ui formatMoney), passed in so this stays pure. Null for a
 * paid project or one with no goal.
 */
export function fundingOf(
  p: FundingSource,
  money: (cents: number) => string,
): { raised: string; goal: string; pct: number } | null {
  if (p.kind !== "passion" || !p.goal || p.goal <= 0) return null;
  const raisedCents = p.raisedCents ?? 0;
  return {
    raised: money(raisedCents),
    goal: money(p.goal * 100),
    pct: Math.min(100, Math.round((raisedCents / (p.goal * 100)) * 100)),
  };
}

/** Same money half the /projects cards print; a gig's pay is per date. */
export function moneyOf(p: BudgetDeclaration & { gig?: { status: string } | null }): string | null {
  const amount = budgetAmountLabel(p);
  return amount && p.gig && p.budgetType === "amount" ? `${amount}/date` : amount;
}
