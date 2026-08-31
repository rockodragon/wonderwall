// /join — the membership page. The front door's primary CTA lands here.
//
// Checkout is NOT live yet (Stripe keys pending, spec §1.1), so this page is
// deliberately honest about that instead of faking a payment flow: it shows
// exactly what each level gets and what it costs, and captures interest with
// the existing waitlist mutation. When Stripe lands, the tier buttons swap
// from "Tell me when seats open" to createMembershipCheckout — the layout and
// copy don't change.

import { useState } from "react";
import { useMutation } from "convex/react";
import { Link, useRouteError } from "react-router";
import { api } from "../../convex/_generated/api";
import { WaitlistFollowUp } from "../components/WaitlistFollowUp";
import {
  GardenErrorState,
  GardenNav,
  GardenPage,
  SectionLabel,
} from "../garden/ui";
import "../garden/garden.css";

export function meta() {
  return [
    { title: "Take a seat — The Garden" },
    {
      name: "description",
      content:
        "A seat in The Garden is $10/mo: start a project, apply to paid work, join member tables. Half of every membership funds another creative's project.",
    },
  ];
}

export function ErrorBoundary() {
  useRouteError();
  return (
    <GardenPage>
      <GardenNav />
      <div style={{ marginTop: 28 }}>
        <GardenErrorState message="This page isn't live yet — check back soon." />
      </div>
    </GardenPage>
  );
}

const LEVELS = [
  {
    name: "Free account",
    price: "$0",
    recommended: false,
    perks: [
      "Profile and portfolio",
      "Join open tables",
      "RSVP to public events",
      "Follow projects",
    ],
  },
  {
    name: "A seat",
    price: "$10/mo",
    recommended: true,
    perks: [
      "One active passion project",
      "Apply to paid work",
      "Put on events",
      "Join member tables",
      "Propose to the Grant Fund",
    ],
  },
  {
    name: "Five seats",
    price: "$25/mo",
    recommended: false,
    perks: [
      "Up to five active projects",
      "Invite collaborators onto them",
      "Everything a seat gets",
    ],
  },
  {
    name: "Leader",
    price: "$50/mo",
    recommended: false,
    perks: [
      "Host tables — your roster, your format",
      "Curate project spaces",
      "Run community grant programs (coming)",
      "Ten active projects",
      "Keep 90% of anything you sell",
    ],
  },
];

export default function JoinPage() {
  const addToWaitlist = useMutation(api.waitlist.addToWaitlist);
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [message, setMessage] = useState("");
  const [position, setPosition] = useState<number | null>(null);

  const valid = /.+@.+\..+/.test(email.trim());

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || state === "sending") return;
    setState("sending");
    try {
      const result = await addToWaitlist({ email: email.trim() });
      setPosition(result.position ?? null);
      setState("done");
    } catch {
      setState("error");
      setMessage("That didn't go through — try again in a moment.");
    }
  }

  return (
    <GardenPage wide>
      <GardenNav />

      <div style={{ marginTop: 28, maxWidth: "58ch" }}>
        <h1 className="g-h" style={{ fontSize: "clamp(28px,5vw,40px)" }}>
          Take a seat.
        </h1>
        <p style={{ marginTop: 12, fontSize: 15, lineHeight: 1.6 }}>
          Half of every membership funds another creative's project. From day
          one your money is supporting someone — instead of hoping to hear
          back.
        </p>
      </div>

      {/* The published dues split — always two cells: $5 funds other
          creatives' projects, $5 runs the place. Data cells, never buttons. */}
      <div style={{ display: "flex", gap: 10, marginTop: 22, maxWidth: 460 }}>
        <div className="g-cell g-cell-hot" style={{ flex: 1, textAlign: "center" }}>
          <span className="g-cell-v" style={{ fontSize: 18 }}>$5</span>
          <div
            className="g-mono"
            style={{
              fontSize: 12.5,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: "var(--g-muted)",
              marginTop: 4,
            }}
          >
            funds other creatives' projects
          </div>
        </div>
        <div className="g-cell" style={{ flex: 1, textAlign: "center" }}>
          <span className="g-cell-v" style={{ fontSize: 18 }}>$5</span>
          <div
            className="g-mono"
            style={{
              fontSize: 12.5,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: "var(--g-muted)",
              marginTop: 4,
            }}
          >
            runs the place
          </div>
        </div>
      </div>

      <div style={{ marginTop: 36 }}>
        <SectionLabel>Levels</SectionLabel>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))",
            gap: 14,
            marginTop: 12,
          }}
        >
          {LEVELS.map((level) => (
            <div
              key={level.name}
              className="g-card"
              style={
                level.recommended
                  ? { borderColor: "var(--g-citron)" }
                  : undefined
              }
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                  gap: 10,
                  flexWrap: "wrap",
                }}
              >
                <div className="g-h" style={{ fontSize: 18 }}>
                  {level.name}
                </div>
                <span
                  className={
                    level.recommended
                      ? "g-badge g-badge-citron"
                      : "g-badge g-badge-line"
                  }
                >
                  {level.price}
                </span>
              </div>
              {level.recommended && (
                <div
                  className="g-mono"
                  style={{
                    fontSize: 12.5,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    color: "var(--g-citron)",
                    marginTop: 8,
                  }}
                >
                  Most people start here
                </div>
              )}
              <ul
                style={{
                  listStyle: "none",
                  padding: 0,
                  margin: "12px 0 0",
                  display: "flex",
                  flexDirection: "column",
                  gap: 7,
                }}
              >
                {level.perks.map((perk) => (
                  <li
                    key={perk}
                    style={{ fontSize: 15, color: "var(--g-body)", lineHeight: 1.45 }}
                  >
                    {perk}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {/* Honest about the state of things: no fake checkout. */}
      <div style={{ marginTop: 36, maxWidth: "52ch" }}>
        <SectionLabel>Seats open this fall</SectionLabel>
        {state === "done" ? (
          <div
            className="g-card"
            style={{ marginTop: 12, borderColor: "var(--g-citron)" }}
          >
            <p style={{ fontSize: 15, lineHeight: 1.6 }}>
              You're on the list. We'll email you the day seats open — and
              nothing else.
            </p>
            <div style={{ marginTop: 14, display: "flex", gap: 14, flexWrap: "wrap" }}>
              <Link to="/tables" className="g-btn g-btn-ghost">
                See the tables
              </Link>
              <Link to="/projects" className="g-btn g-btn-ghost">
                See what people are making
              </Link>
            </div>

            <WaitlistFollowUp email={email.trim()} initialPosition={position} />
          </div>
        ) : (
          <>
            <p style={{ marginTop: 10, fontSize: 15, lineHeight: 1.6 }}>
              Memberships open with our first tables this fall. Leave your
              email and you'll be first through the door.
            </p>
            <form
              onSubmit={handleSubmit}
              style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap" }}
            >
              <label htmlFor="join-email" className="g-label" style={{ flexBasis: "100%" }}>
                Email
              </label>
              <input
                id="join-email"
                type="email"
                className="g-input"
                style={{ maxWidth: 320 }}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
              <button
                type="submit"
                className="g-btn g-btn-citron"
                disabled={!valid || state === "sending"}
                style={!valid ? { opacity: 0.5, cursor: "not-allowed" } : undefined}
              >
                {state === "sending" ? "Sending…" : "Tell me when seats open"}
              </button>
            </form>
            {state === "error" && (
              <p className="g-hint" style={{ marginTop: 10 }}>
                {message}
              </p>
            )}
          </>
        )}
        <p className="g-hint" style={{ marginTop: 14 }}>
          Covered by a church or sponsor? A coverage code gets you a full seat
          at no cost — the link they gave you starts with /c/.
        </p>
      </div>
    </GardenPage>
  );
}
