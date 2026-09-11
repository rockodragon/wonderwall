// /join — the membership page. The front door's primary CTA lands here.
//
// Checkout is NOT live yet (Stripe keys pending, spec §1.1), so this page is
// deliberately honest about that instead of faking a payment flow: it shows
// exactly what each level gets and what it costs, and captures interest with
// the existing waitlist mutation. When Stripe lands, the tier buttons swap
// from "Tell me when membership opens" to createMembershipCheckout — the
// layout and copy don't change.
//
// "Seat" stayed as the internal Level value (capabilities.ts, memberships
// .level) — that's a bigger rename than this page needs. What changed here
// is the WORD a visitor reads: "member," not "seat." A dues split rendered
// as two stat tiles read like a leaked admin metric, not a pitch, so it's
// gone; the same idea — part of what you pay funds someone else's work —
// is one clause in the subhead now, no dollar figures.

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
    { title: "Become a member — The Garden" },
    {
      name: "description",
      content:
        "Membership in The Garden is $10/mo: start a project, apply to paid work, join member tables — and support other creatives through the Grant Fund.",
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
      "Support or join projects",
    ],
  },
  {
    name: "Member",
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
    name: "Team",
    price: "$25/mo",
    recommended: false,
    perks: [
      "Up to five active projects",
      "Invite collaborators onto them",
      "Everything a member gets",
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
          Become a member.
        </h1>
        <p style={{ marginTop: 12, fontSize: 15, lineHeight: 1.6 }}>
          Membership is yours to use — start a project, apply to paid work,
          join tables — and part of it funds the Grant Fund for other
          creatives too.
        </p>
      </div>

      <div style={{ marginTop: 32 }}>
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

      <p className="g-hint" style={{ marginTop: 12 }}>
        Already a member?{" "}
        <Link to="/settings" style={{ textDecoration: "underline" }}>
          Manage billing in Settings.
        </Link>
      </p>

      {/* Honest about the state of things: no fake checkout. */}
      <div style={{ marginTop: 36, maxWidth: "52ch" }}>
        <SectionLabel>Membership opens this fall</SectionLabel>
        {state === "done" ? (
          <div
            className="g-card"
            style={{ marginTop: 12, borderColor: "var(--g-citron)" }}
          >
            <p style={{ fontSize: 15, lineHeight: 1.6 }}>
              You're on the list. We'll email you the day membership opens
              — and nothing else.
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
                {state === "sending" ? "Sending…" : "Tell me when membership opens"}
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
          Covered by a church or sponsor? A coverage code gets you full
          membership at no cost — the link they gave you starts with /c/.
        </p>
      </div>
    </GardenPage>
  );
}
