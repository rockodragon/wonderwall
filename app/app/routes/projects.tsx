import { useMutation, useQuery } from "convex/react";
import { Link } from "react-router";
import { useMemo, useState } from "react";
import { api } from "../../convex/_generated/api";

const KIND_FILTERS = [
  { label: "All", value: "" },
  { label: "Passion", value: "passion" },
  { label: "Paid", value: "paid" },
];

export default function Projects() {
  const projects = useQuery(api.garden.projects.listProjects);
  const [kindFilter, setKindFilter] = useState("");
  const [showPaidForm, setShowPaidForm] = useState(false);

  const filtered = useMemo(() => {
    if (!projects) return [];
    if (!kindFilter) return projects;
    return projects.filter((p) => p.kind === kindFilter);
  }, [projects, kindFilter]);

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
          Creative work seeking support, and paid work seeking creatives.
        </p>

        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
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
          <div className="flex gap-2">
            <Link
              to="/works"
              className="px-4 py-2 rounded-lg text-[13px] font-semibold whitespace-nowrap transition-opacity hover:opacity-90"
              style={{
                fontFamily: "var(--garden-font-body)",
                backgroundColor: "var(--garden-citron)",
                color: "var(--garden-ink)",
              }}
            >
              + Share a passion project
            </Link>
            <button
              onClick={() => setShowPaidForm(true)}
              className="px-4 py-2 rounded-lg text-[13px] font-semibold whitespace-nowrap border transition-colors"
              style={{
                fontFamily: "var(--garden-font-body)",
                borderColor: "var(--garden-hairline-raised)",
                color: "var(--garden-paper)",
              }}
            >
              + Post paid work
            </button>
          </div>
        </div>

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
              <ProjectCard key={project._id} project={project} />
            ))}
          </div>
        )}
      </div>

      {showPaidForm && <PaidProjectForm onClose={() => setShowPaidForm(false)} />}
    </div>
  );
}

function ProjectCard({ project }: { project: any }) {
  const thumb = project.media.find((m: any) => m.resolvedMediaUrl)?.resolvedMediaUrl;
  const detailArtifact = project.media[0];

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
        <span
          className="self-start px-2 py-0.5 rounded-full text-[11px] font-medium uppercase tracking-[0.06em] mb-2"
          style={{
            fontFamily: "var(--garden-font-mono)",
            backgroundColor: project.kind === "paid" ? "rgba(215,242,90,0.14)" : "rgba(198,198,190,0.1)",
            color: project.kind === "paid" ? "var(--garden-citron)" : "var(--garden-muted)",
          }}
        >
          {project.kind === "paid"
            ? `Paid${project.budget ? ` · $${project.budget.toLocaleString()}` : ""}`
            : "Passion"}
        </span>
        <h3
          className="font-semibold mb-1 line-clamp-2"
          style={{ color: "var(--garden-paper)", fontFamily: "var(--garden-font-display)" }}
        >
          {project.title}
        </h3>
        {project.blurb && (
          <p className="text-sm line-clamp-2 mb-3" style={{ color: "var(--garden-dim)" }}>
            {project.blurb}
          </p>
        )}
        {project.creator && (
          <div className="mt-auto flex items-center gap-2 pt-2 min-w-0">
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
      </div>
    </div>
  );

  return detailArtifact ? (
    <Link to={`/works/${detailArtifact._id}`}>{card}</Link>
  ) : (
    <div>{card}</div>
  );
}

function PaidProjectForm({ onClose }: { onClose: () => void }) {
  const createPaidProject = useMutation(api.garden.projects.createPaidProject);
  const [title, setTitle] = useState("");
  const [blurb, setBlurb] = useState("");
  const [budget, setBudget] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

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
    setSubmitting(true);
    try {
      await createPaidProject({ title: title.trim(), blurb: blurb.trim() || undefined, budget: budgetNum });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
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
        <p className="text-sm mb-5" style={{ color: "var(--garden-dim)" }}>
          A bounded commission with a real budget — not an ongoing role.
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
