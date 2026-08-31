import { useState } from "react";
import { ROLES } from "../constants/roles";
import { HEAR_ABOUT_OPTIONS } from "../constants/waitlistOptions";
import { useWaitlistFollowUp } from "../lib/useWaitlistFollowUp";

const inputClass =
  "w-full px-4 py-3 border border-[var(--garden-hairline)] rounded-xl bg-[var(--garden-ink-raised)]/50 backdrop-blur-sm text-[var(--garden-paper)] placeholder-[var(--garden-muted)] focus:ring-2 focus:ring-[var(--garden-citron)] focus:border-transparent transition-all";
const labelClass =
  "block text-[12.5px] uppercase tracking-wide text-[var(--garden-dim)] mb-2";

// Same follow-up as WaitlistFollowUp, styled for the homepage's Tailwind /
// CSS-var token conventions instead of the .g-* Garden classes (which only
// apply inside .garden-root, and the homepage isn't wrapped in it).
export function WaitlistFollowUpDark({
  email,
  initialPosition,
}: {
  email: string;
  initialPosition: number | null;
}) {
  const {
    role,
    setRole,
    projectDescription,
    setProjectDescription,
    projectUrl,
    setProjectUrl,
    hasLaunchProject,
    setHasLaunchProject,
    portfolioUrl,
    setPortfolioUrl,
    interestedInHosting,
    setInterestedInHosting,
    hearAboutUs,
    setHearAboutUs,
    hearAboutUsOther,
    setHearAboutUsOther,
    submitting,
    error,
    position,
    submit,
  } = useWaitlistFollowUp(email);
  const [skipped, setSkipped] = useState(false);
  const [done, setDone] = useState(false);

  if (skipped) return null;

  if (done) {
    const movedUp =
      initialPosition != null && position != null && position < initialPosition;
    return (
      <div className="mt-4 p-5 rounded-2xl border border-[var(--garden-citron)]/40 bg-[var(--garden-ink-raised)]/60">
        <p className="text-sm text-[var(--garden-body)]">
          {movedUp ? "Thanks — that bumps you up the list." : "Thanks — that's saved."}
        </p>
      </div>
    );
  }

  return (
    <div className="mt-4 p-5 rounded-2xl border border-[var(--garden-hairline-raised)] bg-[var(--garden-ink-raised)]/60 text-left">
      <div className="text-[var(--garden-paper)] font-semibold text-base">
        Move up the list
      </div>
      <p className="mt-2 text-sm text-[var(--garden-dim)]">
        Answer a few questions and we'll bump you up — takes a minute, and you can
        skip any of it.
      </p>

      <div className="mt-4 flex flex-col gap-4">
        <div>
          <label className={labelClass}>You're joining as</label>
          <div className="flex gap-2 flex-wrap">
            {ROLES.map((r) => (
              <button
                key={r.value}
                type="button"
                onClick={() => setRole(r.value)}
                className={`px-4 py-2 rounded-xl border text-sm transition-colors ${
                  role === r.value
                    ? "border-[var(--garden-citron)] text-[var(--garden-citron)]"
                    : "border-[var(--garden-hairline-raised)] text-[var(--garden-paper)] hover:bg-[var(--garden-ink-raised)]"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label htmlFor="wld-project" className={labelClass}>
            What are you working on?
          </label>
          <textarea
            id="wld-project"
            rows={2}
            className={inputClass}
            value={projectDescription}
            onChange={(e) => setProjectDescription(e.target.value)}
            placeholder="A short film, a mural series, a worship EP…"
          />
        </div>

        <div>
          <label htmlFor="wld-project-url" className={labelClass}>
            Link to your project or work
          </label>
          <input
            id="wld-project-url"
            type="text"
            className={inputClass}
            value={projectUrl}
            onChange={(e) => setProjectUrl(e.target.value)}
            placeholder="instagram.com/yourname, yoursite.com…"
          />
        </div>

        <label className="flex items-center gap-2 text-sm text-[var(--garden-body)]">
          <input
            type="checkbox"
            checked={hasLaunchProject}
            onChange={(e) => setHasLaunchProject(e.target.checked)}
          />
          I have a project ready to bring to launch
        </label>

        {hasLaunchProject && (
          <div>
            <label htmlFor="wld-portfolio" className={labelClass}>
              Portfolio link
            </label>
            <input
              id="wld-portfolio"
              type="text"
              className={inputClass}
              value={portfolioUrl}
              onChange={(e) => setPortfolioUrl(e.target.value)}
              placeholder="yourportfolio.com, vimeo.com/yourreel…"
            />
          </div>
        )}

        <div>
          <label className="flex items-center gap-2 text-sm text-[var(--garden-body)]">
            <input
              type="checkbox"
              checked={interestedInHosting}
              onChange={(e) => setInterestedInHosting(e.target.checked)}
            />
            I'd want to be a Community Host
          </label>
          <p className="mt-1 ml-6 text-xs text-[var(--garden-dim)]">
            Churches, studios, and other groups that'd run their own space here.
          </p>
        </div>

        <div>
          <label htmlFor="wld-hear" className={labelClass}>
            How did you hear about us?
          </label>
          <select
            id="wld-hear"
            className={inputClass}
            value={hearAboutUs}
            onChange={(e) => setHearAboutUs(e.target.value)}
          >
            <option value="">Choose one</option>
            {HEAR_ABOUT_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
          {hearAboutUs === "Other" && (
            <input
              type="text"
              className={`${inputClass} mt-2`}
              value={hearAboutUsOther}
              onChange={(e) => setHearAboutUsOther(e.target.value)}
              placeholder="Tell us where"
            />
          )}
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <div className="flex items-center gap-4 flex-wrap">
          <button
            type="button"
            disabled={submitting}
            className="px-6 py-3 bg-[var(--garden-citron)] text-[var(--garden-ink)] rounded-xl font-semibold hover:opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={async () => {
              const ok = await submit();
              if (ok) setDone(true);
            }}
          >
            {submitting ? "Saving…" : "Save & move up"}
          </button>
          <button
            type="button"
            onClick={() => setSkipped(true)}
            className="text-sm text-[var(--garden-dim)] underline hover:text-[var(--garden-paper)]"
          >
            Maybe later
          </button>
        </div>
      </div>
    </div>
  );
}
