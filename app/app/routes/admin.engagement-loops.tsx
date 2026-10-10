// /admin/engagement-loops — the emails the app sends on its own clock
// (docs/features/engagement-loops.md), drawn as a flow the way visual
// builders do: signup, the wait, each email with its switch and one line of
// results. The words, the full counts, and what it checks before sending
// open in a drawer from the email (Rick 10/10: "show less up front").
//
// Admin detection mirrors admin.activity.tsx: the client-checkable
// profile.isAdmin flag, so a non-admin gets a message instead of a stuck
// loading state, and the admin query stays skipped until it is true. The
// server functions check admin themselves (requireAdminCtx). Hooks stay
// above every return.

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery } from "convex/react";
import type { MetaFunction } from "react-router";
import { CaretRight, Clock, EnvelopeSimple, UserPlus, X } from "@phosphor-icons/react";
import { api } from "../../convex/_generated/api";
import { loopDefault } from "../../convex/engagement/loops";
import { admin } from "../components/admin/adminStyles";
import {
  AdminAccessDenied,
  AdminFrame,
  AdminHeader,
  AdminLoading,
  AdminNotice,
  type NoticeTone,
} from "../components/admin/AdminUi";
import { errorMessage } from "../lib/convexError";

export const meta: MetaFunction = () => [
  { title: "Engagement loops | Admin" },
  { name: "robots", content: "noindex" },
];

type Loops = NonNullable<ReturnType<typeof useQuery<typeof api.engagement.nudges.adminOverview>>>;
type Loop = Loops[number];
type Window = Loop["last7"];

export default function AdminEngagementLoopsPage() {
  const profile = useQuery(api.profiles.getMyProfile);
  const isAdmin = profile?.isAdmin === true;
  const loops = useQuery(api.engagement.nudges.adminOverview, isAdmin ? {} : "skip");

  if (profile === undefined) {
    return <AdminLoading>Checking access…</AdminLoading>;
  }
  if (!isAdmin) {
    return <AdminAccessDenied />;
  }

  return (
    <AdminFrame width="list">
      <AdminHeader title="Engagement loops" back sub="Emails after signup, until they share a project." />
      {loops === undefined ? <AdminLoading>Loading loops…</AdminLoading> : <LoopFlow loops={loops} />}
    </AdminFrame>
  );
}

// ——————————————————————————————————————————————————————————————
// The flow
// ——————————————————————————————————————————————————————————————

/** Days after signup, from the loop's code (timing isn't editable here). */
function daysAfterSignup(key: string): number {
  return loopDefault(key)?.afterDays ?? 0;
}

function dayWord(n: number): string {
  return n === 1 ? "1 day" : `${n} days`;
}

function LoopFlow({ loops }: { loops: Loop[] }) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const ordered = [...loops].sort((a, b) => daysAfterSignup(a.key) - daysAfterSignup(b.key));
  const open = ordered.find((l) => l.key === openKey) ?? null;

  let previousDay = 0;
  return (
    <>
      <div
        className={`${admin.card} px-4 py-8 sm:px-8 sm:py-10`}
        style={{
          backgroundImage: "radial-gradient(var(--app-hairline-raised) 1px, transparent 1px)",
          backgroundSize: "20px 20px",
        }}
      >
        <ol className="mx-auto flex max-w-[440px] flex-col items-stretch" aria-label="Loop steps">
          <li>
            <Step icon={<UserPlus size={18} weight="bold" aria-hidden />} title="Someone signs up" />
          </li>
          {ordered.map((loop) => {
            const day = daysAfterSignup(loop.key);
            const wait = day - previousDay;
            previousDay = day;
            return (
              <li key={loop.key}>
                <Connector dashed={!loop.enabled}>
                  <Clock size={15} weight="bold" aria-hidden />
                  {dayWord(wait)} later
                </Connector>
                <EmailStep loop={loop} day={day} onOpen={() => setOpenKey(loop.key)} />
              </li>
            );
          })}
          <li>
            <Connector dashed={false} />
            <p className={`mx-auto w-fit rounded-full ${admin.inset} px-3.5 py-1.5 ${admin.meta}`}>
              Stops once they share a project
            </p>
          </li>
        </ol>
      </div>

      {open && <LoopDrawer key={open.key} loop={open} day={daysAfterSignup(open.key)} onClose={() => setOpenKey(null)} />}
    </>
  );
}

function Step({ icon, title }: { icon: ReactNode; title: string }) {
  return (
    <div className={`${admin.card} flex items-center gap-3 px-4 py-3.5`}>
      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--app-accent-wash)] text-[color:var(--app-text)]">
        {icon}
      </span>
      <span className={admin.h3}>{title}</span>
    </div>
  );
}

/** The line between two steps, with the wait on it. Dashed when the step it
 * leads to is off. */
function Connector({ dashed, children }: { dashed: boolean; children?: ReactNode }) {
  const line = `mx-auto w-px grow border-l-2 ${dashed ? "border-dashed" : ""} border-[color:var(--app-hairline-raised)]`;
  return (
    <div className={`flex ${children ? "h-20" : "h-10"} flex-col items-center`} aria-hidden={children ? undefined : true}>
      <span className={line} />
      {children && (
        <span className={`my-1 inline-flex items-center gap-1.5 rounded-full ${admin.inset} px-3 py-1 ${admin.meta}`}>
          {children}
        </span>
      )}
      <span className={line} />
    </div>
  );
}

function EmailStep({ loop, day, onOpen }: { loop: Loop; day: number; onOpen: () => void }) {
  const toggle = useToggle(loop);
  return (
    <div className={`${admin.card} transition-colors hover:border-[color:var(--app-hairline-raised)]`}>
      <div className="flex items-center gap-3 px-4 pt-3.5">
        <span
          className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
            loop.enabled ? "bg-[var(--app-accent)] text-[color:var(--garden-ink)]" : "bg-[var(--app-hairline)] text-[color:var(--app-text-muted)]"
          }`}
        >
          <EnvelopeSimple size={18} weight="bold" aria-hidden />
        </span>
        <span className={`min-w-0 grow ${admin.meta}`}>Email, day {day}</span>
        <LoopSwitch name={loop.name} on={loop.enabled} busy={toggle.busy} onToggle={toggle.run} />
      </div>
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Open ${loop.name}`}
        className={`group flex w-full items-end justify-between gap-3 rounded-b-xl px-4 pt-2 pb-3.5 text-left ${admin.focus}`}
      >
        <span className="min-w-0">
          <span className={`block text-[16px] font-semibold ${loop.enabled ? "text-[color:var(--app-text)]" : "text-[color:var(--app-text-muted)]"}`}>
            {loop.subject}
          </span>
          <span className={`mt-1 block ${admin.meta}`}>
            {loop.enabled ? `${loop.last30.sent} sent · ${loop.last30.shared} shared, last 30 days` : "Off. Not sending."}
          </span>
        </span>
        <span className="inline-flex shrink-0 items-center gap-0.5 text-[13.5px] font-medium text-[color:var(--app-text-muted)] transition-colors group-hover:text-[color:var(--app-text)]">
          Edit
          <CaretRight size={14} weight="bold" aria-hidden />
        </span>
      </button>
      {toggle.error && (
        <div className="px-4 pb-3.5">
          <AdminNotice tone="error">{toggle.error}</AdminNotice>
        </div>
      )}
    </div>
  );
}

function useToggle(loop: Loop) {
  const save = useMutation(api.engagement.nudges.adminSave);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run() {
    setBusy(true);
    setError(null);
    try {
      await save({ key: loop.key, enabled: !loop.enabled });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, run };
}

function LoopSwitch({
  name,
  on,
  busy,
  onToggle,
}: {
  name: string;
  on: boolean;
  busy: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="text-[14px] font-medium text-[color:var(--app-text)]">{on ? "On" : "Off"}</span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={name}
        onClick={onToggle}
        disabled={busy}
        className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-50 ${admin.focus} ${
          on
            ? "border-[color:var(--app-accent)] bg-[var(--app-accent)]"
            : "border-[color:var(--app-hairline-raised)] bg-[var(--app-surface)]"
        }`}
      >
        <span
          aria-hidden="true"
          className={`inline-block h-5 w-5 rounded-full transition-transform motion-reduce:transition-none ${
            on ? "translate-x-6 bg-[color:var(--garden-ink)]" : "translate-x-1 bg-[color:var(--app-text-muted)]"
          }`}
        />
      </button>
    </div>
  );
}

// ——————————————————————————————————————————————————————————————
// The drawer: words, results, checks
// ——————————————————————————————————————————————————————————————

function LoopDrawer({ loop, day, onClose }: { loop: Loop; day: number; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [shown, setShown] = useState(false);
  const save = useMutation(api.engagement.nudges.adminSave);
  const [subject, setSubject] = useState(loop.subject);
  const [body, setBody] = useState(loop.body);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: NoticeTone; text: string } | null>(null);
  const dirty = subject.trim() !== loop.subject || body.trim() !== loop.body;

  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    el.showModal();
    const frame = requestAnimationFrame(() => setShown(true));
    return () => {
      cancelAnimationFrame(frame);
      if (el.open) el.close();
    };
  }, []);

  function close() {
    if (dirty && !window.confirm("Close without saving?")) return;
    onClose();
  }

  async function saveText() {
    setBusy(true);
    setNotice(null);
    try {
      await save({ key: loop.key, subject, body });
      setSubject(subject.trim());
      setBody(body.trim());
      setNotice({ tone: "ok", text: "Saved." });
    } catch (err) {
      setNotice({ tone: "error", text: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  const titleId = `${loop.key}-drawer-title`;
  return (
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      // A click on the dimmed page outside the panel lands on the dialog itself.
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
      className={`fixed inset-y-0 right-0 left-auto m-0 h-dvh max-h-dvh w-full max-w-[480px] border-0 border-l border-[color:var(--app-hairline)] bg-[var(--app-surface-raised)] p-0 text-[color:var(--app-text)] backdrop:bg-black/60 transition-transform duration-200 ease-out motion-reduce:transition-none ${
        shown ? "translate-x-0" : "translate-x-full"
      }`}
    >
      <div className="flex h-full flex-col">
        <div className={`flex items-start justify-between gap-3 px-5 py-4 ${admin.ruleBottom}`}>
          <div className="min-w-0">
            <h2 id={titleId} className={admin.h2}>
              Email, day {day}
            </h2>
            <p className={`mt-0.5 ${admin.meta}`}>{dayWord(day)} after signup, if they haven't shared a project.</p>
          </div>
          <button type="button" onClick={close} aria-label="Close" className={`-mr-1 rounded-lg p-1.5 text-[color:var(--app-text-muted)] hover:text-[color:var(--app-text)] ${admin.focus}`}>
            <X size={20} weight="bold" aria-hidden />
          </button>
        </div>

        <div className="grow space-y-7 overflow-y-auto px-5 py-5">
          <section className="space-y-4" aria-label="Words">
            <div>
              <label htmlFor={`${loop.key}-subject`} className={admin.label}>
                Subject
              </label>
              <input
                id={`${loop.key}-subject`}
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className={admin.input}
              />
            </div>
            <div>
              <label htmlFor={`${loop.key}-body`} className={admin.label}>
                Text
              </label>
              <textarea
                id={`${loop.key}-body`}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={5}
                className={`${admin.input} leading-relaxed`}
              />
              <p className={`mt-1 ${admin.hint}`}>The button says “{loop.ctaText}”.</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" onClick={saveText} disabled={busy || !dirty} className={admin.btnPrimary}>
                Save
              </button>
              {notice && <AdminNotice tone={notice.tone}>{notice.text}</AdminNotice>}
            </div>
          </section>

          <Results loop={loop} />

          <details className="group">
            <summary className={`cursor-pointer list-none rounded ${admin.h3} ${admin.focus}`}>
              <span className="inline-flex items-center gap-1">
                <CaretRight size={14} weight="bold" aria-hidden className="transition-transform group-open:rotate-90 motion-reduce:transition-none" />
                Checks before it sends
              </span>
            </summary>
            <ul className={`mt-2 list-disc space-y-1 pl-9 ${admin.body}`}>
              <li>It's on.</li>
              <li>They still haven't shared a project.</li>
              <li>Their email settings allow it, and their address works.</li>
              <li>They haven't had this one already.</li>
              <li>No other email from us in the last day.</li>
            </ul>
          </details>
        </div>
      </div>
    </dialog>
  );
}

function Results({ loop }: { loop: Loop }) {
  const [days, setDays] = useState<7 | 30>(30);
  const counts: Window = days === 7 ? loop.last7 : loop.last30;
  return (
    <section aria-labelledby={`${loop.key}-results`}>
      <div className="flex items-center justify-between gap-3">
        <h3 id={`${loop.key}-results`} className={admin.h3}>
          Results
        </h3>
        <div className="flex gap-1.5" role="group" aria-label="Period">
          {([7, 30] as const).map((d) => (
            <button key={d} type="button" aria-pressed={days === d} onClick={() => setDays(d)} className={days === d ? admin.pillOn : admin.pillOff}>
              {d} days
            </button>
          ))}
        </div>
      </div>
      <dl className="mt-3 grid grid-cols-3 gap-2">
        <Stat label="Sent" value={counts.sent} />
        <Stat label="Shared" value={counts.shared} />
        <Stat label="Skipped" value={counts.skipped} />
      </dl>
      {counts.reasons.length > 0 && (
        <ul className={`mt-3 space-y-1 ${admin.meta}`}>
          {counts.reasons.map((r) => (
            <li key={r.reason} className="flex justify-between gap-3">
              <span>{r.label}</span>
              <span className="tabular-nums">{r.count}</span>
            </li>
          ))}
        </ul>
      )}
      <p className={`mt-3 ${admin.hint}`}>Shared: posted a project within 7 days of the email.</p>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className={`${admin.inset} flex flex-col-reverse px-3 py-2.5`}>
      <dt className={admin.hint}>{label}</dt>
      <dd className="text-[22px] font-semibold tabular-nums text-[color:var(--app-text)]">{value}</dd>
    </div>
  );
}
