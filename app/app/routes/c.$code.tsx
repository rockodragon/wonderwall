// /c/:code — the coverage-code landing page (W2, spec §1.2 + §2.1). A
// church buys seats; a creative lands here from a QR code or bulletin link.
// The whole page exists to make one fact land before anything else: a
// covered seat is a full seat. Sponsorship changes who pays, never what the
// creative can do.
//
// Same credit-sheet shape as fund.$slug.tsx / tables.$slug.tsx: loading
// (useQuery undefined), unknown code (null), and the real thing. The real
// thing then branches on code status (active vs. suspended/canceled) and,
// for active codes, on auth state and redemption result.

import { useState } from "react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { Link, useParams, useRouteError } from "react-router";
import { api } from "../../convex/_generated/api";
import {
  DenialPanel,
  FactRow,
  GardenErrorState,
  GardenLoading,
  GardenPage,
  GardenNav,
  SectionLabel,
} from "../garden/ui";
import "../garden/garden.css";

export function meta() {
  return [
    { title: "Coverage — The Garden" },
    { name: "robots", content: "noindex" },
  ];
}

export function ErrorBoundary() {
  useRouteError(); // logged by the framework; the page just degrades warmly
  return (
    <GardenPage>
      <GardenNav />
      <div style={{ marginTop: 28 }}>
        <GardenErrorState message="This code isn't live yet — check back soon." />
      </div>
    </GardenPage>
  );
}

// Mirrors the reasons checkRedemption returns for a non-active code
// (convex/garden/coverage.ts) — the public view shows the same warm sentence
// before the creative ever gets to a CTA, so a paused code never dangles a
// "claim" button in front of them.
const STATUS_COPY: Record<string, string> = {
  suspended:
    "This code is paused while the sponsor sorts out billing. Your sponsor has been notified — check back soon.",
  canceled: "This sponsorship has ended. Ask your sponsor about a new code.",
};

export default function CoveragePage() {
  const { code } = useParams();
  // Hooks stay above every early return (React rules-of-hooks — a
  // violation here has crashed another page before).
  const data = useQuery(
    api.garden.coverage.getCodePublic,
    code ? { code } : "skip",
  );
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
  const redeem = useMutation(api.garden.coverage.redeem);
  const [redeeming, setRedeeming] = useState(false);
  const [redeemError, setRedeemError] = useState<string | null>(null);
  const [seated, setSeated] = useState<{ seatsLeft: number } | null>(null);

  if (data === undefined) {
    return (
      <GardenPage>
        <GardenNav />
        <div style={{ marginTop: 28 }}>
          <GardenLoading />
        </div>
      </GardenPage>
    );
  }

  if (data === null) {
    return (
      <GardenPage>
        <GardenNav />
        <div style={{ marginTop: 28 }}>
          <GardenErrorState message="That code isn't one of ours — check the spelling." />
        </div>
      </GardenPage>
    );
  }

  async function handleRedeem() {
    setRedeemError(null);
    setRedeeming(true);
    try {
      const res = await redeem({ code: code! });
      setSeated({ seatsLeft: res.seatsLeft });
    } catch (err) {
      const reason =
        err instanceof ConvexError
          ? (err.data as { reason?: string } | undefined)?.reason
          : undefined;
      setRedeemError(reason ?? "Couldn't claim your seat — try again.");
    } finally {
      setRedeeming(false);
    }
  }

  const inactiveCopy = STATUS_COPY[data.status];

  return (
    <GardenPage>
      <GardenNav />

      <div style={{ marginTop: 28 }}>
        <SectionLabel>{data.sponsorName} is covering seats</SectionLabel>
        <h1 className="g-h" style={{ marginTop: 10, fontSize: "clamp(28px,5vw,40px)" }}>
          Your seat is covered.
        </h1>
        <p style={{ marginTop: 14, fontSize: 15, lineHeight: 1.6, maxWidth: "58ch" }}>
          A covered seat is a full seat — run a project, apply to paid work,
          join member tables. {data.sponsorName} pays; nothing changes about
          what you can do.
        </p>
      </div>

      <div style={{ marginTop: 22, display: "flex", flexDirection: "column", gap: 10, maxWidth: 380 }}>
        <FactRow k="Seats" v={`${data.redeemed} of ${data.seats} claimed`} />
        <FactRow k="Status" v={data.status[0].toUpperCase() + data.status.slice(1)} />
      </div>

      <div style={{ marginTop: 30 }}>
        {inactiveCopy ? (
          <DenialPanel reason={inactiveCopy} />
        ) : seated ? (
          <div className="g-card" style={{ borderColor: "var(--g-citron)", maxWidth: "50ch" }}>
            <div className="g-label" style={{ color: "var(--g-citron)" }}>
              You're seated.
            </div>
            <p style={{ marginTop: 10, fontSize: 15, lineHeight: 1.6 }}>
              Your place is yours now — run a project, apply to paid work,
              join member tables.
            </p>
            <div style={{ marginTop: 16, display: "flex", gap: 10, alignItems: "baseline" }}>
              <FactRow k="Seats left" v={String(seated.seatsLeft)} />
            </div>
            <div style={{ marginTop: 16, display: "flex", gap: 16, flexWrap: "wrap" }}>
              <Link to="/tables" className="g-btn g-btn-citron">
                Find a table
              </Link>
              <Link to="/projects" className="g-btn g-btn-ghost">
                See paid work
              </Link>
            </div>
          </div>
        ) : authLoading ? null : !isAuthenticated ? (
          <Link
            to={`/login?redirect=${encodeURIComponent(`/c/${code}`)}`}
            className="g-btn g-btn-citron"
          >
            Sign in to claim your seat
          </Link>
        ) : (
          <div>
            <button
              type="button"
              className="g-btn g-btn-citron"
              onClick={handleRedeem}
              disabled={redeeming}
            >
              {redeeming ? "Claiming…" : "Claim your seat"}
            </button>
            {redeemError && (
              <div style={{ marginTop: 16 }}>
                <DenialPanel reason={redeemError} />
              </div>
            )}
          </div>
        )}
      </div>
    </GardenPage>
  );
}
