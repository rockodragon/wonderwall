import { usePostHog } from "@posthog/react";
import { useMutation, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { INTERESTS } from "../constants/interests";
import { FF_JOBS, useFeatureGate } from "../lib/featureFlags";

type LocationType = "Remote" | "Hybrid" | "On-site";
type JobType = "Full-time" | "Part-time" | "Contract" | "Freelance";
type VisibilityType = "Private" | "Members";
type ExperienceLevelType = "Entry" | "Mid" | "Senior" | "Any";

export default function JobsEdit() {
  const enabled = useFeatureGate(FF_JOBS, "/projects");
  const navigate = useNavigate();
  const posthog = usePostHog();
  const { id } = useParams();
  const jobId = id as Id<"jobs">;

  const job = useQuery(api.jobs.getJob, { jobId });
  const updateJob = useMutation(api.jobs.updateJob);

  // Track form_started on mount
  useEffect(() => {
    posthog?.capture("form_started", { form_type: "job_editing" });
  }, [posthog]);

  // Redirect if not the poster
  useEffect(() => {
    if (job && !job.isPoster) {
      navigate(`/jobs/${jobId}`);
    }
  }, [job, navigate, jobId]);

  // Required fields
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState<LocationType>("Remote");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [country, setCountry] = useState("");
  const [zipCode, setZipCode] = useState("");
  const [jobType, setJobType] = useState<JobType>("Full-time");
  const [visibility, setVisibility] = useState<VisibilityType>("Members");

  // Optional fields
  const [hiringOrg, setHiringOrg] = useState("");
  const [postAnonymously, setPostAnonymously] = useState(false);
  const [compensationRange, setCompensationRange] = useState("");
  const [externalLink, setExternalLink] = useState("");
  const [disciplines, setDisciplines] = useState<string[]>([]);
  const [experienceLevel, setExperienceLevel] = useState<
    ExperienceLevelType | ""
  >("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Pre-fill form with existing job data
  useEffect(() => {
    if (job) {
      setTitle(job.title);
      setDescription(job.description);
      setLocation(job.location);
      setCity(job.city || "");
      setState(job.state || "");
      setCountry(job.country || "");
      setZipCode(job.zipCode || "");
      setJobType(job.jobType);
      setVisibility(job.visibility);
      setHiringOrg(job.hiringOrg || "");
      setPostAnonymously(job.postAnonymously || false);
      setCompensationRange(job.compensationRange || "");
      setExternalLink(job.externalLink || "");
      setDisciplines(job.disciplines || []);
      setExperienceLevel(job.experienceLevel || "");
    }
  }, [job]);

  function toggleDiscipline(discipline: string) {
    setDisciplines((prev) =>
      prev.includes(discipline)
        ? prev.filter((d) => d !== discipline)
        : [...prev, discipline],
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    // Validate required fields
    if (!title.trim()) {
      setError("Title is required");
      return;
    }
    if (title.length > 100) {
      setError("Title must be 100 characters or less");
      return;
    }
    if (!description.trim()) {
      setError("Description is required");
      return;
    }
    if (description.length > 5000) {
      setError("Description must be 5000 characters or less");
      return;
    }

    // Validate location fields
    if (location !== "Remote") {
      if (!city.trim()) {
        setError("City is required for non-remote positions");
        return;
      }
      if (!country.trim()) {
        setError("Country is required for non-remote positions");
        return;
      }
    }

    // Validate external link
    if (externalLink.trim()) {
      try {
        new URL(externalLink);
      } catch {
        setError("External link must be a valid URL");
        return;
      }
    }

    setSaving(true);
    try {
      await updateJob({
        jobId,
        title,
        description,
        location,
        city: location !== "Remote" ? city : undefined,
        state: location !== "Remote" ? state : undefined,
        country: location !== "Remote" ? country : undefined,
        zipCode: location !== "Remote" && zipCode ? zipCode : undefined,
        jobType,
        visibility,
        hiringOrg: hiringOrg.trim() || undefined,
        postAnonymously,
        compensationRange: compensationRange.trim() || undefined,
        externalLink: externalLink.trim() || undefined,
        disciplines: disciplines.length > 0 ? disciplines : undefined,
        experienceLevel: experienceLevel || undefined,
      });

      // Track job_updated on success
      posthog?.capture("job_updated", {
        location,
        jobType,
        visibility,
        has_hiring_org: !!hiringOrg.trim(),
        post_anonymously: postAnonymously,
        has_compensation: !!compensationRange.trim(),
        has_external_link: !!externalLink.trim(),
        disciplines_count: disciplines.length,
        has_experience_level: !!experienceLevel,
      });

      navigate(`/jobs/${jobId}`);
    } catch (err) {
      console.error("Failed to update job:", err);
      setError(
        err instanceof Error ? err.message : "Failed to update project posting",
      );
    } finally {
      setSaving(false);
    }
  }

  // Show loading state while fetching job
  if (!job) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ backgroundColor: "var(--app-surface)" }}
      >
        <div style={{ color: "var(--app-text-dim)" }}>Loading...</div>
      </div>
    );
  }

  if (!enabled) return null;

  // Shared text-input/select/textarea treatment (base border/bg/text via
  // --app-* tokens, citron focus ring via onFocus/onBlur — Tailwind's
  // focus:ring-* can't take an arbitrary CSS-var color here, same pattern
  // as components/SearchInput.tsx) so the ~10 fields below don't each
  // hand-roll it.
  const fieldStyle: React.CSSProperties = {
    borderColor: "var(--app-hairline)",
    backgroundColor: "var(--app-surface-raised)",
    color: "var(--app-text)",
    boxShadow: "0 0 0 0 transparent",
  };
  function handleFieldFocus(
    e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) {
    e.currentTarget.style.boxShadow = "0 0 0 2px var(--app-accent)";
  }
  function handleFieldBlur(
    e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) {
    e.currentTarget.style.boxShadow = "0 0 0 0 transparent";
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: "var(--app-surface)" }}>
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div
          className="rounded-2xl shadow-sm border p-6"
          style={{ backgroundColor: "var(--app-surface-raised)", borderColor: "var(--app-hairline)" }}
        >
          <h1 className="text-2xl font-bold mb-6" style={{ color: "var(--app-text)" }}>
            Edit Project
          </h1>

          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="p-4 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg text-sm border border-red-200 dark:border-red-800">
                {error}
              </div>
            )}

            {/* Title */}
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: "var(--app-text-muted)" }}>
                Project Title <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., Senior Designer"
                maxLength={100}
                className="w-full px-4 py-2 rounded-lg border outline-none transition-shadow"
                style={fieldStyle}
                onFocus={handleFieldFocus}
                onBlur={handleFieldBlur}
              />
              <div className="text-xs mt-1" style={{ color: "var(--app-text-dim)" }}>
                {title.length}/100 characters
              </div>
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: "var(--app-text-muted)" }}>
                Project Description <span className="text-red-500">*</span>
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe the role, responsibilities, requirements, and what makes this opportunity unique..."
                rows={8}
                maxLength={5000}
                className="w-full px-4 py-2 rounded-lg border outline-none transition-shadow resize-none"
                style={fieldStyle}
                onFocus={handleFieldFocus}
                onBlur={handleFieldBlur}
              />
              <div className="text-xs mt-1" style={{ color: "var(--app-text-dim)" }}>
                {description.length}/5000 characters
              </div>
            </div>

            {/* Location */}
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: "var(--app-text-muted)" }}>
                Location Type <span className="text-red-500">*</span>
              </label>
              <select
                value={location}
                onChange={(e) => setLocation(e.target.value as LocationType)}
                className="w-full px-4 py-2 rounded-lg border outline-none transition-shadow"
                style={fieldStyle}
                onFocus={handleFieldFocus}
                onBlur={handleFieldBlur}
              >
                <option value="Remote">Remote</option>
                <option value="Hybrid">Hybrid</option>
                <option value="On-site">On-site</option>
              </select>
            </div>

            {/* Conditional location fields */}
            {location !== "Remote" && (
              <div className="space-y-4 pl-4 border-l-2" style={{ borderColor: "var(--app-hairline)" }}>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1" style={{ color: "var(--app-text-muted)" }}>
                      City <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      placeholder="e.g., San Francisco"
                      className="w-full px-4 py-2 rounded-lg border outline-none transition-shadow"
                      style={fieldStyle}
                      onFocus={handleFieldFocus}
                      onBlur={handleFieldBlur}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1" style={{ color: "var(--app-text-muted)" }}>
                      State/Province
                    </label>
                    <input
                      type="text"
                      value={state}
                      onChange={(e) => setState(e.target.value)}
                      placeholder="e.g., California"
                      className="w-full px-4 py-2 rounded-lg border outline-none transition-shadow"
                      style={fieldStyle}
                      onFocus={handleFieldFocus}
                      onBlur={handleFieldBlur}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1" style={{ color: "var(--app-text-muted)" }}>
                      Country <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={country}
                      onChange={(e) => setCountry(e.target.value)}
                      placeholder="e.g., United States"
                      className="w-full px-4 py-2 rounded-lg border outline-none transition-shadow"
                      style={fieldStyle}
                      onFocus={handleFieldFocus}
                      onBlur={handleFieldBlur}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1" style={{ color: "var(--app-text-muted)" }}>
                      Zip/Postal Code
                    </label>
                    <input
                      type="text"
                      value={zipCode}
                      onChange={(e) => setZipCode(e.target.value)}
                      placeholder="e.g., 94103"
                      className="w-full px-4 py-2 rounded-lg border outline-none transition-shadow"
                      style={fieldStyle}
                      onFocus={handleFieldFocus}
                      onBlur={handleFieldBlur}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Job Type */}
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: "var(--app-text-muted)" }}>
                Project Type <span className="text-red-500">*</span>
              </label>
              <select
                value={jobType}
                onChange={(e) => setJobType(e.target.value as JobType)}
                className="w-full px-4 py-2 rounded-lg border outline-none transition-shadow"
                style={fieldStyle}
                onFocus={handleFieldFocus}
                onBlur={handleFieldBlur}
              >
                <option value="Full-time">Full-time</option>
                <option value="Part-time">Part-time</option>
                <option value="Contract">Contract</option>
                <option value="Freelance">Freelance</option>
              </select>
            </div>

            {/* Visibility */}
            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: "var(--app-text-muted)" }}>
                Visibility <span className="text-red-500">*</span>
              </label>
              <div className="space-y-3">
                <label
                  className="flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition-colors hover:bg-[var(--app-hairline)]"
                  style={{ borderColor: "var(--app-hairline)" }}
                >
                  <input
                    type="radio"
                    name="visibility"
                    value="Members"
                    checked={visibility === "Members"}
                    onChange={(e) =>
                      setVisibility(e.target.value as VisibilityType)
                    }
                    className="mt-0.5"
                  />
                  <div>
                    <div className="font-medium" style={{ color: "var(--app-text)" }}>
                      Members Only
                    </div>
                    <div className="text-sm" style={{ color: "var(--app-text-dim)" }}>
                      Visible to all logged-in members. Members can express
                      interest.
                    </div>
                  </div>
                </label>
                <label
                  className="flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition-colors hover:bg-[var(--app-hairline)]"
                  style={{ borderColor: "var(--app-hairline)" }}
                >
                  <input
                    type="radio"
                    name="visibility"
                    value="Private"
                    checked={visibility === "Private"}
                    onChange={(e) =>
                      setVisibility(e.target.value as VisibilityType)
                    }
                    className="mt-0.5"
                  />
                  <div>
                    <div className="font-medium" style={{ color: "var(--app-text)" }}>
                      Private
                    </div>
                    <div className="text-sm" style={{ color: "var(--app-text-dim)" }}>
                      Only visible to you. Use this for drafts or private
                      listings.
                    </div>
                  </div>
                </label>
              </div>
            </div>

            {/* Hiring Organization */}
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: "var(--app-text-muted)" }}>
                Hiring Organization
              </label>
              <input
                type="text"
                value={hiringOrg}
                onChange={(e) => setHiringOrg(e.target.value)}
                placeholder="e.g., Acme Inc."
                maxLength={100}
                className="w-full px-4 py-2 rounded-lg border outline-none transition-shadow"
                style={fieldStyle}
                onFocus={handleFieldFocus}
                onBlur={handleFieldBlur}
              />
              <div className="text-xs mt-1" style={{ color: "var(--app-text-dim)" }}>
                {hiringOrg.length}/100 characters
              </div>
              <label className="flex items-center gap-2 mt-2">
                <input
                  type="checkbox"
                  checked={postAnonymously}
                  onChange={(e) => setPostAnonymously(e.target.checked)}
                  className="w-4 h-4 rounded"
                  style={{ accentColor: "var(--app-accent)" }}
                />
                <span className="text-sm" style={{ color: "var(--app-text-muted)" }}>
                  Post anonymously (hides organization name)
                </span>
              </label>
            </div>

            {/* Compensation Range */}
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: "var(--app-text-muted)" }}>
                Compensation Range
              </label>
              <input
                type="text"
                value={compensationRange}
                onChange={(e) => setCompensationRange(e.target.value)}
                placeholder="e.g., $50k-$70k or $30/hr"
                className="w-full px-4 py-2 rounded-lg border outline-none transition-shadow"
                style={fieldStyle}
                onFocus={handleFieldFocus}
                onBlur={handleFieldBlur}
              />
            </div>

            {/* External Link */}
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: "var(--app-text-muted)" }}>
                External Link
              </label>
              <input
                type="url"
                value={externalLink}
                onChange={(e) => setExternalLink(e.target.value)}
                placeholder="https://example.com/apply"
                className="w-full px-4 py-2 rounded-lg border outline-none transition-shadow"
                style={fieldStyle}
                onFocus={handleFieldFocus}
                onBlur={handleFieldBlur}
              />
              <div className="text-xs mt-1" style={{ color: "var(--app-text-dim)" }}>
                Link to external project posting or application form
              </div>
            </div>

            {/* Disciplines */}
            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: "var(--app-text-muted)" }}>
                Disciplines
              </label>
              <div className="flex flex-wrap gap-2">
                {INTERESTS.map((discipline) => (
                  <button
                    key={discipline}
                    type="button"
                    onClick={() => toggleDiscipline(discipline)}
                    className="px-3 py-1.5 rounded-full text-sm font-medium transition-colors"
                    style={
                      disciplines.includes(discipline)
                        ? { backgroundColor: "var(--app-accent)", color: "var(--garden-ink)" }
                        : { backgroundColor: "var(--app-hairline)", color: "var(--app-text-muted)" }
                    }
                  >
                    {discipline}
                  </button>
                ))}
              </div>
            </div>

            {/* Experience Level */}
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: "var(--app-text-muted)" }}>
                Experience Level
              </label>
              <select
                value={experienceLevel}
                onChange={(e) =>
                  setExperienceLevel(e.target.value as ExperienceLevelType | "")
                }
                className="w-full px-4 py-2 rounded-lg border outline-none transition-shadow"
                style={fieldStyle}
                onFocus={handleFieldFocus}
                onBlur={handleFieldBlur}
              >
                <option value="">Not specified</option>
                <option value="Entry">Entry Level</option>
                <option value="Mid">Mid Level</option>
                <option value="Senior">Senior Level</option>
                <option value="Any">Any Level</option>
              </select>
            </div>

            {/* Form Actions */}
            <div className="flex gap-3 pt-4 border-t" style={{ borderColor: "var(--app-hairline)" }}>
              <button
                type="button"
                onClick={() => navigate(`/jobs/${jobId}`)}
                className="flex-1 py-2.5 px-4 border rounded-lg font-medium transition-colors hover:bg-[var(--app-hairline-raised)]"
                style={{ borderColor: "var(--app-hairline-raised)", color: "var(--app-text-muted)" }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex-1 py-2.5 px-4 rounded-lg font-medium transition-colors hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ backgroundColor: "var(--app-accent)", color: "var(--garden-ink)" }}
              >
                {saving ? "Updating..." : "Update Project"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
