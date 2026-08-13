// /fund/:slug — the AP Fund public ledger (spec §1.4, "the trust engine of
// the church pitch"). A treasurer with no account has to be able to see
// exactly where fund money went, with zero friction and zero login. This
// route processes nothing: giving happens off-platform via org.givingUrl.
//
// Three states, in order of how often they'll actually happen pre-launch:
// loading (useQuery undefined), a real org with an empty ledger (allocations
// haven't been entered yet — still has to look designed, not blank), and an
// unknown slug or an undeployed backend (both read as "isn't live yet").

import { useQuery } from "convex/react";
import { Link, useParams, useRouteError, useSearchParams } from "react-router";
import { api } from "../../convex/_generated/api";
import {
  GardenErrorState,
  GardenLoading,
  GardenPage,
  GardenNav,
  SectionLabel,
  formatMoney,
  formatPeriod,
} from "../garden/ui";
import "../garden/garden.css";

export function meta() {
  return [
    { title: "Fund — The Garden" },
    { name: "robots", content: "noindex" },
  ];
}

export function ErrorBoundary() {
  useRouteError(); // logged by the framework; the page just degrades warmly
  return (
    <GardenPage>
      <GardenNav active="Fund" />
      <div style={{ marginTop: 28 }}>
        <GardenErrorState message="This fund's ledger isn't live yet — check back soon." />
      </div>
    </GardenPage>
  );
}

export default function FundPage() {
  const { slug } = useParams();
  // Hooks stay above every early return (React rules-of-hooks).
  const [searchParams] = useSearchParams();
  const data = useQuery(
    api.garden.allocations.getFundPage,
    slug ? { hostOrgSlug: slug } : "skip",
  );

  if (data === undefined) {
    return (
      <GardenPage>
        <GardenNav active="Fund" />
        <div style={{ marginTop: 28 }}>
          <GardenLoading />
        </div>
      </GardenPage>
    );
  }

  if (data === null) {
    return (
      <GardenPage>
        <GardenNav active="Fund" />
        <div style={{ marginTop: 28 }}>
          <GardenErrorState message="Check the link — this fund isn't set up here." />
        </div>
      </GardenPage>
    );
  }

  const { org, totals, ledger } = data;
  const gaveThanks = searchParams.get("gave") === "1";
  // Prefer the org's own Stripe Payment Link (in-site round trip); fall back
  // to their giving page until the link exists.
  const givingHref = org.paymentLinkUrl ?? org.givingUrl;

  return (
    <GardenPage wide>
      <GardenNav active="Fund" />

      <div style={{ marginTop: 28 }}>
        <h1 className="g-h" style={{ fontSize: "clamp(28px,5vw,40px)" }}>
          {org.name} Fund
        </h1>
        <p style={{ marginTop: 12, fontSize: 15, lineHeight: 1.6, maxWidth: "58ch" }}>
          The {org.name} Fund backs creative work. Allocations are published
          here, in the open.
        </p>

        {gaveThanks && (
          <div className="g-card" style={{ marginTop: 18, borderColor: "var(--g-citron)", maxWidth: "50ch" }}>
            <div className="g-label" style={{ color: "var(--g-citron)" }}>Received</div>
            <p style={{ marginTop: 8, fontSize: 15 }}>
              Thank you. Your gift goes to {org.name}, and your receipt comes
              from them. Allocations from the fund are published on this page.
            </p>
          </div>
        )}

        {/* Giving stays on our site: the org's own Stripe Payment Link opens,
            takes the gift in THEIR account, and returns the giver right here
            (after_completion redirect → ?gave=1). We process nothing (D3). */}
        {givingHref && !gaveThanks && (
          <a
            href={givingHref}
            className="g-btn g-btn-citron"
            style={{ marginTop: 18, display: "inline-block" }}
          >
            Give to the {org.name} Fund
          </a>
        )}
        <p className="g-hint" style={{ marginTop: 10 }}>
          Gifts go to {org.name}, a nonprofit — your receipt comes from them.
          Payment runs on their secure Stripe page and returns you right here.
        </p>
      </div>

      <div style={{ marginTop: 32 }}>
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
              All-time
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

      <div style={{ marginTop: 36 }}>
        <SectionLabel>Ledger</SectionLabel>
        {ledger.length === 0 ? (
          <p style={{ marginTop: 12, fontSize: 14.5, maxWidth: "50ch" }}>
            Allocations will be published here as they're made.
          </p>
        ) : (
          <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 0 }}>
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
                <span className="g-mono" style={{ fontSize: 11, color: "var(--g-dim)", minWidth: 68 }}>
                  {formatPeriod(entry.period)}
                </span>
                <span className="g-h" style={{ fontSize: 15 }}>
                  {formatMoney(entry.amount * 100)}
                </span>
                <span style={{ fontSize: 14.5, color: "var(--g-paper)" }}>
                  {entry.recipientName}
                </span>
                {entry.projectTitle && (
                  entry.projectSlug ? (
                    <Link
                      to={`/story/${entry.projectSlug}`}
                      style={{ fontSize: 13.5, color: "var(--g-citron)" }}
                    >
                      {entry.projectTitle}
                    </Link>
                  ) : (
                    <span style={{ fontSize: 13.5, color: "var(--g-muted)" }}>
                      {entry.projectTitle}
                    </span>
                  )
                )}
                {entry.note && (
                  <span style={{ fontSize: 13.5, color: "var(--g-muted)", flexBasis: "100%" }}>
                    {entry.note}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </GardenPage>
  );
}
