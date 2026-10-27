import { useState } from "react";
import { Link, type MetaFunction } from "react-router";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { AdminAccessDenied, AdminFrame, AdminHeader, AdminLoading, AdminNotice } from "../components/admin/AdminUi";
import { admin } from "../components/admin/adminStyles";
import { useIsAdmin } from "../lib/useIsAdmin";
import { errorMessage } from "../lib/convexError";

export const meta: MetaFunction = () => [{ title: "Needs attention | Admin" }, { name: "robots", content: "noindex" }];
const REASONS = { unanswered: "Unanswered messages", newcomer: "New members", invite: "Accepted invites" } as const;
type Reason = keyof typeof REASONS;

export default function AdminAttentionPage() {
  const isAdmin = useIsAdmin();
  const [reason, setReason] = useState<Reason>("unanswered");
  const [cursor, setCursor] = useState<string>();
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();
  const page = useQuery(api.engagement.attention.list, isAdmin ? { reason, cursor } : "skip");
  const settings = useQuery(api.engagement.attention.getUnreadReminder, isAdmin ? {} : "skip");
  const update = useMutation(api.engagement.attention.update);
  const toggle = useMutation(api.engagement.attention.setUnreadReminder);

  async function perform(key: string, work: () => Promise<unknown>) {
    setBusy(key); setError(undefined);
    try { await work(); } catch (err) { setError(errorMessage(err, "Could not save this change.")); }
    finally { setBusy(undefined); }
  }

  if (isAdmin === undefined) return <AdminLoading>Checking access…</AdminLoading>;
  if (!isAdmin) return <AdminAccessDenied />;
  return (
    <AdminFrame width="list">
      <AdminHeader title="Needs attention" back sub="Review people who may need a hand. Actions here never send a personal message." />
      {error && <AdminNotice tone="error">{error}</AdminNotice>}
      <section className={`${admin.panel} mb-5`} aria-labelledby="reminder-heading">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className={admin.h2} id="reminder-heading">Unread message reminder</h2>
          <button className={admin.btnSecondary} disabled={!settings || !!busy} onClick={() => settings && void perform("settings", () => toggle({ enabled: !settings.enabled }))}>
            {settings?.enabled ? "Turn off reminder" : "Enable reminder"}
          </button>
        </div>
        <p className={`mt-2 ${admin.body}`}>{settings ? (settings.enabled ? "On." : "Off.") : "Loading settings…"} One email per unanswered conversation episode after 24 hours. A read, reply, block or email preference change cancels it before dispatch. Standard activity emails share a 24-hour contact limit.</p>
        <p className={`mt-2 ${admin.hint}`}>The reminder uses generic inbox text. Provider acceptance is recorded separately from delivery. The first-cheer welcome email is an explicit exception to the standard contact limit.</p>
      </section>
      <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Attention reason">
        {(Object.entries(REASONS) as [Reason, string][]).map(([key, label]) => <button key={key} className={key === reason ? admin.pillOn : admin.pillOff} aria-pressed={key === reason} onClick={() => { setReason(key); setCursor(undefined); }}>{label}</button>)}
      </div>
      {!page ? <AdminLoading>Loading attention items…</AdminLoading> : <>
        <p className={`mb-3 ${admin.meta}`}>Each page checks up to 25 source records. New member and invite checks cover the last 14 days, after a 24-hour wait.</p>
        {!page.coverage.migrationComplete && <AdminNotice tone="info">Conversation history needs its bounded backfill before new member and invite activation checks are complete. Existing summarized conversations remain visible.</AdminNotice>}
        {page.coverage.unknown > 0 && <p className={`mb-3 ${admin.hint}`}>{page.coverage.unknown} records need more history or have legacy follow origins; they are excluded from inactivity claims.</p>}
        {page.items.length === 0 && <p className={`${admin.panel} ${admin.body}`}>No attention items on this page.{!page.isDone && " More source records are available on the next page."}</p>}
        <ul className="space-y-3">
          {page.items.map(item => <li key={item.candidateKey} className={admin.panel}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <Link className={`${admin.h3} ${admin.link}`} to={`/profile/${item.profileId}`}>{item.name}</Link>
                <p className={`mt-1 ${admin.meta}`}>{REASONS[item.reason]} · since {new Date(item.sourceAt).toLocaleString()}</p>
                <p className={`mt-1 ${admin.meta}`}>Reminder eligibility: {item.contact.reason.replaceAll("_", " ")}. {item.lastContact ? `Last email: ${item.lastContact.status}, ${new Date(item.lastContact.at).toLocaleString()}.` : "No recorded email contact."}</p>
                <p className={`mt-1 ${admin.hint}`}>{item.ownerId ? "Assigned to an admin." : "Unassigned."}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {([ ["claim", "Assign to me"], ["snooze", "Snooze 24h"], ["review", "Reviewed"] ] as const).map(([action, label]) => <button key={action} disabled={!!busy} className={admin.btnRowSecondary} onClick={() => void perform(item.candidateKey, () => update({ candidateKey: item.candidateKey, action }))}>{label}</button>)}
              </div>
            </div>
          </li>)}
        </ul>
        <div className="mt-4 flex items-center gap-3">
          <button className={admin.btnSecondary} disabled={!cursor} onClick={() => setCursor(undefined)}>First page</button>
          <button className={admin.btnSecondary} disabled={!page.nextCursor} onClick={() => page.nextCursor && setCursor(page.nextCursor)}>Next page</button>
          <span className={admin.hint}>{page.coverage.returned} items from {page.coverage.scanned} records checked.</span>
        </div>
      </>}
    </AdminFrame>
  );
}
