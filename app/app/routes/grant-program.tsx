// /grant-program — the public grant program page: what the funds are, how
// grants are decided, how to give, and the transparent ledger. Replaces the
// unregistered /grant-fund route and the AP-specific /fund/abiding-practice
// as the primary entry point. Prerendered (react-router.config.ts), so an
// outside reader — a city arts director, a treasurer — sees it logged out.
//
// Everything in "How it works" is checked against the code, not the pitch:
//   - dues split 50/50 into the PLATFORM pool row ("creatives-exchange"),
//     one-time contributions 90/10 (garden/stripeHandlers.ts duesSplit /
//     contributionSplit); Abiding Practice's 501(c)(3) fund is off-platform
//     (fund.$slug.tsx header, hostOrgs kind "org"/"church").
//   - proposals: garden/grantProposals.ts submitProposal (paid members,
//     one open ask per fund, MIN_AMOUNT_CENTS = $5); decideProposal is
//     operator-only and records a decision, never a payout.
//   - payouts: garden/allocations.ts recordAllocation (admin), every row
//     public on /fund/:slug and here.
//   - NOT built: cycles/deadlines, published criteria, conflict-of-interest
//     policy, community-run selection, percent-of-dues pledges. Say so.
// If one of those changes, change the copy in the same PR.
//
// Money words: this page's Give button is the 501(c)(3) lane, so "donate" /
// "gift" / "tax-deductible" are correct THERE. The platform project pool is
// "fund" / "back" / "contribute" only (money-words rule, fund.$slug.tsx).
//
// "By the numbers" reads api.garden.stats.publicCounts (public, aggregates
// only). It renders em-dash tiles while loading so the layout is stable.
// The "By city" row under it reads counts.cities / counts.withoutLocation
// (top cities, privacy floor applied server-side).
//
// Render order: the shell, h1, intro, numbers, city row, the two-lane cards,
// "How it works" and the FAQ render immediately — so the prerendered HTML
// and the first client paint are the page, not a spinner. Only the
// fund-specific parts (give CTA / thank-you, Totals, Ledger) wait on
// api.garden.allocations.getFundPage, and they show a compact inline
// loading state (or the "isn't live yet" card when the fund is unknown).
//
// Giving modal: collects amount + one-time/monthly, then redirects to the
// org's own Stripe Payment Link (AP stays merchant of record for tax
// deductibility). Two links stored on the hostOrg: paymentLinkUrl (one-time)
// and monthlyPaymentLinkUrl (recurring).

import { useState } from "react";
import type { ReactNode } from "react";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { Link, useSearchParams } from "react-router";
import { api } from "../../convex/_generated/api";
import {
  GardenPage,
  GardenLoading,
  SectionLabel,
  formatMoney,
  formatPeriod,
} from "../garden/ui";
import "../garden/garden.css";

const AP_SLUG = "abiding-practice";
const PRESET_AMOUNTS_CENTS = [1000, 2500, 5000, 10000];

export function meta() {
  return [
    { title: "Grant Program — creatives.exchange" },
    {
      name: "description",
      content:
        "How grants work on creatives.exchange: a platform project pool, community funds, who can propose, who decides, and a public ledger of every award. The Garden's fund is administered by Abiding Practice, a 501(c)(3).",
    },
  ];
}

// Shape of api.garden.stats.publicCounts, derived from the query so the
// strip can't drift from convex/garden/stats.ts.
type PublicCounts = FunctionReturnType<typeof api.garden.stats.publicCounts>;

const PLACEHOLDER = "—";

function NumberTile({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="g-cell">
      <div
        className="g-cell-v"
        style={{ fontVariantNumeric: "tabular-nums" }}
      >
        {value}
      </div>
      <div
        className="g-label g-mono"
        style={{ marginTop: 4, fontSize: 11, letterSpacing: "0.06em" }}
      >
        {label}
      </div>
      {sub && (
        <div
          className="g-mono"
          style={{
            marginTop: 2,
            fontSize: 11,
            color: "var(--g-dim)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {sub}
        </div>
      )}
    </div>
  );
}

/** Six aggregate tiles. Zeros are shown honestly; only the placeholder
 * differs between loading and loaded. */
function NumbersStrip({ counts }: { counts: PublicCounts | undefined }) {
  const n = (v: number | undefined) =>
    v === undefined ? PLACEHOLDER : v.toLocaleString("en-US");
  const money = (v: number | undefined) =>
    v === undefined ? PLACEHOLDER : formatMoney(v);

  const grantsSub =
    counts === undefined
      ? undefined
      : counts.grantsAwarded === 0
        ? "0 · first awards pending"
        : `${counts.grantsAwarded.toLocaleString("en-US")} ${
            counts.grantsAwarded === 1 ? "grant" : "grants"
          }`;

  return (
    <div style={{ marginTop: 40 }}>
      <SectionLabel>By the numbers</SectionLabel>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))",
          gap: 10,
          marginTop: 10,
        }}
      >
        <NumberTile label="Creatives" value={n(counts?.creatives)} />
        <NumberTile label="Communities" value={n(counts?.communities)} />
        <NumberTile label="Active projects" value={n(counts?.activeProjects)} />
        <NumberTile
          label="Paid opportunities"
          value={n(counts?.paidOpportunities)}
        />
        <NumberTile label="Backed directly" value={money(counts?.backedCents)} />
        <NumberTile
          label="Grants awarded"
          value={money(counts?.grantsAwardedCents)}
          sub={grantsSub}
        />
      </div>
      <p className="g-hint" style={{ marginTop: 8 }}>
        Live counts across the whole platform. Grants awarded includes every
        fund; the ledger below is one fund's.
      </p>
    </div>
  );
}

/** "Where" row: one quiet chip per city, from publicCounts.cities (top
 * cities, privacy floor applied server-side). Defensive against the field
 * being absent so the row never throws. */
function CitiesRow({ counts }: { counts: PublicCounts | undefined }) {
  const cities = counts?.cities ?? [];
  const withoutLocation = counts?.withoutLocation?.creatives ?? 0;
  const plural = (n: number, one: string, many: string) =>
    `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

  return (
    <div style={{ marginTop: 20 }}>
      <div
        className="g-label g-mono"
        style={{ fontSize: 11, letterSpacing: "0.06em" }}
      >
        By city
      </div>
      {cities.length === 0 ? (
        <p className="g-hint" style={{ marginTop: 8 }}>
          Locations appear here as members add a city to their profile.
        </p>
      ) : (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
            marginTop: 10,
          }}
        >
          {cities.map((c) => (
            <span
              key={c.label}
              style={{
                display: "inline-flex",
                alignItems: "baseline",
                gap: 8,
                padding: "5px 11px",
                border: "1px solid var(--g-hairline)",
                borderRadius: 999,
                fontSize: 13,
                color: "var(--g-paper)",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {c.label}
              <span
                className="g-mono"
                style={{ fontSize: 11.5, color: "var(--g-dim)" }}
              >
                {plural(c.creatives, "creative", "creatives")}
                {c.projects > 0 &&
                  ` · ${plural(c.projects, "project", "projects")}`}
              </span>
            </span>
          ))}
        </div>
      )}
      {withoutLocation > 0 && (
        <p
          className="g-mono"
          style={{
            marginTop: 8,
            fontSize: 11.5,
            color: "var(--g-dim)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {withoutLocation.toLocaleString("en-US")} without a location set.
        </p>
      )}
    </div>
  );
}

function HowItem({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h3
        style={{
          fontSize: 15,
          fontWeight: 600,
          color: "var(--g-paper)",
          marginBottom: 4,
        }}
      >
        {title}
      </h3>
      <p style={{ fontSize: 14.5, lineHeight: 1.55, color: "var(--g-body)", maxWidth: "62ch" }}>
        {children}
      </p>
    </div>
  );
}

function GiveModal({
  oneTimeUrl,
  monthlyUrl,
  orgName,
  onClose,
}: {
  oneTimeUrl: string | undefined;
  monthlyUrl: string | undefined;
  orgName: string;
  onClose: () => void;
}) {
  const [amountChoice, setAmountChoice] = useState<number | "custom">(2500);
  const [customDollars, setCustomDollars] = useState("");
  const [cadence, setCadence] = useState<"once" | "monthly">(
    monthlyUrl ? "monthly" : "once",
  );

  const amountCents =
    amountChoice === "custom"
      ? Math.round(parseFloat(customDollars || "0") * 100)
      : amountChoice;
  const amountValid = Number.isFinite(amountCents) && amountCents >= 500;

  const targetUrl = cadence === "monthly" ? monthlyUrl : oneTimeUrl;

  function handleContinue() {
    if (!targetUrl || !amountValid) return;
    window.open(targetUrl, "_blank", "noopener");
  }

  return (
    <div
      className="g-modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "rgba(0,0,0,0.7)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        padding: 16,
      }}
    >
      <div
        className="g-card"
        style={{
          width: "100%",
          maxWidth: 420,
          position: "relative",
          backgroundColor: "var(--garden-ink-raised, #1a1a1a)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          style={{
            position: "absolute",
            top: 12,
            right: 14,
            background: "none",
            border: "none",
            color: "var(--g-dim)",
            fontSize: 20,
            cursor: "pointer",
            lineHeight: 1,
          }}
        >
          ×
        </button>

        <div className="g-label" style={{ color: "var(--g-citron)" }}>
          Give to the Grant Fund
        </div>
        <p style={{ marginTop: 8, fontSize: 14, color: "var(--g-body)" }}>
          Your gift goes to {orgName}, a 501(c)(3). Tax-deductible — you'll
          receive a receipt.
        </p>

        {/* Cadence toggle */}
        {oneTimeUrl && monthlyUrl && (
          <div
            style={{
              display: "flex",
              gap: 0,
              marginTop: 16,
              border: "1px solid var(--g-hairline)",
              borderRadius: 8,
              overflow: "hidden",
            }}
          >
            {(["monthly", "once"] as const).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCadence(c)}
                style={{
                  flex: 1,
                  padding: "9px 0",
                  fontSize: 13,
                  fontWeight: 600,
                  border: "none",
                  cursor: "pointer",
                  backgroundColor:
                    cadence === c ? "var(--g-citron)" : "transparent",
                  color:
                    cadence === c
                      ? "var(--g-ink, #121212)"
                      : "var(--g-body)",
                  transition: "background-color 0.15s, color 0.15s",
                }}
              >
                {c === "monthly" ? "Monthly" : "One-time"}
              </button>
            ))}
          </div>
        )}

        {/* Amount presets */}
        <div
          style={{
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            marginTop: 16,
          }}
        >
          {PRESET_AMOUNTS_CENTS.map((cents) => (
            <button
              key={cents}
              type="button"
              className="g-btn g-btn-ghost"
              onClick={() => setAmountChoice(cents)}
              style={
                amountChoice === cents
                  ? {
                      borderColor: "var(--g-citron)",
                      color: "var(--g-citron)",
                    }
                  : undefined
              }
            >
              {formatMoney(cents)}
            </button>
          ))}
          <button
            type="button"
            className="g-btn g-btn-ghost"
            onClick={() => setAmountChoice("custom")}
            style={
              amountChoice === "custom"
                ? {
                    borderColor: "var(--g-citron)",
                    color: "var(--g-citron)",
                  }
                : undefined
            }
          >
            Other
          </button>
        </div>

        {amountChoice === "custom" && (
          <div style={{ marginTop: 10, position: "relative" }}>
            <span
              style={{
                position: "absolute",
                left: 12,
                top: "50%",
                transform: "translateY(-50%)",
                color: "var(--g-dim)",
                fontSize: 15,
                pointerEvents: "none",
              }}
            >
              $
            </span>
            <input
              className="g-input"
              value={customDollars}
              onChange={(e) => setCustomDollars(e.target.value)}
              inputMode="decimal"
              placeholder="Amount"
              autoFocus
              style={{ paddingLeft: 26, maxWidth: 180 }}
            />
          </div>
        )}

        <button
          type="button"
          className="g-btn g-btn-citron"
          onClick={handleContinue}
          disabled={!targetUrl || !amountValid}
          style={{ marginTop: 18, display: "block", width: "100%" }}
        >
          {cadence === "monthly"
            ? `Donate ${amountValid ? formatMoney(amountCents) : ""}/month`
            : `Donate ${amountValid ? formatMoney(amountCents) : ""}`}
        </button>

        {!targetUrl && (
          <p
            style={{
              marginTop: 10,
              fontSize: 13,
              color: "var(--g-dim)",
              textAlign: "center",
            }}
          >
            {cadence === "monthly" ? "Monthly" : "One-time"} giving isn't set up
            yet — check back soon.
          </p>
        )}

        <p className="g-hint" style={{ marginTop: 10, textAlign: "center" }}>
          Secure payment through {orgName}'s Stripe page.
        </p>
      </div>
    </div>
  );
}

type FundData = NonNullable<
  FunctionReturnType<typeof api.garden.allocations.getFundPage>
>;

/** The one "unknown fund / backend not deployed" state, scoped to the fund
 * section so the rest of the explainer still reads. Same copy as before,
 * without a second h1 on the page. */
function FundNotLive() {
  return (
    <div className="g-card" style={{ marginTop: 12, maxWidth: "50ch" }}>
      <div className="g-label">This fund isn't live yet.</div>
      <p style={{ marginTop: 8, fontSize: 14.5, color: "var(--g-body)" }}>
        The grant program page isn't live yet — check back soon.
      </p>
    </div>
  );
}

/** Give CTA (or the post-Stripe thank-you) plus the tax-deductible hint.
 * Needs the org name and payment links, so it waits on fund data. */
function GiveBlock({
  data,
  gaveThanks,
  onGive,
}: {
  data: FundData | null | undefined;
  gaveThanks: boolean;
  onGive: () => void;
}) {
  if (data === undefined) {
    return (
      <div style={{ marginTop: 20 }}>
        <GardenLoading label="Loading fund…" />
      </div>
    );
  }
  if (data === null) return null;

  const { org } = data;
  const oneTimeUrl = org.paymentLinkUrl ?? org.givingUrl;
  const monthlyUrl = org.monthlyPaymentLinkUrl;

  return (
    <>
      {/* Thank-you card after returning from Stripe */}
      {gaveThanks && (
        <div
          className="g-card"
          style={{
            marginTop: 20,
            borderColor: "var(--g-citron)",
            maxWidth: "50ch",
          }}
        >
          <div className="g-label" style={{ color: "var(--g-citron)" }}>
            Thank you
          </div>
          <p style={{ marginTop: 8, fontSize: 15 }}>
            Your gift goes to {org.name}. Your receipt comes from them.
            Grants from the fund are published on this page.
          </p>
        </div>
      )}

      {/* Give CTA */}
      {!gaveThanks && (oneTimeUrl || monthlyUrl) && (
        <button
          type="button"
          className="g-btn g-btn-citron"
          onClick={onGive}
          style={{ marginTop: 20 }}
        >
          Give to the Grant Fund
        </button>
      )}
      <p className="g-hint" style={{ marginTop: 10, maxWidth: "50ch" }}>
        Gifts go to {org.name}, a nonprofit. Your donation is tax-deductible
        and your receipt comes from them.
      </p>
    </>
  );
}

/** Totals + Ledger for the fund. Waits on fund data with a compact inline
 * state; the section labels stay put so the layout doesn't jump. */
function FundLedger({ data }: { data: FundData | null | undefined }) {
  if (data === undefined) {
    return (
      <div style={{ marginTop: 36 }}>
        <SectionLabel>Ledger</SectionLabel>
        <div style={{ marginTop: 12 }}>
          <GardenLoading label="Loading ledger…" />
        </div>
      </div>
    );
  }
  if (data === null) {
    return (
      <div style={{ marginTop: 36 }}>
        <SectionLabel>Ledger</SectionLabel>
        <FundNotLive />
      </div>
    );
  }

  const { totals, ledger } = data;

  return (
    <>
      {/* Totals */}
      <div style={{ marginTop: 36 }}>
        <SectionLabel>Totals</SectionLabel>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))",
            gap: 10,
            marginTop: 10,
          }}
        >
          <div className="g-cell g-cell-hot">
            <div className="g-cell-v">{formatMoney(totals.allTimeCents)}</div>
            <div className="g-label" style={{ marginTop: 4 }}>
              Granted all-time
            </div>
          </div>
          {totals.byPeriod.map((p) => (
            <div className="g-cell" key={p.period}>
              <div className="g-cell-v">{formatMoney(p.cents)}</div>
              <div className="g-label" style={{ marginTop: 4 }}>
                {formatPeriod(p.period)}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Ledger */}
      <div style={{ marginTop: 36 }}>
        <SectionLabel>Ledger</SectionLabel>
        {ledger.length === 0 ? (
          <p
            style={{
              marginTop: 12,
              fontSize: 14.5,
              maxWidth: "50ch",
              color: "var(--g-body)",
            }}
          >
            No grants awarded yet. The first awards come out of the balance
            above and are published here the week they go out.
          </p>
        ) : (
          <div
            style={{
              marginTop: 12,
              display: "flex",
              flexDirection: "column",
            }}
          >
            {ledger.map((entry, i) => (
              <div
                key={`${entry.period}-${entry.recipientName}-${i}`}
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  alignItems: "baseline",
                  gap: 12,
                  padding: "14px 0",
                  borderBottom: "1px solid var(--g-hairline)",
                }}
              >
                <span
                  className="g-mono"
                  style={{
                    fontSize: 12.5,
                    color: "var(--g-dim)",
                    minWidth: 68,
                  }}
                >
                  {formatPeriod(entry.period)}
                </span>
                <span className="g-h" style={{ fontSize: 15 }}>
                  {formatMoney(entry.amount * 100)}
                </span>
                <span style={{ fontSize: 14.5, color: "var(--g-paper)" }}>
                  {entry.recipientName}
                </span>
                {entry.projectTitle &&
                  (entry.projectSlug ? (
                    <Link
                      to={`/story/${entry.projectSlug}`}
                      style={{ fontSize: 14.5, color: "var(--g-citron)" }}
                    >
                      {entry.projectTitle}
                    </Link>
                  ) : (
                    <span style={{ fontSize: 14.5, color: "var(--g-muted)" }}>
                      {entry.projectTitle}
                    </span>
                  ))}
                {entry.note && (
                  <span
                    style={{
                      fontSize: 14.5,
                      color: "var(--g-muted)",
                      flexBasis: "100%",
                    }}
                  >
                    {entry.note}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function FaqItem({ q, children }: { q: string; children: ReactNode }) {
  return (
    <div>
      <h3
        style={{
          fontSize: 15,
          fontWeight: 600,
          color: "var(--g-paper)",
          marginBottom: 4,
        }}
      >
        {q}
      </h3>
      <p style={{ fontSize: 14.5, lineHeight: 1.55, color: "var(--g-body)" }}>
        {children}
      </p>
    </div>
  );
}

export default function GrantProgramPage() {
  // All hooks first — the page never early-returns before them.
  const [searchParams] = useSearchParams();
  const [showModal, setShowModal] = useState(false);
  const data = useQuery(api.garden.allocations.getFundPage, {
    hostOrgSlug: AP_SLUG,
  });
  const counts = useQuery(api.garden.stats.publicCounts, {});

  const gaveThanks = searchParams.get("gave") === "1";
  const org = data?.org;
  const oneTimeUrl = org ? (org.paymentLinkUrl ?? org.givingUrl) : undefined;
  const monthlyUrl = org?.monthlyPaymentLinkUrl;
  const canGive = Boolean(oneTimeUrl || monthlyUrl);

  return (
    <GardenPage wide>
      <div style={{ paddingTop: 48, paddingBottom: 80 }}>
        {/* Hero — static, prerendered */}
        <h1 className="g-h" style={{ fontSize: "clamp(28px,5vw,40px)" }}>
          Grant Program
        </h1>
        <p
          style={{
            marginTop: 12,
            fontSize: 16,
            lineHeight: 1.65,
            maxWidth: "58ch",
            color: "var(--g-body)",
          }}
        >
          Paid members propose projects, and funds award them. There is a
          platform project pool, filled by half of every membership, and
          communities can run funds of their own. The first is The Garden's,
          administered by{" "}
          <strong style={{ color: "var(--g-paper)" }}>Abiding Practice</strong>,
          a registered 501(c)(3). Every award from any fund is recorded on a
          public ledger. How decisions get made is spelled out below.
        </p>

        {/* Give CTA / thank-you — waits on fund data */}
        <GiveBlock
          data={data}
          gaveThanks={gaveThanks}
          onGive={() => setShowModal(true)}
        />

        {/* By the numbers — public aggregates, em-dashes while loading */}
        <NumbersStrip counts={counts} />

        {/* Where — one chip per city */}
        <CitiesRow counts={counts} />

        {/* Two lanes explainer — static copy; only the Give link waits */}
        <div style={{ marginTop: 48 }}>
          <SectionLabel>How money works here</SectionLabel>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))",
              gap: 14,
              marginTop: 14,
            }}
          >
            <div className="g-card">
              <div className="g-label">Direct backing</div>
              <p
                style={{
                  marginTop: 8,
                  fontSize: 14.5,
                  lineHeight: 1.55,
                  color: "var(--g-body)",
                }}
              >
                Back a creative's project directly. They get 90%. Not
                tax-deductible — this is person-to-person funding.
              </p>
              <Link
                to="/opportunities"
                className="g-nav"
                style={{
                  display: "inline-block",
                  marginTop: 12,
                  fontSize: 13,
                  color: "var(--g-citron)",
                }}
              >
                Browse projects →
              </Link>
            </div>
            <div className="g-card" style={{ borderColor: "var(--g-citron)" }}>
              <div className="g-label" style={{ color: "var(--g-citron)" }}>
                Grant Fund (tax-deductible)
              </div>
              <p
                style={{
                  marginTop: 8,
                  fontSize: 14.5,
                  lineHeight: 1.55,
                  color: "var(--g-body)",
                }}
              >
                Donate to The Garden's fund through Abiding Practice, a
                501(c)(3). They decide their own awards — every dollar that
                goes out is on the ledger below.
              </p>
              {canGive && (
                <button
                  type="button"
                  className="g-nav"
                  onClick={() => setShowModal(true)}
                  style={{
                    display: "inline-block",
                    marginTop: 12,
                    fontSize: 13,
                    color: "var(--g-citron)",
                    background: "none",
                    border: "none",
                    padding: 0,
                    cursor: "pointer",
                  }}
                >
                  Give now →
                </button>
              )}
            </div>
          </div>
        </div>

        {/* How it works — governance, stated no stronger than the code */}
        <div style={{ marginTop: 48 }}>
          <SectionLabel>How it works</SectionLabel>
          <div
            style={{ display: "flex", flexDirection: "column", gap: 20, marginTop: 14 }}
          >
            <HowItem title="The funds">
              The platform project pool is filled by membership dues — 50% of
              every payment — and by one-time contributions, of which 90% goes
              to the pool and 10% to the platform. Communities can run funds
              of their own. The Garden's is administered by Abiding Practice,
              a 501(c)(3), through its own payment processor; gifts there are
              tax-deductible and never pass through this platform. The ledger
              on this page is The Garden's fund; the project pool's ledger is
              at{" "}
              <Link to="/fund/creatives-exchange" style={{ color: "var(--g-citron)" }}>
                /fund/creatives-exchange
              </Link>
              .
            </HowItem>
            <HowItem title="Who can propose">
              Any paid member can submit a proposal to a fund: a title, a
              summary and an amount of $5 or more, optionally tied to a
              project they lead. One open proposal per fund at a time.
            </HowItem>
            <HowItem title="Who decides">
              Platform operators review proposals to the project pool and
              approve or decline them. A community fund's administrator
              decides its own awards — for The Garden, that is Abiding
              Practice. Approval and payout are separate steps: a grant
              exists only once it is recorded as a public allocation with
              recipient, amount and month.
            </HowItem>
            <HowItem title="Cadence and criteria">
              There is no fixed cycle or deadline yet. Awards are made by
              hand from the balance the ledger shows. Published criteria, a
              conflict-of-interest policy and community-run selection are not
              yet defined — they are on the roadmap, not in place.
            </HowItem>
            <HowItem title="Run a fund on these rails">
              Any approved community can have its own pool today, with its
              own public ledger and contribution button. A city program, a
              foundation or a nonprofit could publish its awards the same
              way. Percent-of-dues pledges to a community pool, award
              deadlines and host-run selection are planned, not built.
            </HowItem>
          </div>
        </div>

        {/* Totals + Ledger — fund data */}
        <FundLedger data={data} />

        {/* FAQ — static */}
        <div style={{ marginTop: 48 }}>
          <SectionLabel>Common questions</SectionLabel>
          <div
            style={{ display: "flex", flexDirection: "column", gap: 20, marginTop: 14 }}
          >
            <FaqItem q="Is my gift tax-deductible?">
              Gifts to The Garden's fund are: Abiding Practice is a registered
              501(c)(3), and you'll receive a receipt for your records.
              Contributions to the platform project pool are not.
            </FaqItem>
            <FaqItem q="How do creatives get grants?">
              A paid member submits a proposal to a fund. Platform operators
              decide proposals to the project pool; a community fund's
              administrator decides its own — Abiding Practice, for The
              Garden. There is no fixed cycle yet, and a
              grant is only a grant once it appears on the ledger above.
            </FaqItem>
            <FaqItem q="What's the difference between backing and donating?">
              Backing a project sends money directly to the creative (90/10
              split, not tax-deductible). Donating to a community fund like
              The Garden's goes to its administrator — Abiding Practice — who
              decides its own awards; that's the tax-deductible path. Contributing to the project pool is a
              third option: not tax-deductible, 90% to the pool.
            </FaqItem>
          </div>
        </div>
      </div>

      {showModal && org && (
        <GiveModal
          oneTimeUrl={oneTimeUrl}
          monthlyUrl={monthlyUrl}
          orgName={org.name}
          onClose={() => setShowModal(false)}
        />
      )}
    </GardenPage>
  );
}
