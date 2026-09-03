// /communities/apply — the host application (docs/features/community-groups.md
// §0, §5 step 1). Anyone signed in can apply; hosting is free; an operator
// approves before the community is listed (applyToHost lands it "pending").

import { useState } from "react";
import type { FormEvent } from "react";
import { useConvexAuth, useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import { Link, useRouteError } from "react-router";
import { api } from "../../convex/_generated/api";
import {
  GardenErrorState,
  GardenLoading,
  GardenNav,
  GardenPage,
} from "../garden/ui";
import "../garden/garden.css";

export function meta() {
  return [
    { title: "Host a community — creatives.exchange" },
    { name: "robots", content: "noindex" },
  ];
}

export function ErrorBoundary() {
  useRouteError();
  return (
    <GardenPage>
      <GardenNav active="Communities" />
      <div style={{ marginTop: 28 }}>
        <GardenErrorState message="Applications aren't live yet — check back soon." />
      </div>
    </GardenPage>
  );
}

function reasonFor(err: unknown, fallback: string): string {
  if (err instanceof ConvexError) {
    const data = err.data as { reason?: string } | undefined;
    if (data?.reason) return data.reason;
  }
  return fallback;
}

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginTop: 16 }}>
      <label className="g-label" style={{ display: "block", marginBottom: 6 }}>
        {label}
        {required ? <span style={{ color: "var(--g-citron)" }}> *</span> : null}
      </label>
      {children}
      {hint ? (
        <p className="g-hint" style={{ marginTop: 5 }}>
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
      <div className="g-card" style={{ maxWidth: 520, marginTop: 24 }}>
        <span className="g-badge g-badge-line">Application in</span>
        <p style={{ marginTop: 12, fontSize: 15, lineHeight: 1.6 }}>
          We review every community by hand and reply within a week; new
          communities open around November.
        </p>
        <Link
          to={`/communities/${result.slug}`}
          className="g-btn g-btn-citron"
          style={{ marginTop: 16, display: "inline-block" }}
        >
          See your community page →
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} style={{ maxWidth: 520 }}>
      <Field label="Name" required>
        <input
          className="g-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Table Art Society"
        />
      </Field>
      <Field label="Tagline">
        <input
          className="g-input"
          value={tagline}
          onChange={(e) => setTagline(e.target.value)}
          placeholder="One line on what you're about"
        />
      </Field>
      <Field label="Location">
        <input
          className="g-input"
          value={locationLabel}
          onChange={(e) => setLocationLabel(e.target.value)}
          placeholder="San Diego, or wherever you gather"
        />
      </Field>
      <Field label="Website">
        <input
          className="g-input"
          value={websiteUrl}
          onChange={(e) => setWebsiteUrl(e.target.value)}
          placeholder="https://..."
        />
      </Field>
      <Field label="Description">
        <textarea
          className="g-input"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          style={{ resize: "vertical" }}
          placeholder="What this community is, and who it's for."
        />
      </Field>
      <Field
        label="What do you already gather? Who's in it now?"
        hint="Helps us review faster — an existing group, a mailing list, a room full of people already."
      >
        <textarea
          className="g-input"
          value={applicantNote}
          onChange={(e) => setApplicantNote(e.target.value)}
          rows={4}
          style={{ resize: "vertical" }}
        />
      </Field>
      <Field label="Join policy" required>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 4 }}>
          <label style={{ display: "flex", alignItems: "flex-start", gap: 10, fontSize: 14.5 }}>
            <input
              type="radio"
              name="joinPolicy"
              checked={joinPolicy === "open"}
              onChange={() => setJoinPolicy("open")}
              style={{ marginTop: 3 }}
            />
            <span>
              <b>Open</b> — anyone can join
            </span>
          </label>
          <label style={{ display: "flex", alignItems: "flex-start", gap: 10, fontSize: 14.5 }}>
            <input
              type="radio"
              name="joinPolicy"
              checked={joinPolicy === "apply"}
              onChange={() => setJoinPolicy("apply")}
              style={{ marginTop: 3 }}
            />
            <span>
              <b>Ask to join</b> — you approve people
            </span>
          </label>
        </div>
      </Field>

      <button
        className="g-btn g-btn-citron"
        type="submit"
        disabled={busy || !name.trim()}
        style={{ marginTop: 20 }}
      >
        {busy ? "Submitting…" : "Apply to host"}
      </button>
      {error && (
        <p style={{ marginTop: 12, fontSize: 14.5, color: "var(--g-body)" }}>{error}</p>
      )}
    </form>
  );
}

export default function CommunitiesApply() {
  const { isAuthenticated, isLoading } = useConvexAuth();

  return (
    <GardenPage>
      <GardenNav active="Communities" />

      <div style={{ marginTop: 28, maxWidth: "58ch" }}>
        <h1 className="g-h" style={{ fontSize: "clamp(28px,5vw,40px)" }}>
          Host your community
        </h1>
        <p style={{ marginTop: 12, fontSize: 15, lineHeight: 1.6 }}>
          Hosting is free. Anyone can apply — an operator reviews every
          application by hand, and new communities open around November.
          Once yours is approved, its tables, events, and projects live under
          its own page.
        </p>
      </div>

      <div style={{ marginTop: 24 }}>
        {isLoading ? (
          <GardenLoading />
        ) : !isAuthenticated ? (
          <div className="g-card" style={{ maxWidth: 460 }}>
            <p style={{ fontSize: 14.5, lineHeight: 1.6 }}>
              Sign in first, then come back here to apply.
            </p>
            <Link
              to="/login?redirect=/communities/apply"
              className="g-btn g-btn-citron"
              style={{ marginTop: 14, display: "inline-block" }}
            >
              Sign in to apply
            </Link>
          </div>
        ) : (
          <ApplyForm />
        )}
      </div>
    </GardenPage>
  );
}
