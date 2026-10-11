import { Link } from "react-router";
import { formatCents, formatDollars } from "../../convex/money";
import { budgetAmountLabel, budgetKindLabel } from "../lib/budgetLabel";
import { stageLabel, type Stage } from "../lib/stage";
import { CoverFrame } from "./CoverFrame";
import { EMPTY_COVER } from "./emptyCover";

/** A project on a profile or an organization's page, in the Projects page's
 * card (routes/projects.tsx ProjectCard): the 4:5 cover with what it is
 * and its pay on top, then the title, the person's part in it (a profile;
 * `role` is null on an organization's page) and what it's after. Takes a
 * row from garden.projectTeam's listAffiliations or listOrgProjects. */
export function ProjectTile({ project: a }: { project: any }) {
  const job = !a.gig && a.kind === "paid";
  const volunteer = job && budgetKindLabel(a) === "Volunteer";
  const pay = job && !volunteer && a.budgetType ? budgetAmountLabel(a) : null;
  const kindWord = a.gig
    ? "Recurring gig"
    : job
      ? volunteer ? "Volunteer" : "Job"
      : a.raising
        ? "Seeking funding"
        : a.openRoles?.length > 0
          ? "Seeking people"
          : "Project";
  const roles: string = (a.openRoles ?? [])
    .slice(0, 3)
    .map((r: any) => r.title)
    .join(", ");
  const moreRoles = (a.openRoles?.length ?? 0) > 3 ? ` +${a.openRoles.length - 3} more` : "";

  return (
    <Link
      to={`/projects/${a.projectId}`}
      className="group rounded-2xl overflow-hidden border flex flex-col transition-colors hover:border-[var(--app-accent)]"
      style={{ borderColor: "var(--app-hairline)", backgroundColor: "var(--app-surface-raised)" }}
    >
      <div className="relative">
        {a.imageUrl ? (
          <CoverFrame src={a.imageUrl} alt={a.title} />
        ) : (
          // No photo: a strip on a phone, the full 4:5 where cards sit side
          // by side and rows must line up (same as ProjectCard).
          <div className="h-16 sm:h-auto sm:aspect-[4/5]" style={EMPTY_COVER} />
        )}
        <div className="absolute inset-x-2 top-2 flex items-start justify-between gap-2">
          <span
            className="min-w-0 px-2 py-0.5 rounded-[14px] text-[12px] font-semibold uppercase tracking-[0.06em] leading-snug"
            style={{
              fontFamily: "var(--garden-font-mono)",
              backgroundColor: "rgba(20,20,18,0.72)",
              color: "var(--garden-paper)",
            }}
          >
            {kindWord}
          </span>
          {pay && (
            <span
              className="shrink-0 px-2.5 py-1 rounded-full text-xs font-bold"
              style={{
                fontFamily: "var(--garden-font-mono)",
                backgroundColor: "var(--garden-citron)",
                color: "var(--garden-ink)",
              }}
            >
              {pay}
            </span>
          )}
        </div>
      </div>
      <div className="p-4 flex-1 flex flex-col gap-1.5 min-w-0">
        <h3
          className="font-semibold line-clamp-2 group-hover:underline"
          style={{ color: "var(--app-text)", fontFamily: "var(--garden-font-display)" }}
        >
          {a.title}
        </h3>
        <p className="text-[13.5px]" style={{ color: "var(--app-text-muted)" }}>
          {[a.role === null ? null : a.role || "Team", stageLabel(a.stage as Stage)].filter(Boolean).join(" · ")}
        </p>
        {roles && (
          <p className="text-[13.5px] line-clamp-2" style={{ color: "var(--app-text-muted)" }}>
            Looking for {roles}
            {moreRoles}
          </p>
        )}
        {a.raising && a.goal ? (
          <p className="text-[13.5px]" style={{ color: "var(--app-text-muted)" }}>
            {formatCents(a.raisedCents)} of {formatDollars(a.goal)} raised
          </p>
        ) : null}
      </div>
    </Link>
  );
}
