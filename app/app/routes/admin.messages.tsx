// /admin/messages — whether members are sending more messages over time, and
// how often a first message gets an answer. COUNTS ONLY: the numbers come from
// convex/admin/messageReport.ts, which never returns message text, names or
// ids, so there is nothing private on this page to leak.
//
// The report covers 13 weeks (12 full ones and the current one so far), weeks
// starting Monday in UTC. The four headline numbers leave out the current,
// part-way week and compare the last 4 full weeks with the 4 before.
//
// Admin detection is useIsAdmin (the admin flag on the viewer's profile); the
// query is gated on the server too. The query lives in a child that only
// mounts once access is confirmed, so nothing is asked before then, and a
// server error stays in one line (AdminErrorBoundary) instead of a dead page.

import type { ReactNode } from "react";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import type { MetaFunction } from "react-router";
import { api } from "../../convex/_generated/api";
import { admin } from "../components/admin/adminStyles";
import {
  AdminAccessDenied,
  AdminErrorBoundary,
  AdminFrame,
  AdminHeader,
  AdminLoading,
} from "../components/admin/AdminUi";
import { calendarDay, formatWait } from "../lib/dates";
import { useIsAdmin } from "../lib/useIsAdmin";

export const meta: MetaFunction = () => [{ title: "Messages | Admin" }, { name: "robots", content: "noindex" }];

type Report = FunctionReturnType<typeof api.admin.messageReport.getMessageReport>;
type Kind = Report["kinds"][number]["kind"];

const NONE = "–";

/** Shown order and plain words for what started a conversation. */
const KINDS: readonly { kind: Kind; label: string }[] = [
  { kind: "member", label: "Member to member" },
  { kind: "project", label: "About a project" },
  { kind: "host", label: "Host to guest" },
  { kind: "admin", label: "From an admin" },
];

const num = (n: number) => n.toLocaleString("en-US");
const percent = (part: number, whole: number) => (whole === 0 ? null : Math.round((part / whole) * 100));
const percentText = (part: number, whole: number) => {
  const p = percent(part, whole);
  return p === null ? NONE : `${p}%`;
};
const waitText = (minutes: number | null) => (minutes === null ? NONE : formatWait(minutes));

const TH = `${admin.hint} pb-2 text-left align-bottom font-medium`;
const TH_NUMBER = `${TH} pl-3 text-right`;
const TD = "py-2 text-[14px] text-[color:var(--app-text)]";
const TD_NUMBER = `${TD} pl-3 text-right tabular-nums`;

export default function AdminMessagesPage() {
  const isAdmin = useIsAdmin();

  if (isAdmin === undefined) return <AdminLoading>Checking access…</AdminLoading>;
  if (!isAdmin) return <AdminAccessDenied />;

  return (
    <AdminFrame width="list">
      <AdminHeader title="Messages" back sub="Counts only. No one's messages are shown." />
      <AdminErrorBoundary fallback="Couldn't count messages right now. The rest of Admin still works.">
        <Report />
      </AdminErrorBoundary>
    </AdminFrame>
  );
}

function Report() {
  const report = useQuery(api.admin.messageReport.getMessageReport, {});
  if (!report) return <p className={admin.meta}>Counting…</p>;

  const since = `Conversations started in the last ${report.weeks.length} weeks`;
  return (
    <div className="space-y-6">
      <Headline report={report} />
      <Weeks report={report} />
      <Kinds report={report} since={since} />
      <Panel title="What happens next" hint={`${since}.`}>
        <Stats
          columns="grid-cols-3"
          items={[
            { label: "Answered", value: report.responses.replied },
            { label: "Read only", value: report.responses.readNoReply },
            { label: "Unread", value: report.responses.unread },
          ]}
        />
      </Panel>
      <Panel title="How long they run" hint={`${since}. By messages sent in each.`}>
        <Stats
          columns="grid-cols-2 sm:grid-cols-4"
          items={[
            { label: "1 message", value: report.depth.one },
            { label: "2–3", value: report.depth.twoToThree },
            { label: "4–9", value: report.depth.fourToNine },
            { label: "10 or more", value: report.depth.tenPlus },
          ]}
        />
      </Panel>
    </div>
  );
}

function Panel({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  const id = `${title.replace(/\W+/g, "-").toLowerCase()}-heading`;
  return (
    <section className={admin.panel} aria-labelledby={id}>
      <h2 id={id} className={admin.h2}>
        {title}
      </h2>
      {hint && <p className={`mt-1 ${admin.hint}`}>{hint}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

/** A row of plain counts, each with its share of the whole when there is one. */
function Stats({ items, columns }: { items: readonly { label: string; value: number }[]; columns: string }) {
  const total = items.reduce((sum, item) => sum + item.value, 0);
  return (
    <dl className={`grid gap-x-3 gap-y-4 ${columns}`}>
      {items.map((item) => (
        <div key={item.label}>
          <dt className={admin.meta}>{item.label}</dt>
          <dd className="mt-1 text-2xl font-semibold tabular-nums text-[color:var(--app-text)]">{num(item.value)}</dd>
          <dd className={`mt-0.5 ${admin.hint}`}>{percentText(item.value, total)}</dd>
        </div>
      ))}
    </dl>
  );
}

/** The four numbers: the last 4 full weeks, with the 4 before in smaller text. */
function Headline({ report }: { report: Report }) {
  const { recent, before } = report.periods;
  const tiles = [
    { label: "Messages", now: num(recent.messages), was: num(before.messages) },
    { label: "Conversations started", now: num(recent.conversationsStarted), was: num(before.conversationsStarted) },
    {
      label: "Answered",
      now: percentText(recent.startedReplied, recent.conversationsStarted),
      was: percentText(before.startedReplied, before.conversationsStarted),
    },
    { label: "Typical wait", now: waitText(recent.medianReplyMinutes), was: waitText(before.medianReplyMinutes) },
  ];
  return (
    <section aria-labelledby="headline-heading">
      <h2 id="headline-heading" className="sr-only">
        Last 4 full weeks
      </h2>
      <p className={`mb-2 ${admin.hint}`}>Last 4 full weeks. Smaller text is the 4 weeks before.</p>
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map((tile) => (
          <div key={tile.label} className={`${admin.card} p-4`}>
            <dt className={admin.meta}>{tile.label}</dt>
            <dd className="mt-1 text-3xl font-semibold tabular-nums text-[color:var(--app-text)]">{tile.now}</dd>
            <dd className={`mt-1 ${admin.hint}`}>was {tile.was}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** One row per week, newest first, with a bar for messages. */
function Weeks({ report }: { report: Report }) {
  const rows = [...report.weeks].reverse();
  const busiest = Math.max(1, ...rows.map((week) => week.messages));
  return (
    <Panel title="Each week">
      <table className="w-full table-fixed">
        <thead className={admin.ruleBottom}>
          <tr>
            <th scope="col" className={`${TH} w-16`}>
              Week
            </th>
            <th scope="col" className={TH_NUMBER}>
              Messages
            </th>
            <th scope="col" className={`${TH_NUMBER} w-[4.5rem]`}>
              Started
            </th>
            <th scope="col" className={`${TH_NUMBER} w-[4.5rem]`}>
              Answered
            </th>
          </tr>
        </thead>
        <tbody className={admin.divide}>
          {rows.map((week, i) => (
            <tr key={week.weekStart}>
              <th scope="row" className={`${TD} text-left font-normal`}>
                {calendarDay(week.weekStart)}
                {i === 0 && <span className={`block ${admin.hint}`}>this week</span>}
              </th>
              <td className={`${TD} pl-3`}>
                <div className="flex items-center gap-2">
                  <div className="h-2 flex-1 rounded-full bg-[var(--app-hairline)]" aria-hidden="true">
                    <div
                      className="h-full rounded-full bg-[var(--app-accent)]"
                      style={{ width: `${week.messages === 0 ? 0 : Math.max(3, (week.messages / busiest) * 100)}%` }}
                    />
                  </div>
                  <span className="w-10 text-right tabular-nums">{num(week.messages)}</span>
                </div>
              </td>
              <td className={TD_NUMBER}>{num(week.conversationsStarted)}</td>
              <td className={TD_NUMBER}>{percentText(week.startedReplied, week.conversationsStarted)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}

/** What started each conversation, and how often it was answered. */
function Kinds({ report, since }: { report: Report; since: string }) {
  return (
    <Panel title="Who starts them" hint={`${since}.`}>
      <table className="w-full">
        <thead className={admin.ruleBottom}>
          <tr>
            <th scope="col" className={TH}>
              <span className="sr-only">Kind</span>
            </th>
            <th scope="col" className={TH_NUMBER}>
              Started
            </th>
            <th scope="col" className={TH_NUMBER}>
              Answered
            </th>
            <th scope="col" className={TH_NUMBER}>
              Typical wait
            </th>
          </tr>
        </thead>
        <tbody className={admin.divide}>
          {KINDS.map(({ kind, label }) => {
            const row = report.kinds.find((k) => k.kind === kind);
            if (!row) return null;
            return (
              <tr key={kind}>
                <th scope="row" className={`${TD} text-left font-normal`}>
                  {label}
                </th>
                <td className={TD_NUMBER}>{num(row.started)}</td>
                <td className={TD_NUMBER}>{percentText(row.replied, row.started)}</td>
                <td className={TD_NUMBER}>{waitText(row.medianReplyMinutes)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Panel>
  );
}
