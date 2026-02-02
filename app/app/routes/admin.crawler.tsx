import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useState } from "react";
import type { MetaFunction } from "react-router";
import type { Id } from "../../convex/_generated/dataModel";

export const meta: MetaFunction = () => {
  return [{ title: "Crawler Admin | Wonderwall" }];
};

type Organization = {
  _id: Id<"crawledOrganizations">;
  name: string;
  website?: string;
  segment: string;
  totalScore: number;
  city?: string;
  state?: string;
  careerPageUrl?: string;
  hasCareerPage?: boolean;
  lastJobsCrawledAt?: number;
  jobCount?: number;
};

export default function CrawlerAdmin() {
  const profile = useQuery(api.profiles.getMyProfile);
  const stats = useQuery(api.crawler.getStats);
  const queueStatus = useQuery(api.crawler.getQueueStatus);
  const orgs = useQuery(api.crawler.listOrganizations, { limit: 50 });

  const startProcessor = useAction(api.crawler.startQueueProcessor);
  const addToQueue = useMutation(api.crawler.addToQueue);
  const scrapeJobs = useAction(api.jobScraper.scrapeJobsForOrganization);

  const [isProcessing, setIsProcessing] = useState(false);
  const [scrapingOrg, setScrapingOrg] = useState<string | null>(null);
  const [newUrl, setNewUrl] = useState("");
  const [isAddingUrl, setIsAddingUrl] = useState(false);
  const [message, setMessage] = useState<{
    text: string;
    type: "success" | "error";
  } | null>(null);

  // Check admin access
  if (!profile?.isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-950">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white mb-2">Access Denied</h1>
          <p className="text-gray-400">
            You don't have permission to access this page.
          </p>
        </div>
      </div>
    );
  }

  const handleProcessQueue = async () => {
    setIsProcessing(true);
    try {
      const result = await startProcessor({ batchSize: 5 });
      setMessage({
        text: `Processed ${result.processed}: ${result.succeeded} succeeded, ${result.failed} failed`,
        type: result.failed > 0 ? "error" : "success",
      });
    } catch (error) {
      setMessage({ text: `Error: ${error}`, type: "error" });
    }
    setIsProcessing(false);
  };

  const handleAddUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUrl.trim()) return;

    setIsAddingUrl(true);
    try {
      let url = newUrl.trim();
      if (!url.startsWith("http://") && !url.startsWith("https://")) {
        url = "https://" + url;
      }
      const result = await addToQueue({ url, source: "manual", priority: 5 });
      setMessage({
        text: result.alreadyExists ? `Already exists: ${url}` : `Added: ${url}`,
        type: result.alreadyExists ? "error" : "success",
      });
      setNewUrl("");
    } catch (error) {
      setMessage({ text: `Error: ${error}`, type: "error" });
    }
    setIsAddingUrl(false);
  };

  const handleScrapeJobs = async (org: Organization) => {
    setScrapingOrg(org._id);
    try {
      const result = await scrapeJobs({ organizationId: org._id });
      if (result.success) {
        setMessage({
          text: `${org.name}: Found ${result.jobsFound} jobs, ${result.jobsCreated} new`,
          type: "success",
        });
      } else {
        setMessage({
          text: `${org.name}: ${result.error || "Failed to scrape"}${result.botProtectionDetected ? " (bot protection detected)" : ""}`,
          type: "error",
        });
      }
    } catch (error) {
      setMessage({
        text: `Error scraping ${org.name}: ${error}`,
        type: "error",
      });
    }
    setScrapingOrg(null);
  };

  const pendingCount = queueStatus?.pending ?? 0;
  const totalOrgs = stats?.total ?? 0;

  return (
    <div className="min-h-screen bg-gray-950 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-white">Organizations</h1>
            <p className="text-gray-500 text-sm">{totalOrgs} total</p>
          </div>
          <div className="flex items-center gap-3">
            {/* Add URL */}
            <form onSubmit={handleAddUrl} className="flex gap-2">
              <input
                type="text"
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                placeholder="Add URL..."
                className="w-48 px-3 py-1.5 bg-gray-900 border border-gray-800 rounded text-white text-sm placeholder-gray-600 focus:outline-none focus:border-gray-700"
              />
              <button
                type="submit"
                disabled={isAddingUrl || !newUrl.trim()}
                className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-white text-sm rounded"
              >
                Add
              </button>
            </form>
            {/* Process Queue */}
            {pendingCount > 0 && (
              <button
                onClick={handleProcessQueue}
                disabled={isProcessing}
                className="px-4 py-1.5 bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white text-sm font-medium rounded"
              >
                {isProcessing ? "Processing..." : `Process ${pendingCount}`}
              </button>
            )}
          </div>
        </div>

        {/* Message */}
        {message && (
          <div
            className={`mb-4 px-4 py-2 rounded text-sm ${
              message.type === "success"
                ? "bg-green-900/30 text-green-400 border border-green-800"
                : "bg-red-900/30 text-red-400 border border-red-800"
            }`}
          >
            {message.text}
            <button
              onClick={() => setMessage(null)}
              className="float-right opacity-60 hover:opacity-100"
            >
              ×
            </button>
          </div>
        )}

        {/* Table */}
        <div className="bg-gray-900 rounded-lg border border-gray-800 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Organization
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Location
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                  Jobs
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Last Scraped
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {orgs?.organizations?.map((org: Organization) => (
                <tr key={org._id} className="hover:bg-gray-800/30">
                  {/* Organization */}
                  <td className="px-4 py-3">
                    <div className="flex flex-col">
                      <span className="text-white font-medium">{org.name}</span>
                      {org.website && (
                        <a
                          href={org.website}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-gray-500 text-sm hover:text-gray-400"
                        >
                          {
                            org.website
                              .replace(/^https?:\/\/(www\.)?/, "")
                              .split("/")[0]
                          }
                        </a>
                      )}
                    </div>
                  </td>
                  {/* Location */}
                  <td className="px-4 py-3">
                    <span className="text-gray-400 text-sm">
                      {[org.city, org.state].filter(Boolean).join(", ") || "—"}
                    </span>
                  </td>
                  {/* Jobs */}
                  <td className="px-4 py-3 text-center">
                    {org.jobCount !== undefined && org.jobCount > 0 ? (
                      <span className="inline-flex items-center justify-center w-8 h-6 bg-green-900/30 text-green-400 text-sm font-medium rounded">
                        {org.jobCount}
                      </span>
                    ) : org.hasCareerPage ? (
                      <span className="text-gray-600 text-sm">0</span>
                    ) : (
                      <span className="text-gray-700 text-sm">—</span>
                    )}
                  </td>
                  {/* Last Scraped */}
                  <td className="px-4 py-3">
                    <span className="text-gray-500 text-sm">
                      {org.lastJobsCrawledAt
                        ? formatRelativeTime(org.lastJobsCrawledAt)
                        : "Never"}
                    </span>
                  </td>
                  {/* Actions */}
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {org.careerPageUrl && (
                        <a
                          href={org.careerPageUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-2 py-1 text-xs text-gray-400 hover:text-white"
                          title="View careers page"
                        >
                          View
                        </a>
                      )}
                      <button
                        onClick={() => handleScrapeJobs(org)}
                        disabled={scrapingOrg === org._id}
                        className="px-3 py-1 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-white text-xs rounded"
                      >
                        {scrapingOrg === org._id ? "..." : "Scrape"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {(!orgs?.organizations || orgs.organizations.length === 0) && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-8 text-center text-gray-500"
                  >
                    No organizations yet. Add a URL to get started.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Footer stats */}
        <div className="mt-4 flex items-center justify-between text-xs text-gray-600">
          <span>
            {orgs?.organizations?.length ?? 0} shown
            {orgs?.hasMore && " (more available)"}
          </span>
          <span>
            Queue: {pendingCount} pending, {queueStatus?.processing ?? 0}{" "}
            processing
          </span>
        </div>
      </div>
    </div>
  );
}

function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}
