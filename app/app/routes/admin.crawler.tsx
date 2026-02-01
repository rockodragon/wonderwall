import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useState, useMemo } from "react";
import type { MetaFunction } from "react-router";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";

export const meta: MetaFunction = () => {
  return [{ title: "Crawler Admin | Wonderwall" }];
};

// Tooltip/Popover component
function Tooltip({
  children,
  content,
}: {
  children: React.ReactNode;
  content: string;
}) {
  const [show, setShow] = useState(false);

  return (
    <div className="relative inline-block">
      <div
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        className="cursor-help"
      >
        {children}
      </div>
      {show && (
        <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 text-sm text-white bg-gray-800 rounded-lg shadow-lg max-w-xs whitespace-normal">
          {content}
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-800" />
        </div>
      )}
    </div>
  );
}

function InfoIcon() {
  return (
    <svg
      className="w-4 h-4 text-gray-500 inline-block ml-1"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  );
}

type Organization = {
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

export default function CrawlerAdmin() {
  const profile = useQuery(api.profiles.getMyProfile);
  const stats = useQuery(api.crawler.getStats);
  const queueStatus = useQuery(api.crawler.getQueueStatus);
  const orgs = useQuery(api.crawler.listOrganizations, { limit: 50 });

  const seedTestUrls = useAction(api.crawler.seedTestUrls);
  const startProcessor = useAction(api.crawler.startQueueProcessor);
  const addToQueue = useMutation(api.crawler.addToQueue);

  const [isSeeding, setIsSeeding] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastResult, setLastResult] = useState<string | null>(null);
  const [newUrl, setNewUrl] = useState("");
  const [isAddingUrl, setIsAddingUrl] = useState(false);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const toggleRow = (id: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const columns = useMemo<ColumnDef<Organization>[]>(
    () => [
      {
        id: "expander",
        header: "",
        cell: ({ row }) => (
          <button
            onClick={() => toggleRow(row.original._id)}
            className="p-1 hover:bg-gray-700 rounded"
          >
            <svg
              className={`w-4 h-4 text-gray-500 transition-transform ${expandedRows.has(row.original._id) ? "rotate-90" : ""}`}
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
          </button>
        ),
        size: 40,
      },
      {
        accessorKey: "name",
        header: "Organization",
        cell: ({ row }) => (
          <span className="text-white font-medium">{row.original.name}</span>
        ),
      },
      {
        accessorKey: "segment",
        header: () => (
          <Tooltip content="Hot (80+): Ready to contact. Warm (60-79): Good fit, needs nurture. Nurture (40-59): Potential, needs more info. Research (20-39): Needs investigation. Low (<20): Poor fit.">
            <span>
              Segment
              <InfoIcon />
            </span>
          </Tooltip>
        ),
        cell: ({ row }) => <SegmentBadge segment={row.original.segment} />,
        size: 100,
      },
      {
        accessorKey: "totalScore",
        header: () => (
          <Tooltip content="Combined score (0-100) based on: Values alignment (faith signals), Hiring activity (careers page, job posts), Quality indicators (size, web presence), Contact availability (email, phone).">
            <span>
              Score
              <InfoIcon />
            </span>
          </Tooltip>
        ),
        cell: ({ row }) => (
          <span className="font-mono text-gray-300">
            {row.original.totalScore}
          </span>
        ),
        size: 80,
      },
      {
        accessorKey: "industry",
        header: "Industry",
        cell: ({ row }) => (
          <span className="text-gray-400 text-sm">{row.original.industry}</span>
        ),
      },
      {
        accessorKey: "website",
        header: "Website",
        cell: ({ row }) =>
          row.original.website ? (
            <a
              href={row.original.website}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:text-blue-300 text-sm"
            >
              {row.original.website.replace(/^https?:\/\/(www\.)?/, "")}
            </a>
          ) : null,
      },
      {
        id: "contact",
        header: "Contact",
        cell: ({ row }) => {
          const org = row.original;
          const validEmail =
            org.email &&
            !org.email.includes("protected") &&
            org.email.includes("@")
              ? org.email
              : null;
          const hasContact = validEmail || org.phone || org.contactFormUrl;

          return hasContact ? (
            <div className="flex gap-2">
              {validEmail && (
                <Tooltip content={validEmail}>
                  <a
                    href={`mailto:${validEmail}`}
                    className="text-green-400 hover:text-green-300"
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                      />
                    </svg>
                  </a>
                </Tooltip>
              )}
              {org.phone && (
                <Tooltip content={org.phone}>
                  <a
                    href={`tel:${org.phone}`}
                    className="text-yellow-400 hover:text-yellow-300"
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
                      />
                    </svg>
                  </a>
                </Tooltip>
              )}
              {org.contactFormUrl && (
                <Tooltip content="Contact form available">
                  <a
                    href={org.contactFormUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-purple-400 hover:text-purple-300"
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                      />
                    </svg>
                  </a>
                </Tooltip>
              )}
            </div>
          ) : (
            <span className="text-gray-600">—</span>
          );
        },
        size: 100,
      },
    ],
    [expandedRows],
  );

  const table = useReactTable({
    data: orgs?.organizations ?? [],
    columns,
    state: {
      sorting,
      globalFilter,
    },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  // Check admin access - AFTER all hooks
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
      if (result.alreadyExists) {
        setLastResult(`URL already in queue: ${url}`);
      } else {
        setLastResult(`Added to queue: ${url}`);
      }
      setNewUrl("");
    } catch (error) {
      setLastResult(`Error adding URL: ${error}`);
    }
    setIsAddingUrl(false);
  };

  return (
    <div className="min-h-screen bg-gray-950 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">
            Crawler Dashboard
          </h1>
          <p className="text-gray-400">
            Manage lead generation crawler and view classified organizations
          </p>
        </div>

        {/* Add URL Form */}
        <div className="bg-gray-900 rounded-xl p-4 border border-gray-800 mb-6">
          <form onSubmit={handleAddUrl} className="flex gap-3">
            <div className="flex-1">
              <input
                type="text"
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                placeholder="Enter organization website URL (e.g., example.org)"
                className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
              />
            </div>
            <button
              type="submit"
              disabled={isAddingUrl || !newUrl.trim()}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
            >
              {isAddingUrl ? "Adding..." : "Add URL"}
            </button>
          </form>
          <p className="text-xs text-gray-500 mt-2">
            Add any organization website to analyze. The crawler will extract
            contact info, detect faith signals, and score the lead.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-4 mb-6">
          <Tooltip content="Add 10 pre-configured test URLs from Christian organizations, churches, and conservative businesses to demo the crawler.">
            <button
              onClick={handleSeedUrls}
              disabled={isSeeding}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 text-white font-medium rounded-lg transition-colors"
            >
              {isSeeding ? "Seeding..." : "Seed Test URLs"}
            </button>
          </Tooltip>
          <Tooltip content="Process pending URLs in the queue. Uses AI to analyze each website, extract contact info, detect faith/values signals, and assign a lead score.">
            <button
              onClick={handleProcessQueue}
              disabled={isProcessing || (queueStatus?.pending ?? 0) === 0}
              className="px-4 py-2 bg-green-600 hover:bg-green-500 disabled:bg-green-800 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
            >
              {isProcessing
                ? "Processing..."
                : `Process Queue (${queueStatus?.pending ?? 0})`}
            </button>
          </Tooltip>
        </div>

        {/* Last Result */}
        {lastResult && (
          <div className="mb-6 p-4 bg-gray-800 rounded-lg border border-gray-700">
            <p className="text-gray-300">{lastResult}</p>
          </div>
        )}

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <Tooltip content="Total number of organizations that have been analyzed and classified.">
            <StatCard
              label="Total Organizations"
              value={stats?.total ?? 0}
              color="blue"
            />
          </Tooltip>
          <Tooltip content="Score 80+. High values alignment, active hiring, quality contact info. Ready for outreach.">
            <StatCard
              label="Hot Leads"
              value={stats?.hotLeads ?? 0}
              color="red"
            />
          </Tooltip>
          <Tooltip content="Score 60-79. Good fit with some faith signals and hiring activity. Worth nurturing.">
            <StatCard
              label="Warm Leads"
              value={stats?.warmLeads ?? 0}
              color="orange"
            />
          </Tooltip>
          <Tooltip content="Average lead score across all organizations. Higher is better (max 100).">
            <StatCard
              label="Avg Score"
              value={Math.round(stats?.avgScore ?? 0)}
              color="purple"
            />
          </Tooltip>
        </div>

        {/* Queue Status & Segments */}
        <div className="grid md:grid-cols-2 gap-6 mb-6">
          <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
            <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
              Queue Status
              <Tooltip content="URLs waiting to be processed. Pending = in queue, Processing = currently analyzing, Completed = done, Failed = error (will retry).">
                <InfoIcon />
              </Tooltip>
            </h2>
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
            <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
              By Segment
              <Tooltip content="Organizations grouped by lead quality. Hot = best leads, Low = poor fit.">
                <InfoIcon />
              </Tooltip>
            </h2>
            <div className="space-y-2">
              {[
                { key: "hot", label: "Hot", desc: "80+ score" },
                { key: "warm", label: "Warm", desc: "60-79" },
                { key: "nurture", label: "Nurture", desc: "40-59" },
                { key: "research", label: "Research", desc: "20-39" },
                { key: "low", label: "Low", desc: "<20" },
              ].map((segment) => (
                <div
                  key={segment.key}
                  className="flex justify-between items-center"
                >
                  <span className="text-gray-300">
                    {segment.label}{" "}
                    <span className="text-gray-500 text-xs">
                      ({segment.desc})
                    </span>
                  </span>
                  <span
                    className={`font-bold ${
                      segment.key === "hot"
                        ? "text-red-400"
                        : segment.key === "warm"
                          ? "text-orange-400"
                          : segment.key === "nurture"
                            ? "text-yellow-400"
                            : "text-gray-400"
                    }`}
                  >
                    {stats?.bySegment?.[segment.key] ?? 0}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Organizations DataTable */}
        <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between">
            <h2 className="text-xl font-bold text-white">Organizations</h2>
            <input
              type="text"
              value={globalFilter}
              onChange={(e) => setGlobalFilter(e.target.value)}
              placeholder="Search..."
              className="px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 text-sm focus:outline-none focus:border-blue-500"
            />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-800">
                {table.getHeaderGroups().map((headerGroup) => (
                  <tr key={headerGroup.id}>
                    {headerGroup.headers.map((header) => (
                      <th
                        key={header.id}
                        className="px-4 py-3 text-left text-sm font-medium text-gray-300"
                        style={{
                          width: header.getSize(),
                        }}
                      >
                        {header.isPlaceholder ? null : (
                          <div
                            className={
                              header.column.getCanSort()
                                ? "cursor-pointer select-none flex items-center gap-1"
                                : ""
                            }
                            onClick={header.column.getToggleSortingHandler()}
                          >
                            {flexRender(
                              header.column.columnDef.header,
                              header.getContext(),
                            )}
                            {{
                              asc: " ^",
                              desc: " v",
                            }[header.column.getIsSorted() as string] ?? null}
                          </div>
                        )}
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody className="divide-y divide-gray-800">
                {table.getRowModel().rows.map((row) => (
                  <>
                    <tr key={row.id} className="hover:bg-gray-800/50">
                      {row.getVisibleCells().map((cell) => (
                        <td key={cell.id} className="px-4 py-3">
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext(),
                          )}
                        </td>
                      ))}
                    </tr>
                    {expandedRows.has(row.original._id) && (
                      <tr key={`${row.id}-expanded`}>
                        <td colSpan={columns.length} className="bg-gray-800/50">
                          <ExpandedOrgDetails org={row.original} />
                        </td>
                      </tr>
                    )}
                  </>
                ))}
                {table.getRowModel().rows.length === 0 && (
                  <tr>
                    <td
                      colSpan={columns.length}
                      className="px-4 py-8 text-center text-gray-500"
                    >
                      No organizations yet. Add a URL or click "Seed Test URLs"
                      then "Process Queue".
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-3 border-t border-gray-800 text-sm text-gray-400">
            Showing {table.getRowModel().rows.length} of{" "}
            {orgs?.organizations?.length ?? 0} organizations
          </div>
        </div>
      </div>
    </div>
  );
}

function ExpandedOrgDetails({ org }: { org: Organization }) {
  const validEmail =
    org.email && !org.email.includes("protected") && org.email.includes("@")
      ? org.email
      : null;

  return (
    <div className="px-6 py-4 space-y-3">
      {/* Location */}
      {(org.city || org.state) && (
        <div className="text-sm text-gray-400">
          Location: {[org.city, org.state].filter(Boolean).join(", ")}
        </div>
      )}

      {/* Contact Details */}
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
        <p className="text-sm text-gray-300">{org.description}</p>
      )}

      {/* Tags */}
      {org.faithSignals?.length || org.personaTags?.length ? (
        <div className="flex flex-wrap gap-2">
          {org.faithSignals?.map((signal, i) => (
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
      ) : null}
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
    <div className="bg-gray-900 rounded-xl p-4 border border-gray-800 cursor-help">
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
