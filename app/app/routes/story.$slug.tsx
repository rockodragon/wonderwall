// /story/:slug — the public project story page (spec §1.7): photo hero,
// goal/raised bar for passion work, an updates timeline, and the credit
// block that makes fund allocations and covered seats visible on the work
// itself. Share-ready by design, but the actual OG tags come from the
// Cloudflare Pages Function (architect §5, ssr:false + ConvexHttpClient) —
// this is an SPA route with no loader, so it cannot set them itself. Not
// faking them here; see functions-spike for that piece.

import { useState } from "react";
import { useAction, useConvexAuth, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { useLocation, useNavigate, useParams, useRouteError, useSearchParams } from "react-router";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import {
  GardenErrorState,
  GardenLoading,
  GardenPage,
  SectionLabel,
  formatDate,
  formatMoney,
  formatPeriod,
  joinNames,
} from "../garden/ui";
import { RichContent } from "../components/RichContent";
import { CLAIMS } from "../constants/claims";
import { setPendingIntent } from "../lib/pendingIntent";
import "../garden/garden.css";

export function meta() {
  return [
    { title: "Story — The Garden" },
    { name: "robots", content: "noindex" },
  ];
}

export function ErrorBoundary() {
  useRouteError();
  return (
    <GardenPage>
      <div style={{ marginTop: 28 }}>
        <GardenErrorState message="This story isn't live yet — check back soon." />
      </div>
    </GardenPage>
  );
}

/** deriveSponsorLine (stories.ts) always yields "seat covered by {org}" — the
    org name is the citron part (g-credit's <b>), the rest is plain. */
function SponsorCredit({ line }: { line: string }) {
  const prefix = "seat covered by ";
  if (!line.startsWith(prefix)) {
    return <div className="g-credit">{line}</div>;
  }
  return (
    <div className="g-credit">
      {prefix}
      <b>{line.slice(prefix.length)}</b>
    </div>
  );
}

// ————— Support —————
//
// This page is where the QR code on stage lands (bead wonderwall-ke37), so
// it's the one place someone without an account can back a creative. It
// calls the same createBackingCheckout the signed-in Support modal does; a
// guest types a name (or stays anonymous) and Stripe collects the card and
// email. A guest gives once: monthly needs an account, so the backer can
// stop it from Settings (stripeHandlers.ts's guestBackingRefusal is the
// server's version of this rule). Money words follow stripe.ts:
// "back"/"support", never "donate".

const PRESETS_CENTS = [1000, 2500, 5000, 10000]; // $10 · $25 · $50 · $100
// Twin of MIN_BACKING_CENTS in convex/garden/stripeHandlers.ts. The server is
// the authority; this only catches an obvious miss before the round trip.
const MIN_CENTS = 500;

function reasonFor(err: unknown, fallback: string): string {
  if (err instanceof ConvexError) {
    const data = err.data as { reason?: string } | undefined;
    if (data?.reason) return data.reason;
  }
  return fallback;
}

type StoryBackers = { count: number; names: string[]; otherCount: number };

/** "Backed by Ana, Jo, and 3 others" — anonymous backers are only ever in
    the count. */
function backedByLine(backers: StoryBackers): string | null {
  if (backers.names.length === 0) return null;
  const others = backers.otherCount;
  const parts = others > 0 ? [...backers.names, `${others} ${others === 1 ? "other" : "others"}`] : backers.names;
  return `Backed by ${joinNames(parts)}`;
}

/** Two or more equal buttons where exactly one is on — once/monthly, and
    the preset amounts. */
function ChoiceButton({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className="g-btn g-btn-ghost"
      aria-pressed={on}
      onClick={onClick}
      style={{
        padding: "12px 0",
        width: "100%",
        textAlign: "center",
        ...(on ? { borderColor: "var(--g-citron)", color: "var(--g-citron)" } : {}),
      }}
    >
      {children}
    </button>
  );
}

const LINK_BUTTON: React.CSSProperties = {
  background: "none",
  border: "none",
  padding: 0,
  cursor: "pointer",
  textDecoration: "underline",
};

function SupportForm({ projectId, onCancel }: { projectId: Id<"projects">; onCancel: () => void }) {
  const { isAuthenticated } = useConvexAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const createBackingCheckout = useAction(api.garden.stripe.createBackingCheckout);

  const [monthlyChoice, setMonthly] = useState(false);
  // Only a member can give monthly; a guest who signs out mid-form drops
  // back to once rather than hitting the server's refusal.
  const monthly = isAuthenticated && monthlyChoice;
  const [preset, setPreset] = useState<number | null>(2500);
  const [otherDollars, setOtherDollars] = useState("");
  const [name, setName] = useState("");
  const [anonymous, setAnonymous] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const amountCents = preset ?? Math.round(parseFloat(otherDollars || "0") * 100);
  const amountReady = Number.isFinite(amountCents) && amountCents >= MIN_CENTS;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!amountReady) {
      setError(`The smallest amount is ${formatMoney(MIN_CENTS)}.`);
      return;
    }
    if (!isAuthenticated && !anonymous && !name.trim()) {
      setError("Add your name, or check the box to stay anonymous.");
      return;
    }
    setBusy(true);
    try {
      const { url } = await createBackingCheckout({
        projectId,
        amountCents,
        recurring: monthly,
        visible: !anonymous,
        from: "story",
        ...(!isAuthenticated && !anonymous ? { guestName: name.trim() } : {}),
      });
      // Leaving for Stripe. The button stays disabled through the handoff.
      window.location.assign(url);
    } catch (err) {
      setError(reasonFor(err, "Couldn't start checkout. Try again."));
      setBusy(false);
    }
  }

  const buttonAmount = amountReady ? `${formatMoney(amountCents)}${monthly ? " a month" : ""}` : "";

  return (
    <form onSubmit={handleSubmit} style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 14 }}>
      {isAuthenticated && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <ChoiceButton on={!monthly} onClick={() => setMonthly(false)}>Once</ChoiceButton>
          <ChoiceButton on={monthly} onClick={() => setMonthly(true)}>Monthly</ChoiceButton>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
        {PRESETS_CENTS.map((cents) => (
          <ChoiceButton
            key={cents}
            on={preset === cents}
            onClick={() => {
              setPreset(cents);
              setOtherDollars("");
            }}
          >
            {formatMoney(cents)}
          </ChoiceButton>
        ))}
      </div>
      <input
        className="g-input"
        value={otherDollars}
        onChange={(e) => {
          setOtherDollars(e.target.value);
          setPreset(null);
        }}
        onFocus={() => setPreset(null)}
        inputMode="decimal"
        placeholder="Other amount ($)"
        aria-label="Other amount in dollars"
        style={preset === null ? { borderColor: "var(--g-citron)" } : undefined}
      />

      {!isAuthenticated && !anonymous && (
        <input
          className="g-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="name"
          maxLength={60}
          placeholder="Your name, as it shows on this page"
          aria-label="Your name"
        />
      )}
      <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 15, color: "var(--g-body)", cursor: "pointer" }}>
        <input
          type="checkbox"
          checked={anonymous}
          onChange={(e) => setAnonymous(e.target.checked)}
          style={{ width: 18, height: 18, accentColor: "var(--g-citron)" }}
        />
        Keep my name off this page
      </label>

      <button
        type="submit"
        className="g-btn g-btn-citron"
        disabled={busy}
        style={{ width: "100%", opacity: busy ? 0.7 : 1 }}
      >
        {busy ? "Opening checkout…" : buttonAmount ? `Continue · ${buttonAmount}` : "Continue"}
      </button>
      {error && (
        <p role="alert" style={{ fontSize: 15, color: "var(--g-paper)" }}>
          {error}
        </p>
      )}
      <p className="g-hint" style={{ lineHeight: 1.5 }}>
        {CLAIMS.patron} {formatMoney(MIN_CENTS)} minimum.
        {monthly ? " Monthly renews until you cancel." : ""} You pay on the next screen.
      </p>
      {!isAuthenticated && (
        <p className="g-hint" style={{ lineHeight: 1.5 }}>
          Giving monthly needs an account.{" "}
          <button
            type="button"
            onClick={() => {
              // Back to this story after signing in, where Monthly is on.
              setPendingIntent(location.pathname);
              navigate("/login");
            }}
            style={{ ...LINK_BUTTON, font: "inherit", color: "var(--g-paper)" }}
          >
            Sign in
          </button>
        </p>
      )}
      <button type="button" onClick={onCancel} className="g-hint" style={{ ...LINK_BUTTON, alignSelf: "flex-start" }}>
        Not now
      </button>
    </form>
  );
}

/** The money block near the top of the story: what's been raised, who
    backed it, and the Support button. Everything past the button opens only
    when it's pressed. */
function SupportCard({
  projectId,
  acceptingSupport,
  raisedCents,
  goalCents,
  backers,
  justBacked,
}: {
  projectId: Id<"projects">;
  acceptingSupport: boolean;
  raisedCents: number;
  goalCents: number | null;
  backers: StoryBackers;
  justBacked: boolean;
}) {
  const [open, setOpen] = useState(false);
  const byLine = backedByLine(backers);
  const backerCount = `${backers.count} ${backers.count === 1 ? "backer" : "backers"}`;

  if (!acceptingSupport && raisedCents === 0 && backers.count === 0) return null;

  return (
    <section className="g-card" style={{ marginTop: 24, padding: "18px 16px" }} aria-label="Support this project">
      {justBacked && (
        <p style={{ fontSize: 15, color: "var(--g-paper)", marginBottom: 14 }} role="status">
          <span className="g-accent">Thank you.</span> The total here updates once your payment clears.
        </p>
      )}

      {goalCents !== null ? (
        <>
          <SectionLabel>Goal</SectionLabel>
          <div
            style={{
              marginTop: 8,
              height: 6,
              borderRadius: 3,
              background: "var(--g-hairline)",
              overflow: "hidden",
              position: "relative",
            }}
          >
            <div
              style={{
                position: "absolute",
                inset: 0,
                width: `${Math.min(100, (raisedCents / goalCents) * 100)}%`,
                background: "var(--g-paper)",
                borderRight: "2px solid var(--g-citron)",
              }}
            />
          </div>
          <p style={{ marginTop: 8, fontSize: 15, color: "var(--g-paper)" }}>
            {formatMoney(raisedCents)} of {formatMoney(goalCents)}
            {backers.count > 0 && <span style={{ color: "var(--g-body)" }}> · {backerCount}</span>}
          </p>
        </>
      ) : raisedCents > 0 || backers.count > 0 ? (
        <p style={{ fontSize: 15, color: "var(--g-body)" }}>
          <span style={{ fontSize: 22, color: "var(--g-paper)", fontWeight: 600 }}>{formatMoney(raisedCents)}</span>{" "}
          raised{backers.count > 0 ? ` · ${backerCount}` : ""}
        </p>
      ) : (
        <p style={{ fontSize: 15, color: "var(--g-body)" }}>Be the first to back this.</p>
      )}

      {byLine && (
        <p style={{ marginTop: 6, fontSize: 14.5, lineHeight: 1.5, color: "var(--g-body)" }}>{byLine}</p>
      )}

      {acceptingSupport &&
        (open ? (
          <SupportForm projectId={projectId} onCancel={() => setOpen(false)} />
        ) : (
          <button
            type="button"
            className="g-btn g-btn-citron"
            onClick={() => setOpen(true)}
            style={{ marginTop: 14, width: "100%" }}
          >
            Support
          </button>
        ))}
    </section>
  );
}

export default function StoryPage() {
  const { slug } = useParams();
  const [searchParams] = useSearchParams();
  const data = useQuery(
    api.garden.stories.getStoryPage,
    slug ? { storySlug: slug } : "skip",
  );

  if (data === undefined) {
    return (
      <GardenPage>
          <div style={{ marginTop: 28 }}>
          <GardenLoading />
        </div>
      </GardenPage>
    );
  }

  if (data === null) {
    return (
      <GardenPage>
          <div style={{ marginTop: 28 }}>
          <GardenErrorState message="Check the link — this story isn't set up here." />
        </div>
      </GardenPage>
    );
  }

  const { project, updates, credits, backers } = data;
  const hasProgress = project.kind === "passion" && project.goal !== undefined && project.goal > 0;
  const raisedCents = project.raisedCents ?? 0;
  const goalCents = (project.goal ?? 0) * 100;

  return (
    <GardenPage>

      {project.photoUrl && (
        <img
          src={project.photoUrl}
          alt={project.title}
          style={{
            width: "100%",
            height: 280,
            objectFit: "cover",
            borderRadius: 8,
            display: "block",
            marginTop: 20,
            filter: "saturate(0.85)",
          }}
        />
      )}

      <div style={{ marginTop: project.photoUrl ? 20 : 28 }}>
        <h1 className="g-h" style={{ fontSize: "clamp(28px,5vw,40px)" }}>
          {project.title}
        </h1>
        {project.byName && (
          <div className="g-credit" style={{ marginTop: 10 }}>
            {project.byName}
          </div>
        )}
        {project.blurb && (
          <p style={{ marginTop: 16, fontSize: 15, lineHeight: 1.6, maxWidth: "62ch" }}>
            {project.blurb}
          </p>
        )}
        <SupportCard
          projectId={project.id}
          acceptingSupport={project.acceptingSupport}
          raisedCents={raisedCents}
          goalCents={hasProgress ? goalCents : null}
          backers={backers}
          justBacked={searchParams.get("backed") === "1"}
        />
        {/* The full page the creator composed on /projects/:id — the blurb
            above stays the lede (docs/features/rich-project-content.md §2). */}
        {project.body?.length ? (
          <div style={{ marginTop: 20, maxWidth: "62ch" }}>
            <RichContent blocks={project.body} />
          </div>
        ) : null}
      </div>

      <div style={{ marginTop: 32 }}>
        <SectionLabel>Updates</SectionLabel>
        {updates.length === 0 ? (
          <p style={{ marginTop: 12, fontSize: 14.5 }}>
            No updates posted yet.
          </p>
        ) : (
          <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 0 }}>
            {updates.map((u, i) => (
              <div
                key={`${u.createdAt}-${i}`}
                style={{
                  padding: "14px 0",
                  borderBottom: "1px solid var(--g-hairline)",
                }}
              >
                <span className="g-mono" style={{ fontSize: 12.5, color: "var(--g-dim)" }}>
                  {formatDate(u.createdAt)}
                  {u.editedAt ? " · edited" : ""}
                </span>
                {u.bodyDoc?.length ? (
                  <div style={{ marginTop: 8, maxWidth: "62ch" }}>
                    <RichContent blocks={u.bodyDoc} />
                  </div>
                ) : (
                  u.body && (
                    <p style={{ marginTop: 6, fontSize: 14.5, lineHeight: 1.55, whiteSpace: "pre-wrap" }}>
                      {u.body}
                    </p>
                  )
                )}
                {/* The original single-link media field, still on older rows. */}
                {u.mediaUrl && !u.bodyDoc?.length && (
                  <a
                    href={u.mediaUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ fontSize: 14.5, color: "var(--g-citron)", marginTop: 6, display: "inline-block" }}
                  >
                    View media →
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {(credits.allocations.length > 0 || credits.sponsorLine) && (
        <div style={{ marginTop: 32 }}>
          <SectionLabel>Credits</SectionLabel>
          <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
            {credits.allocations.map((c, i) => (
              <div className="g-credit" key={`${c.orgName}-${i}`}>
                <b>Grant Fund</b> — ${c.amount.toLocaleString()} · {formatPeriod(c.period)} ·
                administered by {c.orgName}
              </div>
            ))}
            {credits.sponsorLine && <SponsorCredit line={credits.sponsorLine} />}
          </div>
        </div>
      )}
    </GardenPage>
  );
}
