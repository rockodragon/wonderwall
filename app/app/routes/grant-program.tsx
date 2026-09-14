// /grant-program — the public grant program page: what the fund is, how to
// give, and the transparent ledger. Replaces the unregistered /grant-fund
// route and the AP-specific /fund/abiding-practice as the primary entry point.
//
// Giving modal: collects amount + one-time/monthly, then redirects to the
// org's own Stripe Payment Link (AP stays merchant of record for tax
// deductibility). Two links stored on the hostOrg: paymentLinkUrl (one-time)
// and monthlyPaymentLinkUrl (recurring). "Donate" / "gift" IS correct here —
// this is the 501(c)(3) lane (money-words rule).

import { useState } from "react";
import { useQuery } from "convex/react";
import { Link, useSearchParams } from "react-router";
import { api } from "../../convex/_generated/api";
import {
  GardenPage,
  GardenLoading,
  GardenErrorState,
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
        "Tax-deductible giving to creative projects through Abiding Practice, a 501(c)(3). Every grant is published openly.",
    },
  ];
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
        backgroundColor: "rgba(0,0,0,0.65)",
        padding: 16,
      }}
    >
      <div
        className="g-card"
        style={{
          width: "100%",
          maxWidth: 420,
          position: "relative",
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

export default function GrantProgramPage() {
  const [searchParams] = useSearchParams();
  const [showModal, setShowModal] = useState(false);
  const data = useQuery(api.garden.allocations.getFundPage, {
    hostOrgSlug: AP_SLUG,
  });

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
          <GardenErrorState message="The grant program page isn't live yet — check back soon." />
        </div>
      </GardenPage>
    );
  }

  const { org, totals, ledger } = data;
  const gaveThanks = searchParams.get("gave") === "1";
  const oneTimeUrl = org.paymentLinkUrl ?? org.givingUrl;
  const monthlyUrl = org.monthlyPaymentLinkUrl;

  return (
    <GardenPage wide>
      <div style={{ paddingTop: 48, paddingBottom: 80 }}>
        {/* Hero */}
        <h1
          className="g-h"
          style={{ fontSize: "clamp(28px,5vw,40px)" }}
        >
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
          Creatives on this platform propose projects. The Grant Fund —
          administered by{" "}
          <strong style={{ color: "var(--g-paper)" }}>Abiding Practice</strong>,
          a registered 501(c)(3) — awards grants to the ones that serve its
          mission. Every grant is published here.
        </p>

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
            onClick={() => setShowModal(true)}
            style={{ marginTop: 20 }}
          >
            Give to the Grant Fund
          </button>
        )}
        <p className="g-hint" style={{ marginTop: 10, maxWidth: "50ch" }}>
          Gifts go to {org.name}, a nonprofit. Your donation is tax-deductible
          and your receipt comes from them.
        </p>

        {/* Two lanes explainer */}
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
                Donate to the fund through Abiding Practice, a 501(c)(3). They
                award grants to creatives — you see every dollar on the ledger
                below.
              </p>
              {(oneTimeUrl || monthlyUrl) && (
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
              Grants will be published here as they're awarded.
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
                      <span
                        style={{ fontSize: 14.5, color: "var(--g-muted)" }}
                      >
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

        {/* FAQ */}
        <div style={{ marginTop: 48 }}>
          <SectionLabel>Common questions</SectionLabel>
          <div
            style={{ display: "flex", flexDirection: "column", gap: 20, marginTop: 14 }}
          >
            <div>
              <h3
                style={{
                  fontSize: 15,
                  fontWeight: 600,
                  color: "var(--g-paper)",
                  marginBottom: 4,
                }}
              >
                Is my gift tax-deductible?
              </h3>
              <p style={{ fontSize: 14.5, lineHeight: 1.55, color: "var(--g-body)" }}>
                Yes. Abiding Practice is a registered 501(c)(3). You'll receive
                a receipt for your records.
              </p>
            </div>
            <div>
              <h3
                style={{
                  fontSize: 15,
                  fontWeight: 600,
                  color: "var(--g-paper)",
                  marginBottom: 4,
                }}
              >
                How do creatives get grants?
              </h3>
              <p style={{ fontSize: 14.5, lineHeight: 1.55, color: "var(--g-body)" }}>
                Creatives propose projects on the platform. Abiding Practice
                reviews proposals and awards grants. The ledger above records
                every grant.
              </p>
            </div>
            <div>
              <h3
                style={{
                  fontSize: 15,
                  fontWeight: 600,
                  color: "var(--g-paper)",
                  marginBottom: 4,
                }}
              >
                What's the difference between backing and donating?
              </h3>
              <p style={{ fontSize: 14.5, lineHeight: 1.55, color: "var(--g-body)" }}>
                Backing a project sends money directly to the creative (90/10
                split, not tax-deductible). Donating to the Grant Fund goes to
                Abiding Practice, who awards grants to creatives — that's the
                tax-deductible path.
              </p>
            </div>
          </div>
        </div>
      </div>

      {showModal && (
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
