import { useState } from "react";
import { Link, type MetaFunction } from "react-router";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { AdminAccessDenied, AdminFrame, AdminHeader, AdminLoading, AdminNotice } from "../components/admin/AdminUi";
import { admin } from "../components/admin/adminStyles";
import { InfoTip } from "../components/InfoTip";
import { useIsAdmin } from "../lib/useIsAdmin";
import { errorMessage } from "../lib/convexError";
import {
  attentionSituation,
  attentionTodo,
  CONTACT_STATES,
  contactState,
  lastEmailLine,
  type ContactState,
} from "../lib/attentionState";

export const meta: MetaFunction = () => [{ title: "Needs attention | Admin" }, { name: "robots", content: "noindex" }];
const REASONS = { unanswered: "Unanswered messages", newcomer: "New members", invite: "Accepted invites" } as const;
type Reason = keyof typeof REASONS;

export default function AdminAttentionPage() {
  const isAdmin = useIsAdmin();
  const me = useQuery(api.profiles.getMyProfile, isAdmin ? {} : "skip");
  const [reason, setReason] = useState<Reason>("unanswered");
  const [state, setState] = useState<ContactState | null>(null);
  const [cursor, setCursor] = useState<string>();
  // Fixed while a list is open, so a re-run keeps the same range
  // (attention.ts list); a new list starts from now.
  const [asOf, setAsOf] = useState(() => Date.now());
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();
  const page = useQuery(api.engagement.attention.list, isAdmin ? { reason, cursor, asOf } : "skip");
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

  const items = (page?.items ?? []).map(item => ({ ...item, state: contactState(item.contact.reason) }));
  // Only the states on this page, in CONTACT_STATES order, each with its count.
  const counts = new Map<ContactState, number>();
  for (const item of items) counts.set(item.state, (counts.get(item.state) ?? 0) + 1);
  const states = (Object.keys(CONTACT_STATES) as ContactState[]).filter(s => counts.has(s) || s === state);
  const shown = state ? items.filter(item => item.state === state) : items;

  return (
    <AdminFrame width="list">
      <AdminHeader title="Needs attention" back sub="People who may need a hand. Nothing here sends a personal message." />
      {error && <AdminNotice tone="error">{error}</AdminNotice>}
      <section className={`${admin.panel} mb-5`} aria-labelledby="reminder-heading">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h2 className={admin.h2} id="reminder-heading">Unread message reminder</h2>
            {settings && <span className={settings.enabled ? admin.chip.green : admin.chip.amber}>{settings.enabled ? "On" : "Off"}</span>}
          </div>
          <button className={admin.btnSecondary} disabled={!settings || !!busy} onClick={() => settings && void perform("settings", () => toggle({ enabled: !settings.enabled }))}>
            {settings?.enabled ? "Turn off" : "Turn on"}
          </button>
        </div>
        <p className={`mt-2 flex items-center gap-1 ${admin.body}`}>
          When a message sits unanswered for a day, it emails them once.
          <InfoTip
            label="How the reminder works"
            lines={[
              "Reading, replying, blocking or turning off activity email cancels it.",
              "It says they have a message, not what it says.",
              "It counts toward the one activity email a day.",
              "While it's off, rows with an email say Reminder off.",
            ]}
          />
        </p>
      </section>
      <div className="mb-3 flex flex-wrap items-center gap-2" role="group" aria-label="Why they're here">
        {(Object.entries(REASONS) as [Reason, string][]).map(([key, label]) => <button key={key} className={key === reason ? admin.pillOn : admin.pillOff} aria-pressed={key === reason} onClick={() => { setReason(key); setCursor(undefined); setAsOf(Date.now()); setState(null); }}>{label}</button>)}
        <InfoTip
          label="What these lists check"
          lines={[
            "Each page checks 25 people.",
            "New members and Accepted invites cover the last two weeks, a day after they joined.",
            "They list people who haven't posted, followed anyone or had a conversation.",
          ]}
        />
      </div>
      {!page ? <AdminLoading>Loading…</AdminLoading> : <>
        {reason !== "unanswered" && !page.coverage.migrationComplete && <AdminNotice tone="info">Older conversations aren't counted yet, so New members and Accepted invites can miss people.</AdminNotice>}
        {states.length > 0 && (
          <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Filter by email">
            <button className={state === null ? admin.pillOn : admin.pillOff} aria-pressed={state === null} onClick={() => setState(null)}>All {items.length}</button>
            {states.map(s => <button key={s} className={state === s ? admin.pillOn : admin.pillOff} aria-pressed={state === s} onClick={() => setState(state === s ? null : s)}>{CONTACT_STATES[s].badge} {counts.get(s) ?? 0}</button>)}
          </div>
        )}
        {shown.length === 0 && <p className={`${admin.panel} ${admin.body}`}>No one here on this page.{!page.isDone && " Try the next page."}</p>}
        <ul className="space-y-3">
          {shown.map(item => <li key={item.candidateKey} className={admin.panel}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Link className={`${admin.h3} ${admin.link}`} to={`/profile/${item.profileId}`}>{item.name}</Link>
                  <span className={admin.chip[CONTACT_STATES[item.state].tone]}>{CONTACT_STATES[item.state].badge}</span>
                  {item.ownerId && <span className={admin.chip.neutral}>{item.ownerId === me?.userId ? "Yours" : "Assigned"}</span>}
                </div>
                <p className={`mt-1 ${admin.meta}`}>{attentionSituation(item.reason, item.sourceAt)} {lastEmailLine(item.lastContact)}</p>
                <p className={`mt-2 ${admin.body}`}><span className="font-semibold">What to do:</span> {attentionTodo(item.reason, item.state)}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {([ ["claim", "Assign to me"], ["snooze", "Snooze a day"], ["review", "Reviewed"] ] as const).filter(([action]) => !(action === "claim" && me && item.ownerId === me.userId)).map(([action, label]) => <button key={action} disabled={!!busy} className={admin.btnRowSecondary} onClick={() => void perform(item.candidateKey, () => update({ candidateKey: item.candidateKey, action }))}>{label}</button>)}
              </div>
            </div>
          </li>)}
        </ul>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button className={admin.btnSecondary} disabled={!cursor} onClick={() => { setCursor(undefined); setAsOf(Date.now()); setState(null); }}>First page</button>
          <button className={admin.btnSecondary} disabled={!page.nextCursor} onClick={() => { if (page.nextCursor) { setCursor(page.nextCursor); setState(null); } }}>Next page</button>
          <span className={admin.hint}>
            {page.coverage.returned} of {page.coverage.scanned} checked need attention.
            {page.coverage.unknown > 0 && ` ${page.coverage.unknown} skipped: not enough history to tell.`}
          </span>
        </div>
      </>}
    </AdminFrame>
  );
}
