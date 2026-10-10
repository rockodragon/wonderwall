// /admin/engagement-loops — the emails PostHog asks the app to send
// (docs/features/engagement-loops.md). For each loop: an on/off switch, the
// subject and text, what happened in the last 7 and 30 days (sent, shared,
// skipped by reason), and what to paste into PostHog. The secret is never
// shown here: it lives in the NUDGE_WEBHOOK_SECRET env var and in PostHog.
//
// Admin detection mirrors admin.activity.tsx: the client-checkable
// profile.isAdmin flag, so a non-admin gets a message instead of a stuck
// loading state, and the admin query stays skipped until it is true. The
// server functions check admin themselves (requireAdminCtx). Hooks stay
// above every return.

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery } from "convex/react";
import type { MetaFunction } from "react-router";
import { api } from "../../convex/_generated/api";
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
import { NUDGE_SECRET_ENV, NUDGE_SECRET_HEADER, nudgeWebhookBody, nudgeWebhookUrl } from "../lib/nudgeWebhook";
import { useIsAdmin } from "../lib/useIsAdmin";

export const meta: MetaFunction = () => [
  { title: "Engagement loops | Admin" },
  { name: "robots", content: "noindex" },
];

type Loops = NonNullable<ReturnType<typeof useQuery<typeof api.engagement.nudges.adminOverview>>>;
type Loop = Loops[number];
type Window = Loop["last7"];

export default function AdminEngagementLoopsPage() {
  const isAdmin = useIsAdmin();
  const loops = useQuery(api.engagement.nudges.adminOverview, isAdmin === true ? {} : "skip");
  const webhookUrl = nudgeWebhookUrl(import.meta.env.VITE_CONVEX_URL as string | undefined);

  if (isAdmin === undefined) {
    return <AdminLoading>Checking access…</AdminLoading>;
  }
  if (!isAdmin) {
    return <AdminAccessDenied />;
  }

  return (
    <AdminFrame width="list">
      <AdminHeader title="Engagement loops" back sub="PostHog says when. The app checks, then sends." />
      {loops === undefined ? (
        <AdminLoading>Loading loops…</AdminLoading>
      ) : (
        <div className="space-y-6">
          {loops.map((loop) => (
            <LoopCard key={loop.key} loop={loop} webhookUrl={webhookUrl} />
          ))}
        </div>
      )}
    </AdminFrame>
  );
}

// ——————————————————————————————————————————————————————————————
// One loop
// ——————————————————————————————————————————————————————————————

function LoopCard({ loop, webhookUrl }: { loop: Loop; webhookUrl: string | null }) {
  const save = useMutation(api.engagement.nudges.adminSave);
  const [subject, setSubject] = useState(loop.subject);
  const [body, setBody] = useState(loop.body);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: NoticeTone; text: string } | null>(null);

  const dirty = subject.trim() !== loop.subject || body.trim() !== loop.body;

  async function toggle() {
    setBusy(true);
    setNotice(null);
    try {
      await save({ key: loop.key, enabled: !loop.enabled });
    } catch (err) {
      setNotice({ tone: "error", text: errorMessage(err) });
    } finally {
      setBusy(false);
    }
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

  const inputId = `${loop.key}-subject`;
  const bodyId = `${loop.key}-body`;

  return (
    <section className={admin.panel} aria-labelledby={`${loop.key}-name`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id={`${loop.key}-name`} className={admin.h2}>
            {loop.name}
          </h2>
          <p className={`mt-1 ${admin.meta}`}>PostHog waits: {loop.when}.</p>
        </div>
        <LoopSwitch name={loop.name} on={loop.enabled} busy={busy} onToggle={toggle} />
      </div>

      <div className="mt-5 space-y-4">
        <div>
          <label htmlFor={inputId} className={admin.label}>
            Subject
          </label>
          <input
            id={inputId}
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className={admin.input}
          />
        </div>
        <div>
          <label htmlFor={bodyId} className={admin.label}>
            Text
          </label>
          <textarea
            id={bodyId}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={4}
            className={`${admin.input} leading-relaxed`}
          />
          <p className={`mt-1 ${admin.hint}`}>A blank line starts a new paragraph. The button says “{loop.ctaText}”.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={saveText} disabled={busy || !dirty} className={admin.btnPrimary}>
            Save
          </button>
          {notice && (
            <AdminNotice tone={notice.tone}>{notice.text}</AdminNotice>
          )}
        </div>
      </div>

      <Counts loop={loop} />
      <PostHogSetup loopKey={loop.key} webhookUrl={webhookUrl} />
    </section>
  );
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
// What happened
// ——————————————————————————————————————————————————————————————

function Counts({ loop }: { loop: Loop }) {
  // Every reason seen in either window, most common first, so both columns line up.
  const reasons = new Map<string, { label: string; weight: number }>();
  for (const window of [loop.last7, loop.last30]) {
    for (const r of window.reasons) {
      const seen = reasons.get(r.reason);
      reasons.set(r.reason, { label: r.label, weight: (seen?.weight ?? 0) + r.count });
    }
  }
  const ordered = [...reasons].sort((a, b) => b[1].weight - a[1].weight || a[1].label.localeCompare(b[1].label));
  const count = (window: Window, reason: string) => window.reasons.find((r) => r.reason === reason)?.count ?? 0;

  return (
    <div className="mt-6">
      <div className={admin.tableWrap}>
        <div className={admin.tableScroll}>
          <table className={admin.table}>
            <thead className={admin.thead}>
              <tr>
                <th scope="col" className={admin.th}>
                  <span className="sr-only">What happened</span>
                </th>
                <th scope="col" className={`${admin.th} text-right`}>
                  Last 7 days
                </th>
                <th scope="col" className={`${admin.th} text-right`}>
                  Last 30 days
                </th>
              </tr>
            </thead>
            <tbody className={admin.tbody}>
              <CountRow label="Sent" a={loop.last7.sent} b={loop.last30.sent} />
              <CountRow label="Shared a project" a={loop.last7.shared} b={loop.last30.shared} />
              <CountRow label="Skipped" a={loop.last7.skipped} b={loop.last30.skipped} />
              {ordered.map(([reason, { label }]) => (
                <CountRow
                  key={reason}
                  label={label}
                  a={count(loop.last7, reason)}
                  b={count(loop.last30, reason)}
                  indent
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <p className={`mt-2 ${admin.hint}`}>Shared: they posted a project within 7 days after it was sent.</p>
    </div>
  );
}

function CountRow({ label, a, b, indent = false }: { label: string; a: number; b: number; indent?: boolean }) {
  const cell = indent ? admin.tdMuted : admin.td;
  return (
    <tr>
      <th scope="row" className={`${cell} text-left font-normal ${indent ? "pl-8" : ""}`}>
        {label}
      </th>
      <td className={`${cell} text-right tabular-nums`}>{a}</td>
      <td className={`${cell} text-right tabular-nums`}>{b}</td>
    </tr>
  );
}

// ——————————————————————————————————————————————————————————————
// What to paste into PostHog
// ——————————————————————————————————————————————————————————————

function PostHogSetup({ loopKey, webhookUrl }: { loopKey: string; webhookUrl: string | null }) {
  const body = nudgeWebhookBody(loopKey);
  return (
    <div className={`mt-6 ${admin.inset} p-4`}>
      <h3 className={admin.h3}>PostHog setup</h3>
      <dl className="mt-3 space-y-4">
        <SetupRow label="Method">
          <code className={admin.code}>POST</code>
        </SetupRow>
        <SetupRow label="URL" copy={webhookUrl}>
          {webhookUrl ? (
            <code className={`${admin.code} break-all`}>{webhookUrl}</code>
          ) : (
            <span className={admin.meta}>
              This page doesn't know the deployment. Use https://&lt;deployment&gt;.convex.site/api/nudges.
            </span>
          )}
        </SetupRow>
        <SetupRow label="Header">
          <code className={admin.code}>{NUDGE_SECRET_HEADER}</code>
          <p className={`mt-1.5 ${admin.hint}`}>
            Its value is {NUDGE_SECRET_ENV}, set on this deployment. It isn't shown here.
          </p>
        </SetupRow>
        <SetupRow label="Body" copy={body}>
          <pre className="overflow-x-auto rounded bg-[var(--app-surface-raised)] px-3 py-2 text-[13px] leading-relaxed text-[color:var(--app-text)]">
            {body}
          </pre>
        </SetupRow>
      </dl>
    </div>
  );
}

function SetupRow({ label, copy, children }: { label: string; copy?: string | null; children: ReactNode }) {
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <dt className="text-[12.5px] font-medium text-[color:var(--app-text-muted)]">{label}</dt>
        {copy && <CopyButton text={copy} label={label} />}
      </div>
      <dd className="mt-1.5">{children}</dd>
    </div>
  );
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1600);
    } catch {
      // No clipboard (an insecure page, a blocked permission): the text is on the page to select.
    }
  }

  return (
    <button type="button" onClick={copy} className={admin.btnRowSecondary} aria-label={`Copy ${label.toLowerCase()}`}>
      {copied ? "Copied" : "Copy"}
    </button>
  );
}
