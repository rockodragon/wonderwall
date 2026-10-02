import { useMutation } from "convex/react";
import { useState } from "react";
import { api } from "../../convex/_generated/api";
import { INTERESTS } from "../constants/interests";
import { errorMessage } from "../lib/convexError";
import { useLocationField } from "../lib/useLocationField";
import { CommunityPicker, useDefaultEventCommunity } from "./CommunityPicker";
import { FocusBackdrop } from "./FocusBackdrop";
import { HireWhenToggle, type HireDraft } from "./HireWhenToggle";
import { LocationAutocomplete, LocationVerifiedHint } from "./LocationAutocomplete";
import { describeMediaLink, MediaLinkField } from "./MediaLinkField";

// "Hire someone → One job": a paid posting with a declared pay state. Mounted
// by /projects and by the desk's create flow (desk/DeskCreate.tsx) through
// HireFlow, which also holds the other shape, a recurring gig (GigSeriesForm).

// The four money states a paid posting can declare (convex/garden/
// projects.ts's validateBudgetDeclaration is the authority — this is the
// picker for them). A set amount is first and selected by default: it's the
// encouraged default, and it's what gets answered. The other three exist so
// an honest posting with a small, unknown, or absent budget can still be
// made — and so an unpaid ask has to say "Volunteer" out loud.
const BUDGET_TYPE_OPTIONS = [
  { value: "amount", label: "Set amount" },
  { value: "range", label: "Range" },
  { value: "proposals", label: "Open to proposals" },
  { value: "volunteer", label: "Volunteer" },
] as const;

export function PaidProjectForm({
  onClose,
  onCreated,
  initial,
  onSwitchToDates,
  onSwitchToProject,
}: {
  onClose: () => void;
  onCreated: (projectId: string) => void;
  initial?: HireDraft;
  onSwitchToDates: (draft: HireDraft) => void;
  onSwitchToProject: () => void;
}) {
  const createPaidProject = useMutation(api.garden.projects.createPaidProject);
  const [title, setTitle] = useState(initial?.title ?? "");
  const [blurb, setBlurb] = useState(initial?.blurb ?? "");
  const [budgetType, setBudgetType] = useState<string>("amount");
  const [budget, setBudget] = useState("");
  const [budgetMax, setBudgetMax] = useState("");
  const [mediaUrl, setMediaUrl] = useState("");
  const location = useLocationField();
  const [remote, setRemote] = useState(true);
  const [interests, setInterests] = useState<string[]>([]);
  const [showInterests, setShowInterests] = useState(false);
  const [hostOrgId, setHostOrgId] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  // Pre-fill from the sidebar switcher's current context (community-ux.md
  // §2/§6) — still changeable to "No community — just me" via CommunityPicker.
  const defaultHostOrgId = useDefaultEventCommunity();

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
    // Mirrors validateBudgetDeclaration on the server (convex/garden/
    // projects.ts), which is the authority — this only saves a round trip.
    const budgetNum = Number(budget);
    const budgetMaxNum = Number(budgetMax);
    if (budgetType === "amount" && (!budget.trim() || !Number.isFinite(budgetNum) || budgetNum <= 0)) {
      setError("A set amount needs a real number bigger than zero.");
      return;
    }
    if (budgetType === "range") {
      if (!budget.trim() || !budgetMax.trim()) {
        setError("A range needs both a low and a high number.");
        return;
      }
      if (
        !Number.isFinite(budgetNum) ||
        budgetNum <= 0 ||
        !Number.isFinite(budgetMaxNum) ||
        budgetMaxNum <= 0
      ) {
        setError("A range needs real numbers bigger than zero.");
        return;
      }
      if (budgetMaxNum <= budgetNum) {
        setError("A range needs a high number bigger than the low one.");
        return;
      }
    }
    if (!remote && !location.value.trim()) {
      setError("Pick a location, or check \"This can be done remotely.\"");
      return;
    }
    const link = describeMediaLink(mediaUrl);
    if (link.state === "invalid") {
      setError(link.message);
      return;
    }
    setSubmitting(true);
    try {
      const result = await createPaidProject({
        title: title.trim(),
        blurb: blurb.trim() || undefined,
        mediaUrl: link.state === "ok" ? link.url : undefined,
        // "proposals" and "volunteer" carry no numbers at all — the server
        // rejects a stray one rather than dropping it silently, so anything
        // typed before switching states is left behind here on purpose.
        budgetType,
        budget: budgetType === "amount" || budgetType === "range" ? budgetNum : undefined,
        budgetMax: budgetType === "range" ? budgetMaxNum : undefined,
        ...location.toArgs(),
        remote,
        interests: interests.length > 0 ? interests : undefined,
        hostOrgId: hostOrgId ? (hostOrgId as any) : undefined,
      });
      onCreated(String(result.projectId));
      onClose();
    } catch (err) {
      setError(errorMessage(err));
      setSubmitting(false);
    }
  }

  return (
    <FocusBackdrop phoneFullScreen={false}>
      <div
        className="w-full max-w-md rounded-2xl border p-6"
        style={{ backgroundColor: "var(--garden-ink-raised)", borderColor: "var(--garden-hairline)" }}
      >
        <h2
          className="text-xl font-semibold mb-1"
          style={{ color: "var(--garden-paper)", fontFamily: "var(--garden-font-display)" }}
        >
          Hire someone
        </h2>
        <p className="text-sm mb-3" style={{ color: "var(--garden-dim)" }}>
          Say what the work is and what it pays — a number, a range, or plainly that it doesn't.
        </p>
        <button
          type="button"
          onClick={onSwitchToProject}
          className="block text-left text-xs underline underline-offset-2 hover:opacity-80 mb-5"
          style={{ color: "var(--garden-muted)" }}
        >
          Making something of your own and want collaborators or backers? Start a project instead.
        </button>
        <HireWhenToggle value="job" onChange={() => onSwitchToDates({ title, blurb })} />
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
          <MediaLinkField
            variant="garden"
            label="Or paste a link (optional)"
            placeholder="Instagram post or reel, TikTok, YouTube or Vimeo"
            value={mediaUrl}
            onChange={setMediaUrl}
          />
          <div>
            <label className="block text-xs uppercase tracking-[0.06em] mb-1.5" style={{ color: "var(--garden-dim)" }}>
              What it pays
            </label>
            <div role="radiogroup" aria-label="What it pays" className="flex flex-wrap gap-1.5">
              {BUDGET_TYPE_OPTIONS.map((opt) => {
                const active = budgetType === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setBudgetType(opt.value)}
                    className="px-2.5 py-1 rounded-full text-xs font-medium transition-colors"
                    style={{
                      fontFamily: "var(--garden-font-body)",
                      backgroundColor: active ? "var(--garden-citron)" : "var(--garden-ink)",
                      color: active ? "var(--garden-ink)" : "var(--garden-muted)",
                      border: `1px solid ${active ? "var(--garden-citron)" : "var(--garden-hairline-raised)"}`,
                    }}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
            <p className="text-xs mt-1.5" style={{ color: "var(--garden-dim)" }}>
              Posting a number gets more responses. If you don't have one yet, say so — just
              don't leave people guessing.
            </p>
            {budgetType === "amount" && (
              <input
                type="number"
                min="1"
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
                placeholder="500"
                aria-label="Amount in US dollars"
                className="w-full mt-2.5 px-3 py-2 rounded-lg border text-sm outline-none"
                style={{
                  fontFamily: "var(--garden-font-mono)",
                  backgroundColor: "var(--garden-ink)",
                  borderColor: "var(--garden-hairline-raised)",
                  color: "var(--garden-paper)",
                }}
              />
            )}
            {budgetType === "range" && (
              <div className="flex items-center gap-2 mt-2.5">
                <input
                  type="number"
                  min="1"
                  value={budget}
                  onChange={(e) => setBudget(e.target.value)}
                  placeholder="300"
                  aria-label="Low end, in US dollars"
                  className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
                  style={{
                    fontFamily: "var(--garden-font-mono)",
                    backgroundColor: "var(--garden-ink)",
                    borderColor: "var(--garden-hairline-raised)",
                    color: "var(--garden-paper)",
                  }}
                />
                <span className="text-sm" style={{ color: "var(--garden-dim)" }}>
                  to
                </span>
                <input
                  type="number"
                  min="1"
                  value={budgetMax}
                  onChange={(e) => setBudgetMax(e.target.value)}
                  placeholder="600"
                  aria-label="High end, in US dollars"
                  className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
                  style={{
                    fontFamily: "var(--garden-font-mono)",
                    backgroundColor: "var(--garden-ink)",
                    borderColor: "var(--garden-hairline-raised)",
                    color: "var(--garden-paper)",
                  }}
                />
              </div>
            )}
          </div>
          <div>
            <label className="block text-xs uppercase tracking-[0.06em] mb-1.5" style={{ color: "var(--garden-dim)" }}>
              Interests (optional)
            </label>
            {showInterests ? (
              <>
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
              </>
            ) : (
              <button
                type="button"
                onClick={() => setShowInterests(true)}
                className="text-xs underline underline-offset-2 hover:opacity-80"
                style={{ color: "var(--garden-citron)" }}
              >
                {interests.length > 0 ? `${interests.length} selected — edit` : "+ Add interests"}
              </button>
            )}
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
              <LocationVerifiedHint value={location.value} selected={location.selected} />
            </div>
          )}
          <CommunityPicker value={hostOrgId} onChange={setHostOrgId} defaultHostOrgId={defaultHostOrgId} />
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
              {submitting ? "Posting…" : "Post job"}
            </button>
          </div>
        </form>
      </div>
    </FocusBackdrop>
  );
}
