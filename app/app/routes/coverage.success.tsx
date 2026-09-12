// /coverage/success — the code a sponsor just paid for.
//
// The code is issued by the webhook, not by this page, and Stripe redirects
// the browser faster than it delivers webhooks. So getCoverageBySession
// returns {status:"pending"} rather than an error while that race resolves,
// and this page retries a few times before telling someone to check back.
// A sponsor who has just been charged should never see a failure.

import { useCallback, useEffect, useRef, useState } from "react";
import { useAction } from "convex/react";
import { Link, useRouteError, useSearchParams } from "react-router";
import { api } from "../../convex/_generated/api";
import { GardenErrorState, GardenPage, SectionLabel } from "../garden/ui";
import "../garden/garden.css";

const MAX_TRIES = 6;
const RETRY_MS = 2000;

export function meta() {
  return [
    { title: "Your coverage code — The Garden" },
    { name: "robots", content: "noindex" },
  ];
}

export function ErrorBoundary() {
  useRouteError();
  return (
    <GardenPage>
      <div style={{ marginTop: 28 }}>
        <GardenErrorState message="We couldn't load your code here — it's in your email, and we can resend it." />
      </div>
    </GardenPage>
  );
}

type Result =
  | { status: "ready"; code: string; seats: number; orgName: string | null }
  | { status: "pending" };

export default function CoverageSuccess() {
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get("session_id");
  const getCoverage = useAction(api.garden.stripe.getCoverageBySession);

  const [result, setResult] = useState<Result | null>(null);
  const [gaveUp, setGaveUp] = useState(false);
  const [copied, setCopied] = useState(false);
  const tries = useRef(0);
  const stopped = useRef(false);

  const poll = useCallback(async () => {
    if (!sessionId || stopped.current) return;
    try {
      const r = (await getCoverage({ sessionId })) as Result;
      if (stopped.current) return;
      if (r.status === "ready") {
        setResult(r);
        stopped.current = true;
        return;
      }
      setResult(r);
    } catch {
      // Treated as pending: the charge succeeded either way, and the code
      // is recoverable from the operator console.
    }
    tries.current += 1;
    if (tries.current >= MAX_TRIES) {
      setGaveUp(true);
      return;
    }
    setTimeout(() => void poll(), RETRY_MS);
  }, [getCoverage, sessionId]);

  useEffect(() => {
    void poll();
    return () => {
      stopped.current = true;
    };
  }, [poll]);

  const ready = result?.status === "ready" ? result : null;

  return (
    <GardenPage>
      <div style={{ marginTop: 28, maxWidth: "52ch" }}>
        <h1 className="g-h" style={{ fontSize: "clamp(28px,5vw,40px)" }}>
          Thank you.
        </h1>

        {ready ? (
          <>
            <p style={{ marginTop: 12, fontSize: 15, lineHeight: 1.6 }}>
              {ready.seats} {ready.seats === 1 ? "seat" : "seats"} covered
              {ready.orgName ? ` in ${ready.orgName}` : ""}. Hand this code to
              your creatives. Each person uses it once.
            </p>
            <div style={{ marginTop: 20 }}>
              <SectionLabel>Your code</SectionLabel>
              <div
                className="g-card"
                style={{
                  marginTop: 10,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  borderColor: "var(--g-citron)",
                }}
              >
                <span className="g-h" style={{ fontSize: 24, letterSpacing: "0.08em" }}>
                  {ready.code}
                </span>
                <button
                  type="button"
                  className="g-btn g-btn-ghost"
                  onClick={() => {
                    try {
                      void navigator.clipboard.writeText(ready.code);
                      setCopied(true);
                    } catch {
                      // Clipboard blocked — the code is on screen to copy.
                    }
                  }}
                >
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
              <p className="g-hint" style={{ marginTop: 10 }}>
                They redeem it at creatives.exchange/c/{ready.code}
              </p>
            </div>
          </>
        ) : gaveUp ? (
          <p style={{ marginTop: 12, fontSize: 15, lineHeight: 1.6 }}>
            Your payment went through. The code is taking longer than usual to
            issue — check back in a few minutes, or reply to your receipt and
            we'll send it over.
          </p>
        ) : (
          <p style={{ marginTop: 12, fontSize: 15, lineHeight: 1.6 }}>
            Payment went through. Issuing your code…
          </p>
        )}

        <div style={{ marginTop: 22, display: "flex", gap: 12, flexWrap: "wrap" }}>
          <Link to="/garden" className="g-btn g-btn-ghost">
            Back to The Garden
          </Link>
          <Link to="/settings" className="g-btn g-btn-ghost">
            Manage billing
          </Link>
        </div>
      </div>
    </GardenPage>
  );
}
