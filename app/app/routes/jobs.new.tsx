import { usePostHog } from "@posthog/react";
import { useMutation } from "convex/react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { api } from "../../convex/_generated/api";

const JOB_FUNCTIONS = [
  "Designer",
  "Writer",
  "Musician",
  "Developer",
  "Filmmaker",
  "Photographer",
  "Artist",
  "Entrepreneur",
  "Marketer",
  "Product Manager",
  "Other",
];

type LocationType = "Remote" | "Hybrid" | "On-site";
type JobType = "Full-time" | "Part-time" | "Contract" | "Freelance";
type VisibilityType = "Private" | "Members";
type ExperienceLevelType = "Entry" | "Mid" | "Senior" | "Any";

export default function JobsNew() {
  const navigate = useNavigate();
  const posthog = usePostHog();
  const createJob = useMutation(api.jobs.createJob);

  // Track form_started on mount
  useEffect(() => {
    posthog?.capture("form_started", { form_type: "job_posting" });
  }, [posthog]);

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
      const jobId = await createJob({
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

      // Track job_posted on success
      posthog?.capture("job_posted", {
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
      console.error("Failed to create job:", err);
      setError(
        err instanceof Error ? err.message : "Failed to create job posting",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-800 p-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
            Post a Job
          </h1>

          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="p-4 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg text-sm border border-red-200 dark:border-red-800">
                {error}
              </div>
            )}

            {/* Title */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Job Title <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., Senior Designer"
                maxLength={100}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-white"
              />
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {title.length}/100 characters
              </div>
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Job Description <span className="text-red-500">*</span>
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe the role, responsibilities, requirements, and what makes this opportunity unique..."
                rows={8}
                maxLength={5000}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-white resize-none"
              />
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {description.length}/5000 characters
              </div>
            </div>

            {/* Location */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Location Type <span className="text-red-500">*</span>
              </label>
              <select
                value={location}
                onChange={(e) => setLocation(e.target.value as LocationType)}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-white"
              >
                <option value="Remote">Remote</option>
                <option value="Hybrid">Hybrid</option>
                <option value="On-site">On-site</option>
              </select>
            </div>

            {/* Conditional location fields */}
            {location !== "Remote" && (
              <div className="space-y-4 pl-4 border-l-2 border-gray-200 dark:border-gray-700">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      City <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      placeholder="e.g., San Francisco"
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      State/Province
                    </label>
                    <input
                      type="text"
                      value={state}
                      onChange={(e) => setState(e.target.value)}
                      placeholder="e.g., California"
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-white"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Country <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={country}
                      onChange={(e) => setCountry(e.target.value)}
                      placeholder="e.g., United States"
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Zip/Postal Code
                    </label>
                    <input
                      type="text"
                      value={zipCode}
                      onChange={(e) => setZipCode(e.target.value)}
                      placeholder="e.g., 94103"
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-white"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Job Type */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Job Type <span className="text-red-500">*</span>
              </label>
              <select
                value={jobType}
                onChange={(e) => setJobType(e.target.value as JobType)}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-white"
              >
                <option value="Full-time">Full-time</option>
                <option value="Part-time">Part-time</option>
                <option value="Contract">Contract</option>
                <option value="Freelance">Freelance</option>
              </select>
            </div>

            {/* Visibility */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Visibility <span className="text-red-500">*</span>
              </label>
              <div className="space-y-3">
                <label className="flex items-start gap-3 p-3 border border-gray-300 dark:border-gray-700 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
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
                    <div className="font-medium text-gray-900 dark:text-white">
                      Members Only
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">
                      Visible to all logged-in members. Members can express
                      interest.
                    </div>
                  </div>
                </label>
                <label className="flex items-start gap-3 p-3 border border-gray-300 dark:border-gray-700 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
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
                    <div className="font-medium text-gray-900 dark:text-white">
                      Private
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">
                      Only visible to you. Use this for drafts or private
                      listings.
                    </div>
                  </div>
                </label>
              </div>
            </div>

            {/* Hiring Organization */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Hiring Organization
              </label>
              <input
                type="text"
                value={hiringOrg}
                onChange={(e) => setHiringOrg(e.target.value)}
                placeholder="e.g., Acme Inc."
                maxLength={100}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-white"
              />
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {hiringOrg.length}/100 characters
              </div>
              <label className="flex items-center gap-2 mt-2">
                <input
                  type="checkbox"
                  checked={postAnonymously}
                  onChange={(e) => setPostAnonymously(e.target.checked)}
                  className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  Post anonymously (hides organization name)
                </span>
              </label>
            </div>

            {/* Compensation Range */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Compensation Range
              </label>
              <input
                type="text"
                value={compensationRange}
                onChange={(e) => setCompensationRange(e.target.value)}
                placeholder="e.g., $50k-$70k or $30/hr"
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-white"
              />
            </div>

            {/* External Link */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                External Link
              </label>
              <input
                type="url"
                value={externalLink}
                onChange={(e) => setExternalLink(e.target.value)}
                placeholder="https://example.com/apply"
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-white"
              />
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Link to external job posting or application form
              </div>
            </div>

            {/* Disciplines */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Disciplines
              </label>
              <div className="flex flex-wrap gap-2">
                {JOB_FUNCTIONS.map((discipline) => (
                  <button
                    key={discipline}
                    type="button"
                    onClick={() => toggleDiscipline(discipline)}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                      disciplines.includes(discipline)
                        ? "bg-blue-600 text-white"
                        : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
                    }`}
                  >
                    {discipline}
                  </button>
                ))}
              </div>
            </div>

            {/* Experience Level */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Experience Level
              </label>
              <select
                value={experienceLevel}
                onChange={(e) =>
                  setExperienceLevel(e.target.value as ExperienceLevelType | "")
                }
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-white"
              >
                <option value="">Not specified</option>
                <option value="Entry">Entry Level</option>
                <option value="Mid">Mid Level</option>
                <option value="Senior">Senior Level</option>
                <option value="Any">Any Level</option>
              </select>
            </div>

            {/* Form Actions */}
            <div className="flex gap-3 pt-4 border-t border-gray-200 dark:border-gray-800">
              <button
                type="button"
                onClick={() => navigate("/jobs")}
                className="flex-1 py-2.5 px-4 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-lg font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex-1 py-2.5 px-4 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {saving ? "Posting..." : "Post Job"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
