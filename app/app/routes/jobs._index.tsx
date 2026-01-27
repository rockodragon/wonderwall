import { useQuery } from "convex/react";
import { useState, useEffect } from "react";
import { Link } from "react-router";
import { usePostHog } from "@posthog/react";
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

type StatusFilter = "All" | "Open" | "Closed";
type LocationFilter = "All" | "Remote" | "Hybrid" | "On-site";
type TabFilter = "all" | "matches" | "interested" | "posts";

export default function JobsIndex() {
  const posthog = usePostHog();

  // Tab state
  const [activeTab, setActiveTab] = useState<TabFilter>("all");

  // Filter state
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("Open");
  const [locationFilter, setLocationFilter] = useState<LocationFilter>("All");
  const [disciplinesFilter, setDisciplinesFilter] = useState<string[]>([]);
  const [showFilters, setShowFilters] = useState(false);

  // Derive filter booleans from active tab
  const forMe = activeTab === "matches";
  const myInterests = activeTab === "interested";
  const myPosts = activeTab === "posts";

  // Query jobs with filters
  const jobs = useQuery(api.jobs.getJobs, {
    statusFilter: statusFilter === "All" ? undefined : statusFilter,
    locationFilter: locationFilter === "All" ? undefined : locationFilter,
    disciplinesFilter:
      disciplinesFilter.length > 0 ? disciplinesFilter : undefined,
    forMe,
    myPosts,
    myInterests,
  });

  // Track page view on mount
  useEffect(() => {
    posthog?.capture("jobs_page_viewed");
  }, [posthog]);

  // Track filter changes
  useEffect(() => {
    if (
      statusFilter !== "Open" ||
      locationFilter !== "All" ||
      disciplinesFilter.length > 0 ||
      activeTab !== "all"
    ) {
      posthog?.capture("jobs_filters_changed", {
        activeTab,
        statusFilter,
        locationFilter,
        disciplinesFilter,
      });
    }
  }, [activeTab, statusFilter, locationFilter, disciplinesFilter, posthog]);

  const toggleDiscipline = (discipline: string) => {
    setDisciplinesFilter((prev) =>
      prev.includes(discipline)
        ? prev.filter((d) => d !== discipline)
        : [...prev, discipline],
    );
  };

  // Reset status filter when switching to interested tab (show all statuses)
  const handleTabChange = (tab: TabFilter) => {
    setActiveTab(tab);
    if (tab === "interested") {
      setStatusFilter("All");
    }
  };

  // Check if any filters are active
  const hasActiveFilters =
    statusFilter !== "Open" ||
    locationFilter !== "All" ||
    disciplinesFilter.length > 0;

  // Helper to format relative time
  const getRelativeTime = (timestamp: number): string => {
    const now = Date.now();
    const diff = now - timestamp;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    const weeks = Math.floor(days / 7);
    const months = Math.floor(days / 30);

    if (months > 0) return `${months}mo ago`;
    if (weeks > 0) return `${weeks}w ago`;
    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return "just now";
  };

  const tabs = [
    { id: "all" as const, label: "All Jobs" },
    { id: "matches" as const, label: "My Matches" },
    { id: "interested" as const, label: "Interested Jobs" },
    { id: "posts" as const, label: "My Job Posts" },
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Jobs
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            Discover opportunities in the creative community
          </p>
        </div>
        <Link
          to="/jobs/new"
          className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          + Post a Job
        </Link>
      </div>

      {/* Tab Navigation */}
      <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-2">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => handleTabChange(tab.id)}
            className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
              activeTab === tab.id
                ? "bg-blue-600 text-white"
                : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
            }`}
          >
            {tab.label}
          </button>
        ))}

        {/* Filter Button */}
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`ml-auto flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-colors ${
            hasActiveFilters
              ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400"
              : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
          }`}
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
              d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
            />
          </svg>
          Filter
          {hasActiveFilters && (
            <span className="w-2 h-2 bg-blue-600 rounded-full" />
          )}
          <svg
            className={`w-4 h-4 transition-transform ${showFilters ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </button>
      </div>

      {/* Collapsible Filters */}
      {showFilters && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 mb-6 border border-gray-200 dark:border-gray-700 animate-in slide-in-from-top-2 duration-200">
          <div className="space-y-4">
            {/* Status and Location Dropdowns */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Status Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Status
                </label>
                <select
                  value={statusFilter}
                  onChange={(e) =>
                    setStatusFilter(e.target.value as StatusFilter)
                  }
                  className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-xl text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="All">All</option>
                  <option value="Open">Open Only</option>
                  <option value="Closed">Closed</option>
                </select>
              </div>

              {/* Location Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Location
                </label>
                <select
                  value={locationFilter}
                  onChange={(e) =>
                    setLocationFilter(e.target.value as LocationFilter)
                  }
                  className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-xl text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="All">All</option>
                  <option value="Remote">Remote</option>
                  <option value="Hybrid">Hybrid</option>
                  <option value="On-site">On-site</option>
                </select>
              </div>
            </div>

            {/* Disciplines Multi-Select */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Disciplines
              </label>
              <div className="flex flex-wrap gap-2">
                {JOB_FUNCTIONS.map((discipline) => (
                  <button
                    key={discipline}
                    onClick={() => toggleDiscipline(discipline)}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                      disciplinesFilter.includes(discipline)
                        ? "bg-blue-600 text-white"
                        : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
                    }`}
                  >
                    {discipline}
                  </button>
                ))}
              </div>
            </div>

            {/* Clear Filters */}
            {hasActiveFilters && (
              <button
                onClick={() => {
                  setStatusFilter("Open");
                  setLocationFilter("All");
                  setDisciplinesFilter([]);
                }}
                className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
              >
                Clear all filters
              </button>
            )}
          </div>
        </div>
      )}

      {/* Loading State */}
      {jobs === undefined ? (
        <div className="flex items-center justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      ) : jobs.length === 0 ? (
        /* Empty State */
        <div className="text-center py-16 text-gray-400 dark:text-gray-500">
          <svg
            className="w-16 h-16 mx-auto mb-4 opacity-50"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1}
              d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
            />
          </svg>
          <p className="text-lg font-medium mb-1">No jobs found</p>
          <p className="text-sm">
            {activeTab === "matches"
              ? "No jobs match your profile disciplines yet"
              : activeTab === "interested"
                ? "You haven't expressed interest in any jobs yet"
                : activeTab === "posts"
                  ? "You haven't posted any jobs yet"
                  : "Try adjusting your filters or be the first to post a job"}
          </p>
        </div>
      ) : (
        /* Job Cards Grid */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {jobs.map((job) => {
            const descriptionPreview =
              job.description.length > 150
                ? `${job.description.substring(0, 150)}...`
                : job.description;

            return (
              <Link
                key={job._id}
                to={`/jobs/${job._id}`}
                className="group block bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-200 dark:border-gray-700 hover:border-blue-500 dark:hover:border-blue-500 transition-all hover:shadow-lg"
              >
                {/* Job Title */}
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2 line-clamp-2 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                  {job.title}
                </h3>

                {/* Poster Info */}
                {job.poster && (
                  <div className="flex items-center gap-2 mb-3">
                    {job.poster.imageUrl ? (
                      <img
                        src={job.poster.imageUrl}
                        alt={job.poster.name}
                        className="w-6 h-6 rounded-full object-cover"
                      />
                    ) : (
                      <div className="w-6 h-6 rounded-full bg-gray-300 dark:bg-gray-600 flex items-center justify-center text-white text-xs">
                        {job.poster.name[0]?.toUpperCase() || "?"}
                      </div>
                    )}
                    <Link
                      to={`/profile/${job.poster.profileId}`}
                      className="text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 truncate"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {job.poster.name}
                    </Link>
                  </div>
                )}

                {/* Badges Row */}
                <div className="flex flex-wrap gap-2 mb-3">
                  {/* Status Badge */}
                  <span
                    className={`px-2 py-1 rounded-lg text-xs font-medium ${
                      job.status === "Open"
                        ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400"
                        : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400"
                    }`}
                  >
                    {job.status}
                  </span>

                  {/* Location Badge */}
                  <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded-lg text-xs font-medium">
                    {job.location}
                  </span>

                  {/* Job Type Badge */}
                  <span className="px-2 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 rounded-lg text-xs font-medium">
                    {job.jobType}
                  </span>
                </div>

                {/* Description Preview */}
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-3 line-clamp-3">
                  {descriptionPreview}
                </p>

                {/* Footer with Date and Interest Count */}
                <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-500">
                  <span>{getRelativeTime(job.createdAt)}</span>
                  {job.interestCount > 0 && (
                    <div className="flex items-center gap-1">
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
                          d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
                        />
                      </svg>
                      <span>{job.interestCount} interested</span>
                    </div>
                  )}
                </div>

                {/* Disciplines Tags */}
                {job.disciplines && job.disciplines.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
                    {job.disciplines.slice(0, 3).map((discipline) => (
                      <span
                        key={discipline}
                        className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded-full text-xs"
                      >
                        {discipline}
                      </span>
                    ))}
                    {job.disciplines.length > 3 && (
                      <span className="px-2 py-0.5 text-gray-500 dark:text-gray-500 text-xs">
                        +{job.disciplines.length - 3} more
                      </span>
                    )}
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
