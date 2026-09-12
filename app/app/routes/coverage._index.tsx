// /coverage — a church or sponsor buys seats for its creatives.
//
// The persona audit found this was the most completely specified journey in
// the docs (the-garden-product-plan.md §4.2: commit -> code -> hand out ->
// redeem -> dashboard) with no product surface at all — only an admin-only
// tool that issues codes by hand. This is the sponsor's half. The creative's
// half already exists at /c/:code.
//
// Public on purpose: a church treasurer following a link from /for/churches
// has no account and shouldn't need one to see the price. Checkout needs an
// account, so the button carries the intent through signup the same way
// /join does.

import { useState } from "react";
import { useAction, useConvexAuth, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { Link, useNavigate, useRouteError } from "react-router";
import { api } from "../../convex/_generated/api";
import { setPendingIntent } from "../lib/pendingIntent";
import { GardenErrorState, GardenPage, SectionLabel } from "../garden/ui";
import "../garden/garden.css";

const SEAT_PRICE = 10; // $/seat/month, the published price

export function meta() {
  return [
    { title: "Sponsor your creatives — The Garden" },
    {
      name: "description",
      content:
        "Cover seats for the creatives in your church. $10 per seat per month, one code for your whole group.",
    },
  ];
}

export function ErrorBoundary() {
  useRouteError();
  return (
    <GardenPage>
      <div style={{ marginTop: 28 }}>
        <GardenErrorState message="This page isn't live yet — check back soon." />
      </div>
    </GardenPage>
  );
}

function errorMessage(err: unknown): string {
  if (err instanceof ConvexError) {
    const data = err.data as unknown;
    if (typeof data === "string") return data;
    if (data && typeof data === "object" && "reason" in data) {
      const reason = (data as { reason?: unknown }).reason;
      if (reason) return String(reason);
    }
  }
  return "Checkout didn't open. Try again in a moment.";
}

export default function CoverageIndex() {
  const { isAuthenticated } = useConvexAuth();
  const navigate = useNavigate();
  const communities = useQuery(api.garden.communities.listCommunities);
  const createCoverageCheckout = useAction(api.garden.stripe.createCoverageCheckout);

  const [seats, setSeats] = useState(10);
  const [sponsorName, setSponsorName] = useState("");
  const [orgId, setOrgId] = useState<string>("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const chosenOrgId = orgId || communities?.[0]?._id || "";
  const validSeats = Number.isInteger(seats) && seats >= 1 && seats <= 500;
  const ready = validSeats && sponsorName.trim().length > 0 && !!chosenOrgId;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready || pending) return;
    if (!isAuthenticated) {
      // One choice, not two: they've priced it, so send them to sign up
      // and bring them straight back here.
      setPendingIntent("/coverage");
      navigate("/signup");
      return;
    }
    setError(null);
    setPending(true);
    try {
      const { url } = await createCoverageCheckout({
        hostOrgId: chosenOrgId as never,
        seats,
        sponsorName: sponsorName.trim(),
      });
      window.location.assign(url);
    } catch (err) {
      setError(errorMessage(err));
      setPending(false);
    }
  }

  return (
    <GardenPage>

      <div style={{ marginTop: 28, maxWidth: "58ch" }}>
        <h1 className="g-h" style={{ fontSize: "clamp(28px,5vw,40px)" }}>
          Sponsor your creatives.
        </h1>
        <p style={{ marginTop: 12, fontSize: 15, lineHeight: 1.6 }}>
          Cover seats for the people in your church who make things. You get
          one code to hand out. They get everything a paying member gets.
        </p>
      </div>

      <div style={{ marginTop: 28, maxWidth: 460 }}>
        <SectionLabel>How many</SectionLabel>
        <form onSubmit={handleSubmit} style={{ marginTop: 12 }}>
          {communities && communities.length > 1 && (
            <div style={{ marginBottom: 14 }}>
              <label htmlFor="cov-org" className="g-label">
                Community
              </label>
              <select
                id="cov-org"
                className="g-input"
                value={chosenOrgId}
                onChange={(e) => setOrgId(e.target.value)}
                style={{ marginTop: 6, width: "100%" }}
              >
                {communities.map((c: { _id: string; name: string }) => (
                  <option key={c._id} value={c._id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <label htmlFor="cov-seats" className="g-label">
            Seats
          </label>
          <input
            id="cov-seats"
            type="number"
            min={1}
            max={500}
            className="g-input"
            value={seats}
            onChange={(e) => setSeats(Number(e.target.value))}
            style={{ marginTop: 6, width: 120 }}
          />

          <div style={{ marginTop: 14 }}>
            <label htmlFor="cov-name" className="g-label">
              Who's sponsoring
            </label>
            <input
              id="cov-name"
              type="text"
              className="g-input"
              placeholder="Grace Fellowship"
              value={sponsorName}
              onChange={(e) => setSponsorName(e.target.value)}
              style={{ marginTop: 6, width: "100%", maxWidth: 320 }}
            />
            <p className="g-hint" style={{ marginTop: 6 }}>
              This is the name credited on the work your creatives publish.
            </p>
          </div>

          <div
            className="g-card"
            style={{ marginTop: 18, display: "flex", justifyContent: "space-between", gap: 12 }}
          >
            <span style={{ fontSize: 15 }}>
              {validSeats ? seats : 0} {validSeats && seats === 1 ? "seat" : "seats"}
            </span>
            <span className="g-h" style={{ fontSize: 18 }}>
              ${validSeats ? seats * SEAT_PRICE : 0}/mo
            </span>
          </div>

          <button
            type="submit"
            className="g-btn g-btn-citron"
            disabled={!ready || pending}
            style={{ marginTop: 16, ...(!ready || pending ? { opacity: 0.5 } : {}) }}
          >
            {pending ? "Opening checkout…" : "Continue to checkout"}
          </button>
          {error && (
            <p className="g-hint" style={{ marginTop: 10 }}>
              {error}
            </p>
          )}
        </form>

        <p className="g-hint" style={{ marginTop: 20 }}>
          Cancel any time in{" "}
          <Link to="/settings" style={{ textDecoration: "underline" }}>
            Settings
          </Link>
          . Seats nobody has claimed stop billing when you cancel.
        </p>
      </div>
    </GardenPage>
  );
}
