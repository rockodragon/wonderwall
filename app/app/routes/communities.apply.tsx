// /communities/apply — the host application (docs/features/community-groups.md
// §0, §5 step 1; docs/features/community-ux.md §5). Signed in: the existing
// application form, unchanged logic — hosting is free, an operator approves
// before the community is listed. Signed out: intro copy, a "Sign in to
// apply" button, and the lightweight interest capture from community-ux.md
// §5 — a pre-account visitor can leave their email and get emailed when
// applications open to them, via the existing waitlist flow
// (addToWaitlist + answerWaitlistQuestions({ interestedInHosting: true })).
// This never touches applyToHost's pending hostOrgs row — the waitlist stays
// the separate, pre-account funnel it already is.

import { useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { useConvexAuth, useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import { Link, useRouteError } from "react-router";
import { api } from "../../convex/_generated/api";

export function meta() {
  return [
    { title: "Host a community — creatives.exchange" },
    { name: "robots", content: "noindex" },
  ];
}

export function ErrorBoundary() {
  useRouteError();
  return (
    <PageShell>
      <p className="text-sm" style={{ color: "var(--garden-dim)" }}>
        Applications aren't live yet — check back soon.
      </p>
    </PageShell>
  );
}

function reasonFor(err: unknown, fallback: string): string {
  if (err instanceof ConvexError) {
    const data = err.data as { reason?: string } | undefined;
    if (data?.reason) return data.reason;
  }
  return fallback;
}

// ————— Shared shell + style bits (same tokens as projects.tsx/offerings.tsx) —————

function PageShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[var(--garden-ink)]">
      <link rel="stylesheet" href="/tokens.css" />
      <link rel="stylesheet" href="/about/fonts/fonts.css" />
      <div className="p-4 sm:p-6 max-w-2xl mx-auto">{children}</div>
    </div>
  );
}

const cardStyle = { borderColor: "var(--garden-hairline)", backgroundColor: "var(--garden-ink-raised)" };
const inputClass = "w-full px-3 py-2 rounded-lg border text-sm outline-none";
const inputStyle = { backgroundColor: "var(--garden-ink)", borderColor: "var(--garden-hairline-raised)", color: "var(--garden-paper)" };
const labelClass = "block text-xs uppercase tracking-[0.06em] mb-1.5";
const labelStyle = { color: "var(--garden-dim)" };
const btnPrimaryClass = "px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50 transition-opacity hover:opacity-90";
const btnPrimaryStyle = { backgroundColor: "var(--garden-citron)", color: "var(--garden-ink)" };

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="mt-4">
      <label className={labelClass} style={labelStyle}>
        {label}
        {required ? <span style={{ color: "var(--garden-citron)" }}> *</span> : null}
      </label>
      {children}
      {hint ? (
        <p className="text-xs mt-1.5" style={{ color: "var(--garden-dim)" }}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function ApplyForm() {
  const applyToHost = useMutation(api.garden.communities.applyToHost);
  const [name, setName] = useState("");
  const [tagline, setTagline] = useState("");
  const [locationLabel, setLocationLabel] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [description, setDescription] = useState("");
  const [applicantNote, setApplicantNote] = useState("");
  const [joinPolicy, setJoinPolicy] = useState<"open" | "apply">("open");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ slug: string } | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await applyToHost({
        name,
        tagline: tagline.trim() || undefined,
        description: description.trim() || undefined,
        websiteUrl: websiteUrl.trim() || undefined,
        locationLabel: locationLabel.trim() || undefined,
        applicantNote: applicantNote.trim() || undefined,
        joinPolicy,
      });
      setResult({ slug: res.slug });
    } catch (err) {
      setError(reasonFor(err, "Couldn't submit the application — try again."));
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    return (
      <div className="rounded-2xl border p-5 mt-6" style={cardStyle}>
        <span
          className="inline-block px-2.5 py-1 rounded-full text-[11px] font-medium uppercase tracking-[0.06em]"
          style={{ backgroundColor: "rgba(198,198,190,0.1)", color: "var(--garden-muted)", fontFamily: "var(--garden-font-mono)" }}
        >
          Application in
        </span>
        <p className="mt-3 text-[15px] leading-relaxed" style={{ color: "var(--garden-body)" }}>
          We review every community by hand and reply within a week; new
          communities open around November.
        </p>
        <Link to={`/communities/${result.slug}`} className={`${btnPrimaryClass} inline-block mt-4`} style={btnPrimaryStyle}>
          See your community page →
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="mt-6">
      <Field label="Name" required>
        <input className={inputClass} style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder="Table Art Society" />
      </Field>
      <Field label="Tagline">
        <input className={inputClass} style={inputStyle} value={tagline} onChange={(e) => setTagline(e.target.value)} placeholder="One line on what you're about" />
      </Field>
      <Field label="Location">
        <input className={inputClass} style={inputStyle} value={locationLabel} onChange={(e) => setLocationLabel(e.target.value)} placeholder="San Diego, or wherever you gather" />
      </Field>
      <Field label="Website">
        <input className={inputClass} style={inputStyle} value={websiteUrl} onChange={(e) => setWebsiteUrl(e.target.value)} placeholder="https://..." />
      </Field>
      <Field label="Description">
        <textarea
          className={`${inputClass} resize-y`}
          style={inputStyle}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          placeholder="What this community is, and who it's for."
        />
      </Field>
      <Field
        label="What do you already gather? Who's in it now?"
        hint="Helps us review faster — an existing group, a mailing list, a room full of people already."
      >
        <textarea
          className={`${inputClass} resize-y`}
          style={inputStyle}
          value={applicantNote}
          onChange={(e) => setApplicantNote(e.target.value)}
          rows={4}
        />
      </Field>
      <Field label="Join policy" required>
        <div className="flex flex-col gap-2.5 mt-1">
          <label className="flex items-start gap-2.5 text-sm" style={{ color: "var(--garden-body)" }}>
            <input type="radio" name="joinPolicy" checked={joinPolicy === "open"} onChange={() => setJoinPolicy("open")} className="mt-1" />
            <span><b>Open</b> — anyone can join</span>
          </label>
          <label className="flex items-start gap-2.5 text-sm" style={{ color: "var(--garden-body)" }}>
            <input type="radio" name="joinPolicy" checked={joinPolicy === "apply"} onChange={() => setJoinPolicy("apply")} className="mt-1" />
            <span><b>Ask to join</b> — you approve people</span>
          </label>
        </div>
      </Field>

      <button className={btnPrimaryClass} style={{ ...btnPrimaryStyle, marginTop: 20 }} type="submit" disabled={busy || !name.trim()}>
        {busy ? "Submitting…" : "Apply to host"}
      </button>
      {error && <p className="mt-3 text-sm" style={{ color: "var(--garden-body)" }}>{error}</p>}
    </form>
  );
}

// ————— Signed-out: lightweight pre-account interest capture (§5) —————

function HostInterestForm() {
  const addToWaitlist = useMutation(api.waitlist.addToWaitlist);
  const answerWaitlistQuestions = useMutation(api.waitlist.answerWaitlistQuestions);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ alreadyOnList: boolean } | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) {
      setError("Enter your email.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      // addToWaitlist keys on email, is idempotent for an existing address,
      // and returns a "you're already on the waitlist" message rather than
      // an error — answerWaitlistQuestions then keys on that same email to
      // set interestedInHosting, whether the row is brand new or not.
      const result = await addToWaitlist({ email: trimmed });
      await answerWaitlistQuestions({ email: trimmed, interestedInHosting: true });
      setDone({ alreadyOnList: result.message.toLowerCase().includes("already") });
    } catch {
      setError("Couldn't save that — try again.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="rounded-2xl border p-4 max-w-md" style={cardStyle}>
        <p className="text-sm leading-relaxed" style={{ color: "var(--garden-body)" }}>
          {done.alreadyOnList
            ? "You're already on the list — we've noted you're interested in hosting, and we'll email you when applications open to you."
            : "Thanks — we'll email you when applications open to you."}
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="max-w-md">
      <label className={labelClass} style={labelStyle}>Email</label>
      <div className="flex gap-2 flex-wrap">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className={inputClass}
          style={{ ...inputStyle, flex: 1, minWidth: 200 }}
        />
        <button type="submit" disabled={busy} className={btnPrimaryClass} style={btnPrimaryStyle}>
          {busy ? "Saving…" : "Notify me"}
        </button>
      </div>
      {error && <p className="mt-2 text-sm" style={{ color: "var(--garden-body)" }}>{error}</p>}
    </form>
  );
}

export default function CommunitiesApply() {
  const { isAuthenticated, isLoading } = useConvexAuth();

  return (
    <PageShell>
      <h1
        className="text-2xl sm:text-3xl font-semibold max-w-[58ch]"
        style={{ color: "var(--garden-paper)", fontFamily: "var(--garden-font-display)" }}
      >
        Host your community
      </h1>
      <p className="mt-3 text-[15px] leading-relaxed max-w-[58ch]" style={{ color: "var(--garden-body)" }}>
        Hosting is free. Anyone can apply — an operator reviews every
        application by hand, and new communities open around November.
        Once yours is approved, its tables, events, and projects live under
        its own page.
      </p>

      {isLoading ? (
        <div className="mt-6"><p className="text-sm" style={{ color: "var(--garden-dim)" }}>Loading…</p></div>
      ) : !isAuthenticated ? (
        <>
          <div className="rounded-2xl border p-5 mt-6 max-w-md" style={cardStyle}>
            <p className="text-sm leading-relaxed" style={{ color: "var(--garden-body)" }}>
              Sign in first, then come back here to apply.
            </p>
            <Link to="/login?redirect=/communities/apply" className={`${btnPrimaryClass} inline-block mt-3.5`} style={btnPrimaryStyle}>
              Sign in to apply
            </Link>
          </div>

          <div className="mt-8 max-w-md">
            <div className="text-sm font-semibold mb-1" style={{ color: "var(--garden-paper)" }}>
              Not ready for an account?
            </div>
            <p className="text-sm mb-3" style={{ color: "var(--garden-dim)" }}>
              Tell us you're interested and we'll email you when applications open to you.
            </p>
            <HostInterestForm />
          </div>
        </>
      ) : (
        <ApplyForm />
      )}
    </PageShell>
  );
}
