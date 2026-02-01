import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useState } from "react";
import type { MetaFunction } from "react-router";

export const meta: MetaFunction = () => {
  return [{ title: "Crawler Admin | Wonderwall" }];
};

export default function CrawlerAdmin() {
  const profile = useQuery(api.profiles.getMyProfile);
  const stats = useQuery(api.crawler.getStats);
  const queueStatus = useQuery(api.crawler.getQueueStatus);
  const orgs = useQuery(api.crawler.listOrganizations, { limit: 20 });

  const seedTestUrls = useAction(api.crawler.seedTestUrls);
  const startProcessor = useAction(api.crawler.startQueueProcessor);

  const [isSeeding, setIsSeeding] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastResult, setLastResult] = useState<string | null>(null);

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

  const handleSeedUrls = async () => {
    setIsSeeding(true);
    try {
      const result = await seedTestUrls();
      setLastResult(result.message);
    } catch (error) {
      setLastResult(`Error: ${error}`);
    }
    setIsSeeding(false);
  };

  const handleProcessQueue = async () => {
    setIsProcessing(true);
    try {
      const result = await startProcessor({ batchSize: 5 });
      setLastResult(
        `Processed ${result.processed} URLs: ${result.succeeded} succeeded, ${result.failed} failed`,
      );
    } catch (error) {
      setLastResult(`Error: ${error}`);
    }
    setIsProcessing(false);
  };

  return (
    <div className="min-h-screen bg-gray-950 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">
            Crawler Dashboard
          </h1>
          <p className="text-gray-400">
            Manage lead generation crawler and view results
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-4 mb-8">
          <button
            onClick={handleSeedUrls}
            disabled={isSeeding}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 text-white font-medium rounded-lg transition-colors"
          >
            {isSeeding ? "Seeding..." : "Seed Test URLs"}
          </button>
          <button
            onClick={handleProcessQueue}
            disabled={isProcessing || (queueStatus?.pending ?? 0) === 0}
            className="px-4 py-2 bg-green-600 hover:bg-green-500 disabled:bg-green-800 text-white font-medium rounded-lg transition-colors"
          >
            {isProcessing ? "Processing..." : "Process Queue"}
          </button>
        </div>

        {/* Last Result */}
        {lastResult && (
          <div className="mb-8 p-4 bg-gray-800 rounded-lg border border-gray-700">
            <p className="text-gray-300">{lastResult}</p>
          </div>
        )}

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <StatCard
            label="Total Organizations"
            value={stats?.total ?? 0}
            color="blue"
          />
          <StatCard
            label="Hot Leads"
            value={stats?.hotLeads ?? 0}
            color="red"
          />
          <StatCard
            label="Warm Leads"
            value={stats?.warmLeads ?? 0}
            color="orange"
          />
          <StatCard
            label="Avg Score"
            value={Math.round(stats?.avgScore ?? 0)}
            color="purple"
          />
        </div>

        {/* Queue Status */}
        <div className="grid md:grid-cols-2 gap-6 mb-8">
          <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
            <h2 className="text-xl font-bold text-white mb-4">Queue Status</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-2xl font-bold text-yellow-400">
                  {queueStatus?.pending ?? 0}
                </div>
                <div className="text-sm text-gray-400">Pending</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-blue-400">
                  {queueStatus?.processing ?? 0}
                </div>
                <div className="text-sm text-gray-400">Processing</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-green-400">
                  {queueStatus?.completed ?? 0}
                </div>
                <div className="text-sm text-gray-400">Completed</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-red-400">
                  {queueStatus?.failed ?? 0}
                </div>
                <div className="text-sm text-gray-400">Failed</div>
              </div>
            </div>
          </div>

          <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
            <h2 className="text-xl font-bold text-white mb-4">By Segment</h2>
            <div className="space-y-2">
              {["hot", "warm", "nurture", "research", "low"].map((segment) => (
                <div
                  key={segment}
                  className="flex justify-between items-center"
                >
                  <span className="text-gray-300 capitalize">{segment}</span>
                  <span
                    className={`font-bold ${
                      segment === "hot"
                        ? "text-red-400"
                        : segment === "warm"
                          ? "text-orange-400"
                          : segment === "nurture"
                            ? "text-yellow-400"
                            : "text-gray-400"
                    }`}
                  >
                    {stats?.bySegment?.[segment] ?? 0}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Organizations Table */}
        <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-800">
            <h2 className="text-xl font-bold text-white">
              Recent Organizations
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-800">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-300">
                    Name
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-300">
                    Website
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-300">
                    Segment
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-300">
                    Score
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-300">
                    Industry
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-300">
                    Location
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {orgs?.organizations?.map((org) => (
                  <tr key={org._id} className="hover:bg-gray-800/50">
                    <td className="px-4 py-3 text-white font-medium">
                      {org.name}
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-sm">
                      <a
                        href={org.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:text-blue-400"
                      >
                        {org.website?.replace(/^https?:\/\/(www\.)?/, "")}
                      </a>
                    </td>
                    <td className="px-4 py-3">
                      <SegmentBadge segment={org.segment} />
                    </td>
                    <td className="px-4 py-3 text-white font-mono">
                      {org.totalScore}
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-sm">
                      {org.industry}
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-sm">
                      {[org.city, org.state].filter(Boolean).join(", ") || "—"}
                    </td>
                  </tr>
                ))}
                {(!orgs?.organizations || orgs.organizations.length === 0) && (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-4 py-8 text-center text-gray-500"
                    >
                      No organizations yet. Click "Seed Test URLs" then "Process
                      Queue" to get started.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: "blue" | "red" | "orange" | "purple" | "green";
}) {
  const colorClasses = {
    blue: "text-blue-400",
    red: "text-red-400",
    orange: "text-orange-400",
    purple: "text-purple-400",
    green: "text-green-400",
  };

  return (
    <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
      <div className={`text-3xl font-bold ${colorClasses[color]}`}>{value}</div>
      <div className="text-sm text-gray-400">{label}</div>
    </div>
  );
}

function SegmentBadge({ segment }: { segment: string }) {
  const colors: Record<string, string> = {
    hot: "bg-red-500/20 text-red-400",
    warm: "bg-orange-500/20 text-orange-400",
    nurture: "bg-yellow-500/20 text-yellow-400",
    research: "bg-blue-500/20 text-blue-400",
    low: "bg-gray-500/20 text-gray-400",
  };

  return (
    <span
      className={`px-2 py-1 rounded-full text-xs font-medium ${colors[segment] || colors.low}`}
    >
      {segment}
    </span>
  );
}
