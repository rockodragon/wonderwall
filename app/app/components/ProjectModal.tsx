import { useMutation } from "convex/react";
import { useEffect, useId, useRef, useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { INTERESTS } from "../constants/interests";
import { CommunityPicker, useDefaultEventCommunity } from "./CommunityPicker";
import { LocationAutocomplete, LocationVerifiedHint } from "./LocationAutocomplete";
import { describeMediaLink, MediaLinkField } from "./MediaLinkField";
import { useLocationField } from "../lib/useLocationField";
import { errorMessage } from "../lib/convexError";

// One modal for starting AND editing a project, in three short steps — the
// same shape as the event modal (CreateEventModal): name it -> show it ->
// where it lives. Pass `edit` to open it on an existing project.
//
// Every field's state lives up here and all three panels stay mounted
// (hidden when inactive), so Back never loses anything and the community
// picker's one-time pre-fill can't overwrite a later choice.

const STEPS = ["Name it", "Show it", "Where it lives"] as const;
type Step = 1 | 2 | 3;

/** An existing project, to edit with the same steps as create. */
export type ProjectEditTarget = {
  projectId: Id<"projects">;
  title: string;
  blurb?: string;
  mediaUrl?: string;
  interests?: string[];
  remote?: boolean;
  location?: string;
  locationType?: string;
  address?: any;
  coordinates?: any;
  placeId?: string;
  hostOrgId?: Id<"hostOrgs">;
};

const labelClass = "block text-xs uppercase tracking-[0.06em] mb-1.5";
const inputClass = "w-full px-3 py-2 rounded-lg border text-sm outline-none";
const inputStyle = {
  backgroundColor: "var(--garden-ink)",
  borderColor: "var(--garden-hairline-raised)",
  color: "var(--garden-paper)",
};

export function ProjectModal({
  onClose,
  onCreated,
  edit,
}: {
  onClose: () => void;
  /** Create only: where to go once the project exists. */
  onCreated?: (projectId: string) => void;
  edit?: ProjectEditTarget;
}) {
  const createPassionProject = useMutation(api.garden.projects.createPassionProject);
  const updateProject = useMutation(api.garden.projects.updateProject);
  const uid = useId();

  const [step, setStep] = useState<Step>(1);
  const [title, setTitle] = useState(edit?.title ?? "");
  const [blurb, setBlurb] = useState(edit?.blurb ?? "");
  const [mediaUrl, setMediaUrl] = useState(edit?.mediaUrl ?? "");
  const location = useLocationField(edit);
  const [remote, setRemote] = useState(edit?.remote ?? true);
  const [interests, setInterests] = useState<string[]>(edit?.interests ?? []);
  const [hostOrgId, setHostOrgId] = useState<string>(edit?.hostOrgId ?? "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  // New projects pre-fill the switcher's community, else The Garden — still
  // changeable to "No community — just me".
  const defaultHostOrgId = useDefaultEventCommunity();
  const bodyRef = useRef<HTMLDivElement>(null);

  // The page behind shouldn't scroll under a sheet that fills the phone.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: 0 });
  }, [step]);

  function toggleInterest(tag: string) {
    setInterests((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  }

  function goNext() {
    setError("");
    if (step === 1) {
      if (!title.trim()) return;
      setStep(2);
    } else if (step === 2) {
      const link = describeMediaLink(mediaUrl);
      if (link.state === "invalid") {
        setError(link.message);
        return;
      }
      setStep(3);
    }
  }

  async function submit() {
    setError("");
    if (!title.trim()) {
      setStep(1);
      setError("Give it a title.");
      return;
    }
    const link = describeMediaLink(mediaUrl);
    if (link.state === "invalid") {
      setStep(2);
      setError(link.message);
      return;
    }
    if (!remote && !location.value.trim()) {
      setError('Pick a location, or check "This can be done remotely."');
      return;
    }
    setSaving(true);
    try {
      if (edit) {
        await updateProject({
          projectId: edit.projectId,
          title: title.trim(),
          blurb: blurb.trim(),
          // An emptied link clears it (updateProject: "" clears).
          mediaUrl: link.state === "ok" ? link.url : "",
          interests,
          // Remote clears the location; otherwise it travels with its
          // structured half (updateProject takes them as one group).
          ...(remote ? { location: "" } : { ...location.toArgs(), location: location.toArgs().location ?? "" }),
          remote,
          ...(hostOrgId ? { hostOrgId: hostOrgId as Id<"hostOrgs"> } : { clearCommunity: true }),
        });
        onClose();
        return;
      }
      const result = await createPassionProject({
        title: title.trim(),
        blurb: blurb.trim() || undefined,
        mediaUrl: link.state === "ok" ? link.url : undefined,
        ...(remote ? {} : location.toArgs()),
        remote,
        interests: interests.length > 0 ? interests : undefined,
        hostOrgId: hostOrgId ? (hostOrgId as Id<"hostOrgs">) : undefined,
      });
      onCreated?.(String(result.projectId));
      onClose();
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (step < 3) goNext();
    else if (!saving) void submit();
  }

  // Enter in a text box on the last step shouldn't save from inside the
  // location search.
  function handleFormKeyDown(e: React.KeyboardEvent<HTMLFormElement>) {
    if (step === 3 && e.key === "Enter" && e.target instanceof HTMLInputElement) e.preventDefault();
  }

  const primaryDisabled = step === 1 ? !title.trim() : step === 3 ? saving : false;
  const secondaryClass = "px-4 py-2.5 rounded-lg border text-[13.5px] font-medium disabled:opacity-50";

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch sm:items-center justify-center sm:p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.6)" }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${uid}-heading`}
        className="flex flex-col w-full h-[100dvh] sm:h-auto sm:max-h-[90vh] sm:max-w-md sm:rounded-2xl sm:border shadow-2xl"
        style={{ backgroundColor: "var(--garden-ink-raised)", borderColor: "var(--garden-hairline)" }}
      >
        <div className="px-5 sm:px-6 pt-5 pb-4 flex-shrink-0">
          <div className="flex items-center justify-between">
            <h2
              id={`${uid}-heading`}
              className="text-xl font-semibold"
              style={{ color: "var(--garden-paper)", fontFamily: "var(--garden-font-display)" }}
            >
              {edit ? "Edit project" : "Start a project"}
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="-mr-2 w-10 h-10 flex items-center justify-center rounded-lg"
              style={{ color: "var(--garden-dim)" }}
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="flex gap-1.5 mt-3" aria-hidden="true">
            {[1, 2, 3].map((n) => (
              <div
                key={n}
                className="h-1 flex-1 rounded-full"
                style={{ backgroundColor: n <= step ? "var(--garden-citron)" : "var(--garden-hairline-raised)" }}
              />
            ))}
          </div>
          <p className="mt-2 text-sm" style={{ color: "var(--garden-dim)" }}>
            {step} of 3 · {STEPS[step - 1]}
          </p>
        </div>

        <form onSubmit={handleSubmit} onKeyDown={handleFormKeyDown} className="flex flex-col flex-1 min-h-0">
          <div ref={bodyRef} className="flex-1 min-h-0 px-5 sm:px-6 pb-4 overflow-y-auto">
            {/* Step 1 — name it */}
            <div className={step === 1 ? "flex flex-col gap-4" : "hidden"}>
              {!edit && (
                <p className="text-sm" style={{ color: "var(--garden-dim)" }}>
                  Say what you're making. Once it's up, you can add the people you need and ask for support from its
                  page.
                </p>
              )}
              <div>
                <label htmlFor={`${uid}-title`} className={labelClass} style={{ color: "var(--garden-dim)" }}>
                  Title
                </label>
                <input
                  id={`${uid}-title`}
                  autoFocus
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="A short film about my grandmother's garden"
                  className={inputClass}
                  style={inputStyle}
                />
              </div>
              <div>
                <label htmlFor={`${uid}-blurb`} className={labelClass} style={{ color: "var(--garden-dim)" }}>
                  What is it
                </label>
                <textarea
                  id={`${uid}-blurb`}
                  value={blurb}
                  onChange={(e) => setBlurb(e.target.value)}
                  rows={4}
                  placeholder="What you're making, and why"
                  className={`${inputClass} resize-none`}
                  style={inputStyle}
                />
              </div>
            </div>

            {/* Step 2 — show it */}
            <div className={step === 2 ? "flex flex-col gap-5" : "hidden"}>
              <MediaLinkField
                variant="garden"
                label="Paste a link (optional)"
                placeholder="Instagram post or reel, TikTok, YouTube or Vimeo"
                value={mediaUrl}
                onChange={setMediaUrl}
              />
              <div>
                <div className={labelClass} style={{ color: "var(--garden-dim)" }}>
                  Interests (optional)
                </div>
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
            </div>

            {/* Step 3 — where it lives */}
            <div className={step === 3 ? "flex flex-col gap-4" : "hidden"}>
              <label className="flex items-center gap-2 text-sm" style={{ color: "var(--garden-body)" }}>
                <input type="checkbox" checked={remote} onChange={(e) => setRemote(e.target.checked)} />
                This can be done remotely
              </label>
              {!remote && (
                <div>
                  <div className={labelClass} style={{ color: "var(--garden-dim)" }}>
                    Location
                  </div>
                  <LocationAutocomplete
                    value={location.value}
                    onChange={location.onChange}
                    onSelect={location.onSelect}
                    placeholder="Search for a location, type 'Online', or 'TBD'"
                  />
                  <LocationVerifiedHint value={location.value} selected={location.selected} />
                </div>
              )}
              <CommunityPicker value={hostOrgId} onChange={setHostOrgId} defaultHostOrgId={edit ? undefined : defaultHostOrgId} />
            </div>
          </div>

          {error && (
            <p role="alert" className="mx-5 sm:mx-6 mb-3 text-sm text-red-400 flex-shrink-0">
              {error}
            </p>
          )}

          <div
            className="flex gap-3 px-5 sm:px-6 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:pb-5 border-t flex-shrink-0"
            style={{ borderColor: "var(--garden-hairline)" }}
          >
            {step > 1 ? (
              <button
                type="button"
                onClick={() => {
                  setError("");
                  setStep((s) => (s > 1 ? ((s - 1) as Step) : s));
                }}
                disabled={saving}
                className={secondaryClass}
                style={{ borderColor: "var(--garden-hairline-raised)", color: "var(--garden-paper)" }}
              >
                Back
              </button>
            ) : (
              <button
                type="button"
                onClick={onClose}
                className={secondaryClass}
                style={{ borderColor: "var(--garden-hairline-raised)", color: "var(--garden-paper)" }}
              >
                Cancel
              </button>
            )}
            <button
              key={step === 3 ? "save" : "next"}
              type="submit"
              disabled={primaryDisabled}
              className="flex-1 px-4 py-2.5 rounded-lg text-[13.5px] font-semibold disabled:opacity-50"
              style={{ backgroundColor: "var(--garden-citron)", color: "var(--garden-ink)" }}
            >
              {step < 3
                ? "Next"
                : edit
                  ? saving
                    ? "Saving…"
                    : "Save changes"
                  : saving
                    ? "Creating…"
                    : "Create project"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
