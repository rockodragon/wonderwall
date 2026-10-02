import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Fragment, useState, useMemo } from "react";
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
import { admin } from "../components/admin/adminStyles";
import {
  AdminAccessDenied,
  AdminFrame,
  AdminHeader,
  AdminLoading,
  SortButton,
  ariaSortFor,
} from "../components/admin/AdminUi";

export const meta: MetaFunction = () => {
  return [{ title: "Crawler Admin | TheCreative.exchange" }];
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
        <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 text-[13.5px] text-[color:var(--app-text)] bg-[var(--app-surface)] border border-[color:var(--app-hairline-raised)] rounded-lg shadow-lg w-max max-w-xs whitespace-normal">
          {content}
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-[color:var(--app-hairline-raised)]" />
        </div>
      )}
    </div>
  );
}

function InfoIcon() {
  return (
    <svg
      className="w-4 h-4 text-[color:var(--app-text-muted)] inline-block ml-1"
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
    color: "text-red-300",
    bg: "bg-red-400/15",
  },
  warm: {
    label: "Warm",
    desc: "Good fit, nurture",
    color: "text-orange-300",
    bg: "bg-orange-400/15",
  },
  nurture: {
    label: "Nurture",
    desc: "Potential, needs outreach",
    color: "text-amber-300",
    bg: "bg-amber-400/15",
  },
  research: {
    label: "Review",
    desc: "Needs manual review",
    color: "text-sky-300",
    bg: "bg-sky-400/15",
  },
  low: {
    label: "Low Priority",
    desc: "Poor fit",
    color: "text-[color:var(--app-text-muted)]",
    bg: "bg-[var(--app-hairline)]",
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
  const retryFailed = useMutation(api.crawler.retryFailedItems);
  const failedItems = useQuery(api.crawler.getFailedQueueItems);
  const scrapeJobs = useAction(api.jobScraper.scrapeJobsForOrganization);

  const [isSeeding, setIsSeeding] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [scrapingOrg, setScrapingOrg] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<string | null>(null);
  const [newUrl, setNewUrl] = useState("");
  const [isAddingUrl, setIsAddingUrl] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showFailedItems, setShowFailedItems] = useState(false);
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
            aria-expanded={expandedRows.has(row.original._id)}
            aria-label={`Details for ${row.original.name}`}
            className={`rounded p-1 transition-colors hover:bg-[var(--app-hairline)] ${admin.focus}`}
          >
            <svg
              className={`w-4 h-4 text-[color:var(--app-text-muted)] transition-transform ${expandedRows.has(row.original._id) ? "rotate-90" : ""}`}
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
          <span className="font-medium text-[color:var(--app-text)]">{row.original.name}</span>
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
          <span className="font-mono text-[color:var(--garden-body)]">
            {row.original.totalScore}
          </span>
        ),
        size: 70,
      },
      {
        accessorKey: "industry",
        header: "Industry",
        cell: ({ row }) => (
          <span className="text-[color:var(--app-text-muted)]">{row.original.industry}</span>
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
              className={admin.link}
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
              <span className={admin.chip.green}>
                {org.jobCount}
              </span>
            );
          }
          if (org.hasCareerPage) {
            return <span className="text-[color:var(--app-text-muted)]">0</span>;
          }
          return <span className="text-[color:var(--app-text-muted)]">—</span>;
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
            className={admin.btnRowSecondary}
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
  if (profile === undefined) {
    return <AdminLoading>Checking access…</AdminLoading>;
  }

  if (!profile?.isAdmin) {
    return <AdminAccessDenied />;
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
      } else if (result.requeued) {
        setLastResult(`Requeued failed URL: ${url}`);
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

  const handleRetryFailed = async () => {
    setIsRetrying(true);
    try {
      const result = await retryFailed({});
      setLastResult(`Requeued ${result.retriedCount} failed items`);
      setShowFailedItems(false);
    } catch (error) {
      setLastResult(`Error retrying: ${error}`);
    }
    setIsRetrying(false);
  };

  const pendingCount = queueStatus?.pending ?? 0;
  const processingCount = queueStatus?.processing ?? 0;
  const completedCount = queueStatus?.completed ?? 0;
  const failedCount = queueStatus?.failed ?? 0;

  return (
    <AdminFrame>
      <AdminHeader
        back
        title="Lead Crawler"
        sub="Find and classify faith-aligned organizations"
      />

      {/* Queue Status Bar */}
      <div className={`${admin.card} mb-6 p-4`}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            {/* Queue flow: Pending → Processing → Completed / Failed */}
            <div className="flex items-center gap-2">
              <span className="text-xl font-bold text-amber-300">
                {pendingCount}
              </span>
              <span className={admin.meta}>pending</span>
            </div>
            <ChevronRight />
            <div className="flex items-center gap-2">
              <span className="text-xl font-bold text-sky-300">
                {processingCount}
              </span>
              <span className={admin.meta}>processing</span>
            </div>
            <ChevronRight />
            <div className="flex items-center gap-2">
              <span className="text-xl font-bold text-green-300">
                {completedCount}
              </span>
              <span className={admin.meta}>done</span>
            </div>
            {failedCount > 0 && (
              <>
                <span aria-hidden="true" className="text-[color:var(--app-text-dim)]">
                  |
                </span>
                <button
                  onClick={() => setShowFailedItems(!showFailedItems)}
                  aria-expanded={showFailedItems}
                  className={`flex items-center gap-2 rounded px-2 py-1 transition-colors hover:bg-[var(--app-hairline)] ${admin.focus}`}
                >
                  <span className="text-xl font-bold text-red-300">
                    {failedCount}
                  </span>
                  <span className={admin.meta}>failed</span>
                  <svg
                    className={`w-4 h-4 text-[color:var(--app-text-muted)] transition-transform ${showFailedItems ? "rotate-180" : ""}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                </button>
              </>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowAddForm(!showAddForm)}
              className={admin.btnSecondary}
            >
              + Add URL
            </button>
            <button
              onClick={handleProcessQueue}
              disabled={isProcessing || pendingCount === 0}
              className={admin.btnPrimary}
            >
              {isProcessing ? "Processing..." : `Process (${pendingCount})`}
            </button>
          </div>
        </div>

        {/* Collapsible Add URL Form */}
        {showAddForm && (
          <form onSubmit={handleAddUrl} className={`mt-4 pt-4 ${admin.ruleTop}`}>
            <div className="flex flex-wrap gap-3">
              <input
                type="text"
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                placeholder="Enter website URL (e.g., example.org)"
                aria-label="Website URL"
                className={`${admin.input} min-w-[220px] flex-1`}
                autoFocus
              />
              <button
                type="submit"
                disabled={isAddingUrl || !newUrl.trim()}
                className={admin.btnPrimary}
              >
                {isAddingUrl ? "Adding..." : "Add"}
              </button>
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className={admin.btnQuiet}
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {/* Collapsible Failed Items Panel */}
        {showFailedItems && failedItems && failedItems.length > 0 && (
          <div className={`mt-4 pt-4 ${admin.ruleTop}`}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className={admin.h3}>Failed Items</h3>
              <button
                onClick={handleRetryFailed}
                disabled={isRetrying}
                className={admin.btnRowSecondary}
              >
                {isRetrying
                  ? "Retrying..."
                  : `Retry All (${failedItems.length})`}
              </button>
            </div>
            <div className="max-h-48 space-y-2 overflow-y-auto">
              {failedItems.map((item) => (
                <div
                  key={item._id}
                  className={`${admin.inset} flex items-center justify-between p-2.5 text-[13.5px]`}
                >
                  <div className="min-w-0 flex-1">
                    <span className="block truncate text-[color:var(--app-text)]">
                      {
                        item.url
                          .replace(/^https?:\/\/(www\.)?/, "")
                          .split("/")[0]
                      }
                    </span>
                    {item.errorMessage && (
                      <span className="block truncate text-[12.5px] text-red-300">
                        {item.errorMessage}
                      </span>
                    )}
                  </div>
                  <span className={`ml-2 ${admin.hint}`}>
                    {item.retryCount} retries
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Last Result Message */}
      {lastResult && (
        <div
          role="status"
          className={`${admin.notice.info} mb-4 flex items-center justify-between gap-3`}
        >
          <p>{lastResult}</p>
          <button
            onClick={() => setLastResult(null)}
            aria-label="Dismiss message"
            className={`rounded text-[color:var(--app-text-muted)] transition-colors hover:text-[color:var(--app-text)] ${admin.focus}`}
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
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
      <div className="mb-6 flex flex-wrap gap-3">
        {Object.entries(SEGMENTS).map(([key, seg]) => {
          const count = stats?.bySegment?.[key] ?? 0;
          return (
            <Tooltip key={key} content={seg.desc}>
              <div
                className={`flex items-center gap-2 rounded-lg px-3 py-2 ${seg.bg}`}
              >
                <span className={`font-bold ${seg.color}`}>{count}</span>
                <span className={`text-[13.5px] ${seg.color}`}>{seg.label}</span>
              </div>
            </Tooltip>
          );
        })}
        <div className={`${admin.card} ml-auto flex items-center gap-2 px-3 py-2`}>
          <span className="font-bold text-[color:var(--app-text)]">
            {stats?.total ?? 0}
          </span>
          <span className={admin.meta}>total</span>
        </div>
      </div>

      {/* Organizations DataTable */}
      <div className={admin.tableWrap}>
        <div
          className={`${admin.ruleBottom} flex flex-wrap items-center justify-between gap-3 px-4 py-3`}
        >
          <h2 className={admin.h2}>Organizations</h2>
          <input
            type="search"
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            placeholder="Search..."
            aria-label="Search organizations"
            className={`${admin.input} sm:w-64`}
          />
        </div>
        <div className={admin.tableScroll}>
          <table className={`${admin.table} min-w-[900px]`}>
            <thead className={admin.thead}>
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map((header) => {
                    const canSort = header.column.getCanSort();
                    const sorted = header.column.getIsSorted();
                    return (
                      <th
                        key={header.id}
                        scope="col"
                        className={admin.th}
                        style={{ width: header.getSize() }}
                        aria-sort={canSort ? ariaSortFor(sorted) : undefined}
                      >
                        {header.isPlaceholder ? null : canSort ? (
                          <SortButton
                            label={String(header.column.columnDef.header)}
                            sorted={sorted}
                            onClick={header.column.getToggleSortingHandler()}
                          />
                        ) : (
                          flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )
                        )}
                      </th>
                    );
                  })}
                </tr>
              ))}
            </thead>
            <tbody className={admin.tbody}>
              {table.getRowModel().rows.map((row) => (
                <Fragment key={row.id}>
                  <tr className={admin.tr}>
                    {row.getVisibleCells().map((cell) => (
                      <td
                        key={cell.id}
                        className="px-4 py-2.5 align-middle text-[14px] text-[color:var(--app-text)]"
                      >
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext(),
                        )}
                      </td>
                    ))}
                  </tr>
                  {expandedRows.has(row.original._id) && (
                    <tr>
                      <td
                        colSpan={columns.length}
                        className="bg-[var(--app-surface)]"
                      >
                        <ExpandedOrgDetails org={row.original} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
              {table.getRowModel().rows.length === 0 && (
                <tr>
                  <td
                    colSpan={columns.length}
                    className={`px-4 py-8 text-center ${admin.meta}`}
                  >
                    No organizations yet. Add a URL and click Process to get
                    started.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className={admin.tableFoot}>
          <span>
            {table.getRowModel().rows.length} of{" "}
            {orgs?.organizations?.length ?? 0} organizations
          </span>
        </div>
      </div>

      {/* Dev tools - hidden in corner */}
      <div className="mt-8 flex justify-end">
        <button
          onClick={handleSeedUrls}
          disabled={isSeeding}
          className={`rounded text-[12.5px] text-[color:var(--app-text-dim)] transition-colors hover:text-[color:var(--app-text)] ${admin.focus}`}
        >
          {isSeeding ? "Seeding..." : "Seed test data"}
        </button>
      </div>
    </AdminFrame>
  );
}

// The arrow between the queue stages.
function ChevronRight() {
  return (
    <svg
      className="w-4 h-4 text-[color:var(--app-text-dim)]"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 5l7 7-7 7"
      />
    </svg>
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
    return <span className="text-[color:var(--app-text-muted)]">—</span>;
  }

  return (
    <div className="flex items-center gap-3">
      {validEmail && (
        <a
          href={`mailto:${validEmail}`}
          className={admin.link}
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
          className={admin.link}
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
          className={admin.link}
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
        <div className="text-[14px] text-[color:var(--garden-body)]">
          <span className="text-[color:var(--app-text-muted)]">Jobs:</span>{" "}
          {org.jobCount !== undefined && org.jobCount > 0 ? (
            <span className="text-green-300">{org.jobCount} active</span>
          ) : (
            <span>None found</span>
          )}
          {org.lastJobsCrawledAt && (
            <span className="ml-2 text-[color:var(--app-text-muted)]">
              (scraped {formatRelativeTime(org.lastJobsCrawledAt)})
            </span>
          )}
        </div>
      )}

      {/* Location */}
      {(org.streetAddress || org.city || org.state || org.zipCode) && (
        <div className="text-[14px] text-[color:var(--garden-body)]">
          <span className="text-[color:var(--app-text-muted)]">Location:</span>{" "}
          {org.streetAddress && <span>{org.streetAddress}, </span>}
          {[org.city, org.state].filter(Boolean).join(", ")}
          {org.zipCode && <span> {org.zipCode}</span>}
        </div>
      )}

      {/* Full Contact Details */}
      <div className="flex flex-wrap gap-4 text-[14px]">
        {validEmail && (
          <a
            href={`mailto:${validEmail}`}
            className={admin.link}
          >
            {validEmail}
          </a>
        )}
        {validPhone && (
          <a
            href={`tel:${validPhone}`}
            className={admin.link}
          >
            {org.phone}
          </a>
        )}
        {org.website && (
          <a
            href={org.website}
            target="_blank"
            rel="noopener noreferrer"
            className={admin.link}
          >
            {org.website}
          </a>
        )}
        {org.careerPageUrl && (
          <a
            href={org.careerPageUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={admin.link}
          >
            Careers page
          </a>
        )}
        {org.contactFormUrl && org.contactFormUrl.startsWith("http") && (
          <a
            href={org.contactFormUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={admin.link}
          >
            Contact form
          </a>
        )}
      </div>

      {/* Description */}
      {org.description && (
        <p className="text-[14px] text-[color:var(--garden-body)]">{org.description}</p>
      )}

      {/* Tags - just persona tags, skip faith signals */}
      {org.personaTags?.length ? (
        <div className="flex flex-wrap gap-2">
          {org.personaTags?.map((tag, i) => (
            <span key={i} className={admin.chip.neutral}>
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
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[12.5px] font-medium ${seg.bg} ${seg.color}`}
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
