import { useAction, useConvexAuth, useMutation, useQuery } from "convex/react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router";
import { HireFlow } from "../components/HireFlow";
import { useEffect, useMemo, useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { formatCents, formatDollars } from "../../convex/money";
import { justPublished } from "../lib/justPublished";
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
import { distinctKindLabel, leadRoles, rolePay } from "../lib/projectKind";
import { FilterButton, FilterPanel, filterButtonLabel } from "../components/FilterMenu";
import { ChevronDownIcon } from "../components/icons";
import { TagFilterPills } from "../components/TagFilterPills";
import { CLAIMS } from "../constants/claims";
import { toEmbedUrl } from "../lib/videoEmbed";
import { Dissolve } from "../hooks/useReveal";
import { EmbedStill } from "../components/EmbedStill";
import { CoverFrame } from "../components/CoverFrame";
import { EMPTY_COVER } from "../components/emptyCover";
import { CreateCard } from "../components/CreateCard";
import { errorMessage } from "../lib/convexError";
import { FF_BACKING } from "../lib/featureFlags";
import { ProjectModal } from "../components/ProjectModal";
import { INTEREST_OPTIONS } from "../lib/browse/peopleFilter";
import { PAGE_WIDTH } from "../lib/pageWidth";
import { PageTop, TopButton } from "../components/phone/PageTop";
import { CurrencyDollar, Heart, Plus } from "@phosphor-icons/react";
import { readStartStage, shareProjectHref } from "../lib/shareProject";
import { signupHref, supportDetour } from "../lib/pendingIntent";
import { bylineOf } from "../lib/byline";
import { Byline } from "../components/Byline";

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
  // Anyone can browse; posting and cheering need an account. A visitor has
  // none yet, so they go to sign up (Rick, 2026-10-09), which brings them
  // back here.
  const withAccount = (act: () => void) => () =>
    isAuthenticated ? act() : navigate(signupHref(`/projects${window.location.search}`));
  const [showPassionForm, setShowPassionForm] = useState(false);
  // The header's create button and menu and the first card in the grid do the same two
  // things, so they share one handler each.
  // Starting a project signed out asks for an account, not a sign-in (Rick,
  // 2026-10-09): a visitor has none yet. Signup brings them back to the form.
  const startProject = () => (isAuthenticated ? setShowPassionForm(true) : navigate(shareProjectHref(false)));
  const hireSomeone = withAccount(() => setHiring(true));
  const { support, modal: supportModal } = useProjectSupport();
  const [searchParams, setSearchParams] = useSearchParams();
  // /projects?new=project (the palette's "Start a project") opens the start
  // flow once, then drops the param so a refresh doesn't open it again. Signed
  // out, it goes to sign up, replacing this entry so Back doesn't land on the
  // param again, and the redirect keeps ?new=project so the flow opens when
  // they come back. Wait out the token check first: until it settles a
  // signed-in member reads as signed out.
  const wantsNewProject = searchParams.get("new") === "project";
  useEffect(() => {
    if (!wantsNewProject || authLoading) return;
    if (!isAuthenticated) {
      navigate(signupHref(`/projects?${searchParams}`), { replace: true });
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
        {/* A phone gets a bar (docs/features/phone-screens.md): the name,
            and Post in the corner, which opens the same two ways in the
            split button offers on desktop. Desktop keeps the heading and
            the lens's line under it. */}
        <PageTop
          className="md:hidden"
          title="Projects"
          action={<PostMenu look="bar" primary={{ label: create.label, onClick: create.kind === "hire" ? hireSomeone : startProject }} onProject={startProject} onHire={hireSomeone} />}
        />
        <div className="hidden md:block">
          <h1
            className="text-2xl sm:text-3xl font-semibold text-[var(--garden-paper)] mb-1"
            style={{ fontFamily: "var(--garden-font-display)" }}
          >
            Projects
          </h1>
          <p className="text-[var(--garden-body)] mb-6">
            {LENS_BLURB[lens]}
          </p>
        </div>

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

        <div className="mt-1 mb-4 md:mt-3 md:flex md:flex-wrap md:items-center md:justify-between md:gap-x-4 md:gap-y-3">
          <div className="min-w-0 md:flex md:flex-wrap md:items-center md:gap-2">
            {/* On a phone the lenses are one row that scrolls sideways, edge
                to edge, as a block in normal flow: as wide as the page and
                never wider. (As a flex item it took its content's width,
                the page grew to 464px on a 390px phone, and iOS panned the
                whole page sideways, bar included; Rick, 2026-10-12.) Stage
                and the tag filter take the row under it. From md up it all
                wraps on one line as before: the row under becomes
                `contents`, so its two sit beside the lenses. */}
            <div
              role="group"
              aria-label="Show"
              className="flex items-center gap-2 overflow-x-auto px-4 py-1 -mx-4 sm:-mx-6 sm:px-6 md:mx-0 md:flex-wrap md:overflow-visible md:px-0 md:py-0 no-scrollbar"
            >
              {PROJECT_LENSES.map((l) => (
                <FilterChip
                  key={l.value}
                  label={l.label}
                  on={lens === l.value}
                  onClick={() => setView(selectLens({ lens, stage: stageFilter }, l.value))}
                />
              ))}
            </div>
            {(lens !== "work" || allTags.length > 0) && (
              <div className="mt-3 flex items-center gap-2 md:contents">
                {lens !== "work" && (
                  <>
                    <span
                      role="separator"
                      aria-orientation="vertical"
                      className="hidden md:block mx-1 h-5 w-px"
                      style={{ backgroundColor: "var(--garden-hairline-raised)" }}
                    />
                    <StageMenu stage={stageFilter} onChange={(stage) => setView({ lens, stage })} />
                  </>
                )}
                {allTags.length > 0 && (
                  <FilterButton
                    open={tagsExpanded}
                    onClick={() => setTagsExpanded((v) => !v)}
                    label={filterButtonLabel(tagOptions, tagFilter)}
                    active={tagFilter.length > 0}
                    className="py-1.5! rounded-lg!"
                  />
                )}
              </div>
            )}
          </div>
          <div className="hidden md:block">
            <PostMenu
              primary={{ label: create.label, onClick: create.kind === "hire" ? hireSomeone : startProject }}
              onProject={startProject}
              onHire={hireSomeone}
            />
          </div>
        </div>

        {tagsExpanded && (
          <FilterPanel className="mb-4">
            <TagFilterPills
              options={tagOptions}
              active={tagFilter}
              onToggle={toggleTag}
              onClear={() => setTagFilter([])}
            />
          </FilterPanel>
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
            {filtered.length === 0 && communitySlug === "all" && (
              // A phone has no make-one tile in the feed (Post is in the
              // bar), so an empty list says so here. From sm up the tile is
              // the empty state.
              <p className="py-10 text-center text-[15px] sm:hidden" style={{ color: "var(--garden-muted)" }}>
                Nothing here yet.{" "}
                <button
                  type="button"
                  onClick={create.kind === "hire" ? hireSomeone : startProject}
                  className="underline underline-offset-2"
                  style={{ color: "var(--garden-citron)" }}
                >
                  {create.label}
                </button>
              </p>
            )}
            {/* The make-one card is first from sm up, so an empty list is
                just the grid with that one card in it. A phone reads the
                list as a feed: one column, each project edge to edge
                (ProjectCard's feed look), no tile. */}
            <div className="-mx-4 grid grid-cols-1 gap-7 sm:mx-0 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
              <div className="hidden sm:block">
                <CreateCard label={create.label} onClick={create.kind === "hire" ? hireSomeone : startProject} />
              </div>
              {filtered.map((project) => (
                <ProjectCard
                  key={project._id}
                  project={project}
                  lens={lens}
                  feed
                  onSupport={(mode) => support(project, mode)}
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
          onCreated={(projectId) => navigate(justPublished(`/projects/${projectId}`))}
          onSwitchToProject={() => {
            setHiring(false);
            setShowPassionForm(true);
          }}
        />
      )}
      {showPassionForm && (
        <ProjectModal
          onClose={() => setShowPassionForm(false)}
          onCreated={(projectId) => navigate(justPublished(`/projects/${projectId}`))}
          initialTitle={searchParams.get("title")?.trim() || undefined}
          initialStage={readStartStage(searchParams)}
        />
      )}
      {supportModal}
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
  look = "split",
}: {
  primary: { label: string; onClick: () => void };
  onProject: () => void;
  onHire: () => void;
  /** "bar": one Post pill in the phone's top bar that opens the two choices. */
  look?: "split" | "bar";
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
      {look === "bar" ? (
        <TopButton onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-haspopup="true" icon={<Plus size={16} weight="bold" aria-hidden />}>
          Post
        </TopButton>
      ) : (
        <>
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
        </>
      )}
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

export function ProjectCard({
  project,
  lens,
  onSupport,
  matched,
  feed = false,
}: {
  project: any;
  lens: ProjectsLens;
  onSupport: (mode: SupportMode) => void;
  matched?: boolean;
  /** The feed look on a phone (docs/features/phone-screens.md): no frame,
   * the cover edge to edge and the words under it. From sm up the framed
   * grid card either way. Only /projects passes it. */
  feed?: boolean;
}) {
  // The photo first, then the pasted link's still, then the first attached
  // artifact's file (docs/features/creator-media-cross-post.md, Round 2).
  // The still is static — a grid never loads a player.
  const photo = project.resolvedPhotoUrl ?? null;
  const mediaEmbed = photo ? null : toEmbedUrl(project.mediaUrl);
  const thumb =
    photo ??
    (mediaEmbed ? null : (project.media.find((m: any) => m.resolvedMediaUrl)?.resolvedMediaUrl ?? null));
  // Passion-only campaign deadline (docs/the-exchange-v1-prd.md §7 review
  // follow-up) — a past raiseByDate just means the badge doesn't render;
  // building a distinct "expired" state is explicitly out of scope.
  const daysLeft =
    project.kind === "passion" && project.raiseByDate && project.raiseByDate > Date.now()
      ? Math.max(1, Math.ceil((project.raiseByDate - Date.now()) / 86400000))
      : null;

  // The first line says what the card is (lib/projectKind): "Job",
  // "Recurring gig · Fridays 8–10pm", "Volunteer" (an unpaid posting never
  // passes itself off as paid), or "Seeking funding". A plain project says
  // nothing: "Project" on every card of a list of projects is noise. On Jobs
  // and gigs a project with a paid role leads with that role: "Role on
  // Harbor Mural · Paid", the role as the title, its pay in the corner. The
  // money half ("$400", "$300–600", "Open to proposals") comes from the same
  // helper as the full badge on /projects/:id.
  const raising = isRaising(project);
  const onJobsAndGigs = lens === "work";
  const role = leadRoles(project, onJobsAndGigs)[0] ?? null;
  const kindWord = distinctKindLabel(project, { onJobsAndGigs, raising });
  const moneyAmount =
    project.kind === "paid" && budgetKindLabel(project) === "Paid" ? budgetAmountLabel(project) : role ? rolePay(role) : null;
  // A gig's money is per date ("$300/date"), not per project.
  const moneyWord = moneyAmount && project.gig && project.budgetType === "amount" ? `${moneyAmount}/date` : moneyAmount;
  // Something to pin to the top of the cover: the first line or the money.
  const hasBadge = !!kindWord || !!moneyWord;
  const title = role ? role.title : project.title;
  const stage = resolveStage(project);
  const openRoles: any[] = project.openRoles ?? [];
  // The roles spelled out with their pay, where they are the reason the card
  // is here (Seeking people, Jobs and gigs); elsewhere a count says it. The
  // role the card leads with is not listed twice.
  const spellRoles = lens === "people" || lens === "work";
  const otherRoles = role ? openRoles.filter((r) => r !== role) : openRoles;
  // Posted as an organization: the organization, not the person who runs it.
  const byline = bylineOf(project);

  const card = (
    <div
      className={`group overflow-hidden h-full flex flex-col transition-colors ${
        feed ? "sm:rounded-2xl sm:border sm:bg-[var(--garden-ink-raised)]" : "rounded-2xl border bg-[var(--garden-ink-raised)]"
      }`}
      style={{ borderColor: "var(--garden-hairline)" }}
    >
      {/* Same fixed overlay spot Classes uses: kind top-left, money top-right
          of the image area, in the SAME place whether or not there's a
          photo — founder item (Classes redesign) was explicit that a
          photo-dependent position defeats the point of a fixed badge.
          The cover is 4:5 (docs/features/cover-4x5.md). Without a photo the
          area collapses to a strip on a phone, where a portrait empty box
          was most of a screen of nothing, and goes altogether when there's
          no badge for the strip to hold; it keeps the full 4:5 box from sm
          up, where cards sit side by side and rows must line up. The
          badges sit beside the cover, not inside it, so the picture
          dissolves in as the card scrolls into view and they don't. */}
      <div className="relative">
        {thumb ? (
          <Dissolve>
            <CoverFrame src={thumb} alt={project.title} />
          </Dissolve>
        ) : mediaEmbed ? (
          <Dissolve>
            <div
              className="relative aspect-[4/5] overflow-hidden"
              style={{ backgroundColor: "var(--garden-ink)" }}
            >
              <EmbedStill
                embed={mediaEmbed}
                previewUrl={project.mediaPreviewUrl}
                title={project.title}
                badgeSize="sm"
              />
            </div>
          </Dissolve>
        ) : (
          <div
            className={hasBadge ? "h-16 sm:h-auto sm:aspect-[4/5]" : "hidden sm:block sm:aspect-[4/5]"}
            style={EMPTY_COVER}
          />
        )}
        {/* One row, so a long first line and the money never sit on each other. */}
        {hasBadge && (
          <div className="absolute inset-x-2 top-2 flex items-start justify-between gap-2">
            {kindWord && (
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
            )}
            {moneyWord && (
              <span
                className="ml-auto shrink-0 px-2.5 py-1 rounded-full text-xs font-bold"
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
        )}
      </div>
      <div className={`flex-1 flex flex-col min-w-0 ${feed ? "px-4 py-3 sm:p-4" : "p-4"}`}>
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
        {project.viewerGate && (
          // The card is one big link, so this is words, not a nested link;
          // the project page carries the membership link.
          <p className="text-[13px] mb-2" style={{ color: "var(--garden-body)" }}>
            Members respond.{project.viewerGate.upgradePath ? ` ${project.viewerGate.upgradePath}` : ""}
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
        {/* Who made it, and the two ways to show up for it as icons at the
            end of the same line, the way a feed post carries its heart. A
            job or gig is paid, not backed, so it has none. */}
        <div className="mt-auto flex items-center justify-between gap-2 pt-2 min-w-0">
          {byline && (
            <Byline byline={byline} size="sm">
              {project.community && (
                <span style={{ color: "var(--garden-dim)" }}> · in {project.community.name}</span>
              )}
            </Byline>
          )}
          {project.kind === "passion" && lens !== "work" && (
            <div className="ml-auto">
              <SupportButtons raising={raising} onSupport={onSupport} count={project.supportCount} size="sm" />
            </div>
          )}
        </div>
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

/** The two ways to show up for a project (docs/features/project-ia.md), as
 * icons: a heart to Cheer, a dollar to Back this (Rick, 2026-10-22).
 * Cheering is always there and costs nothing; backing only appears once the
 * owner has asked for support — a project that isn't raising has no money
 * button to press — and only while backing is open (FF_BACKING). `count`
 * (everyone who cheered or backed it) sits beside the heart once there is
 * one. */
export function SupportButtons({
  raising,
  onSupport,
  count = 0,
  size = "md",
}: {
  raising: boolean;
  onSupport: (mode: SupportMode) => void;
  count?: number;
  size?: "sm" | "md" | "post";
}) {
  // `post` is a feed post's action row (Today): 44px targets, a bigger
  // heart, and the count in the page's own text colour at 15px semibold.
  const post = size === "post";
  const box = post ? "w-11 h-11" : size === "sm" ? "w-9 h-9" : "w-10 h-10";
  const icon = post ? 26 : size === "sm" ? 20 : 22;
  const click = (mode: SupportMode) => (e: React.MouseEvent) => {
    // Cards are links; a button inside one must not also navigate.
    e.preventDefault();
    e.stopPropagation();
    onSupport(mode);
  };
  return (
    <div className="flex items-center gap-1 shrink-0">
      <button
        type="button"
        onClick={click("cheer")}
        aria-label="Cheer"
        title="Cheer"
        className={`${box} inline-flex items-center justify-center rounded-full transition-opacity hover:opacity-80`}
        style={{ color: post ? "var(--app-text)" : "var(--garden-paper)" }}
      >
        <Heart size={icon} aria-hidden="true" />
      </button>
      {count > 0 && (
        <span
          className={post ? "text-[15px] font-semibold tabular-nums pr-2" : "text-[13.5px] tabular-nums pr-1"}
          style={
            post
              ? { color: "var(--app-text)" }
              : { color: "var(--garden-muted)", fontFamily: "var(--garden-font-mono)" }
          }
        >
          {count}
          <span className="sr-only"> {count === 1 ? "supporter" : "supporters"}</span>
        </span>
      )}
      {raising && FF_BACKING && (
        <button
          type="button"
          onClick={click("back")}
          aria-label="Back this"
          title="Back this"
          className={`${box} inline-flex items-center justify-center rounded-full transition-opacity hover:opacity-90`}
          style={{ backgroundColor: "var(--garden-citron)", color: "var(--garden-ink)" }}
        >
          <CurrencyDollar size={icon} weight="bold" aria-hidden="true" />
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
        <span style={{ color: "var(--garden-paper)" }}>{formatCents(raisedCents)}</span> of {formatDollars(goal)}
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

/** What a backing tier costs, as the backer reads it: "$25" once, "$25/mo",
 *  or "$300/yr" when they pick Yearly (twelve months, charged together). */
export function tierPriceLabel(tier: { priceCents: number; billing?: string }, type: string): string {
  if ((tier.billing ?? "monthly") === "one_time") return formatCents(tier.priceCents);
  if (type === "financial_annual") return `${formatCents(tier.priceCents * 12)}/yr`;
  return `${formatCents(tier.priceCents)}/mo`;
}

// Twin of MIN_BACKING_CENTS in convex/garden/stripeHandlers.ts (the server
// is the authority; this is only so the modal can say it out loud and catch
// an obvious miss before a round trip).
const MIN_BACKING_DOLLARS = 5;

// One-tap amounts in the Back this modal; each goes straight to Stripe.
export const BACKING_PRESET_DOLLARS = [10, 25, 50] as const;

/** What SupportModal sends createBackingCheckout. A signed-out backer who
 *  chose to be named sends that name, trimmed (the server stores a guest's
 *  backing under it); an anonymous guest and a member send none. Pure. */
export function backingCheckoutArgs(p: {
  projectId: Id<"projects">;
  amountCents: number;
  type: string;
  visible: boolean;
  message: string;
  tierId?: string;
  signedIn: boolean;
  guestName: string;
}) {
  return {
    projectId: p.projectId,
    amountCents: p.amountCents,
    recurring: p.type !== "financial_one_time",
    visible: p.visible,
    message: p.message.trim() || undefined,
    tierId: p.tierId,
    ...(p.type === "financial_annual" ? { interval: "year" as const } : {}),
    ...(!p.signedIn && p.visible ? { guestName: p.guestName.trim() } : {}),
  };
}

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
  // The project page is public, and a visitor may back it without an
  // account: once only (a monthly backing needs one, and the server says
  // so), under the name they type unless they back it anonymously.
  const { isAuthenticated } = useConvexAuth();

  const [type, setType] = useState(
    mode === "cheer" ? "encouragement" : isAuthenticated ? "financial_recurring" : "financial_one_time",
  );
  const [guestName, setGuestName] = useState("");
  // A guest backs once: Monthly and Yearly need an account, so they aren't offered.
  const typeOptions =
    mode === "back" && !isAuthenticated
      ? SUPPORT_TYPES.back.filter((t) => t.value === "financial_one_time")
      : SUPPORT_TYPES[mode];
  const [amount, setAmount] = useState("");
  const [message, setMessage] = useState("");
  const [resourceDescription, setResourceDescription] = useState("");
  const [visible, setVisible] = useState(true);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [selectedTierId, setSelectedTierId] = useState<string | null>(null);
  const [showCustomAmount, setShowCustomAmount] = useState(false);
  const [showOtherAmount, setShowOtherAmount] = useState(false);

  const isFinancial = type === "financial_one_time" || type === "financial_recurring" || type === "financial_annual";
  const billingFilter = type === "financial_one_time" ? "one_time" : "monthly";
  const filteredTiers = tiers?.filter((t: any) => (t.billing ?? "monthly") === billingFilter);
  const hasTiers = filteredTiers && filteredTiers.length > 0;
  const selectedTier = tiers?.find((t: any) => t._id === selectedTierId);

  async function startCheckout(finalAmountCents: number, finalTierId?: string) {
    setError("");
    // Mirrors the server's floor (validateBackingAmount) so an obvious
    // miss costs a round trip to nowhere instead of a round trip to Convex.
    if (!Number.isFinite(finalAmountCents) || finalAmountCents < MIN_BACKING_DOLLARS * 100) {
      setError(`Back this with at least $${MIN_BACKING_DOLLARS}.`);
      return;
    }
    setSubmitting(true);
    try {
      const { url } = await createBackingCheckout(
        backingCheckoutArgs({
          projectId: project._id,
          amountCents: finalAmountCents,
          type,
          visible,
          message,
          tierId: finalTierId,
          signedIn: isAuthenticated,
          guestName,
        }),
      );
      // Leaving for Stripe — deliberately no setSubmitting(false), so the
      // button stays disabled through the handoff.
      window.location.assign(url);
    } catch (err) {
      setError(errorMessage(err));
      setSubmitting(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (isFinancial) {
      if (selectedTier && !showCustomAmount) {
        await startCheckout(
          type === "financial_annual" ? selectedTier.priceCents * 12 : selectedTier.priceCents,
          selectedTier._id,
        );
      } else {
        await startCheckout(Math.round(Number(amount) * 100));
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
    <div className="fixed inset-0 z-50 flex p-4 overflow-y-auto" style={{ backgroundColor: "rgba(0,0,0,0.6)" }}>
      <div
        className="w-full max-w-md rounded-2xl border p-6 m-auto"
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
                      {" "}· {formatCents(e.amountCents)}
                      {e.status === "pledged" ? " pledged" : " backed"}
                    </span>
                  )}
                  {(e.type === "financial_recurring" || e.type === "financial_annual") && e.amountCents && (
                    <span style={{ color: "var(--garden-citron)" }}>
                      {" "}· {formatCents(e.amountCents)}{e.type === "financial_annual" ? "/yr" : "/mo"}
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
              {typeOptions.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => { setType(t.value); setSelectedTierId(null); setShowCustomAmount(false); setShowOtherAmount(false); }}
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

            {/* Before the amounts: a preset goes straight to checkout. */}
            {isFinancial && !isAuthenticated && visible && (
              <div>
                <label
                  htmlFor="support-guest-name"
                  className="block text-xs uppercase tracking-[0.06em] mb-1.5"
                  style={{ color: "var(--garden-dim)" }}
                >
                  Your name, as it shows on the project
                </label>
                <input
                  id="support-guest-name"
                  type="text"
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  autoComplete="name"
                  className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
                  style={{
                    backgroundColor: "var(--garden-ink)",
                    borderColor: "var(--garden-hairline-raised)",
                    color: "var(--garden-paper)",
                  }}
                />
              </div>
            )}

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
                        {tierPriceLabel(tier, type)}
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
                <div className="flex flex-wrap gap-2 mb-2">
                  {BACKING_PRESET_DOLLARS.map((d) => (
                    <button
                      key={d}
                      type="button"
                      disabled={submitting}
                      onClick={() => void startCheckout(d * 100)}
                      className="flex-1 px-3 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
                      style={{
                        fontFamily: "var(--garden-font-mono)",
                        backgroundColor: "var(--garden-citron)",
                        color: "var(--garden-ink)",
                      }}
                    >
                      ${d}
                      {type === "financial_recurring" ? "/mo" : type === "financial_annual" ? "/yr" : ""}
                    </button>
                  ))}
                  {!showOtherAmount && (
                    <button
                      type="button"
                      onClick={() => setShowOtherAmount(true)}
                      className="px-3 py-2 rounded-lg border text-sm font-medium"
                      style={{ borderColor: "var(--garden-hairline-raised)", color: "var(--garden-body)" }}
                    >
                      Other amount
                    </button>
                  )}
                </div>
                {showOtherAmount && (
                  <>
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
                  </>
                )}
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
              {!(isFinancial && !(hasTiers && !showCustomAmount) && !showOtherAmount) && (
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
              )}
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

/**
 * Cheering or backing a project from a list: the one place that decides what
 * a tap does (the Projects page, a project's own page and Today's posts all
 * use it). Cheering needs an account, so a signed-out visitor goes to sign up
 * and comes back to this page (pendingIntent.supportDetour); backing doesn't,
 * the sheet opens for a visitor on a one-time payment (the server takes a
 * guest's one-time backing, not a monthly one). Until the token check settles
 * a member reads as signed out, so a tap then does nothing rather than send
 * them to sign up or a guest's sheet. `modal` is the sheet once one is open,
 * else null: render it anywhere on the page.
 */
export function useProjectSupport() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
  const [supporting, setSupporting] = useState<{ project: any; mode: SupportMode } | null>(null);
  const support = (project: any, mode: SupportMode) => {
    if (authLoading) return;
    const detour = supportDetour(mode, isAuthenticated, location.pathname + location.search);
    if (detour) navigate(detour);
    else setSupporting({ project, mode });
  };
  const modal = supporting ? (
    <SupportModal project={supporting.project} mode={supporting.mode} onClose={() => setSupporting(null)} />
  ) : null;
  return { support, modal };
}
