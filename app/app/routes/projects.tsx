import { useAction, useConvexAuth, useMutation, useQuery } from "convex/react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { HireFlow } from "../components/HireFlow";
import { useEffect, useMemo, useState } from "react";
import { api } from "../../convex/_generated/api";
import { INTERESTS } from "../constants/interests";
import { budgetAmountLabel, budgetKindLabel } from "../lib/budgetLabel";
import {
  CommunityContextLine,
  communityNameFor,
  useCommunityContext,
} from "../components/CommunityFilter";
import { resolveStage, stageLabel } from "../lib/stage";
import {
  PROJECT_LENSES,
  STAGE_OPTIONS,
  filterProjects,
  isMatch as isSoftMatch,
  isRaising,
  lensCreate,
  readProjectsView,
  selectLens,
  stageCaption,
  writeProjectsView,
  type ProjectsLens,
} from "../lib/browse/projectsFilter";
import { leadRoles, projectKindLabel, rolePay } from "../lib/projectKind";
import { FilterButton, FilterPanel, filterButtonLabel } from "../components/FilterMenu";
import { ChevronDownIcon } from "../components/icons";
import { TagFilterPills } from "../components/TagFilterPills";
import { CLAIMS } from "../constants/claims";
import { toEmbedUrl } from "../lib/videoEmbed";
import { Dissolve } from "../hooks/useReveal";
import { EmbedStill } from "../components/EmbedStill";
import { CreateCard } from "../components/CreateCard";
import { errorMessage } from "../lib/convexError";
import { ProjectModal } from "../components/ProjectModal";
import { INTEREST_OPTIONS } from "../lib/browse/peopleFilter";
import { PAGE_WIDTH } from "../lib/pageWidth";

// The four chips (Projects, Seeking funding, Seeking people, Jobs and gigs),
// the Stage menu and the pure filtering live in lib/browse/projectsFilter.ts,
// shared with the desk's Projects view.
// Still importable from here: projects.$id.tsx reads it.
export { isRaising };

export const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  active: "Active",
  in_progress: "In Progress",
  completed: "Completed",
  archived: "Archived",
};

// Kept in sync with garden/projects.ts's ALLOWED_STATUSES — the options a
// creator/operator can move a project into from this card's status select.
const STATUS_OPTIONS_BY_KIND: Record<string, { value: string; label: string }[]> = {
  passion: [
    { value: "active", label: "Active" },
    { value: "completed", label: "Completed" },
    { value: "archived", label: "Archived" },
  ],
  paid: [
    { value: "active", label: "Active" },
    { value: "in_progress", label: "In Progress" },
    { value: "completed", label: "Completed" },
    { value: "archived", label: "Archived" },
  ],
};


export default function Projects() {
  const projects = useQuery(api.garden.projects.listProjects);
  // "Hire someone" is one entry (HireFlow): one job, or a recurring gig.
  const [hiring, setHiring] = useState(false);
  const navigate = useNavigate();
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
  // Anyone can browse; posting and supporting need an account. Login
  // brings them back here (and on to sign up, keeping the redirect).
  const withAccount = (act: () => void) => () =>
    isAuthenticated
      ? act()
      : navigate(`/login?redirect=${encodeURIComponent(`/projects${window.location.search}`)}`);
  const [showPassionForm, setShowPassionForm] = useState(false);
  // The header's create button and menu and the first card in the grid do the same two
  // things, so they share one handler each.
  const startProject = withAccount(() => setShowPassionForm(true));
  const hireSomeone = withAccount(() => setHiring(true));
  const [supporting, setSupporting] = useState<{ project: any; mode: SupportMode } | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  // /projects?new=project (the palette's "Start a project") opens the start
  // flow once, then drops the param so a refresh doesn't open it again. Signed
  // out, it goes to log in, replacing this entry so Back doesn't land on the
  // param again, and the redirect keeps ?new=project so the flow opens when
  // they come back. Wait out the token check first: until it settles a
  // signed-in member reads as signed out.
  const wantsNewProject = searchParams.get("new") === "project";
  useEffect(() => {
    if (!wantsNewProject || authLoading) return;
    if (!isAuthenticated) {
      navigate(`/login?redirect=${encodeURIComponent(`/projects?${searchParams}`)}`, { replace: true });
      return;
    }
    setShowPassionForm(true);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("new");
        return next;
      },
      { replace: true },
    );
    // The param and the auth answer are the triggers.
  }, [wantsNewProject, isAuthenticated, authLoading]);
  const {
    selected: communitySlug,
    setSelected: setCommunitySlug,
    communities,
  } = useCommunityContext();

  const interestFilter = useMemo(
    () => (searchParams.get("interests") || "").split(",").map((s) => s.trim()).filter(Boolean),
    [searchParams],
  );
  const locationFilter = (searchParams.get("location") || "").trim();
  const hasMatchFilter = interestFilter.length > 0 || !!locationFilter;

  // The chip and the Stage live in the URL (?show=work&stage=planning), not in
  // component state, so a link can land on "Jobs and gigs" — Today's links
  // depend on it, and the back button and a shared link both keep it. Absent
  // is Projects. The old ?view=work, ?kind=passion|paid|gigs, ?show=gigs|
  // roles|raising and ?seek= links still land in the right place.
  const { lens, stage: stageFilter } = readProjectsView({
    view: searchParams.get("view"),
    kind: searchParams.get("kind"),
    show: searchParams.get("show"),
    stage: searchParams.get("stage"),
    seek: searchParams.get("seek"),
  });
  // Writes the chip and the Stage, and drops the old params a link may carry.
  function setView(next: { lens: ProjectsLens; stage: string }) {
    const params = new URLSearchParams(searchParams);
    writeProjectsView(params, next, ["view", "kind", "seek"]);
    setSearchParams(params, { replace: true });
  }
  const create = lensCreate(lens);

  // Manual hashtag pills, separate from the soft interests/location match
  // above (which only sorts). Clicking a tag is a deliberate "show me only
  // this" action, so it's a real filter — same behavior as the Events page.
  // The available tags are the canonical INTERESTS list itself (not derived
  // from whoever happens to have posted a project) so this list is always
  // identical to People's, regardless of current creator/project data.
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  // The full interest-tag row (28 pills) lives behind one Filter button now
  // (the /search affordance — components/FilterMenu.tsx), not inline, so it
  // doesn't clutter the page next to the kind row above.
  const [tagsExpanded, setTagsExpanded] = useState(false);
  const allTags: readonly string[] = INTERESTS;
  const tagOptions = INTEREST_OPTIONS;
  function toggleTag(tag: string) {
    setTagFilter((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  }

  function clearInterestFilter() {
    const next = new URLSearchParams(searchParams);
    next.delete("interests");
    next.delete("location");
    setSearchParams(next, { replace: true });
  }

  const softMatch = useMemo(
    () => ({ interests: interestFilter, location: locationFilter }),
    [interestFilter, locationFilter],
  );
  const isMatch = (p: any) => isSoftMatch(p, softMatch);

  const filtered = useMemo(() => {
    if (!projects) return [];
    return filterProjects(projects, {
      lens,
      stage: stageFilter,
      inCommunity: communitySlug !== "all" ? (p) => p.community?.slug === communitySlug : null,
      tags: tagFilter,
      soft: hasMatchFilter ? softMatch : null,
    });
  }, [projects, lens, stageFilter, communitySlug, tagFilter, softMatch, hasMatchFilter]);

  return (
    <div className="min-h-screen bg-[var(--garden-ink)]">
      <link rel="stylesheet" href="/tokens.css" />
      <link rel="stylesheet" href="/about/fonts/fonts.css" />
      <div className={`p-4 sm:p-6 ${PAGE_WIDTH.list} mx-auto`}>
        <h1
          className="text-2xl sm:text-3xl font-semibold text-[var(--garden-paper)] mb-1"
          style={{ fontFamily: "var(--garden-font-display)" }}
        >
          Projects
        </h1>
        <p className="text-[var(--garden-body)] mb-6">
          {LENS_BLURB[lens]}
        </p>

        {hasMatchFilter && (
          <div
            className="flex flex-wrap items-center gap-2 mb-6 px-3 py-2 rounded-lg text-[13px]"
            style={{ backgroundColor: "var(--garden-ink-raised)", color: "var(--garden-muted)" }}
          >
            <span>
              Showing matches first for{" "}
              <span style={{ color: "var(--garden-body)" }}>
                {[interestFilter.join(", "), locationFilter].filter(Boolean).join(" near ")}
              </span>
            </span>
            <button
              onClick={clearInterestFilter}
              className="underline underline-offset-2 hover:opacity-80"
              style={{ color: "var(--garden-citron)" }}
            >
              Clear
            </button>
          </div>
        )}

        <CommunityContextLine
          variant="app"
          selected={communitySlug}
          setSelected={setCommunitySlug}
          communities={communities}
          rows={projects}
        />

        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 mt-3 mb-4">
          <div className="flex flex-wrap items-center gap-2">
            <div role="group" aria-label="Show" className="flex flex-wrap items-center gap-2">
              {PROJECT_LENSES.map((l) => (
                <FilterChip
                  key={l.value}
                  label={l.label}
                  on={lens === l.value}
                  onClick={() => setView(selectLens({ lens, stage: stageFilter }, l.value))}
                />
              ))}
            </div>
            {lens !== "work" && (
              <>
                <span
                  role="separator"
                  aria-orientation="vertical"
                  className="hidden sm:block mx-1 h-5 w-px"
                  style={{ backgroundColor: "var(--garden-hairline-raised)" }}
                />
                <StageMenu stage={stageFilter} onChange={(stage) => setView({ lens, stage })} />
              </>
            )}
          </div>
          <PostMenu
            primary={{ label: create.label, onClick: create.kind === "hire" ? hireSomeone : startProject }}
            onProject={startProject}
            onHire={hireSomeone}
          />
        </div>

        {allTags.length > 0 && (
          <div className="mb-6">
            <FilterButton
              open={tagsExpanded}
              onClick={() => setTagsExpanded((v) => !v)}
              label={filterButtonLabel(tagOptions, tagFilter)}
              active={tagFilter.length > 0}
            />
            {tagsExpanded && (
              <FilterPanel className="mt-3">
                <TagFilterPills
                  options={tagOptions}
                  active={tagFilter}
                  onToggle={toggleTag}
                  onClear={() => setTagFilter([])}
                />
              </FilterPanel>
            )}
          </div>
        )}

        {!projects ? (
          <div className="flex items-center justify-center py-24">
            <div
              className="h-8 w-8 rounded-full border-2 border-t-transparent animate-spin"
              style={{ borderColor: "var(--garden-citron)", borderTopColor: "transparent" }}
            />
          </div>
        ) : (
          <>
            {filtered.length === 0 && communitySlug !== "all" && (
              <div className="text-center pt-8 pb-10" style={{ color: "var(--garden-dim)" }}>
                <p className="text-lg font-medium mb-1" style={{ color: "var(--garden-body)" }}>
                  Nothing in {communityNameFor(communitySlug, communities, projects)} yet — see
                  everything
                </p>
                <button
                  onClick={() => setCommunitySlug("all")}
                  className="text-sm underline underline-offset-2 hover:opacity-80"
                  style={{ color: "var(--garden-citron)" }}
                >
                  Show all communities
                </button>
              </div>
            )}
            {/* The make-one card is always first, so an empty list is just
                the grid with that one card in it. */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <CreateCard label={create.label} onClick={create.kind === "hire" ? hireSomeone : startProject} />
              {filtered.map((project) => (
                <ProjectCard
                  key={project._id}
                  project={project}
                  lens={lens}
                  onSupport={(mode) => withAccount(() => setSupporting({ project, mode }))()}
                  matched={hasMatchFilter && isMatch(project)}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {hiring && (
        <HireFlow
          onClose={() => setHiring(false)}
          onCreated={(projectId) => navigate(`/projects/${projectId}`)}
          onSwitchToProject={() => {
            setHiring(false);
            setShowPassionForm(true);
          }}
        />
      )}
      {showPassionForm && (
        <ProjectModal
          onClose={() => setShowPassionForm(false)}
          onCreated={(projectId) => navigate(`/projects/${projectId}`)}
        />
      )}
      {supporting && (
        <SupportModal
          project={supporting.project}
          mode={supporting.mode}
          onClose={() => setSupporting(null)}
        />
      )}
    </div>
  );
}

// Under the title, one line on what the chip shows.
const LENS_BLURB: Record<ProjectsLens, string> = {
  projects: "Things people are making — cheer them on, back them, or join in.",
  funding: "Projects asking for backers. Cheer them on, or back them.",
  people: "Projects that need people, paid or volunteer.",
  work: "Jobs, recurring gigs, and paid roles on projects.",
};

// Two ways in, named for what the poster is doing (docs/features/
// project-ia.md). Money is not a question here: asking for support and
// adding roles are steps on the project's own page, after it exists.
//
// A split button: the main half is the one the chip goes with (Start a
// project on Projects, Seeking funding and Seeking people; Hire someone on
// Jobs and gigs), and the arrow opens both.
function PostMenu({
  primary,
  onProject,
  onHire,
}: {
  primary: { label: string; onClick: () => void };
  onProject: () => void;
  onHire: () => void;
}) {
  const [open, setOpen] = useState(false);
  const items = [
    {
      label: "Start a project",
      hint: "Something you're making. Once it's up, add the people you need or ask for support.",
      onClick: onProject,
    },
    {
      label: "Hire someone",
      hint: "One job, or a recurring gig — every Friday, say. Say what it pays.",
      onClick: onHire,
    },
  ];
  const fill = { fontFamily: "var(--garden-font-body)", backgroundColor: "var(--garden-citron)", color: "var(--garden-ink)" };
  return (
    <div className="relative inline-flex">
      <button
        type="button"
        onClick={primary.onClick}
        className="pl-4 pr-3 py-2 rounded-l-lg text-[13.5px] font-semibold whitespace-nowrap transition-opacity hover:opacity-90"
        style={fill}
      >
        {primary.label}
      </button>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label="More ways to post"
        className="px-2 py-2 rounded-r-lg transition-opacity hover:opacity-90"
        style={{ ...fill, borderLeft: "1px solid rgba(18,18,18,0.25)" }}
      >
        <ChevronDownIcon className={`w-4 h-4 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            className="absolute right-0 top-full mt-2 w-64 rounded-xl border overflow-hidden z-50"
            style={{ backgroundColor: "var(--garden-ink-raised)", borderColor: "var(--garden-hairline)" }}
          >
            {items.map((item, i) => (
              <button
                key={item.label}
                onClick={() => {
                  setOpen(false);
                  item.onClick();
                }}
                className="block w-full text-left px-4 py-3 text-sm transition-colors hover:opacity-80"
                style={{
                  color: "var(--garden-paper)",
                  borderBottom: i < items.length - 1 ? "1px solid var(--garden-hairline)" : undefined,
                }}
              >
                <span className="block font-medium">{item.label}</span>
                <span className="block text-xs mt-0.5" style={{ color: "var(--garden-body)" }}>
                  {item.hint}
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/** The cover a project without a photo gets. Lighter than the card around
 * it, with a faint hairline texture, so an empty cover reads as a surface
 * rather than a hole with a "missing image" icon in it. Neutral on purpose:
 * citron is for actions and chip-scale badges, never large fills. */
const EMPTY_COVER = {
  backgroundColor: "var(--garden-hairline-raised)",
  backgroundImage:
    "repeating-linear-gradient(135deg, rgba(247,247,244,0.05) 0 1px, transparent 1px 11px)",
};

export function ProjectCard({
  project,
  lens,
  onSupport,
  matched,
}: {
  project: any;
  lens: ProjectsLens;
  onSupport: (mode: SupportMode) => void;
  matched?: boolean;
}) {
  // The photo first, then the pasted link's still, then the first attached
  // artifact's file (docs/features/creator-media-cross-post.md, Round 2).
  // The still is static — a grid never loads a player.
  const photo = project.resolvedPhotoUrl ?? null;
  const mediaEmbed = photo ? null : toEmbedUrl(project.mediaUrl);
  const thumb =
    photo ??
    (mediaEmbed ? null : (project.media.find((m: any) => m.resolvedMediaUrl)?.resolvedMediaUrl ?? null));
  const hasCover = !!thumb || !!mediaEmbed;
  // Passion-only campaign deadline (docs/the-exchange-v1-prd.md §7 review
  // follow-up) — a past raiseByDate just means the badge doesn't render;
  // building a distinct "expired" state is explicitly out of scope.
  const daysLeft =
    project.kind === "passion" && project.raiseByDate && project.raiseByDate > Date.now()
      ? Math.max(1, Math.ceil((project.raiseByDate - Date.now()) / 86400000))
      : null;

  // The first line says what the card is (lib/projectKind): "Job",
  // "Recurring gig · Fridays 8–10pm", "Volunteer" (an unpaid posting never
  // passes itself off as paid), or "Seeking funding" / "Project". On Jobs and gigs a
  // project with a paid role leads with that role: "Role on Harbor Mural ·
  // Paid", the role as the title, its pay in the corner. The money half
  // ("$400", "$300–600", "Open to proposals") comes from the same helper as
  // the full badge on /projects/:id.
  const raising = isRaising(project);
  const onJobsAndGigs = lens === "work";
  const role = leadRoles(project, onJobsAndGigs)[0] ?? null;
  const kindWord = projectKindLabel(project, { onJobsAndGigs, raising });
  const moneyAmount =
    project.kind === "paid" && budgetKindLabel(project) === "Paid" ? budgetAmountLabel(project) : role ? rolePay(role) : null;
  // A gig's money is per date ("$300/date"), not per project.
  const moneyWord = moneyAmount && project.gig && project.budgetType === "amount" ? `${moneyAmount}/date` : moneyAmount;
  const title = role ? role.title : project.title;
  const stage = resolveStage(project);
  const openRoles: any[] = project.openRoles ?? [];
  // The roles spelled out with their pay, where they are the reason the card
  // is here (Seeking people, Jobs and gigs); elsewhere a count says it. The
  // role the card leads with is not listed twice.
  const spellRoles = lens === "people" || lens === "work";
  const otherRoles = role ? openRoles.filter((r) => r !== role) : openRoles;

  const card = (
    <div
      className="group rounded-2xl overflow-hidden border h-full flex flex-col transition-colors"
      style={{ borderColor: "var(--garden-hairline)", backgroundColor: "var(--garden-ink-raised)" }}
    >
      {/* Same fixed overlay spot Classes uses: kind top-left, money top-right
          of the image area, in the SAME place whether or not there's a
          photo — founder item (Classes redesign) was explicit that a
          photo-dependent position defeats the point of a fixed badge.
          Without a photo the area collapses to a strip on a phone, where a
          16:10 empty box was most of a screen of nothing; it keeps the full
          box from sm up, where cards sit side by side and rows must line up. */}
      <div
        className={`relative overflow-hidden flex items-center justify-center ${
          hasCover ? "aspect-[16/10]" : "h-16 sm:h-auto sm:aspect-[16/10]"
        }`}
        style={hasCover ? { backgroundColor: "var(--garden-ink)" } : EMPTY_COVER}
      >
        {/* The picture dissolves in as the card scrolls into view; the
            badges over it don't, so the card's facts are readable at once. */}
        {thumb && (
          <Dissolve className="w-full h-full">
            <img
              src={thumb}
              alt={project.title}
              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
          </Dissolve>
        )}
        {mediaEmbed && (
          <Dissolve className="absolute inset-0">
            <EmbedStill
              embed={mediaEmbed}
              previewUrl={project.mediaPreviewUrl}
              title={project.title}
              badgeSize="sm"
            />
          </Dissolve>
        )}
        {/* One row, so a long first line and the money never sit on each other. */}
        <div className="absolute inset-x-2 top-2 flex items-start justify-between gap-2">
          <span
            className="min-w-0 px-2 py-0.5 rounded-[14px] text-[12px] font-semibold uppercase tracking-[0.06em] leading-snug line-clamp-2"
            style={{
              fontFamily: "var(--garden-font-mono)",
              backgroundColor: "rgba(20,20,18,0.72)",
              color: "var(--garden-paper)",
            }}
          >
            {kindWord}
          </span>
          {moneyWord && (
            <span
              className="shrink-0 px-2.5 py-1 rounded-full text-xs font-bold"
              style={{
                fontFamily: "var(--garden-font-mono)",
                backgroundColor: "var(--garden-citron)",
                color: "var(--garden-ink)",
              }}
            >
              {moneyWord}
            </span>
          )}
        </div>
      </div>
      <div className="p-4 flex-1 flex flex-col min-w-0">
        <h3
          className="font-semibold line-clamp-2 mb-1"
          style={{ color: "var(--garden-paper)", fontFamily: "var(--garden-font-display)" }}
        >
          {title}
        </h3>
        <div className="flex flex-wrap items-center gap-1.5 mb-2">
          {/* Stage always shows — see docs/features/project-teams.md §7 —
              right beside the money/budget badge above it. Days-left folds
              into the same pill instead of getting its own, so a passion
              campaign near its deadline doesn't need two near-identical
              pills to say one thing ("active" + "5 days left"). The
              nonprofit-funding note lives on the project's own detail page
              (projects.$id.tsx) — it's provenance, not a browse-time
              decision factor, so it doesn't need a pill here too. */}
          <span
            className="self-start px-2 py-0.5 rounded-full text-[12px] font-medium uppercase tracking-[0.06em]"
            style={{
              fontFamily: "var(--garden-font-mono)",
              backgroundColor: "rgba(198,198,190,0.1)",
              color: "var(--garden-muted)",
            }}
          >
            {stageLabel(stage)}
            {daysLeft !== null && ` · ${daysLeft} ${daysLeft === 1 ? "day" : "days"} left`}
          </span>
          {matched && (
            <span
              className="self-start px-2 py-0.5 rounded-full text-[12px] font-medium uppercase tracking-[0.06em]"
              style={{
                fontFamily: "var(--garden-font-mono)",
                backgroundColor: "rgba(254,226,104,0.14)",
                color: "var(--garden-citron)",
              }}
            >
              Matches you
            </span>
          )}
          {/* Stage (above) now carries the lifecycle signal on every card;
              this legacy status pill is kept only for archived, per
              docs/features/project-teams.md §7. */}
          {project.status === "archived" && (
            <span
              className="self-start px-2 py-0.5 rounded-full text-[12px] font-medium uppercase tracking-[0.06em]"
              style={{
                fontFamily: "var(--garden-font-mono)",
                backgroundColor: "rgba(198,198,190,0.1)",
                color: "var(--garden-muted)",
              }}
            >
              {STATUS_LABELS[project.status] ?? project.status}
            </span>
          )}
        </div>
        {project.gig && (
          // Live booking: the schedule in one line — the card's real
          // decision factor for a musician scanning for work.
          <p className="text-[13px] mb-2" style={{ color: "var(--garden-body)" }}>
            {project.gig.venueName ? `${project.gig.venueName} · ` : ""}
            {project.gig.schedule}
            {project.gig.status === "open" && project.gig.nextDateLabel
              ? ` · next ${project.gig.nextDateLabel}`
              : project.gig.status === "paused"
                ? " · paused"
                : project.gig.status === "ended"
                  ? " · ended"
                  : ""}
            {project.gig.status === "open" && project.gig.openCount > 0 && (
              <span style={{ color: "var(--garden-citron)" }}>
                {" "}· {project.gig.openCount} {project.gig.openCount === 1 ? "date" : "dates"} open
              </span>
            )}
          </p>
        )}
        {otherRoles.length > 0 &&
          (spellRoles ? (
            <ul className="text-[13px] mb-2 flex flex-col gap-0.5" style={{ color: "var(--garden-body)" }}>
              {otherRoles.slice(0, 3).map((r) => (
                <li key={r.roleId} className="flex justify-between gap-2">
                  <span className="min-w-0 break-words">{r.title}</span>
                  {r.budgetType && (
                    <span className="shrink-0" style={{ color: "var(--garden-citron)", fontFamily: "var(--garden-font-mono)" }}>
                      {budgetAmountLabel(r) ?? budgetKindLabel(r)}
                    </span>
                  )}
                </li>
              ))}
              {otherRoles.length > 3 && (
                <li style={{ color: "var(--garden-muted)" }}>+{otherRoles.length - 3} more</li>
              )}
            </ul>
          ) : (
            <p className="text-[13px] mb-2" style={{ color: "var(--garden-citron)" }}>
              Looking for {openRoles.length} {openRoles.length === 1 ? "person" : "people"}
            </p>
          ))}
        {raising && (project.goal ?? 0) > 0 && (
          <GoalProgress raisedCents={project.raisedCents ?? 0} goal={project.goal} compact />
        )}
        {project.interests && project.interests.length > 0 && (
          // Capped at 3 — a browse card is a scan, not the full tag list
          // (that's what the detail page is for); every tag rendered here
          // was competing with the title and blurb for the same glance.
          <div className="flex flex-wrap gap-1 mb-2">
            {project.interests.slice(0, 3).map((tag: string) => (
              <span
                key={tag}
                className="px-2 py-0.5 rounded-full text-[12px] font-medium"
                style={{
                  fontFamily: "var(--garden-font-body)",
                  backgroundColor: "rgba(198,198,190,0.1)",
                  color: "var(--garden-muted)",
                }}
              >
                {tag}
              </span>
            ))}
            {project.interests.length > 3 && (
              <span
                className="px-2 py-0.5 rounded-full text-[12px] font-medium"
                style={{
                  fontFamily: "var(--garden-font-body)",
                  color: "var(--garden-dim)",
                }}
              >
                +{project.interests.length - 3}
              </span>
            )}
          </div>
        )}
        {project.blurb && (
          <p className="text-sm line-clamp-2 mb-3" style={{ color: "var(--garden-dim)" }}>
            {project.blurb}
          </p>
        )}
        <div className="mt-auto flex items-center justify-between gap-2 pt-2 min-w-0">
          {project.creator && (
            <div className="flex items-center gap-2 min-w-0">
              {project.creator.imageUrl ? (
                <img
                  src={project.creator.imageUrl}
                  alt={project.creator.name}
                  className="w-5 h-5 rounded-full object-cover shrink-0"
                />
              ) : (
                <div
                  className="w-5 h-5 rounded-full flex items-center justify-center text-[12px] font-bold shrink-0"
                  style={{ backgroundColor: "var(--garden-hairline-raised)", color: "var(--garden-paper)" }}
                >
                  {project.creator.name.charAt(0).toUpperCase()}
                </div>
              )}
              {/* Names are never truncated — the card wraps to fit instead */}
              <span className="text-xs break-words" style={{ color: "var(--garden-muted)" }}>
                {project.creator.name}
                {project.community && (
                  <span style={{ color: "var(--garden-dim)" }}> · in {project.community.name}</span>
                )}
              </span>
            </div>
          )}
        </div>
        {project.kind === "passion" && lens !== "work" && (
          // Stacked, not side by side: a grid card is too narrow for a
          // count and two buttons on one line.
          <div className="mt-3 pt-3" style={{ borderTop: "1px solid var(--garden-hairline)" }}>
            <p className="text-xs mb-2" style={{ color: "var(--garden-dim)" }}>
              {project.supportCount > 0
                ? `${project.supportCount} ${project.supportCount === 1 ? "supporter" : "supporters"}`
                : "No supporters yet"}
            </p>
            <SupportButtons raising={raising} onSupport={onSupport} size="sm" stretch />
          </div>
        )}
      </div>
    </div>
  );

  // Every card is now a real, working link — before this it only linked
  // anywhere at all when an attached portfolio artifact existed, and even
  // then it diverted to that artifact's own /works page rather than the
  // project's own page. That left most cards (any project with no attached
  // media) not clickable at all.
  return <Link to={`/projects/${project._id}`}>{card}</Link>;
}

function chipStyle(on: boolean) {
  return {
    fontFamily: "var(--garden-font-body)",
    backgroundColor: on ? "rgba(254,226,104,0.14)" : "var(--garden-ink-raised)",
    color: on ? "var(--garden-citron)" : "var(--garden-muted)",
  };
}

function FilterChip({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      className="px-3 py-1.5 rounded-lg text-[13.5px] font-medium whitespace-nowrap transition-colors"
      style={chipStyle(on)}
    >
      {label}
    </button>
  );
}

/** "Stage ▾": Any stage, Planning, Forming team, Working, Released. Reads as
 * the stage that is chosen once one is. Narrows any chip but Jobs and gigs. */
function StageMenu({ stage, onChange }: { stage: string; onChange: (stage: string) => void }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="true"
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13.5px] font-medium whitespace-nowrap transition-colors"
        style={chipStyle(!!stage)}
      >
        {stageCaption(stage)}
        <ChevronDownIcon className={`w-4 h-4 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            role="group"
            aria-label="Stage"
            className="absolute left-0 top-full mt-2 w-48 rounded-xl border overflow-hidden z-50 py-1"
            style={{ backgroundColor: "var(--garden-ink-raised)", borderColor: "var(--garden-hairline)" }}
          >
            {STAGE_OPTIONS.map((o) => {
              const on = stage === o.value;
              return (
                <button
                  key={o.value || "any"}
                  type="button"
                  aria-pressed={on}
                  onClick={() => {
                    setOpen(false);
                    onChange(o.value);
                  }}
                  className="block w-full text-left px-4 py-2 text-[13.5px] transition-colors hover:opacity-80"
                  style={{ color: on ? "var(--garden-citron)" : "var(--garden-paper)", fontWeight: on ? 600 : 400 }}
                >
                  {o.label}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

export type SupportMode = "cheer" | "back";

/** The two ways to show up for a project (docs/features/project-ia.md).
 * Cheering is always there and costs nothing; backing only appears once the
 * owner has asked for support — a project that isn't raising has no money
 * button to press. */
export function SupportButtons({
  raising,
  onSupport,
  size = "md",
  stretch,
}: {
  raising: boolean;
  onSupport: (mode: SupportMode) => void;
  size?: "sm" | "md";
  /** Fill the row, buttons sharing it equally (the grid card). */
  stretch?: boolean;
}) {
  const pad = size === "sm" ? "px-2.5 py-1.5 min-w-0" : "px-4 py-2";
  const click = (mode: SupportMode) => (e: React.MouseEvent) => {
    // Cards are links; a button inside one must not also navigate.
    e.preventDefault();
    e.stopPropagation();
    onSupport(mode);
  };
  return (
    <div className={`flex items-center gap-2 ${stretch ? "w-full [&>button]:flex-1" : "shrink-0"}`}>
      <button
        onClick={click("cheer")}
        className={`${pad} rounded-lg text-[13.5px] font-semibold whitespace-nowrap border transition-opacity hover:opacity-90`}
        style={{ borderColor: "var(--garden-hairline-raised)", color: "var(--garden-paper)" }}
      >
        Cheer them on
      </button>
      {raising && (
        <button
          onClick={click("back")}
          className={`${pad} rounded-lg text-[13.5px] font-semibold whitespace-nowrap transition-opacity hover:opacity-90`}
          style={{ backgroundColor: "var(--garden-citron)", color: "var(--garden-ink)" }}
        >
          Back this
        </button>
      )}
    </div>
  );
}

/** "$420 of $1,000" and a thin bar. `goal` is in dollars, as stored. */
export function GoalProgress({
  raisedCents,
  goal,
  compact,
}: {
  raisedCents: number;
  goal: number;
  compact?: boolean;
}) {
  const raised = raisedCents / 100;
  const pct = Math.min(100, Math.round((raised / goal) * 100));
  return (
    <div className={compact ? "mb-2" : "mb-3"}>
      <p
        className={compact ? "text-[13px] mb-1" : "text-sm mb-1.5"}
        style={{ color: "var(--garden-body)", fontFamily: "var(--garden-font-mono)" }}
      >
        <span style={{ color: "var(--garden-paper)" }}>${raised.toLocaleString("en-US")}</span> of $
        {goal.toLocaleString("en-US")}
      </p>
      <div className="h-1 rounded-full overflow-hidden" style={{ backgroundColor: "var(--garden-hairline-raised)" }}>
        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: "var(--garden-citron)" }} />
      </div>
    </div>
  );
}

// Minimal utility control, not a design centerpiece — a creator changing
// their own project's status via the new updateProjectStatus mutation.
export function StatusSelect({ project }: { project: any }) {
  const updateProjectStatus = useMutation(api.garden.projects.updateProjectStatus);
  const [saving, setSaving] = useState(false);
  const options = STATUS_OPTIONS_BY_KIND[project.kind] ?? STATUS_OPTIONS_BY_KIND.passion;

  async function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const status = e.target.value;
    setSaving(true);
    try {
      await updateProjectStatus({ projectId: project._id, status });
    } catch {
      // The select reverts on the next render since project.status won't
      // have actually changed server-side — no separate error UI needed
      // for this lightweight control.
    } finally {
      setSaving(false);
    }
  }

  return (
    <select
      value={project.status}
      onChange={handleChange}
      disabled={saving}
      className="text-xs rounded-lg border px-2 py-1 outline-none disabled:opacity-50"
      style={{
        backgroundColor: "var(--garden-ink)",
        borderColor: "var(--garden-hairline-raised)",
        color: "var(--garden-body)",
      }}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

// Split by the two buttons (SupportButtons): cheering is free — a message or
// an offer of help; backing is money.
const SUPPORT_TYPES: Record<SupportMode, { value: string; label: string }[]> = {
  cheer: [
    { value: "encouragement", label: "Send a message" },
    { value: "resource", label: "Offer help or gear" },
  ],
  back: [
    { value: "financial_one_time", label: "Once" },
    { value: "financial_recurring", label: "Monthly" },
    { value: "financial_annual", label: "Yearly" },
  ],
};

// Twin of MIN_BACKING_CENTS in convex/garden/stripeHandlers.ts (the server
// is the authority; this is only so the modal can say it out loud and catch
// an obvious miss before a round trip).
const MIN_BACKING_DOLLARS = 5;

// Backing a project is REAL money now: the two financial options open a
// Stripe Checkout session (convex/garden/stripe.ts's createBackingCheckout)
// and hand the browser off to it, exactly like fund.$slug.tsx's
// AddToPoolPanel. Encouragement and resource offers are unchanged — they're
// free, they post instantly, and nothing about them involves a charge.
//
// Money words (the rule stripe.ts states for its own lane): money moving
// through the platform's Stripe is "back"/"fund"/"add to" — never
// "donate"/"gift"/tax-deductible.
export function SupportModal({
  project,
  mode,
  onClose,
}: {
  project: any;
  mode: SupportMode;
  onClose: () => void;
}) {
  const existing = useQuery(api.garden.support.listSupportForProject, { projectId: project._id });
  const tiers = useQuery((api as any).garden.patronTiers.listTiers, { projectId: project._id });
  const supportProject = useMutation(api.garden.support.supportProject);
  const createBackingCheckout = useAction(api.garden.stripe.createBackingCheckout);

  const [type, setType] = useState(mode === "cheer" ? "encouragement" : "financial_recurring");
  const [amount, setAmount] = useState("");
  const [message, setMessage] = useState("");
  const [resourceDescription, setResourceDescription] = useState("");
  const [visible, setVisible] = useState(true);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [selectedTierId, setSelectedTierId] = useState<string | null>(null);
  const [showCustomAmount, setShowCustomAmount] = useState(false);

  const isFinancial = type === "financial_one_time" || type === "financial_recurring" || type === "financial_annual";
  const billingFilter = type === "financial_one_time" ? "one_time" : "monthly";
  const filteredTiers = tiers?.filter((t: any) => (t.billing ?? "monthly") === billingFilter);
  const hasTiers = filteredTiers && filteredTiers.length > 0;
  const selectedTier = tiers?.find((t: any) => t._id === selectedTierId);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (isFinancial) {
      let finalAmountCents: number;
      let finalTierId: string | undefined;

      if (selectedTier && !showCustomAmount) {
        finalAmountCents = type === "financial_annual" ? selectedTier.priceCents * 12 : selectedTier.priceCents;
        finalTierId = selectedTier._id;
      } else {
        finalAmountCents = Math.round(Number(amount) * 100);
        // Mirrors the server's floor (validateBackingAmount) so an obvious
        // miss costs a round trip to nowhere instead of a round trip to Convex.
        if (!Number.isFinite(finalAmountCents) || finalAmountCents < MIN_BACKING_DOLLARS * 100) {
          setError(`Back this with at least $${MIN_BACKING_DOLLARS}.`);
          return;
        }
      }
      setSubmitting(true);
      try {
        const { url } = await createBackingCheckout({
          projectId: project._id,
          amountCents: finalAmountCents,
          recurring: type !== "financial_one_time",
          visible,
          message: message.trim() || undefined,
          tierId: finalTierId,
          ...(type === "financial_annual" ? { interval: "year" } : {}),
        });
        // Leaving for Stripe — deliberately no setSubmitting(false), so the
        // button stays disabled through the handoff.
        window.location.assign(url);
      } catch (err) {
        setError(errorMessage(err));
        setSubmitting(false);
      }
      return;
    }

    setSubmitting(true);
    try {
      await supportProject({
        projectId: project._id,
        type,
        message: type === "encouragement" ? message.trim() : undefined,
        resourceDescription: type === "resource" ? resourceDescription.trim() : undefined,
        visible,
      });
      setDone(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto" style={{ backgroundColor: "rgba(0,0,0,0.6)" }}>
      <div
        className="w-full max-w-md rounded-2xl border p-6 my-8"
        style={{ backgroundColor: "var(--garden-ink-raised)", borderColor: "var(--garden-hairline)" }}
      >
        <h2
          className="text-xl font-semibold mb-1"
          style={{ color: "var(--garden-paper)", fontFamily: "var(--garden-font-display)" }}
        >
          {mode === "cheer" ? "Cheer on" : "Back"} "{project.title}"
        </h2>
        <p className="text-sm mb-4" style={{ color: "var(--garden-dim)" }}>
          {mode === "cheer"
            ? "A few words, or something you can lend. It's free, and it shows up on the project."
            : "Put money toward this project."}
        </p>

        {existing && existing.length > 0 && (
          <div className="mb-5 pb-5" style={{ borderBottom: "1px solid var(--garden-hairline)" }}>
            <p className="text-xs uppercase tracking-[0.06em] mb-2" style={{ color: "var(--garden-dim)" }}>
              Supported by
            </p>
            <ul className="flex flex-col gap-2 max-h-32 overflow-y-auto">
              {existing.map((e) => (
                <li key={e._id} className="text-sm" style={{ color: "var(--garden-body)" }}>
                  <span style={{ color: "var(--garden-paper)" }}>{e.supporterName}</span>
                  {e.tierName && (
                    <span
                      className="ml-1.5 px-1.5 py-0.5 rounded text-[12px] font-medium uppercase tracking-[0.04em]"
                      style={{ backgroundColor: "rgba(254,226,104,0.12)", color: "var(--garden-citron)" }}
                    >
                      {e.tierName}
                    </span>
                  )}
                  {e.type === "financial_one_time" && e.amountCents && (
                    <span style={{ color: "var(--garden-citron)" }}>
                      {" "}· ${(e.amountCents / 100).toLocaleString()}
                      {e.status === "pledged" ? " pledged" : " backed"}
                    </span>
                  )}
                  {(e.type === "financial_recurring" || e.type === "financial_annual") && e.amountCents && (
                    <span style={{ color: "var(--garden-citron)" }}>
                      {" "}· ${(e.amountCents / 100).toLocaleString()}{e.type === "financial_annual" ? "/yr" : "/mo"}
                      {e.status === "pledged" ? " pledged" : ""}
                    </span>
                  )}
                  {e.message && <span style={{ color: "var(--garden-dim)" }}> — "{e.message}"</span>}
                  {e.resourceDescription && (
                    <span style={{ color: "var(--garden-dim)" }}> — offered {e.resourceDescription}</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {done ? (
          <div className="py-4">
            {/* Only encouragement and resource land here — a financial
                backing leaves for Stripe Checkout instead of resolving
                in-modal. */}
            <p className="text-sm mb-4" style={{ color: "var(--garden-body)" }}>
              Thanks for showing up for this.
            </p>
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm font-semibold"
              style={{ backgroundColor: "var(--garden-citron)", color: "var(--garden-ink)" }}
            >
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-2">
              {SUPPORT_TYPES[mode].map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => { setType(t.value); setSelectedTierId(null); setShowCustomAmount(false); }}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors"
                  style={{
                    fontFamily: "var(--garden-font-body)",
                    backgroundColor: type === t.value ? "var(--garden-citron)" : "var(--garden-ink)",
                    color: type === t.value ? "var(--garden-ink)" : "var(--garden-muted)",
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {isFinancial && hasTiers && !showCustomAmount ? (
              <div className="flex flex-col gap-2">
                {filteredTiers.map((tier: any) => (
                  <button
                    key={tier._id}
                    type="button"
                    onClick={() => { setSelectedTierId(tier._id); setShowCustomAmount(false); }}
                    className="text-left rounded-xl border p-3 transition-colors"
                    style={{
                      borderColor: selectedTierId === tier._id ? "var(--garden-citron)" : "var(--garden-hairline)",
                      backgroundColor: selectedTierId === tier._id ? "rgba(254,226,104,0.08)" : "var(--garden-ink)",
                    }}
                  >
                    <div className="flex items-baseline justify-between gap-2 mb-1">
                      <span className="text-sm font-semibold" style={{ color: "var(--garden-paper)" }}>
                        {tier.name}
                      </span>
                      <span className="text-sm font-bold" style={{ color: "var(--garden-citron)", fontFamily: "var(--garden-font-mono)" }}>
                        ${(tier.billing ?? "monthly") === "one_time"
                          ? (tier.priceCents / 100).toLocaleString()
                          : type === "financial_annual"
                            ? (tier.priceCents * 12 / 100).toLocaleString() + "/yr"
                            : (tier.priceCents / 100).toLocaleString() + "/mo"}
                      </span>
                    </div>
                    {tier.description && (
                      <p className="text-xs mb-1" style={{ color: "var(--garden-body)" }}>{tier.description}</p>
                    )}
                    {tier.benefits && tier.benefits.length > 0 && (
                      <ul className="text-xs flex flex-col gap-0.5" style={{ color: "var(--garden-dim)" }}>
                        {tier.benefits.map((b: string, i: number) => <li key={i}>· {b}</li>)}
                      </ul>
                    )}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => { setSelectedTierId(null); setShowCustomAmount(true); }}
                  className="text-xs underline underline-offset-2 hover:opacity-80 self-start mt-1"
                  style={{ color: "var(--garden-dim)" }}
                >
                  Custom amount instead
                </button>
              </div>
            ) : isFinancial && (
              <div>
                {hasTiers && showCustomAmount && (
                  <button
                    type="button"
                    onClick={() => { setShowCustomAmount(false); }}
                    className="text-xs underline underline-offset-2 hover:opacity-80 mb-2"
                    style={{ color: "var(--garden-dim)" }}
                  >
                    Back to tiers
                  </button>
                )}
                <label className="block text-xs uppercase tracking-[0.06em] mb-1.5" style={{ color: "var(--garden-dim)" }}>
                  Amount (USD{type === "financial_recurring" ? "/mo" : type === "financial_annual" ? "/yr" : ""})
                </label>
                <input
                  type="number"
                  min="1"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="25"
                  className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
                  style={{
                    fontFamily: "var(--garden-font-mono)",
                    backgroundColor: "var(--garden-ink)",
                    borderColor: "var(--garden-hairline-raised)",
                    color: "var(--garden-paper)",
                  }}
                />
                <p
                  className="text-xs mt-1.5 px-2.5 py-1.5 rounded-md"
                  style={{ color: "var(--garden-citron)", backgroundColor: "rgba(254,226,104,0.1)" }}
                >
                  ${MIN_BACKING_DOLLARS} minimum
                  {type === "financial_recurring" ? ", charged monthly until you cancel" : type === "financial_annual" ? ", charged annually until you cancel" : ""}.{" "}
                  {CLAIMS.processingFee} Next step is secure checkout — your card is charged there, not here.
                </p>
              </div>
            )}

            {isFinancial && (
              <div>
                <label className="block text-xs uppercase tracking-[0.06em] mb-1.5" style={{ color: "var(--garden-dim)" }}>
                  Note to the creator (optional)
                </label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={2}
                  placeholder="Why this one matters to you…"
                  className="w-full px-3 py-2 rounded-lg border text-sm outline-none resize-none"
                  style={{
                    backgroundColor: "var(--garden-ink)",
                    borderColor: "var(--garden-hairline-raised)",
                    color: "var(--garden-paper)",
                  }}
                />
              </div>
            )}

            {type === "encouragement" && (
              <div>
                <label className="block text-xs uppercase tracking-[0.06em] mb-1.5" style={{ color: "var(--garden-dim)" }}>
                  Your message
                </label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={3}
                  placeholder="This is great — keep going."
                  className="w-full px-3 py-2 rounded-lg border text-sm outline-none resize-none"
                  style={{
                    backgroundColor: "var(--garden-ink)",
                    borderColor: "var(--garden-hairline-raised)",
                    color: "var(--garden-paper)",
                  }}
                />
              </div>
            )}

            {type === "resource" && (
              <div>
                <label className="block text-xs uppercase tracking-[0.06em] mb-1.5" style={{ color: "var(--garden-dim)" }}>
                  What are you offering
                </label>
                <textarea
                  value={resourceDescription}
                  onChange={(e) => setResourceDescription(e.target.value)}
                  rows={2}
                  placeholder="A spare camera lens, an afternoon of color grading…"
                  className="w-full px-3 py-2 rounded-lg border text-sm outline-none resize-none"
                  style={{
                    backgroundColor: "var(--garden-ink)",
                    borderColor: "var(--garden-hairline-raised)",
                    color: "var(--garden-paper)",
                  }}
                />
              </div>
            )}

            <label className="flex items-center gap-2 text-sm" style={{ color: "var(--garden-body)" }}>
              <input
                type="checkbox"
                checked={visible}
                onChange={(e) => setVisible(e.target.checked)}
              />
              Show me as a supporter
            </label>

            {error && <p className="text-sm text-red-400">{error}</p>}

            <div className="flex gap-2 justify-end pt-2">
              <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-medium" style={{ color: "var(--garden-dim)" }}>
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
                style={{ backgroundColor: "var(--garden-citron)", color: "var(--garden-ink)" }}
              >
                {submitting
                  ? isFinancial
                    ? "Starting checkout…"
                    : "Sending…"
                  : isFinancial
                    ? "Continue to checkout"
                    : "Send"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
