import { useMutation, useQuery } from "convex/react";
import { Link, useSearchParams } from "react-router";
import { useMemo, useState } from "react";
import { api } from "../../convex/_generated/api";
import { INTERESTS } from "../constants/interests";
import { LocationAutocomplete } from "../components/LocationAutocomplete";
import { useLocationField } from "../lib/useLocationField";

const KIND_FILTERS = [
  { label: "All", value: "" },
  { label: "Passion", value: "passion" },
  { label: "Paid", value: "paid" },
];

const STATUS_LABELS: Record<string, string> = {
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

// Convex surfaces a thrown ConvexError's payload on err.data, not
// err.message (that's a generic "Server Error" in production, by design —
// only ConvexError.data is meant to reach the client). Caught via testing:
// a real validation error ("Needs a real amount.") was showing as an opaque
// server error instead of its actual reason.
function errorMessage(err: unknown): string {
  const data = (err as { data?: unknown })?.data;
  if (data && typeof data === "object" && "reason" in data) {
    return String((data as { reason: unknown }).reason);
  }
  return "Something went wrong — try again.";
}

export default function Projects() {
  const projects = useQuery(api.garden.projects.listProjects);
  const myProfile = useQuery(api.profiles.getMyProfile);
  const [kindFilter, setKindFilter] = useState("");
  const [showPaidForm, setShowPaidForm] = useState(false);
  const [showPassionForm, setShowPassionForm] = useState(false);
  const [supportingProject, setSupportingProject] = useState<any>(null);
  const [searchParams, setSearchParams] = useSearchParams();

  const interestFilter = useMemo(
    () => (searchParams.get("interests") || "").split(",").map((s) => s.trim()).filter(Boolean),
    [searchParams],
  );
  const locationFilter = (searchParams.get("location") || "").trim();
  const hasMatchFilter = interestFilter.length > 0 || !!locationFilter;

  // Manual hashtag pills, separate from the soft interests/location match
  // above (which only sorts). Clicking a tag is a deliberate "show me only
  // this" action, so it's a real filter — same behavior as the Events page.
  // The available tags are the canonical INTERESTS list itself (not derived
  // from whoever happens to have posted a project) so this list is always
  // identical to People's, regardless of current creator/project data.
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  const allTags: readonly string[] = INTERESTS;
  function toggleTag(tag: string) {
    setTagFilter((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  }

  function clearInterestFilter() {
    const next = new URLSearchParams(searchParams);
    next.delete("interests");
    next.delete("location");
    setSearchParams(next, { replace: true });
  }

  // A project's own declared interests win when it has any; a project with
  // none set (nothing selected at creation, or an older project from before
  // this field existed) falls back to its creator's interests so existing/
  // untagged projects don't just vanish from every filter.
  function projectTopics(p: any): string[] {
    return p.interests?.length ? p.interests : (p.creator?.interests ?? []);
  }

  // Interests/location are a soft signal, not a hard filter — with a small
  // friend-group-scale catalog, excluding non-matches outright would too
  // easily show an empty page. Matching projects float to the top instead.
  // A project's own location wins over its creator's when the project set
  // one; remote !== false (covers both true and unset) always satisfies a
  // location filter — a remote-friendly project matches anywhere.
  function isMatch(p: any): boolean {
    const interestHit =
      interestFilter.length > 0 &&
      projectTopics(p).some((fn: string) => interestFilter.includes(fn));
    const locationText = p.remote === false ? (p.location ?? p.creator?.location) : null;
    const creatorLoc = locationText?.toLowerCase();
    const filterLoc = locationFilter.toLowerCase();
    // Bidirectional substring: "Nashville, TN" vs "Nashville" should match
    // either way round, not just filter-is-shorter.
    const locationHit =
      !!locationFilter &&
      (p.remote !== false || (!!creatorLoc && (creatorLoc.includes(filterLoc) || filterLoc.includes(creatorLoc))));
    return interestHit || locationHit;
  }

  const filtered = useMemo(() => {
    if (!projects) return [];
    let list = kindFilter ? projects.filter((p) => p.kind === kindFilter) : projects;
    if (tagFilter.length > 0) {
      list = list.filter((p) => projectTopics(p).some((fn: string) => tagFilter.includes(fn)));
    }
    if (hasMatchFilter) {
      list = [...list].sort((a, b) => Number(isMatch(b)) - Number(isMatch(a)));
    }
    return list;
  }, [projects, kindFilter, tagFilter, interestFilter, locationFilter]);

  return (
    <div className="min-h-screen bg-[var(--garden-ink)]">
      <link rel="stylesheet" href="/tokens.css" />
      <link rel="stylesheet" href="/about/fonts/fonts.css" />
      <div className="p-4 sm:p-6 max-w-7xl mx-auto">
        <h1
          className="text-2xl sm:text-3xl font-semibold text-[var(--garden-paper)] mb-1"
          style={{ fontFamily: "var(--garden-font-display)" }}
        >
          Projects
        </h1>
        <p className="text-[var(--garden-body)] mb-6">
          Support creative work in progress, or post paid work that needs a creative.
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

        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex gap-2">
            {KIND_FILTERS.map((f) => (
              <button
                key={f.value}
                onClick={() => setKindFilter(f.value)}
                className="px-3 py-1.5 rounded-lg text-[13px] font-medium uppercase tracking-[0.06em] whitespace-nowrap transition-colors"
                style={{
                  fontFamily: "var(--garden-font-body)",
                  backgroundColor:
                    kindFilter === f.value ? "var(--garden-citron)" : "var(--garden-ink-raised)",
                  color: kindFilter === f.value ? "var(--garden-ink)" : "var(--garden-muted)",
                }}
              >
                {f.label}
              </button>
            ))}
          </div>
          <PostProjectMenu
            onPaid={() => setShowPaidForm(true)}
            onPassion={() => setShowPassionForm(true)}
          />
        </div>

        {allTags.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 mb-6">
            {allTags.map((tag) => {
              const active = tagFilter.includes(tag);
              return (
                <button
                  key={tag}
                  onClick={() => toggleTag(tag)}
                  className="px-3 py-1 rounded-full text-xs font-medium transition-colors"
                  style={{
                    fontFamily: "var(--garden-font-body)",
                    backgroundColor: active ? "var(--garden-citron)" : "var(--garden-ink-raised)",
                    color: active ? "var(--garden-ink)" : "var(--garden-muted)",
                  }}
                >
                  {tag}
                </button>
              );
            })}
            {tagFilter.length > 0 && (
              <button
                onClick={() => setTagFilter([])}
                className="text-xs underline underline-offset-2 hover:opacity-80"
                style={{ color: "var(--garden-citron)" }}
              >
                Clear
              </button>
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
        ) : filtered.length === 0 ? (
          <div className="text-center py-16" style={{ color: "var(--garden-dim)" }}>
            <p className="text-lg font-medium mb-1" style={{ color: "var(--garden-body)" }}>
              No projects yet
            </p>
            <p className="text-sm">Be the first to post something you're making</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((project) => (
              <ProjectCard
                key={project._id}
                project={project}
                onSupport={setSupportingProject}
                matched={hasMatchFilter && isMatch(project)}
                isOwn={!!myProfile && myProfile.userId === project.userId}
              />
            ))}
          </div>
        )}
      </div>

      {showPaidForm && (
        <PaidProjectForm
          onClose={() => setShowPaidForm(false)}
          onSwitchToPassion={() => {
            setShowPaidForm(false);
            setShowPassionForm(true);
          }}
        />
      )}
      {showPassionForm && <PassionProjectForm onClose={() => setShowPassionForm(false)} />}
      {supportingProject && (
        <SupportModal project={supportingProject} onClose={() => setSupportingProject(null)} />
      )}
    </div>
  );
}

function PostProjectMenu({
  onPaid,
  onPassion,
}: {
  onPaid: () => void;
  onPassion: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="px-4 py-2 rounded-lg text-[13px] font-semibold whitespace-nowrap transition-opacity hover:opacity-90"
        style={{ fontFamily: "var(--garden-font-body)", backgroundColor: "var(--garden-citron)", color: "var(--garden-ink)" }}
      >
        + Post a project
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            className="absolute right-0 mt-2 w-56 rounded-xl border overflow-hidden z-50"
            style={{ backgroundColor: "var(--garden-ink-raised)", borderColor: "var(--garden-hairline)" }}
          >
            <button
              onClick={() => {
                setOpen(false);
                onPassion();
              }}
              className="block w-full text-left px-4 py-3 text-sm transition-colors hover:opacity-80"
              style={{ color: "var(--garden-paper)", borderBottom: "1px solid var(--garden-hairline)" }}
            >
              <span className="block font-medium">Passion project</span>
              <span className="block text-xs mt-0.5" style={{ color: "var(--garden-dim)" }}>
                Something you're making — show it, and optionally ask for support toward a goal.
              </span>
            </button>
            <button
              onClick={() => {
                setOpen(false);
                onPaid();
              }}
              className="block w-full text-left px-4 py-3 text-sm transition-colors hover:opacity-80"
              style={{ color: "var(--garden-paper)" }}
            >
              <span className="block font-medium">Paid work</span>
              <span className="block text-xs mt-0.5" style={{ color: "var(--garden-dim)" }}>
                You're hiring someone — a bounded commission with a budget you'll pay them.
              </span>
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function ProjectCard({
  project,
  onSupport,
  matched,
  isOwn,
}: {
  project: any;
  onSupport: (project: any) => void;
  matched?: boolean;
  isOwn?: boolean;
}) {
  const thumb = project.media.find((m: any) => m.resolvedMediaUrl)?.resolvedMediaUrl;
  const detailArtifact = project.media[0];
  // Passion-only campaign deadline (docs/the-exchange-v1-prd.md §7 review
  // follow-up) — a past raiseByDate just means the badge doesn't render;
  // building a distinct "expired" state is explicitly out of scope.
  const daysLeft =
    project.kind === "passion" && project.raiseByDate && project.raiseByDate > Date.now()
      ? Math.max(1, Math.ceil((project.raiseByDate - Date.now()) / 86400000))
      : null;

  const card = (
    <div
      className="group rounded-2xl overflow-hidden border h-full flex flex-col transition-colors"
      style={{ borderColor: "var(--garden-hairline)", backgroundColor: "var(--garden-ink-raised)" }}
    >
      <div
        className="aspect-[16/10] overflow-hidden flex items-center justify-center"
        style={{ backgroundColor: "var(--garden-ink)" }}
      >
        {thumb ? (
          <img
            src={thumb}
            alt={project.title}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <svg
            className="w-10 h-10"
            style={{ color: "var(--garden-hairline-raised)" }}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1}
              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
        )}
      </div>
      <div className="p-4 flex-1 flex flex-col min-w-0">
        <div className="flex items-start justify-between gap-2 mb-1">
          <h3
            className="font-semibold line-clamp-2"
            style={{ color: "var(--garden-paper)", fontFamily: "var(--garden-font-display)" }}
          >
            {project.title}
          </h3>
          <span
            className="shrink-0 px-2 py-0.5 rounded-full text-[11px] font-medium uppercase tracking-[0.06em]"
            style={{
              fontFamily: "var(--garden-font-mono)",
              backgroundColor: project.kind === "paid" ? "rgba(215,242,90,0.14)" : "rgba(198,198,190,0.1)",
              color: project.kind === "paid" ? "var(--garden-citron)" : "var(--garden-muted)",
            }}
          >
            {project.kind === "paid" ? "Paid" : "Passion"}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 mb-2">
          {daysLeft !== null && (
            <span
              className="self-start px-2 py-0.5 rounded-full text-[11px] font-medium uppercase tracking-[0.06em]"
              style={{
                fontFamily: "var(--garden-font-mono)",
                backgroundColor: "rgba(198,198,190,0.1)",
                color: "var(--garden-muted)",
              }}
            >
              {daysLeft} {daysLeft === 1 ? "day" : "days"} left
            </span>
          )}
          {project.benefitsNonprofit && (
            <span
              className="self-start px-2 py-0.5 rounded-full text-[11px] font-medium"
              style={{
                fontFamily: "var(--garden-font-mono)",
                backgroundColor: "rgba(198,198,190,0.1)",
                color: "var(--garden-muted)",
              }}
            >
              Supports {project.nonprofitName || "a nonprofit"} — self-declared, not verified
            </span>
          )}
          {matched && (
            <span
              className="self-start px-2 py-0.5 rounded-full text-[11px] font-medium uppercase tracking-[0.06em]"
              style={{
                fontFamily: "var(--garden-font-mono)",
                backgroundColor: "rgba(215,242,90,0.14)",
                color: "var(--garden-citron)",
              }}
            >
              Matches you
            </span>
          )}
          {/* An "active" badge on every card would just be noise — only
              in_progress/completed/archived signal something worth knowing. */}
          {project.status && project.status !== "active" && (
            <span
              className="self-start px-2 py-0.5 rounded-full text-[11px] font-medium uppercase tracking-[0.06em]"
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
        {project.interests && project.interests.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-2">
            {project.interests.map((tag: string) => (
              <span
                key={tag}
                className="px-2 py-0.5 rounded-full text-[11px] font-medium"
                style={{
                  fontFamily: "var(--garden-font-body)",
                  backgroundColor: "rgba(198,198,190,0.1)",
                  color: "var(--garden-muted)",
                }}
              >
                {tag}
              </span>
            ))}
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
                  className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
                  style={{ backgroundColor: "var(--garden-hairline-raised)", color: "var(--garden-paper)" }}
                >
                  {project.creator.name.charAt(0).toUpperCase()}
                </div>
              )}
              {/* Names are never truncated — the card wraps to fit instead */}
              <span className="text-xs break-words" style={{ color: "var(--garden-muted)" }}>
                {project.creator.name}
              </span>
            </div>
          )}
          {project.kind === "paid" && project.budget && (
            <span
              className="shrink-0 text-sm font-semibold"
              style={{ fontFamily: "var(--garden-font-mono)", color: "var(--garden-citron)" }}
            >
              ${project.budget.toLocaleString()}
            </span>
          )}
        </div>
        {isOwn && (
          <div
            className="flex items-center gap-2 mt-3"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
          >
            <label
              className="text-[11px] uppercase tracking-[0.06em]"
              style={{ color: "var(--garden-dim)" }}
            >
              Status
            </label>
            <StatusSelect project={project} />
          </div>
        )}
        <div className="flex items-center justify-between gap-2 mt-3 pt-3" style={{ borderTop: "1px solid var(--garden-hairline)" }}>
          <span className="text-xs" style={{ color: "var(--garden-dim)" }}>
            {project.supportCount > 0
              ? `${project.supportCount} ${project.supportCount === 1 ? "supporter" : "supporters"}`
              : "Be the first to support"}
          </span>
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onSupport(project);
            }}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-opacity hover:opacity-90"
            style={{ backgroundColor: "var(--garden-citron)", color: "var(--garden-ink)" }}
          >
            Support
          </button>
        </div>
      </div>
    </div>
  );

  return detailArtifact ? (
    <Link to={`/works/${detailArtifact._id}`}>{card}</Link>
  ) : (
    <div>{card}</div>
  );
}

// Minimal utility control, not a design centerpiece — a creator changing
// their own project's status via the new updateProjectStatus mutation.
function StatusSelect({ project }: { project: any }) {
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

function PaidProjectForm({
  onClose,
  onSwitchToPassion,
}: {
  onClose: () => void;
  onSwitchToPassion: () => void;
}) {
  const createPaidProject = useMutation(api.garden.projects.createPaidProject);
  const [title, setTitle] = useState("");
  const [blurb, setBlurb] = useState("");
  const [budget, setBudget] = useState("");
  const location = useLocationField();
  const [remote, setRemote] = useState(true);
  const [interests, setInterests] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function toggleInterest(tag: string) {
    setInterests((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const budgetNum = Number(budget);
    if (!title.trim()) {
      setError("Give it a title.");
      return;
    }
    if (!Number.isFinite(budgetNum) || budgetNum <= 0) {
      setError("Budget needs to be a real number — a declared amount, not a range.");
      return;
    }
    if (!remote && !location.value.trim()) {
      setError("Pick a location, or check \"This can be done remotely.\"");
      return;
    }
    setSubmitting(true);
    try {
      await createPaidProject({
        title: title.trim(),
        blurb: blurb.trim() || undefined,
        budget: budgetNum,
        ...location.toArgs(),
        remote,
        interests: interests.length > 0 ? interests : undefined,
      });
      onClose();
    } catch (err) {
      setError(errorMessage(err));
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.6)" }}>
      <div
        className="w-full max-w-md rounded-2xl border p-6"
        style={{ backgroundColor: "var(--garden-ink-raised)", borderColor: "var(--garden-hairline)" }}
      >
        <h2
          className="text-xl font-semibold mb-1"
          style={{ color: "var(--garden-paper)", fontFamily: "var(--garden-font-display)" }}
        >
          Post paid work
        </h2>
        <p className="text-sm mb-3" style={{ color: "var(--garden-dim)" }}>
          A bounded commission with a real budget — not an ongoing role.
        </p>
        <button
          type="button"
          onClick={onSwitchToPassion}
          className="block text-left text-xs underline underline-offset-2 hover:opacity-80 mb-5"
          style={{ color: "var(--garden-muted)" }}
        >
          Raising money for your own project instead of hiring someone? Post it as a Passion project instead.
        </button>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="block text-xs uppercase tracking-[0.06em] mb-1.5" style={{ color: "var(--garden-dim)" }}>
              Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Logo design for a local bakery"
              className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
              style={{
                backgroundColor: "var(--garden-ink)",
                borderColor: "var(--garden-hairline-raised)",
                color: "var(--garden-paper)",
              }}
            />
          </div>
          <div>
            <label className="block text-xs uppercase tracking-[0.06em] mb-1.5" style={{ color: "var(--garden-dim)" }}>
              What's the work
            </label>
            <textarea
              value={blurb}
              onChange={(e) => setBlurb(e.target.value)}
              rows={3}
              placeholder="What you need done"
              className="w-full px-3 py-2 rounded-lg border text-sm outline-none resize-none"
              style={{
                backgroundColor: "var(--garden-ink)",
                borderColor: "var(--garden-hairline-raised)",
                color: "var(--garden-paper)",
              }}
            />
          </div>
          <div>
            <label className="block text-xs uppercase tracking-[0.06em] mb-1.5" style={{ color: "var(--garden-dim)" }}>
              Budget (USD)
            </label>
            <input
              type="number"
              min="1"
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
              placeholder="500"
              className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
              style={{
                fontFamily: "var(--garden-font-mono)",
                backgroundColor: "var(--garden-ink)",
                borderColor: "var(--garden-hairline-raised)",
                color: "var(--garden-paper)",
              }}
            />
          </div>
          <div>
            <label className="block text-xs uppercase tracking-[0.06em] mb-1.5" style={{ color: "var(--garden-dim)" }}>
              Interests (optional)
            </label>
            <div className="flex flex-wrap gap-1.5">
              {INTERESTS.map((tag) => {
                const active = interests.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    aria-pressed={active}
                    onClick={() => toggleInterest(tag)}
                    className="px-2.5 py-1 rounded-full text-xs font-medium transition-colors"
                    style={{
                      fontFamily: "var(--garden-font-body)",
                      backgroundColor: active ? "var(--garden-citron)" : "var(--garden-ink)",
                      color: active ? "var(--garden-ink)" : "var(--garden-muted)",
                      border: `1px solid ${active ? "var(--garden-citron)" : "var(--garden-hairline-raised)"}`,
                    }}
                  >
                    {tag}
                  </button>
                );
              })}
            </div>
            <p className="text-xs mt-1.5" style={{ color: "var(--garden-dim)" }}>
              What's this work about — helps people find it, separate from your own profile tags.
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm" style={{ color: "var(--garden-body)" }}>
            <input
              type="checkbox"
              checked={remote}
              onChange={(e) => setRemote(e.target.checked)}
            />
            This can be done remotely
          </label>
          {!remote && (
            <div>
              <label className="block text-xs uppercase tracking-[0.06em] mb-1.5" style={{ color: "var(--garden-dim)" }}>
                Location
              </label>
              <LocationAutocomplete
                value={location.value}
                onChange={location.onChange}
                onSelect={location.onSelect}
                placeholder="Search for a location, type 'Online', or 'TBD'"
              />
            </div>
          )}
          {error && <p className="text-sm text-red-400">{error}</p>}
          <div className="flex gap-2 justify-end pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm font-medium"
              style={{ color: "var(--garden-dim)" }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
              style={{ backgroundColor: "var(--garden-citron)", color: "var(--garden-ink)" }}
            >
              {submitting ? "Posting…" : "Post project"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function PassionProjectForm({ onClose }: { onClose: () => void }) {
  const createPassionProject = useMutation(api.garden.projects.createPassionProject);
  const [title, setTitle] = useState("");
  const [blurb, setBlurb] = useState("");
  const [goal, setGoal] = useState("");
  const location = useLocationField();
  const [remote, setRemote] = useState(true);
  const [interests, setInterests] = useState<string[]>([]);
  const [raiseByDate, setRaiseByDate] = useState("");
  const [benefitsNonprofit, setBenefitsNonprofit] = useState(false);
  const [nonprofitName, setNonprofitName] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function toggleInterest(tag: string) {
    setInterests((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!title.trim()) {
      setError("Give it a title.");
      return;
    }
    const goalNum = goal.trim() ? Number(goal) : undefined;
    if (goalNum !== undefined && (!Number.isFinite(goalNum) || goalNum <= 0)) {
      setError("If you set a support goal, it needs to be a real positive amount.");
      return;
    }
    if (!remote && !location.value.trim()) {
      setError("Pick a location, or check \"This can be done remotely.\"");
      return;
    }
    if (benefitsNonprofit && !nonprofitName.trim()) {
      setError("Add the nonprofit's name, or uncheck if you're not sure yet.");
      return;
    }
    setSubmitting(true);
    try {
      await createPassionProject({
        title: title.trim(),
        blurb: blurb.trim() || undefined,
        goal: goalNum,
        ...location.toArgs(),
        remote,
        interests: interests.length > 0 ? interests : undefined,
        raiseByDate: raiseByDate ? new Date(raiseByDate).getTime() : undefined,
        benefitsNonprofit: benefitsNonprofit || undefined,
        nonprofitName: benefitsNonprofit ? nonprofitName.trim() : undefined,
      });
      onClose();
    } catch (err) {
      setError(errorMessage(err));
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
          Post a passion project
        </h2>
        <p className="text-sm mb-5" style={{ color: "var(--garden-dim)" }}>
          Something you're making for its own sake — show it, and optionally ask for support.
        </p>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="block text-xs uppercase tracking-[0.06em] mb-1.5" style={{ color: "var(--garden-dim)" }}>
              Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="A short film about my grandmother's garden"
              className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
              style={{
                backgroundColor: "var(--garden-ink)",
                borderColor: "var(--garden-hairline-raised)",
                color: "var(--garden-paper)",
              }}
            />
          </div>
          <div>
            <label className="block text-xs uppercase tracking-[0.06em] mb-1.5" style={{ color: "var(--garden-dim)" }}>
              What is it
            </label>
            <textarea
              value={blurb}
              onChange={(e) => setBlurb(e.target.value)}
              rows={3}
              placeholder="What you're making, and why"
              className="w-full px-3 py-2 rounded-lg border text-sm outline-none resize-none"
              style={{
                backgroundColor: "var(--garden-ink)",
                borderColor: "var(--garden-hairline-raised)",
                color: "var(--garden-paper)",
              }}
            />
          </div>
          <div>
            <label className="block text-xs uppercase tracking-[0.06em] mb-1.5" style={{ color: "var(--garden-dim)" }}>
              Support goal (USD, optional)
            </label>
            <input
              type="number"
              min="1"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="1000"
              className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
              style={{
                fontFamily: "var(--garden-font-mono)",
                backgroundColor: "var(--garden-ink)",
                borderColor: "var(--garden-hairline-raised)",
                color: "var(--garden-paper)",
              }}
            />
            <p className="text-xs mt-1.5" style={{ color: "var(--garden-dim)" }}>
              How much are you hoping to raise? Leave blank if you're just sharing.
            </p>
          </div>
          <div>
            <label className="block text-xs uppercase tracking-[0.06em] mb-1.5" style={{ color: "var(--garden-dim)" }}>
              Raise by (optional)
            </label>
            <input
              type="date"
              value={raiseByDate}
              onChange={(e) => setRaiseByDate(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
              style={{
                backgroundColor: "var(--garden-ink)",
                borderColor: "var(--garden-hairline-raised)",
                color: "var(--garden-paper)",
              }}
            />
          </div>
          <div>
            <label className="block text-xs uppercase tracking-[0.06em] mb-1.5" style={{ color: "var(--garden-dim)" }}>
              Interests (optional)
            </label>
            <div className="flex flex-wrap gap-1.5">
              {INTERESTS.map((tag) => {
                const active = interests.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    aria-pressed={active}
                    onClick={() => toggleInterest(tag)}
                    className="px-2.5 py-1 rounded-full text-xs font-medium transition-colors"
                    style={{
                      fontFamily: "var(--garden-font-body)",
                      backgroundColor: active ? "var(--garden-citron)" : "var(--garden-ink)",
                      color: active ? "var(--garden-ink)" : "var(--garden-muted)",
                      border: `1px solid ${active ? "var(--garden-citron)" : "var(--garden-hairline-raised)"}`,
                    }}
                  >
                    {tag}
                  </button>
                );
              })}
            </div>
            <p className="text-xs mt-1.5" style={{ color: "var(--garden-dim)" }}>
              What's this project about — helps people find it, separate from your own profile tags.
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm" style={{ color: "var(--garden-body)" }}>
            <input
              type="checkbox"
              checked={remote}
              onChange={(e) => setRemote(e.target.checked)}
            />
            This can be done remotely
          </label>
          {!remote && (
            <div>
              <label className="block text-xs uppercase tracking-[0.06em] mb-1.5" style={{ color: "var(--garden-dim)" }}>
                Location
              </label>
              <LocationAutocomplete
                value={location.value}
                onChange={location.onChange}
                onSelect={location.onSelect}
                placeholder="Search for a location, type 'Online', or 'TBD'"
              />
            </div>
          )}
          <label className="flex items-center gap-2 text-sm" style={{ color: "var(--garden-body)" }}>
            <input
              type="checkbox"
              checked={benefitsNonprofit}
              onChange={(e) => setBenefitsNonprofit(e.target.checked)}
            />
            This supports a registered nonprofit
          </label>
          {benefitsNonprofit && (
            <div>
              <label className="block text-xs uppercase tracking-[0.06em] mb-1.5" style={{ color: "var(--garden-dim)" }}>
                Nonprofit name
              </label>
              <input
                type="text"
                value={nonprofitName}
                onChange={(e) => setNonprofitName(e.target.value)}
                placeholder="e.g. Second Harvest Food Bank"
                className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
                style={{
                  backgroundColor: "var(--garden-ink)",
                  borderColor: "var(--garden-hairline-raised)",
                  color: "var(--garden-paper)",
                }}
              />
              <p className="text-xs mt-1.5" style={{ color: "var(--garden-dim)" }}>
                Self-declared, not verified — we don't check nonprofit status in V1.
              </p>
            </div>
          )}
          {error && <p className="text-sm text-red-400">{error}</p>}
          <div className="flex gap-2 justify-end pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm font-medium"
              style={{ color: "var(--garden-dim)" }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
              style={{ backgroundColor: "var(--garden-citron)", color: "var(--garden-ink)" }}
            >
              {submitting ? "Posting…" : "Post project"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const SUPPORT_TYPES = [
  { value: "financial_one_time", label: "Give once" },
  { value: "financial_recurring", label: "Give monthly" },
  { value: "encouragement", label: "Encouragement" },
  { value: "resource", label: "Offer a resource" },
];

function SupportModal({ project, onClose }: { project: any; onClose: () => void }) {
  const existing = useQuery(api.garden.support.listSupportForProject, { projectId: project._id });
  const supportProject = useMutation(api.garden.support.supportProject);

  const [type, setType] = useState("encouragement");
  const [amount, setAmount] = useState("");
  const [message, setMessage] = useState("");
  const [resourceDescription, setResourceDescription] = useState("");
  const [visible, setVisible] = useState(true);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const isFinancial = type === "financial_one_time" || type === "financial_recurring";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await supportProject({
        projectId: project._id,
        type,
        amountCents: isFinancial ? Math.round(Number(amount) * 100) : undefined,
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
          Support "{project.title}"
        </h2>

        {existing && existing.length > 0 && (
          <div className="mb-5 pb-5" style={{ borderBottom: "1px solid var(--garden-hairline)" }}>
            <p className="text-xs uppercase tracking-[0.06em] mb-2" style={{ color: "var(--garden-dim)" }}>
              Supported by
            </p>
            <ul className="flex flex-col gap-2 max-h-32 overflow-y-auto">
              {existing.map((e) => (
                <li key={e._id} className="text-sm" style={{ color: "var(--garden-body)" }}>
                  <span style={{ color: "var(--garden-paper)" }}>{e.supporterName}</span>
                  {e.type === "financial_one_time" && e.amountCents && (
                    <span style={{ color: "var(--garden-citron)" }}> · ${(e.amountCents / 100).toLocaleString()} pledged</span>
                  )}
                  {e.type === "financial_recurring" && e.amountCents && (
                    <span style={{ color: "var(--garden-citron)" }}> · ${(e.amountCents / 100).toLocaleString()}/mo pledged</span>
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
            <p className="text-sm mb-4" style={{ color: "var(--garden-body)" }}>
              {isFinancial
                ? "Pledge recorded — thank you. We'll follow up when real checkout is live."
                : "Thanks for showing up for this."}
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
              {SUPPORT_TYPES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setType(t.value)}
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

            {isFinancial && (
              <div>
                <label className="block text-xs uppercase tracking-[0.06em] mb-1.5" style={{ color: "var(--garden-dim)" }}>
                  Amount (USD{type === "financial_recurring" ? "/mo" : ""})
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
                  style={{ color: "var(--garden-citron)", backgroundColor: "rgba(215,242,90,0.1)" }}
                >
                  This is a pledge — no checkout, no charge. Nothing is collected at this point.
                </p>
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
                {submitting ? "Sending…" : isFinancial ? "Pledge" : "Send"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
