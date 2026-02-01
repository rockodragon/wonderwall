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

        {/* Organizations List */}
        <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-800">
            <h2 className="text-xl font-bold text-white">
              Recent Organizations
            </h2>
          </div>
          <div className="divide-y divide-gray-800">
            {orgs?.organizations?.map((org) => (
              <OrgRow key={org._id} org={org} />
            ))}
            {(!orgs?.organizations || orgs.organizations.length === 0) && (
              <div className="px-4 py-8 text-center text-gray-500">
                No organizations yet. Click "Seed Test URLs" then "Process
                Queue" to get started.
              </div>
            )}
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

function OrgRow({
  org,
}: {
  org: {
    _id: string;
    name: string;
    website?: string;
    segment: string;
    totalScore: number;
    industry?: string;
    email?: string;
    phone?: string;
    city?: string;
    state?: string;
    description?: string;
    contactFormUrl?: string;
    careerPageUrl?: string;
    faithSignals?: string[];
    personaTags?: string[];
  };
}) {
  const [isOpen, setIsOpen] = useState(false);

  // Filter out invalid emails (like "email protected" artifacts)
  const validEmail =
    org.email && !org.email.includes("protected") && org.email.includes("@")
      ? org.email
      : null;

  return (
    <div className="hover:bg-gray-800/30">
      {/* Summary Row - Always visible */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-4 py-3 flex items-center gap-4 text-left"
      >
        <svg
          className={`w-4 h-4 text-gray-500 transition-transform ${isOpen ? "rotate-90" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 5l7 7-7 7"
          />
        </svg>
        <span className="flex-1 text-white font-medium truncate">
          {org.name}
        </span>
        <SegmentBadge segment={org.segment} />
        <span className="w-12 text-right font-mono text-gray-400">
          {org.totalScore}
        </span>
        <a
          href={org.website}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="text-blue-400 hover:text-blue-300 text-sm truncate max-w-[200px]"
        >
          {org.website?.replace(/^https?:\/\/(www\.)?/, "")}
        </a>
      </button>

      {/* Expanded Details */}
      {isOpen && (
        <div className="px-4 pb-4 pl-12 space-y-3">
          {/* Industry & Location */}
          <div className="flex gap-4 text-sm text-gray-400">
            {org.industry && <span>{org.industry}</span>}
            {(org.city || org.state) && (
              <span>{[org.city, org.state].filter(Boolean).join(", ")}</span>
            )}
          </div>

          {/* Contact Info */}
          <div className="flex flex-wrap gap-4 text-sm">
            {validEmail && (
              <a
                href={`mailto:${validEmail}`}
                className="text-green-400 hover:text-green-300"
              >
                {validEmail}
              </a>
            )}
            {org.phone && (
              <a
                href={`tel:${org.phone}`}
                className="text-yellow-400 hover:text-yellow-300"
              >
                {org.phone}
              </a>
            )}
            {org.contactFormUrl && (
              <a
                href={org.contactFormUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-purple-400 hover:text-purple-300"
              >
                Contact Form
              </a>
            )}
            {org.careerPageUrl && (
              <a
                href={org.careerPageUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-orange-400 hover:text-orange-300"
              >
                Careers Page
              </a>
            )}
          </div>

          {/* Description */}
          {org.description && (
            <p className="text-sm text-gray-400">{org.description}</p>
          )}

          {/* Tags */}
          {(org.faithSignals?.length || org.personaTags?.length) && (
            <div className="flex flex-wrap gap-2">
              {org.faithSignals?.slice(0, 4).map((signal, i) => (
                <span
                  key={i}
                  className="px-2 py-0.5 bg-blue-500/10 text-blue-400 text-xs rounded"
                >
                  {signal}
                </span>
              ))}
              {org.personaTags?.map((tag, i) => (
                <span
                  key={i}
                  className="px-2 py-0.5 bg-gray-700 text-gray-300 text-xs rounded"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
