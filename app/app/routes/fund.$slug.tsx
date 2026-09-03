// /fund/:slug — the public fund ledger (spec §1.4, "the trust engine of the
// church pitch"; community-groups.md §3, community-grant-pools.md). A
// treasurer (or anyone) with no account has to be able to see exactly where
// fund money went, with zero friction and zero login.
//
// Two lanes, chosen by org.kind:
//   "org" / "church" — the tax-deductible AP out-link lane. This route
//     processes nothing: giving happens off-platform via org.givingUrl /
//     paymentLinkUrl, on the ORG'S own Stripe account. "Donate"/"gift" is
//     reserved for this lane only.
//   "platform" / "community" — the in-platform project pool. Money moves
//     through creatives.exchange's own Stripe (createPoolContributionCheckout
//     below); NEVER "donate"/"gift"/tax-deductible copy here — "fund",
//     "back", "add to the project pool" only (money-words rule, task spec).
//
// Three loading states, in order of how often they'll actually happen
// pre-launch: loading (useQuery undefined), a real org with an empty ledger
// (still has to look designed, not blank), and an unknown slug or an
// undeployed backend (both read as "isn't live yet").

import { useState } from "react";
import { useAction, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
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

function reasonFor(err: unknown, fallback: string): string {
  if (err instanceof ConvexError) {
    const data = err.data as { reason?: string } | undefined;
    if (data?.reason) return data.reason;
  }
  return fallback;
}

const CONTRIBUTION_TYPE_LABELS: Record<string, string> = {
  dues_share: "Member dues share",
  contribution_in: "Pool contributions",
  topup_in: "Host top-ups",
  sponsor_in: "Sponsors",
  entry_fee_in: "Entry fees",
  adjustment: "Adjustments",
};

const PRESET_AMOUNTS_CENTS = [1000, 2500, 5000, 10000]; // $10 · $25 · $50 · $100

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

/** "Add to the project pool" — the in-platform lane (org.kind "platform" |
 * "community"). Its own component so its hooks (amount picker state, the
 * checkout action) only mount when this lane actually renders. */
function AddToPoolPanel({ slug }: { slug: string }) {
  const contribute = useAction(api.garden.stripe.createPoolContributionCheckout);
  const [amountChoice, setAmountChoice] = useState<number | "custom">(PRESET_AMOUNTS_CENTS[0]);
  const [customDollars, setCustomDollars] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleContribute() {
    setError(null);
    const amountCents =
      amountChoice === "custom" ? Math.round(parseFloat(customDollars || "0") * 100) : amountChoice;
    if (!Number.isFinite(amountCents) || amountCents < 500) {
      setError("Give at least $5.");
      return;
    }
    setBusy(true);
    try {
      const { url } = await contribute({ amountCents, hostOrgSlug: slug });
      window.location.href = url;
    } catch (err) {
      setError(reasonFor(err, "Couldn't start checkout — try again."));
      setBusy(false);
    }
  }

  return (
    <div className="g-card" style={{ marginTop: 18, maxWidth: "50ch" }}>
      <div className="g-label">Add to the project pool</div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
        {PRESET_AMOUNTS_CENTS.map((cents) => (
          <button
            key={cents}
            type="button"
            className="g-btn g-btn-ghost"
            onClick={() => setAmountChoice(cents)}
            style={
              amountChoice === cents
                ? { borderColor: "var(--g-citron)", color: "var(--g-citron)" }
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
              ? { borderColor: "var(--g-citron)", color: "var(--g-citron)" }
              : undefined
          }
        >
          Custom
        </button>
      </div>
      {amountChoice === "custom" && (
        <input
          className="g-input"
          value={customDollars}
          onChange={(e) => setCustomDollars(e.target.value)}
          inputMode="decimal"
          placeholder="Dollars"
          autoFocus
          style={{ marginTop: 10, maxWidth: 160 }}
        />
      )}
      <button
        type="button"
        className="g-btn g-btn-citron"
        onClick={handleContribute}
        disabled={busy}
        style={{ marginTop: 16, display: "block" }}
      >
        {busy ? "Starting checkout…" : "Add to the pool"}
      </button>
      {error && (
        <p style={{ marginTop: 8, fontSize: 14, color: "var(--g-body)" }}>{error}</p>
      )}
      <p className="g-hint" style={{ marginTop: 10 }}>
        10% runs the place; the rest goes into the pool. Not a donation —
        allocations are published here.
      </p>
    </div>
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

  const { org, totals, ledger, inflows, balanceCents } = data;
  const isPool = org.kind === "platform" || org.kind === "community";
  const isOutLink = org.kind === "org" || org.kind === "church";
  const gaveThanks = searchParams.get("gave") === "1";
  const contributed = searchParams.get("contributed") === "1";
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

        {isPool && (
          <>
            {contributed && (
              <div className="g-card" style={{ marginTop: 18, borderColor: "var(--g-citron)", maxWidth: "50ch" }}>
                <div className="g-label" style={{ color: "var(--g-citron)" }}>Received</div>
                <p style={{ marginTop: 8, fontSize: 15 }}>
                  Received. Your contribution is in the pool — allocations are
                  published on this page.
                </p>
              </div>
            )}
            <AddToPoolPanel slug={org.slug} />
          </>
        )}

        {isOutLink && (
          <>
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
          </>
        )}
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
          {isPool && (
            <div className="g-cell">
              <div className="g-cell-v">{formatMoney(balanceCents)}</div>
              <div className="g-label" style={{ marginTop: 4 }}>
                Balance
              </div>
            </div>
          )}
        </div>
      </div>

      {isPool && (
        <div style={{ marginTop: 32 }}>
          <SectionLabel>Money in</SectionLabel>
          {inflows.byType.length === 0 ? (
            <p style={{ marginTop: 12, fontSize: 14.5, maxWidth: "50ch" }}>
              Nothing in the pool yet — be the first to add to it.
            </p>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))",
                gap: 10,
                marginTop: 10,
              }}
            >
              <div className="g-cell g-cell-hot">
                <div className="g-cell-v">{formatMoney(inflows.poolCents)}</div>
                <div className="g-label" style={{ marginTop: 4 }}>
                  In the pool
                </div>
              </div>
              {inflows.byType.map((t) => (
                <div className="g-cell" key={t.type}>
                  <div className="g-cell-v">{formatMoney(t.poolCents)}</div>
                  <div className="g-label" style={{ marginTop: 4 }}>
                    {CONTRIBUTION_TYPE_LABELS[t.type] ?? t.type}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

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
                <span className="g-mono" style={{ fontSize: 12.5, color: "var(--g-dim)", minWidth: 68 }}>
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
                      style={{ fontSize: 14.5, color: "var(--g-citron)" }}
                    >
                      {entry.projectTitle}
                    </Link>
                  ) : (
                    <span style={{ fontSize: 14.5, color: "var(--g-muted)" }}>
                      {entry.projectTitle}
                    </span>
                  )
                )}
                {entry.note && (
                  <span style={{ fontSize: 14.5, color: "var(--g-muted)", flexBasis: "100%" }}>
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
