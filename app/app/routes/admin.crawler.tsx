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

// Tooltip component
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
  streetAddress?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  description?: string;
  contactFormUrl?: string;
  careerPageUrl?: string;
  hasCareerPage?: boolean;
  lastJobsCrawledAt?: number;
  jobCount?: number;
  faithSignals?: string[];
  personaTags?: string[];
};

// Segment display names and descriptions
const SEGMENTS = {
  hot: {
    label: "Hot",
    desc: "Ready to contact",
    color: "text-red-400",
    bg: "bg-red-500/20",
  },
  warm: {
    label: "Warm",
    desc: "Good fit, nurture",
    color: "text-orange-400",
    bg: "bg-orange-500/20",
  },
  nurture: {
    label: "Nurture",
    desc: "Potential, needs outreach",
    color: "text-yellow-400",
    bg: "bg-yellow-500/20",
  },
  research: {
    label: "Review",
    desc: "Needs manual review",
    color: "text-blue-400",
    bg: "bg-blue-500/20",
  },
  low: {
    label: "Low Priority",
    desc: "Poor fit",
    color: "text-gray-400",
    bg: "bg-gray-500/20",
  },
};

export default function CrawlerAdmin() {
  const profile = useQuery(api.profiles.getMyProfile);
  const stats = useQuery(api.crawler.getStats);
  const queueStatus = useQuery(api.crawler.getQueueStatus);
  const orgs = useQuery(api.crawler.listOrganizations, { limit: 50 });

  const seedTestUrls = useAction(api.crawler.seedTestUrls);
  const startProcessor = useAction(api.crawler.startQueueProcessor);
  const addToQueue = useMutation(api.crawler.addToQueue);
  const scrapeJobs = useAction(api.jobScraper.scrapeJobsForOrganization);

  const [isSeeding, setIsSeeding] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [scrapingOrg, setScrapingOrg] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<string | null>(null);
  const [newUrl, setNewUrl] = useState("");
  const [isAddingUrl, setIsAddingUrl] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
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
        header: "Status",
        cell: ({ row }) => <SegmentBadge segment={row.original.segment} />,
        size: 120,
      },
      {
        accessorKey: "totalScore",
        header: "Score",
        cell: ({ row }) => (
          <span className="font-mono text-gray-300">
            {row.original.totalScore}
          </span>
        ),
        size: 70,
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
              {
                row.original.website
                  .replace(/^https?:\/\/(www\.)?/, "")
                  .split("/")[0]
              }
            </a>
          ) : null,
      },
      {
        id: "contact",
        header: "Contact",
        cell: ({ row }) => <ContactCell org={row.original} />,
        size: 150,
      },
      {
        id: "jobs",
        header: "Jobs",
        cell: ({ row }) => {
          const org = row.original;
          if (org.jobCount !== undefined && org.jobCount > 0) {
            return (
              <span className="inline-flex items-center justify-center px-2 py-0.5 bg-green-900/30 text-green-400 text-xs font-medium rounded">
                {org.jobCount}
              </span>
            );
          }
          if (org.hasCareerPage) {
            return <span className="text-gray-600 text-xs">0</span>;
          }
          return <span className="text-gray-700 text-xs">—</span>;
        },
        size: 60,
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <button
            onClick={() => handleScrapeJobs(row.original)}
            disabled={scrapingOrg === row.original._id}
            className="px-2 py-1 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-white text-xs rounded"
          >
            {scrapingOrg === row.original._id ? "..." : "Scrape"}
          </button>
        ),
        size: 70,
      },
    ],
    [expandedRows, scrapingOrg],
  );

  const handleScrapeJobs = async (org: Organization) => {
    setScrapingOrg(org._id);
    try {
      const result = await scrapeJobs({
        organizationId: org._id as Parameters<
          typeof scrapeJobs
        >[0]["organizationId"],
      });
      if (result.success) {
        setLastResult(
          `${org.name}: Found ${result.jobsFound} jobs, ${result.jobsCreated} new`,
        );
      } else {
        setLastResult(
          `${org.name}: ${result.error || "Failed"}${result.botProtectionDetected ? " (bot protection)" : ""}`,
        );
      }
    } catch (error) {
      setLastResult(`Error scraping ${org.name}: ${error}`);
    }
    setScrapingOrg(null);
  };

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
      setShowAddForm(false);
    } catch (error) {
      setLastResult(`Error adding URL: ${error}`);
    }
    setIsAddingUrl(false);
  };

  const pendingCount = queueStatus?.pending ?? 0;
  const processingCount = queueStatus?.processing ?? 0;
  const completedCount = queueStatus?.completed ?? 0;
  const failedCount = queueStatus?.failed ?? 0;

  return (
    <div className="min-h-screen bg-gray-950 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-white mb-1">Lead Crawler</h1>
          <p className="text-gray-500 text-sm">
            Find and classify faith-aligned organizations
          </p>
        </div>

        {/* Queue Status Bar */}
        <div className="bg-gray-900 rounded-xl p-4 border border-gray-800 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6">
              {/* Queue flow: Pending → Processing → Completed / Failed */}
              <div className="flex items-center gap-2">
                <span className="text-yellow-400 font-bold text-xl">
                  {pendingCount}
                </span>
                <span className="text-gray-400 text-sm">pending</span>
              </div>
              <svg
                className="w-4 h-4 text-gray-600"
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
              <div className="flex items-center gap-2">
                <span className="text-blue-400 font-bold text-xl">
                  {processingCount}
                </span>
                <span className="text-gray-400 text-sm">processing</span>
              </div>
              <svg
                className="w-4 h-4 text-gray-600"
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
              <div className="flex items-center gap-2">
                <span className="text-green-400 font-bold text-xl">
                  {completedCount}
                </span>
                <span className="text-gray-400 text-sm">done</span>
              </div>
              {failedCount > 0 && (
                <>
                  <span className="text-gray-600">|</span>
                  <div className="flex items-center gap-2">
                    <span className="text-red-400 font-bold text-xl">
                      {failedCount}
                    </span>
                    <span className="text-gray-400 text-sm">failed</span>
                  </div>
                </>
              )}
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowAddForm(!showAddForm)}
                className="px-3 py-1.5 text-sm bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg transition-colors"
              >
                + Add URL
              </button>
              <button
                onClick={handleProcessQueue}
                disabled={isProcessing || pendingCount === 0}
                className="px-4 py-1.5 text-sm bg-green-600 hover:bg-green-500 disabled:bg-gray-700 disabled:text-gray-500 text-white font-medium rounded-lg transition-colors"
              >
                {isProcessing ? "Processing..." : `Process (${pendingCount})`}
              </button>
            </div>
          </div>

          {/* Collapsible Add URL Form */}
          {showAddForm && (
            <form
              onSubmit={handleAddUrl}
              className="mt-4 pt-4 border-t border-gray-800"
            >
              <div className="flex gap-3">
                <input
                  type="text"
                  value={newUrl}
                  onChange={(e) => setNewUrl(e.target.value)}
                  placeholder="Enter website URL (e.g., example.org)"
                  className="flex-1 px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                  autoFocus
                />
                <button
                  type="submit"
                  disabled={isAddingUrl || !newUrl.trim()}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 text-white font-medium rounded-lg transition-colors"
                >
                  {isAddingUrl ? "Adding..." : "Add"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="px-3 py-2 text-gray-400 hover:text-white"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Last Result Message */}
        {lastResult && (
          <div className="mb-4 p-3 bg-gray-800/50 rounded-lg border border-gray-700 flex items-center justify-between">
            <p className="text-gray-300 text-sm">{lastResult}</p>
            <button
              onClick={() => setLastResult(null)}
              className="text-gray-500 hover:text-gray-300"
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
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        )}

        {/* Segment Summary */}
        <div className="flex flex-wrap gap-3 mb-6">
          {Object.entries(SEGMENTS).map(([key, seg]) => {
            const count = stats?.bySegment?.[key] ?? 0;
            return (
              <Tooltip key={key} content={seg.desc}>
                <div
                  className={`px-3 py-2 rounded-lg ${seg.bg} flex items-center gap-2`}
                >
                  <span className={`font-bold ${seg.color}`}>{count}</span>
                  <span className={`text-sm ${seg.color}`}>{seg.label}</span>
                </div>
              </Tooltip>
            );
          })}
          <div className="px-3 py-2 rounded-lg bg-gray-800 flex items-center gap-2 ml-auto">
            <span className="font-bold text-white">{stats?.total ?? 0}</span>
            <span className="text-sm text-gray-400">total</span>
          </div>
        </div>

        {/* Organizations DataTable */}
        <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">Organizations</h2>
            <input
              type="text"
              value={globalFilter}
              onChange={(e) => setGlobalFilter(e.target.value)}
              placeholder="Search..."
              className="px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 text-sm focus:outline-none focus:border-blue-500 w-48"
            />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-800/50">
                {table.getHeaderGroups().map((headerGroup) => (
                  <tr key={headerGroup.id}>
                    {headerGroup.headers.map((header) => (
                      <th
                        key={header.id}
                        className="px-4 py-2 text-left text-xs font-medium text-gray-400 uppercase tracking-wider"
                        style={{ width: header.getSize() }}
                      >
                        {header.isPlaceholder ? null : (
                          <div
                            className={
                              header.column.getCanSort()
                                ? "cursor-pointer select-none flex items-center gap-1 hover:text-gray-200"
                                : ""
                            }
                            onClick={header.column.getToggleSortingHandler()}
                          >
                            {flexRender(
                              header.column.columnDef.header,
                              header.getContext(),
                            )}
                            {{
                              asc: " ↑",
                              desc: " ↓",
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
                    <tr key={row.id} className="hover:bg-gray-800/30">
                      {row.getVisibleCells().map((cell) => (
                        <td key={cell.id} className="px-4 py-2.5">
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext(),
                          )}
                        </td>
                      ))}
                    </tr>
                    {expandedRows.has(row.original._id) && (
                      <tr key={`${row.id}-expanded`}>
                        <td colSpan={columns.length} className="bg-gray-800/30">
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
                      No organizations yet. Add a URL and click Process to get
                      started.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2 border-t border-gray-800 text-xs text-gray-500">
            {table.getRowModel().rows.length} of{" "}
            {orgs?.organizations?.length ?? 0} organizations
          </div>
        </div>

        {/* Dev tools - hidden in corner */}
        <div className="mt-8 flex justify-end">
          <button
            onClick={handleSeedUrls}
            disabled={isSeeding}
            className="text-xs text-gray-600 hover:text-gray-400"
          >
            {isSeeding ? "Seeding..." : "Seed test data"}
          </button>
        </div>
      </div>
    </div>
  );
}

// Contact cell with actual clickable links
function ContactCell({ org }: { org: Organization }) {
  const validEmail =
    org.email && !org.email.includes("protected") && org.email.includes("@")
      ? org.email
      : null;

  const validPhone = org.phone ? org.phone.replace(/[^\d+]/g, "") : null;
  const validContactForm =
    org.contactFormUrl && org.contactFormUrl.startsWith("http")
      ? org.contactFormUrl
      : null;

  if (!validEmail && !validPhone && !validContactForm) {
    return <span className="text-gray-600 text-sm">—</span>;
  }

  return (
    <div className="flex items-center gap-3 text-sm">
      {validEmail && (
        <a
          href={`mailto:${validEmail}`}
          className="text-green-400 hover:text-green-300 hover:underline"
          title={`Email: ${validEmail}`}
        >
          {validEmail.length > 20
            ? validEmail.substring(0, 20) + "..."
            : validEmail}
        </a>
      )}
      {validPhone && (
        <a
          href={`tel:${validPhone}`}
          className="text-yellow-400 hover:text-yellow-300 hover:underline"
          title={`Call: ${org.phone}`}
        >
          {org.phone}
        </a>
      )}
      {validContactForm && !validEmail && !validPhone && (
        <a
          href={validContactForm}
          target="_blank"
          rel="noopener noreferrer"
          className="text-purple-400 hover:text-purple-300 hover:underline"
        >
          Contact form
        </a>
      )}
    </div>
  );
}

function ExpandedOrgDetails({ org }: { org: Organization }) {
  const validEmail =
    org.email && !org.email.includes("protected") && org.email.includes("@")
      ? org.email
      : null;
  const validPhone = org.phone ? org.phone.replace(/[^\d+]/g, "") : null;

  return (
    <div className="px-6 py-4 space-y-3">
      {/* Jobs Info */}
      {(org.jobCount !== undefined || org.lastJobsCrawledAt) && (
        <div className="text-sm text-gray-400">
          <span className="text-gray-500">Jobs:</span>{" "}
          {org.jobCount !== undefined && org.jobCount > 0 ? (
            <span className="text-green-400">{org.jobCount} active</span>
          ) : (
            <span>None found</span>
          )}
          {org.lastJobsCrawledAt && (
            <span className="ml-2 text-gray-500">
              (scraped {formatRelativeTime(org.lastJobsCrawledAt)})
            </span>
          )}
        </div>
      )}

      {/* Location */}
      {(org.streetAddress || org.city || org.state || org.zipCode) && (
        <div className="text-sm text-gray-400">
          <span className="text-gray-500">Location:</span>{" "}
          {org.streetAddress && <span>{org.streetAddress}, </span>}
          {[org.city, org.state].filter(Boolean).join(", ")}
          {org.zipCode && <span> {org.zipCode}</span>}
        </div>
      )}

      {/* Full Contact Details */}
      <div className="flex flex-wrap gap-4 text-sm">
        {validEmail && (
          <a
            href={`mailto:${validEmail}`}
            className="text-green-400 hover:text-green-300 hover:underline"
          >
            {validEmail}
          </a>
        )}
        {validPhone && (
          <a
            href={`tel:${validPhone}`}
            className="text-yellow-400 hover:text-yellow-300 hover:underline"
          >
            {org.phone}
          </a>
        )}
        {org.website && (
          <a
            href={org.website}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400 hover:text-blue-300 hover:underline"
          >
            {org.website}
          </a>
        )}
        {org.careerPageUrl && (
          <a
            href={org.careerPageUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-orange-400 hover:text-orange-300 hover:underline"
          >
            Careers page
          </a>
        )}
        {org.contactFormUrl && org.contactFormUrl.startsWith("http") && (
          <a
            href={org.contactFormUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-purple-400 hover:text-purple-300 hover:underline"
          >
            Contact form
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

function SegmentBadge({ segment }: { segment: string }) {
  const seg = SEGMENTS[segment as keyof typeof SEGMENTS] || SEGMENTS.low;

  return (
    <span
      className={`px-2 py-1 rounded-full text-xs font-medium ${seg.bg} ${seg.color}`}
    >
      {seg.label}
    </span>
  );
}

function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}
