import { useMutation, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import Markdown from "react-markdown";
import { usePostHog } from "@posthog/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { InterestModal } from "../components/InterestModal";

export default function JobDetail() {
  const { id } = useParams();
  const posthog = usePostHog();
  const jobId = id as Id<"jobs">;

  const job = useQuery(api.jobs.getJob, jobId ? { jobId } : "skip");
  const interests = useQuery(
    api.jobs.getJobInterests,
    jobId ? { jobId } : "skip",
  );
  const userInterest = useQuery(
    api.jobs.getUserJobInterest,
    jobId ? { jobId } : "skip",
  );
  const closeJob = useMutation(api.jobs.closeJob);
  const reopenJob = useMutation(api.jobs.reopenJob);

  const [closing, setClosing] = useState(false);
  const [reopening, setReopening] = useState(false);
  const [showInterestModal, setShowInterestModal] = useState(false);

  // Track job view on mount
  useEffect(() => {
    if (job && posthog) {
      posthog.capture("job_viewed", {
        job_id: jobId,
        job_title: job.title,
        location: job.location,
        job_type: job.jobType,
        status: job.status,
        is_poster: job.isPoster,
      });
    }
  }, [job, jobId, posthog]);

  async function handleCloseJob() {
    if (!jobId) return;
    if (!confirm("Are you sure you want to mark this job as closed?")) return;

    setClosing(true);
    try {
      await closeJob({ jobId });
    } catch (err) {
      console.error("Failed to close job:", err);
      alert("Failed to close job. Please try again.");
    } finally {
      setClosing(false);
    }
  }

  async function handleReopenJob() {
    if (!jobId) return;
    if (!confirm("Are you sure you want to reopen this job?")) return;

    setReopening(true);
    try {
      await reopenJob({ jobId });
    } catch (err) {
      console.error("Failed to reopen job:", err);
      alert("Failed to reopen job. Please try again.");
    } finally {
      setReopening(false);
    }
  }

  if (job === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (!job) {
    return (
      <div className="p-6 max-w-4xl mx-auto text-center py-12">
        <p className="text-gray-500 dark:text-gray-400">Job not found</p>
        <Link
          to="/jobs"
          className="text-blue-600 hover:underline mt-4 inline-block"
        >
          Back to Jobs
        </Link>
      </div>
    );
  }

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = Date.now();
    const diff = now - timestamp;
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) return "Today";
    if (days === 1) return "Yesterday";
    if (days < 7) return `${days} days ago`;
    if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      {/* Back link */}
      <Link
        to="/jobs"
        className="inline-flex items-center gap-2 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white mb-6 text-sm"
      >
        <svg
          className="w-4 h-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 19l-7-7 7-7"
          />
        </svg>
        Back to Jobs
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Hero Section */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-lg">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div className="flex-1">
                {/* Job Title */}
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white mb-3">
                  {job.title}
                </h1>

                {/* Disciplines (Job Functions) - Priority display in color */}
                {job.disciplines && job.disciplines.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-4">
                    {job.disciplines.map((discipline) => (
                      <span
                        key={discipline}
                        className="px-3 py-1.5 bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-400 rounded-lg text-sm font-medium"
                      >
                        {discipline}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Job Description */}
            <div className="mb-6">
              <div className="prose prose-base dark:prose-invert max-w-none prose-headings:text-gray-900 dark:prose-headings:text-white prose-p:text-gray-800 dark:prose-p:text-gray-200 prose-p:leading-relaxed prose-a:text-blue-600 dark:prose-a:text-blue-400 prose-strong:text-gray-900 dark:prose-strong:text-white prose-ul:text-gray-800 dark:prose-ul:text-gray-200 prose-ol:text-gray-800 dark:prose-ol:text-gray-200">
                <Markdown>{job.description}</Markdown>
              </div>
            </div>

            {/* Secondary Metadata - Outlined badges */}
            <div className="pt-6 border-t border-gray-200 dark:border-gray-700 space-y-4">
              <div className="flex flex-wrap gap-2">
                {/* Location */}
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 rounded-full text-sm">
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                  </svg>
                  {job.location}
                  {job.city && ` · ${job.city}`}
                  {job.state && `, ${job.state}`}
                </span>

                {/* Job Type */}
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 rounded-full text-sm">
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                    />
                  </svg>
                  {job.jobType}
                </span>

                {/* Status */}
                <span
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 border rounded-full text-sm ${
                    job.status === "Open"
                      ? "border-green-300 dark:border-green-700 text-green-600 dark:text-green-400"
                      : "border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400"
                  }`}
                >
                  <div
                    className={`w-2 h-2 rounded-full ${
                      job.status === "Open" ? "bg-green-500" : "bg-gray-500"
                    }`}
                  />
                  {job.status}
                </span>

                {/* Posted date */}
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 rounded-full text-sm">
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                    />
                  </svg>
                  Posted {formatDate(job.createdAt)}
                </span>
              </div>

              {/* Additional Info */}
              {(job.experienceLevel || job.compensationRange) && (
                <div className="flex flex-wrap gap-2">
                  {job.experienceLevel && job.experienceLevel !== "Any" && (
                    <span className="inline-flex items-center px-3 py-1.5 border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 rounded-full text-sm">
                      {job.experienceLevel} level
                    </span>
                  )}
                  {job.compensationRange && (
                    <span className="inline-flex items-center px-3 py-1.5 border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 rounded-full text-sm">
                      {job.compensationRange}
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* External Link */}
            {job.externalLink && (
              <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
                <a
                  href={job.externalLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white rounded-xl font-medium hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                >
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                    />
                  </svg>
                  View Full Details
                </a>
              </div>
            )}

            {/* Interest Section */}
            {!job.isPoster && (
              <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      <svg
                        className="w-5 h-5 text-gray-400"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"
                        />
                      </svg>
                      <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
                        {interests?.count || 0}{" "}
                        {interests?.count === 1 ? "person" : "people"}{" "}
                        interested
                      </span>
                    </div>
                  </div>

                  {userInterest ? (
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-green-600 dark:text-green-400 font-medium">
                        You're interested
                      </span>
                      <button
                        onClick={() => setShowInterestModal(true)}
                        className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-xl text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                      >
                        Edit
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setShowInterestModal(true)}
                      disabled={job.status === "Closed"}
                      className="px-6 py-2.5 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      I'm Interested
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Poster Controls */}
            {job.isPoster && (
              <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
                <div className="flex flex-wrap gap-3">
                  <Link
                    to={`/jobs/${jobId}/edit`}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors"
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                      />
                    </svg>
                    Edit Job
                  </Link>

                  {job.status === "Open" ? (
                    <button
                      onClick={handleCloseJob}
                      disabled={closing}
                      className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-xl font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
                    >
                      {closing ? (
                        <div className="w-4 h-4 animate-spin rounded-full border-2 border-gray-300 border-t-gray-600" />
                      ) : (
                        <svg
                          className="w-4 h-4"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M6 18L18 6M6 6l12 12"
                          />
                        </svg>
                      )}
                      Mark as Closed
                    </button>
                  ) : (
                    <button
                      onClick={handleReopenJob}
                      disabled={reopening}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-xl font-medium hover:bg-green-700 transition-colors disabled:opacity-50"
                    >
                      {reopening ? (
                        <div className="w-4 h-4 animate-spin rounded-full border-2 border-white border-t-green-300" />
                      ) : (
                        <svg
                          className="w-4 h-4"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M5 13l4 4L19 7"
                          />
                        </svg>
                      )}
                      Reopen Job
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Interested Members (Poster Only) */}
          {job.isPoster &&
            interests &&
            interests.interests &&
            interests.interests.length > 0 && (
              <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-lg">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
                  Interested Members ({interests.count})
                </h2>
                <div className="space-y-6">
                  {interests.interests.map((interest) => (
                    <div
                      key={interest._id}
                      className="p-5 bg-gray-50 dark:bg-gray-900 rounded-xl"
                    >
                      {/* Profile Header */}
                      <div className="flex items-start gap-4 mb-4">
                        <Link
                          to={`/profile/${interest.profile?._id}`}
                          className="shrink-0"
                        >
                          {interest.profile?.imageUrl ? (
                            <img
                              src={interest.profile.imageUrl}
                              alt={interest.profile.name}
                              className="w-12 h-12 rounded-full object-cover"
                            />
                          ) : (
                            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white text-lg font-bold">
                              {interest.profile?.name.charAt(0).toUpperCase()}
                            </div>
                          )}
                        </Link>

                        <div className="flex-1 min-w-0">
                          <Link
                            to={`/profile/${interest.profile?._id}`}
                            className="font-semibold text-gray-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400"
                          >
                            {interest.profile?.name}
                          </Link>
                          {interest.profile?.jobFunctions &&
                            interest.profile.jobFunctions.length > 0 && (
                              <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                                {interest.profile.jobFunctions
                                  .slice(0, 3)
                                  .join(" · ")}
                              </p>
                            )}
                          <p className="text-xs text-gray-400 mt-1">
                            Interested {formatDate(interest.createdAt)}
                          </p>
                        </div>
                      </div>

                      {/* Note */}
                      {interest.note && (
                        <div className="mb-4">
                          <p className="text-sm text-gray-700 dark:text-gray-300">
                            {interest.note}
                          </p>
                        </div>
                      )}

                      {/* Work Links */}
                      {interest.workLinkArtifacts &&
                        interest.workLinkArtifacts.length > 0 && (
                          <div>
                            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                              Portfolio
                            </p>
                            <div className="flex flex-wrap gap-3">
                              {interest.workLinkArtifacts.map((artifact) => (
                                <Link
                                  key={artifact._id}
                                  to={`/works/${artifact._id}`}
                                  className="group relative w-24 h-24 rounded-lg overflow-hidden bg-gray-200 dark:bg-gray-700 hover:ring-2 hover:ring-blue-500 transition-all"
                                >
                                  {artifact.type === "image" &&
                                  artifact.mediaUrl ? (
                                    <img
                                      src={artifact.mediaUrl}
                                      alt={artifact.title || "Work"}
                                      className="w-full h-full object-cover"
                                    />
                                  ) : (
                                    <div className="w-full h-full flex items-center justify-center">
                                      <svg
                                        className="w-8 h-8 text-gray-400"
                                        fill="none"
                                        viewBox="0 0 24 24"
                                        stroke="currentColor"
                                      >
                                        <path
                                          strokeLinecap="round"
                                          strokeLinejoin="round"
                                          strokeWidth={2}
                                          d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                                        />
                                      </svg>
                                    </div>
                                  )}
                                  {artifact.title && (
                                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center p-2">
                                      <p className="text-white text-xs text-center line-clamp-3">
                                        {artifact.title}
                                      </p>
                                    </div>
                                  )}
                                </Link>
                              ))}
                            </div>
                          </div>
                        )}
                    </div>
                  ))}
                </div>
              </div>
            )}
        </div>

        {/* Sidebar */}
        <div className="lg:col-span-1">
          {/* Poster Card */}
          {job.poster && !job.postAnonymously && (
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-lg mb-6">
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
                Posted By
              </p>
              <Link
                to={`/profile/${job.poster.profileId}`}
                className="block group"
              >
                <div className="flex items-center gap-3 mb-3">
                  {job.poster.imageUrl ? (
                    <img
                      src={job.poster.imageUrl}
                      alt={job.poster.name}
                      className="w-12 h-12 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white text-lg font-bold">
                      {job.poster.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                      {job.poster.name}
                    </h3>
                  </div>
                  <svg
                    className="w-5 h-5 text-gray-400 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </div>
              </Link>

              {/* Job Functions */}
              {job.poster.jobFunctions &&
                job.poster.jobFunctions.length > 0 && (
                  <div className="mb-3">
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {job.poster.jobFunctions.slice(0, 3).join(" · ")}
                    </p>
                  </div>
                )}

              {/* Hiring Org */}
              {job.hiringOrg && (
                <div className="pt-3 border-t border-gray-200 dark:border-gray-700">
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
                    Organization
                  </p>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                    {job.hiringOrg}
                  </p>
                </div>
              )}
            </div>
          )}

          {job.postAnonymously && (
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-lg mb-6">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
                  <svg
                    className="w-6 h-6 text-gray-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                    />
                  </svg>
                </div>
                <div>
                  <p className="font-semibold text-gray-900 dark:text-white">
                    Anonymous Poster
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Community Member
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Interest Modal */}
      {showInterestModal && job && (
        <InterestModal
          jobId={jobId}
          jobTitle={job.title}
          onClose={() => setShowInterestModal(false)}
          onSuccess={() => {
            setShowInterestModal(false);
            // Interests will refresh automatically via Convex reactivity
          }}
        />
      )}
    </div>
  );
}
