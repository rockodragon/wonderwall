// /admin/activity — who is joining and making things, newest first. The
// operator's answer to "what happened since I last looked": joins, projects,
// classes, Tables, events, across every community. Money activity lives on
// /admin/ledger instead (convex/garden/reports.ts's own `recent`); this page
// is people and content only.
//
// Admin detection mirrors admin.waitlist.tsx: the client-checkable
// profile.isAdmin flag, so a non-admin gets a message rather than a stuck
// loading state. The server query is gated independently.

import { useQuery } from "convex/react";
import type { MetaFunction } from "react-router";
import { Link } from "react-router";
import { api } from "../../convex/_generated/api";
import { admin } from "../components/admin/adminStyles";
import {
  AdminAccessDenied,
  AdminFrame,
  AdminHeader,
  AdminLoading,
} from "../components/admin/AdminUi";

export const meta: MetaFunction = () => {
  return [{ title: "Activity | Admin" }, { name: "robots", content: "noindex" }];
};

const SOURCE_LABEL: Record<string, string> = {
  member_joined: "Joined",
  project_created: "Project",
  class_created: "Class",
  table_created: "Table",
  event_created: "Event",
};

const SOURCE_CHIP: Record<string, string> = {
  member_joined: admin.chip.green,
  project_created: admin.chip.sky,
  class_created: admin.chip.purple,
  table_created: admin.chip.amber,
  event_created: admin.chip.orange,
};

// "3m ago", "2h ago", "4d ago" — the feed is read by scanning, and an
// absolute timestamp makes you do the subtraction yourself. The exact time
// stays available as the cell's title attribute.
function relativeTime(at: number, now: number): string {
  const mins = Math.round((now - at) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.round(days / 30);
  return `${months}mo ago`;
}

export default function AdminActivityPage() {
  const profile = useQuery(api.profiles.getMyProfile);
  const activity = useQuery(api.garden.activity.getRecentActivity);

  if (profile === undefined) {
    return <AdminLoading>Checking access…</AdminLoading>;
  }
  if (!profile?.isAdmin) {
    return <AdminAccessDenied />;
  }

  const now = Date.now();
  const joins = activity?.filter((i) => i.source === "member_joined").length ?? 0;

  return (
    <AdminFrame width="list">
      <AdminHeader
        title="Activity"
        back
        sub={
          activity
            ? `${activity.length} most recent · ${joins} ${joins === 1 ? "join" : "joins"}`
            : undefined
        }
      />

      {activity === undefined ? (
        <AdminLoading>Loading activity…</AdminLoading>
      ) : activity.length === 0 ? (
        <div className={admin.panel}>
          <p className={admin.meta}>
            Nothing yet. Joins and anything people make will show up here.
          </p>
        </div>
      ) : (
        <ul className={`${admin.card} ${admin.divide}`}>
          {activity.map((row, i) => (
            <li
              key={`${row.source}-${row.at}-${i}`}
              className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-3"
            >
              <span className={SOURCE_CHIP[row.source] ?? admin.chip.neutral}>
                {SOURCE_LABEL[row.source] ?? row.source}
              </span>

              <div className="min-w-0 flex-1">
                <span className="text-[14px] font-medium text-[color:var(--app-text)]">
                  {row.actorProfileId ? (
                    <Link to={`/profile/${row.actorProfileId}`} className={admin.link}>
                      {row.actorName}
                    </Link>
                  ) : (
                    row.actorName
                  )}
                </span>{" "}
                <span className="text-[14px] text-[color:var(--garden-body)]">
                  {row.href ? (
                    <Link to={row.href} className={admin.link}>
                      {row.description}
                    </Link>
                  ) : (
                    row.description
                  )}
                </span>
                {row.hostOrgName && row.source !== "member_joined" && (
                  <span className={`ml-2 ${admin.hint}`}>in {row.hostOrgName}</span>
                )}
              </div>

              <span className={admin.hint} title={new Date(row.at).toLocaleString()}>
                {relativeTime(row.at, now)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </AdminFrame>
  );
}
