import { useMutation } from "convex/react";
import { useEffect, useId, useRef, useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { INTERESTS } from "../constants/interests";
import { CommunityPicker, useDefaultEventCommunity } from "./CommunityPicker";
import { PostAsPicker } from "./PostAsPicker";
import { LocationAutocomplete, LocationVerifiedHint } from "./LocationAutocomplete";
import { describeMediaLink, MediaLinkField } from "./MediaLinkField";
import { useLocationField } from "../lib/useLocationField";
import { errorMessage } from "../lib/convexError";
import type { Stage } from "../lib/stage";
import { START_STAGES, type StartStage } from "../lib/shareProject";
import { FocusBackdrop } from "./FocusBackdrop";
import { gardenField } from "./gardenField";
import { SheetExit } from "./SheetExit";

// One modal for starting AND editing a project, in four short screens, each
// one thing: what it is called, a few words about it, a link to it, and the
// details. Nothing about inviting people: that comes after the project is up.
// Pass `edit` to open it on an existing project.
//
// Every field's state lives up here and all four panels stay mounted
// (hidden when inactive), so Back never loses anything and the community
// picker's one-time pre-fill can't overwrite a later choice.

export const PROJECT_STEPS = [
  { id: "name", title: "What are you making?", editTitle: "Title" },
  { id: "about", title: "Say a bit about it", editTitle: "About it" },
  { id: "show", title: "Show it", editTitle: "Show it" },
  { id: "details", title: "Details", editTitle: "Details" },
] as const;
export type ProjectStep = (typeof PROJECT_STEPS)[number]["id"];

const stepIndex = (step: ProjectStep) => PROJECT_STEPS.findIndex((s) => s.id === step);
export const stepAfter = (step: ProjectStep): ProjectStep =>
  PROJECT_STEPS[Math.min(stepIndex(step) + 1, PROJECT_STEPS.length - 1)].id;
export const stepBefore = (step: ProjectStep): ProjectStep => PROJECT_STEPS[Math.max(stepIndex(step) - 1, 0)].id;

/** The screen's heading (Rick, 2026-10-27: the form's name isn't repeated
 *  on every screen; the step's question takes that space). A new project
 *  asks; finished work says "made"; an edit names the field. */
export const stepTitle = (step: ProjectStep, finished: boolean, edit = false) =>
  edit
    ? PROJECT_STEPS[stepIndex(step)].editTitle
    : finished && step === "name"
      ? "What did you make?"
      : PROJECT_STEPS[stepIndex(step)].title;

/** The stage a new project posts in: the one the link asked for, else the
 *  one picked on the first screen, else none (the server starts it in
 *  Planning). */
export const postedStage = (asked: Stage | undefined, picked: StartStage | undefined): Stage | undefined =>
  asked ?? picked;

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
  organizationId?: Id<"organizations">;
};

/** A pill the person taps on or off: a stage, an interest. */
function pillStyle(active: boolean) {
  return {
    fontFamily: "var(--garden-font-body)",
    backgroundColor: active ? "var(--garden-citron)" : "var(--garden-ink)",
    color: active ? "var(--garden-ink)" : "var(--garden-muted)",
    border: `1px solid ${active ? "var(--garden-citron)" : "var(--garden-hairline-raised)"}`,
  };
}
const PILL = "px-3.5 py-2 rounded-full text-sm font-medium transition-colors";
// 44px tall: the pair has to fit under the sheet on a phone, with the
// browser's own bar below it.
const BUTTON = "min-h-11 rounded-lg text-[15px] disabled:opacity-50";

export function ProjectModal({
  onClose,
  onCreated,
  edit,
  initialTitle,
  initialStage,
  initialStep,
  inUrl,
}: {
  onClose: () => void;
  /** Create only: where to go once the project exists. */
  onCreated?: (projectId: string) => void;
  edit?: ProjectEditTarget;
  /** Create only: a title typed on the front door before signing in. */
  initialTitle?: string;
  /** Create only: the stage the project starts in, when the link asked for
   *  one (lib/shareProject.ts readStartStage). Finished work posts as a
   *  completed project, which is the profile's Portfolio; the heading says
   *  so. Without one, the first screen asks. */
  initialStage?: Stage;
  /** The screen to open on: the project page's "Add a link" opens an edit
   *  on "show". */
  initialStep?: ProjectStep;
  /** True when the sheet is open because of the address (the Canvas's
   *  ?create=project), so the browser's Back already closes it
   *  (SheetExit.tsx). */
  inUrl?: boolean;
}) {
  const createPassionProject = useMutation(api.garden.projects.createPassionProject);
  const updateProject = useMutation(api.garden.projects.updateProject);
  const uid = useId();
  const finished = !edit && initialStage === "completed";

  const [step, setStep] = useState<ProjectStep>(initialStep ?? "name");
  const [title, setTitle] = useState(edit?.title ?? initialTitle ?? "");
  const [pickedStage, setPickedStage] = useState<StartStage | undefined>(undefined);
  const [blurb, setBlurb] = useState(edit?.blurb ?? "");
  const [mediaUrl, setMediaUrl] = useState(edit?.mediaUrl ?? "");
  const location = useLocationField(edit);
  const [remote, setRemote] = useState(edit?.remote ?? true);
  const [interests, setInterests] = useState<string[]>(edit?.interests ?? []);
  const [hostOrgId, setHostOrgId] = useState<string>(edit?.hostOrgId ?? "");
  const [organizationId, setOrganizationId] = useState<string>(edit?.organizationId ?? "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  // New projects pre-fill the switcher's community, else The Garden — still
  // changeable to "No community — just me".
  const defaultHostOrgId = useDefaultEventCommunity();
  const bodyRef = useRef<HTMLDivElement>(null);

  const first = step === "name";
  const last = step === "details";
  // The first screen asks where it is, unless the link already said.
  const asksStage = !edit && !initialStage;

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
    if (step === "name" && !title.trim()) return;
    if (step === "show") {
      const link = describeMediaLink(mediaUrl);
      if (link.state === "invalid") {
        setError(link.message);
        return;
      }
    }
    setStep(stepAfter(step));
  }

  async function submit() {
    setError("");
    if (!title.trim()) {
      setStep("name");
      setError("Give it a title.");
      return;
    }
    const link = describeMediaLink(mediaUrl);
    if (link.state === "invalid") {
      setStep("show");
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
          ...(organizationId ? { organizationId: organizationId as Id<"organizations"> } : { postAsSelf: true }),
        });
        onClose();
        return;
      }
      const result = await createPassionProject({
        title: title.trim(),
        stage: postedStage(initialStage, pickedStage),
        blurb: blurb.trim() || undefined,
        mediaUrl: link.state === "ok" ? link.url : undefined,
        ...(remote ? {} : location.toArgs()),
        remote,
        interests: interests.length > 0 ? interests : undefined,
        hostOrgId: hostOrgId ? (hostOrgId as Id<"hostOrgs">) : undefined,
        organizationId: organizationId ? (organizationId as Id<"organizations">) : undefined,
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
    if (!last) goNext();
    else if (!saving) void submit();
  }

  // Enter in a text box on the last screen shouldn't save from inside the
  // location search.
  function handleFormKeyDown(e: React.KeyboardEvent<HTMLFormElement>) {
    if (last && e.key === "Enter" && e.target instanceof HTMLInputElement) e.preventDefault();
  }

  const panel = (id: ProjectStep) => `flex flex-col gap-6${step === id ? "" : " hidden"}`;
  const primaryDisabled = first ? !title.trim() : last ? saving : false;
  const secondaryStyle = { borderColor: "var(--garden-hairline-raised)", color: "var(--garden-paper)" };

  return (
    <FocusBackdrop>
      {/* Escape and the browser's Back close it, unless it is saving. */}
      <SheetExit onExit={() => !saving && onClose()} inUrl={inUrl} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${uid}-heading`}
        className="flex flex-col w-full h-full sm:h-auto sm:max-h-[90vh] sm:max-w-md sm:rounded-2xl sm:border shadow-2xl"
        style={{ backgroundColor: "var(--garden-ink-raised)", borderColor: "var(--garden-hairline)" }}
      >
        {/* The stepper, then the screen's question. The sheet's name is in
            the first question ("What are you making?"), not over every screen. */}
        <div className="px-5 sm:px-6 pt-4 pb-3 flex-shrink-0">
          <div
            className="flex gap-1.5"
            role="progressbar"
            aria-label={`Step ${stepIndex(step) + 1} of ${PROJECT_STEPS.length}`}
            aria-valuemin={1}
            aria-valuemax={PROJECT_STEPS.length}
            aria-valuenow={stepIndex(step) + 1}
          >
            {PROJECT_STEPS.map((s, i) => (
              <div
                key={s.id}
                className="h-1 flex-1 rounded-full"
                style={{
                  backgroundColor: i <= stepIndex(step) ? "var(--garden-citron)" : "var(--garden-hairline-raised)",
                }}
              />
            ))}
          </div>
          <div className="mt-4 flex items-start justify-between gap-3">
            <h2
              id={`${uid}-heading`}
              className="text-2xl font-semibold leading-tight"
              style={{ color: "var(--garden-paper)", fontFamily: "var(--garden-font-display)", textWrap: "balance" }}
            >
              {stepTitle(step, finished, !!edit)}
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="-mr-2.5 -mt-1.5 w-11 h-11 flex-shrink-0 flex items-center justify-center rounded-lg"
              style={{ color: "var(--garden-dim)" }}
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} onKeyDown={handleFormKeyDown} className="flex flex-col flex-1 min-h-0">
          <div ref={bodyRef} className="flex-1 min-h-0 px-5 sm:px-6 pt-2 pb-6 overflow-y-auto">
            {/* What are you making? */}
            <div data-step="name" className={panel("name")}>
              <div>
                <label htmlFor={`${uid}-title`} className={gardenField.label} style={gardenField.labelStyle}>
                  Title
                </label>
                <input
                  id={`${uid}-title`}
                  autoFocus={first}
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="A short film about my grandmother's garden"
                  className={gardenField.input}
                  style={gardenField.inputStyle}
                />
              </div>
              {asksStage && (
                <div role="group" aria-label="Where it is" className="flex flex-wrap gap-2">
                  {START_STAGES.map((s) => {
                    const on = pickedStage === s.value;
                    return (
                      <button
                        key={s.value}
                        type="button"
                        aria-pressed={on}
                        onClick={() => setPickedStage(on ? undefined : s.value)}
                        className={PILL}
                        style={pillStyle(on)}
                      >
                        {s.label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Say a bit about it */}
            <div data-step="about" className={panel("about")}>
              <div>
                <label htmlFor={`${uid}-blurb`} className={gardenField.label} style={gardenField.labelStyle}>
                  What is it (optional)
                </label>
                <textarea
                  id={`${uid}-blurb`}
                  value={blurb}
                  onChange={(e) => setBlurb(e.target.value)}
                  rows={4}
                  placeholder={finished ? "What you made, and why" : "What you're making, and why"}
                  className={`${gardenField.input} resize-none`}
                  style={gardenField.inputStyle}
                />
              </div>
            </div>

            {/* Show it */}
            <div data-step="show" className={panel("show")}>
              <MediaLinkField
                variant="garden"
                label="Paste a link (optional)"
                placeholder="Instagram post or reel, TikTok, YouTube or Vimeo"
                value={mediaUrl}
                onChange={setMediaUrl}
              />
            </div>

            {/* Details: all of it optional */}
            <div data-step="details" className={panel("details")}>
              <div>
                <div className={gardenField.label} style={gardenField.labelStyle}>
                  Interests (optional)
                </div>
                <div className="flex flex-wrap gap-2">
                  {INTERESTS.map((tag) => {
                    const active = interests.includes(tag);
                    return (
                      <button
                        key={tag}
                        type="button"
                        aria-pressed={active}
                        onClick={() => toggleInterest(tag)}
                        className={PILL}
                        style={pillStyle(active)}
                      >
                        {tag}
                      </button>
                    );
                  })}
                </div>
                <p className={gardenField.hint} style={gardenField.hintStyle}>
                  Helps people find your project.
                </p>
              </div>
              <div>
                <label className="flex items-center gap-3 min-h-11 text-[15px]" style={{ color: "var(--garden-body)" }}>
                  <input
                    type="checkbox"
                    className="w-5 h-5"
                    style={{ accentColor: "var(--garden-citron)" }}
                    checked={remote}
                    onChange={(e) => setRemote(e.target.checked)}
                  />
                  This can be done remotely
                </label>
                {!remote && (
                  <div className="mt-4">
                    <div className={gardenField.label} style={gardenField.labelStyle}>
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
              </div>
              <CommunityPicker
                roomy
                value={hostOrgId}
                onChange={setHostOrgId}
                defaultHostOrgId={edit ? undefined : defaultHostOrgId}
              />
              <PostAsPicker roomy value={organizationId} onChange={setOrganizationId} />
            </div>
          </div>

          {error && (
            <p role="alert" className="mx-5 sm:mx-6 mb-3 text-sm text-red-400 flex-shrink-0">
              {error}
            </p>
          )}

          <div
            className="flex gap-2.5 px-5 sm:px-6 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:pb-4 border-t flex-shrink-0"
            style={{ borderColor: "var(--garden-hairline)" }}
          >
            {first ? (
              <button
                type="button"
                onClick={onClose}
                className={`${BUTTON} px-4 border font-medium`}
                style={secondaryStyle}
              >
                Cancel
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setError("");
                  setStep(stepBefore(step));
                }}
                disabled={saving}
                className={`${BUTTON} px-4 border font-medium`}
                style={secondaryStyle}
              >
                Back
              </button>
            )}
            <button
              key={last ? "save" : "next"}
              type="submit"
              disabled={primaryDisabled}
              className={`${BUTTON} flex-1 px-4 font-semibold`}
              style={{ backgroundColor: "var(--garden-citron)", color: "var(--garden-ink)" }}
            >
              {!last ? "Next" : edit ? (saving ? "Saving…" : "Save changes") : saving ? "Posting…" : "Post it"}
            </button>
          </div>
        </form>
      </div>
    </FocusBackdrop>
  );
}
