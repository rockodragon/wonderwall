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
import type { FormEvent, ReactNode } from "react";
import { useAction, useConvexAuth, useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { Link, useParams, useRouteError, useSearchParams } from "react-router";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import {
  DenialPanel,
  GardenErrorState,
  GardenLoading,
  GardenPage,
  SectionLabel,
  formatMoney,
  formatPeriod,
} from "../garden/ui";
import { CLAIMS } from "../constants/claims";
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
  member_gift_out: "Directed by members to creatives",
};

// A fund can carry its own name and a short note about it, and a short
// address that points at the org's slug (/fund/sophia → abiding-practice).
const FUND_ALIASES: Record<string, string> = { sophia: "abiding-practice" };
const NAMED_FUNDS: Record<
  string,
  { name: string; about: string; openCall?: string; seedCents?: number }
> = {
  "abiding-practice": {
    name: "The Sophia Fund",
    openCall: CLAIMS.sophiaSchedule,
    // Money the fund holds that isn't in this ledger (Rick, 2026-09-29).
    // Tickets and gifts recorded here add to it; grants made come off it.
    // If it's ever entered as a ledger row, remove it here or it counts twice.
    seedCents: 1_000_000,
    about:
      "Sophia means wisdom in Greek. The fund carries the name of Sophia, a young Christian creative whose life was lost in a car accident this year.",
  },
};

const PRESET_AMOUNTS_CENTS = [1000, 2500, 5000, 10000]; // $10 · $25 · $50 · $100

export function meta() {
  return [
    { title: "The Sophia Fund — TheCreative.exchange" },
    { name: "robots", content: "noindex" },
  ];
}

export function ErrorBoundary() {
  useRouteError(); // logged by the framework; the page just degrades warmly
  return (
    <GardenPage>
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
        10% keeps this running; the rest goes into the pool. Not a donation.
        The grants this pool makes are listed on this page.
      </p>
    </div>
  );
}

const PROPOSAL_STATUS_LABELS: Record<string, string> = {
  submitted: "Submitted",
  under_review: "Under review",
  approved: "Approved",
  declined: "Declined",
  withdrawn: "Withdrawn",
};

/** One of the proposer's own asks — with a Withdraw action while it's still
 * open (submitted / under_review). */
function MyProposalRow({
  proposal,
  onWithdraw,
}: {
  proposal: {
    proposalId: Id<"grantProposals">;
    title: string;
    summary: string;
    amountCents: number;
    status: string;
  };
  onWithdraw: (proposalId: Id<"grantProposals">) => void;
}) {
  const [busy, setBusy] = useState(false);
  const canWithdraw = proposal.status === "submitted" || proposal.status === "under_review";

  return (
    <div className="g-cell" style={{ padding: "12px 14px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <span style={{ color: "var(--g-paper)", fontWeight: 600, fontSize: 14.5 }}>{proposal.title}</span>
        <span className="g-badge g-badge-line">{PROPOSAL_STATUS_LABELS[proposal.status] ?? proposal.status}</span>
      </div>
      <div className="g-hint" style={{ marginTop: 6 }}>
        {formatMoney(proposal.amountCents)} asked
      </div>
      <p style={{ marginTop: 6, fontSize: 14, lineHeight: 1.5 }}>{proposal.summary}</p>
      {canWithdraw && (
        <button
          type="button"
          className="g-btn g-btn-ghost"
          style={{ marginTop: 10 }}
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await onWithdraw(proposal.proposalId);
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Withdrawing…" : "Withdraw"}
        </button>
      )}
    </div>
  );
}

/** The "Propose a grant" section (task spec §3). Three states: signed out
 * (a line + a link to /join), signed in without `pool.propose` (the
 * denial anatomy, verbatim — DenialPanel), signed in with it (the form
 * plus the proposer's own open/past proposals). Own component so its hooks
 * only mount for this section. */
function ProposeGrantSection({ slug }: { slug: string }) {
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
  const access = useQuery(api.garden.grantProposals.getProposeAccess, { hostOrgSlug: slug });
  const myProposals = useQuery(
    api.garden.grantProposals.listMyProposals,
    isAuthenticated && access?.hostOrgId ? { hostOrgId: access.hostOrgId } : "skip",
  );
  const myProjects = useQuery(
    api.garden.grantProposals.listMyProjectsForProposal,
    isAuthenticated ? {} : "skip",
  );
  const submitProposal = useMutation(api.garden.grantProposals.submitProposal);
  const withdrawProposal = useMutation(api.garden.grantProposals.withdrawProposal);

  const [title, setTitle] = useState("");
  const [amountDollars, setAmountDollars] = useState("");
  const [summary, setSummary] = useState("");
  const [projectId, setProjectId] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!access?.hostOrgId) return;
    setStatus(null);
    setBusy(true);
    try {
      const amountCents = Math.round(parseFloat(amountDollars || "0") * 100);
      await submitProposal({
        hostOrgId: access.hostOrgId,
        projectId: projectId ? (projectId as Id<"projects">) : undefined,
        title,
        summary,
        amountCents,
      });
      setStatus({ kind: "ok", text: "Sent. An operator will review it." });
      setTitle("");
      setAmountDollars("");
      setSummary("");
      setProjectId("");
    } catch (err) {
      setStatus({ kind: "err", text: reasonFor(err, "Couldn't send that. Try again.") });
    } finally {
      setBusy(false);
    }
  }

  async function onWithdraw(proposalId: Id<"grantProposals">) {
    try {
      await withdrawProposal({ proposalId });
    } catch {
      // Withdraw is best-effort from this row; the list will just show the
      // proposal's current status if it didn't change.
    }
  }

  if (authLoading || access === undefined) {
    return (
      <div style={{ marginTop: 36 }}>
        <SectionLabel>Propose a grant</SectionLabel>
        <div style={{ marginTop: 12 }}>
          <GardenLoading />
        </div>
      </div>
    );
  }

  return (
    <div id="propose" style={{ marginTop: 36, scrollMarginTop: 24 }}>
      <SectionLabel>Propose a grant</SectionLabel>

      {!isAuthenticated ? (
        <div style={{ marginTop: 12 }}>
          <p style={{ fontSize: 14.5 }}>Sign in to send a proposal to this fund.</p>
          <Link to="/join" className="g-btn g-btn-ghost" style={{ marginTop: 12, display: "inline-block" }}>
            Sign in
          </Link>
        </div>
      ) : !access.allowed ? (
        <div style={{ marginTop: 12 }}>
          <DenialPanel
            reason={access.reason}
            // The open-call card above already has the membership button.
            upgradePath={NAMED_FUNDS[slug]?.openCall ? undefined : access.upgradePath}
          />
        </div>
      ) : (
        <>
          <div className="g-card" style={{ marginTop: 12, maxWidth: "56ch" }}>
            <form onSubmit={onSubmit}>
              <label className="g-label" style={{ display: "block", marginBottom: 6 }}>
                Title
              </label>
              <input
                className="g-input"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="What the grant is for"
                maxLength={120}
              />

              <label className="g-label" style={{ display: "block", marginTop: 14, marginBottom: 6 }}>
                Amount you're asking for
              </label>
              <input
                className="g-input"
                value={amountDollars}
                onChange={(e) => setAmountDollars(e.target.value)}
                inputMode="decimal"
                placeholder="500"
                style={{ maxWidth: 160 }}
              />
              <p className="g-hint" style={{ marginTop: 5 }}>
                Dollars. $5 minimum.
              </p>

              <label className="g-label" style={{ display: "block", marginTop: 14, marginBottom: 6 }}>
                Summary
              </label>
              <textarea
                className="g-input"
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                rows={3}
                maxLength={2000}
                placeholder="What the grant funds, and why."
                style={{ resize: "vertical" }}
              />

              {myProjects && myProjects.length > 0 && (
                <>
                  <label className="g-label" style={{ display: "block", marginTop: 14, marginBottom: 6 }}>
                    Project (optional)
                  </label>
                  <select
                    className="g-input"
                    value={projectId}
                    onChange={(e) => setProjectId(e.target.value)}
                    style={{ appearance: "none" }}
                  >
                    <option value="">Not tied to a project</option>
                    {myProjects.map((p) => (
                      <option key={p.projectId} value={p.projectId}>
                        {p.title}
                      </option>
                    ))}
                  </select>
                </>
              )}

              <button
                className="g-btn g-btn-citron"
                type="submit"
                disabled={busy || !title.trim() || !amountDollars.trim() || !summary.trim()}
                style={{ marginTop: 18 }}
              >
                {busy ? "Sending…" : "Send proposal"}
              </button>
              {status && (
                <p
                  style={{
                    marginTop: 12,
                    fontSize: 14.5,
                    color: status.kind === "ok" ? "var(--g-citron)" : "var(--g-body)",
                  }}
                >
                  {status.text}
                </p>
              )}
            </form>
          </div>

          <div style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 10, maxWidth: "56ch" }}>
            {myProposals === undefined ? (
              <GardenLoading label="Loading your proposals…" />
            ) : myProposals.length === 0 ? (
              <p className="g-hint">You haven't sent a proposal to this fund yet.</p>
            ) : (
              myProposals.map((p) => (
                <MyProposalRow key={p.proposalId} proposal={p} onWithdraw={onWithdraw} />
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default function FundPage() {
  const { slug: rawSlug } = useParams();
  const slug = rawSlug ? (FUND_ALIASES[rawSlug] ?? rawSlug) : rawSlug;
  // Hooks stay above every early return (React rules-of-hooks).
  const [searchParams] = useSearchParams();
  // One-time or monthly, when the org has both Payment Links.
  const [giveMonthly, setGiveMonthly] = useState(false);
  const data = useQuery(
    api.garden.allocations.getFundPage,
    slug ? { hostOrgSlug: slug } : "skip",
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
          <GardenErrorState message="Check the link — this fund isn't set up here." />
        </div>
      </GardenPage>
    );
  }

  const { org, totals, ledger, inflows, balanceCents } = data;
  const isPool = org.kind === "platform" || org.kind === "community";
  const isOutLink = org.kind === "org" || org.kind === "church";
  const seedCents = NAMED_FUNDS[org.slug]?.seedCents;
  const availableCents = (seedCents ?? 0) + balanceCents;
  const gaveThanks = searchParams.get("gave") === "1";
  const contributed = searchParams.get("contributed") === "1";
  // Prefer the org's own Stripe Payment Link (in-site round trip); fall back
  // to their giving page until the link exists.
  const givingHref = org.paymentLinkUrl ?? org.givingUrl;

  // Named funds (the Sophia Fund) get their own page, SophiaFundView below
  // (from the Claude Design file "Sophia Fund", 2026-09-29).
  const named = seedCents !== undefined;
  const ledgerList = (ledger.length === 0 ? (
          <p style={{ marginTop: 12, fontSize: 14.5, maxWidth: "50ch" }}>
            Grants will be listed here as they're made.
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
        ));

  if (named) {
    return (
      <GardenPage wide>
        <SophiaFundView
          name={NAMED_FUNDS[org.slug]?.name ?? "Grant Fund"}
          about={NAMED_FUNDS[org.slug]?.about}
          orgName={org.name}
          availableCents={availableCents}
          grantedCents={totals.allTimeCents}
          schedule={NAMED_FUNDS[org.slug]?.openCall}
          ledgerList={ledger.length === 0 ? null : ledgerList}
          oneTimeHref={givingHref ?? null}
          monthlyHref={org.monthlyPaymentLinkUrl ?? null}
          gaveThanks={gaveThanks}
        />
      </GardenPage>
    );
  }

  return (
    <GardenPage wide>

      <div style={{ marginTop: 28 }}>
        <h1 className="g-h" style={{ fontSize: "clamp(28px,5vw,40px)" }}>
          {NAMED_FUNDS[org.slug]?.name ?? "Grant Fund"}
        </h1>
        {NAMED_FUNDS[org.slug] && (
          <p style={{ marginTop: 12, fontSize: 16, lineHeight: 1.6, maxWidth: "58ch", color: "var(--g-paper)" }}>
            {NAMED_FUNDS[org.slug].about}
          </p>
        )}
        <p style={{ marginTop: 12, fontSize: 15, lineHeight: 1.6, maxWidth: "58ch" }}>
          Grants to creatives, administered by {org.name}.
        </p>

        {isPool && (
          <>
            {contributed && (
              <div className="g-card" style={{ marginTop: 18, borderColor: "var(--g-citron)", maxWidth: "50ch" }}>
                <div className="g-label" style={{ color: "var(--g-citron)" }}>Received</div>
                <p style={{ marginTop: 8, fontSize: 15 }}>
                  Received. Your contribution is in the pool. Grants from it are
                  listed on this page as they're made.
                </p>
              </div>
            )}
            <AddToPoolPanel slug={org.slug} />
          </>
        )}

        {isOutLink && (
          <section>
            {gaveThanks && (
              <div className="g-card" style={{ marginTop: 18, borderColor: "var(--g-citron)", maxWidth: "50ch" }}>
                <div className="g-label" style={{ color: "var(--g-citron)" }}>Received</div>
                <p style={{ marginTop: 8, fontSize: 15 }}>
                  Thank you. Your gift goes to {org.name}, and your receipt comes
                  from them. Grants from the fund are listed on this page as they're made.
                </p>
              </div>
            )}

            {/* Giving stays on our site: the org's own Stripe Payment Link opens,
                takes the gift in THEIR account, and returns the giver right here
                (after_completion redirect → ?gave=1). We process nothing (D3). */}
            {givingHref && !gaveThanks && (
              <div style={{ marginTop: 18 }}>
                {org.monthlyPaymentLinkUrl && (
                  <div
                    role="radiogroup"
                    aria-label="How often"
                    className="inline-flex rounded-lg"
                    style={{ border: "1px solid var(--g-hairline)", padding: 3, marginBottom: 12 }}
                  >
                    {[
                      { monthly: false, label: "One-time" },
                      { monthly: true, label: "Monthly" },
                    ].map((o) => (
                      <button
                        key={o.label}
                        type="button"
                        role="radio"
                        aria-checked={giveMonthly === o.monthly}
                        onClick={() => setGiveMonthly(o.monthly)}
                        className="rounded-md"
                        style={{
                          padding: "8px 16px",
                          fontSize: 13.5,
                          fontWeight: 600,
                          background: giveMonthly === o.monthly ? "var(--g-paper)" : "transparent",
                          color: giveMonthly === o.monthly ? "#141414" : "var(--g-paper)",
                        }}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                )}
                <div>
                  <a
                    href={giveMonthly && org.monthlyPaymentLinkUrl ? org.monthlyPaymentLinkUrl : givingHref}
                    className="g-btn g-btn-citron"
                    style={{ display: "inline-block" }}
                  >
                    {giveMonthly ? "Give monthly to" : "Give to"} {NAMED_FUNDS[org.slug]?.name ?? "the Grant Fund"}
                  </a>
                </div>
              </div>
            )}
            <p style={{ marginTop: 10, fontSize: 14, lineHeight: 1.6, color: "var(--g-body)" }}>
              Gifts go to {org.name}, a nonprofit. Payment runs on their secure
              Stripe page, your receipt comes from them, and it returns you here.
            </p>
          </section>
        )}
      </div>

      {!named && (
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
          {/* A fund with an open call shows what's available once, in the
              card above; here it's only what's been granted. */}
          <div className={seedCents !== undefined ? "g-cell" : "g-cell g-cell-hot"}>
            <div className="g-cell-v">{formatMoney(totals.allTimeCents)}</div>
            <div className="g-label" style={{ marginTop: 4 }}>
              {seedCents !== undefined ? "Granted" : "All-time"}
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

      )}

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

      {!named && (
        <div style={{ marginTop: 36 }}>
          <SectionLabel>Grants made</SectionLabel>
          {ledgerList}
        </div>
      )}

      <ProposeGrantSection slug={org.slug} />
    </GardenPage>
  );
}

// ——— The Sophia Fund page (Claude Design "Sophia Fund.dc.html") ———
// One column: header, The fund (available / granted / total), Upcoming, Grants
// made, then a Give panel. Colors are the design's, mapped to garden tokens
// where they match (citron = its accent). Money copy comes from CLAIMS.

const SF = {
  text: "#F4F4F2",
  n200: "#D6D6D6",
  n300: "#B3B3B3",
  n400: "#8F8F8F",
  n700: "#3A3A3A",
  n800: "#262626",
  section: "#1A1A1A",
  glow: "#2A2515",
  ghost: "#333333",
  accent800: "#2E2812",
  accent700: "#6B5A1E",
  mono: "ui-monospace, 'JetBrains Mono', Menlo, monospace",
};

function SfLabel({ children, accent }: { children: ReactNode; accent?: boolean }) {
  return (
    <h2
      style={{
        margin: 0,
        fontSize: 13,
        fontWeight: 500,
        letterSpacing: "0.2em",
        textTransform: "uppercase",
        fontFamily: SF.mono,
        color: accent ? "var(--g-citron)" : SF.n400,
      }}
    >
      {children}
    </h2>
  );
}

function formatDollars(cents: number): string {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function SophiaFundView({
  name,
  about,
  orgName,
  availableCents,
  grantedCents,
  schedule,
  ledgerList,
  oneTimeHref,
  monthlyHref,
  gaveThanks,
}: {
  name: string;
  about?: string;
  orgName: string;
  availableCents: number;
  grantedCents: number;
  schedule?: string;
  ledgerList: ReactNode | null;
  oneTimeHref: string | null;
  monthlyHref: string | null;
  gaveThanks: boolean;
}) {
  const [monthly, setMonthly] = useState(false);
  const href = monthly && monthlyHref ? monthlyHref : oneTimeHref;
  const row = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "baseline",
    gap: 22,
    padding: "22px 0",
  } as const;

  return (
    <main
      style={{
        maxWidth: 1120,
        margin: "0 auto",
        padding: "72px 0 120px",
        display: "flex",
        flexDirection: "column",
        gap: 96,
        color: SF.text,
        fontVariantNumeric: "tabular-nums",
      }}
    >
      <header style={{ display: "flex", flexDirection: "column", gap: 22, maxWidth: 720 }}>
        <span
          style={{
            fontSize: 12,
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            fontFamily: SF.mono,
            color: "var(--g-citron)",
          }}
        >
          Grant fund
        </span>
        <h1
          style={{
            margin: 0,
            fontSize: "clamp(44px, 9vw, 72px)",
            fontWeight: 500,
            letterSpacing: "-0.03em",
            lineHeight: 1,
            color: SF.text,
          }}
        >
          {name}
        </h1>
        {about && (
          <p style={{ margin: 0, fontSize: 19, lineHeight: 1.65, color: SF.n200, maxWidth: "54ch" }}>
            {about}
          </p>
        )}
        <p style={{ margin: 0, fontSize: 15, color: SF.n400 }}>
          Grants to creatives, administered by {orgName}.
        </p>
      </header>

      <section style={{ display: "flex", flexDirection: "column", gap: 33, maxWidth: 720 }}>
        <SfLabel>The fund</SfLabel>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              ...row,
              background: `linear-gradient(to right, transparent, ${SF.n800} 48px, ${SF.n800} calc(100% - 48px), transparent) no-repeat bottom / 100% 1px`,
            }}
          >
            <span style={{ fontSize: 17, color: SF.n200 }}>Available to grant</span>
            <span style={{ fontSize: 22, fontWeight: 500 }}>{formatDollars(availableCents)}</span>
          </div>
          <div style={row}>
            <span style={{ fontSize: 17, color: SF.n200 }}>Granted to date</span>
            <span style={{ fontSize: 22, fontWeight: 500, color: SF.n300 }}>{formatDollars(grantedCents)}</span>
          </div>
          <div
            style={{
              ...row,
              alignItems: "center",
              paddingTop: 28,
              background: `linear-gradient(to right, var(--g-citron), ${SF.accent700} 60%, transparent) no-repeat top / 100% 1px`,
            }}
          >
            <span
              style={{
                fontSize: 13,
                letterSpacing: "0.2em",
                textTransform: "uppercase",
                fontFamily: SF.mono,
                color: SF.n300,
              }}
            >
              Total
            </span>
            <span style={{ fontSize: "clamp(32px, 7vw, 48px)", fontWeight: 500, letterSpacing: "-0.02em", lineHeight: 1 }}>
              {formatDollars(availableCents + grantedCents)}
            </span>
          </div>
        </div>
      </section>

      {schedule && (
        <section style={{ display: "flex", flexDirection: "column", gap: 22, maxWidth: 720 }}>
          <SfLabel>Upcoming</SfLabel>
          <p
            style={{
              margin: 0,
              fontSize: "clamp(24px, 5vw, 32px)",
              fontWeight: 500,
              letterSpacing: "-0.015em",
              lineHeight: 1.25,
              textWrap: "balance",
              color: SF.text,
            }}
          >
            {schedule}
          </p>
          <div style={{ marginTop: 11 }}>
            <Link
              to="/join"
              style={{
                display: "inline-block",
                padding: "11px 22px",
                borderRadius: 8,
                border: `1px solid ${SF.n700}`,
                color: SF.text,
                fontSize: 15,
                fontWeight: 500,
                textDecoration: "none",
              }}
            >
              Become a member and create a project →
            </Link>
          </div>
        </section>
      )}

      <section style={{ display: "flex", flexDirection: "column", gap: 33, maxWidth: 720 }}>
        <SfLabel>Grants made</SfLabel>
        {ledgerList ?? (
          <p style={{ margin: 0, fontSize: 17, lineHeight: 1.6, color: SF.n300 }}>
            None yet. Grants will be listed here as they're made.
          </p>
        )}
      </section>

      <section
        id="give"
        style={{
          borderRadius: 14,
          background: `radial-gradient(800px 420px at 85% 0%, ${SF.glow}, transparent 70%), ${SF.section}`,
          padding: "clamp(40px, 8vw, 78px) clamp(20px, 5vw, 56px)",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 400px), 1fr))",
          gap: "clamp(32px, 6vw, 67px)",
          alignItems: "center",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          <SfLabel accent>Give</SfLabel>
          <p
            style={{
              margin: 0,
              fontSize: "clamp(32px, 6vw, 44px)",
              fontWeight: 500,
              letterSpacing: "-0.02em",
              lineHeight: 1.08,
              textWrap: "balance",
              color: SF.text,
            }}
          >
            Fund the next creative in Sophia's name.
          </p>
          <p style={{ margin: 0, fontSize: 16, lineHeight: 1.65, color: SF.n200, maxWidth: "44ch" }}>
            {CLAIMS.grantFundDeductible}
          </p>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 22,
            padding: 33,
            borderRadius: 14,
            background: "rgba(18,18,18,0.7)",
            boxShadow: `0 16px 40px rgba(0,0,0,0.65), inset 0 0 0 1px ${SF.ghost}`,
          }}
        >
          {gaveThanks ? (
            <p style={{ margin: 0, fontSize: 17, lineHeight: 1.6, color: SF.text }}>
              Thank you. Your receipt comes from {orgName}.
            </p>
          ) : href ? (
            <>
              {monthlyHref && (
                <div role="radiogroup" aria-label="How often" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 11 }}>
                  {[
                    { on: !monthly, label: "One time", pick: () => setMonthly(false) },
                    { on: monthly, label: "Monthly", pick: () => setMonthly(true) },
                  ].map((o) => (
                    <button
                      key={o.label}
                      type="button"
                      role="radio"
                      aria-checked={o.on}
                      onClick={o.pick}
                      style={{
                        height: 48,
                        borderRadius: 8,
                        cursor: "pointer",
                        fontSize: 16,
                        fontWeight: 500,
                        color: o.on ? "var(--g-citron)" : SF.n200,
                        background: o.on ? SF.accent800 : "transparent",
                        border: `1px solid ${o.on ? "var(--g-citron)" : SF.n700}`,
                      }}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              )}
              <a
                href={href}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  height: 60,
                  borderRadius: 8,
                  color: "#121212",
                  background: "var(--g-citron)",
                  fontSize: 18,
                  fontWeight: 600,
                  textDecoration: "none",
                  boxShadow: "0 10px 40px rgba(254,226,104,0.25)",
                }}
              >
                {monthly ? "Give monthly →" : "Give →"}
              </a>
              <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.6, color: SF.n300 }}>
                Secure checkout on {orgName}'s Stripe page. Your receipt comes from them, then you return here.
              </p>
            </>
          ) : (
            <p style={{ margin: 0, fontSize: 16, color: SF.n300 }}>Giving opens soon.</p>
          )}
        </div>
      </section>
    </main>
  );
}
