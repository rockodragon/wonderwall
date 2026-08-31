import { useState } from "react";
import { ROLES } from "../constants/roles";
import { HEAR_ABOUT_OPTIONS } from "../constants/waitlistOptions";
import { useWaitlistFollowUp } from "../lib/useWaitlistFollowUp";

// Garden-styled (.g-* classes) — used on /join, which already renders
// inside GardenPage's .garden-root wrapper.
export function WaitlistFollowUp({
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
      <div className="g-card" style={{ marginTop: 14, borderColor: "var(--g-citron)" }}>
        <p style={{ fontSize: 15, lineHeight: 1.6 }}>
          {movedUp ? "Thanks — that bumps you up the list." : "Thanks — that's saved."}
        </p>
      </div>
    );
  }

  return (
    <div className="g-card" style={{ marginTop: 14 }}>
      <div className="g-h" style={{ fontSize: 17 }}>
        Move up the list
      </div>
      <p className="g-hint" style={{ marginTop: 8 }}>
        Answer a few questions and we'll bump you up — takes a minute, and you can
        skip any of it.
      </p>

      <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 14 }}>
        <div>
          <label className="g-label" style={{ display: "block", marginBottom: 8 }}>
            You're joining as
          </label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {ROLES.map((r) => (
              <button
                key={r.value}
                type="button"
                onClick={() => setRole(r.value)}
                className="g-btn g-btn-ghost"
                style={
                  role === r.value
                    ? { borderColor: "var(--g-citron)", color: "var(--g-citron)" }
                    : undefined
                }
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label
            htmlFor="wl-project"
            className="g-label"
            style={{ display: "block", marginBottom: 8 }}
          >
            What are you working on?
          </label>
          <textarea
            id="wl-project"
            className="g-input"
            rows={2}
            value={projectDescription}
            onChange={(e) => setProjectDescription(e.target.value)}
            placeholder="A short film, a mural series, a worship EP…"
          />
        </div>

        <div>
          <label
            htmlFor="wl-project-url"
            className="g-label"
            style={{ display: "block", marginBottom: 8 }}
          >
            Link to your project or work
          </label>
          <input
            id="wl-project-url"
            type="text"
            className="g-input"
            value={projectUrl}
            onChange={(e) => setProjectUrl(e.target.value)}
            placeholder="instagram.com/yourname, yoursite.com…"
          />
        </div>

        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 15,
            color: "var(--g-body)",
          }}
        >
          <input
            type="checkbox"
            checked={hasLaunchProject}
            onChange={(e) => setHasLaunchProject(e.target.checked)}
          />
          I have a project ready to bring to launch
        </label>

        {hasLaunchProject && (
          <div>
            <label
              htmlFor="wl-portfolio"
              className="g-label"
              style={{ display: "block", marginBottom: 8 }}
            >
              Portfolio link
            </label>
            <input
              id="wl-portfolio"
              type="text"
              className="g-input"
              value={portfolioUrl}
              onChange={(e) => setPortfolioUrl(e.target.value)}
              placeholder="yourportfolio.com, vimeo.com/yourreel…"
            />
          </div>
        )}

        <div>
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: 15,
              color: "var(--g-body)",
            }}
          >
            <input
              type="checkbox"
              checked={interestedInHosting}
              onChange={(e) => setInterestedInHosting(e.target.checked)}
            />
            I'd want to be a Community Host
          </label>
          <p className="g-hint" style={{ marginTop: 4, marginLeft: 24 }}>
            Churches, studios, and other groups that'd run their own space here.
          </p>
        </div>

        <div>
          <label
            htmlFor="wl-hear"
            className="g-label"
            style={{ display: "block", marginBottom: 8 }}
          >
            How did you hear about us?
          </label>
          <select
            id="wl-hear"
            className="g-input"
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
              className="g-input"
              style={{ marginTop: 8 }}
              value={hearAboutUsOther}
              onChange={(e) => setHearAboutUsOther(e.target.value)}
              placeholder="Tell us where"
            />
          )}
        </div>

        {error && <p className="g-hint">{error}</p>}

        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center" }}>
          <button
            type="button"
            className="g-btn g-btn-citron"
            disabled={submitting}
            style={submitting ? { opacity: 0.6, cursor: "not-allowed" } : undefined}
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
            className="g-hint"
            style={{
              background: "none",
              border: "none",
              padding: 0,
              cursor: "pointer",
              textDecoration: "underline",
            }}
          >
            Maybe later
          </button>
        </div>
      </div>
    </div>
  );
}
