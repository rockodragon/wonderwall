// /join — the membership page. The front door's primary CTA lands here.
//
// Each paid card is a real Stripe Checkout button — garden/stripe.ts's
// createMembershipCheckout, the same action settings.tsx's billing portal
// and fund.$slug.tsx's pool contribution already use. There is no waitlist
// fallback: clicking a tier either opens a real Checkout session or shows a
// plain error (e.g. a price isn't configured yet). A signed-out visitor is
// asked once, not twice — the click stashes ?level= as a pending intent and
// sends them to signup; _app.tsx replays it, and the tier they picked opens
// checkout on arrival.
//
// "Seat" stayed as the internal Level value (capabilities.ts, memberships
// .level) — that's a bigger rename than this page needs. What changed here
// is the WORD a visitor reads: "member," not "seat." A dues split rendered
// as two stat tiles read like a leaked admin metric, not a pitch, so it's
// gone; the same idea — part of what you pay funds someone else's work —
// is one clause in the subhead, no dollar figures.
//
// Hosting a community (tables, classes, selling to your own people) is
// free — that's /communities/apply, not a line item here (see
// docs/features/community-groups.md §0 and the /for/hosts page's own cost
// line). The paid "Community Host" tier below is a distinct upgrade for a
// host who ALSO wants to run funding programs for their community — it is
// not the price of hosting itself, and the copy says so.

import { useCallback, useEffect, useRef, useState } from "react";
import { useAction, useConvexAuth, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { Link, useNavigate, useRouteError, useSearchParams } from "react-router";
import { api } from "../../convex/_generated/api";
import { SiteHeader } from "../components/SiteHeader";
import { setPendingIntent } from "../lib/pendingIntent";
import { GardenErrorState, GardenPage, SectionLabel } from "../garden/ui";
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
      <SiteHeader />
      <div style={{ marginTop: 28 }}>
        <GardenErrorState message="This page isn't live yet — check back soon." />
      </div>
    </GardenPage>
  );
}

type MembershipLevel = "seat" | "five" | "host";

type LevelCard = {
  name: string;
  price: string;
  recommended: boolean;
  perks: string[];
  /** Absent on the free tier — nothing to check out. */
  level?: MembershipLevel;
  /** A short note under the perks, for the one tier where the price needs
      one sentence of context (Community Host — see the file header). */
  note?: string;
};

const LEVELS: LevelCard[] = [
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
    level: "seat",
    perks: [
      "One active passion project",
      "Apply to paid work",
      "Put on events",
      "Join member tables",
      "Propose to the Grant Fund",
    ],
  },
  {
    name: "Five projects",
    price: "$25/mo",
    recommended: false,
    level: "five",
    perks: [
      "Up to five active projects",
      "Invite collaborators onto them",
      "Everything a member gets",
    ],
  },
  {
    name: "Community Host",
    price: "$50/mo",
    recommended: false,
    level: "host",
    perks: [
      "Run funding programs for your community — contests, funded cohorts, grant pools (coming)",
      "Create tables — your roster, your format",
      "Ten active projects",
    ],
    note: "Hosting itself is free — apply any time at /communities/apply. This is for a host who also wants to run funding programs.",
  },
];

/** Same shape as settings.tsx's billingErrorMessage — a plain ConvexError
    string or {reason} reads as a warm line instead of the generic fallback. */
function checkoutErrorMessage(err: unknown): string {
  if (err instanceof ConvexError) {
    const data = err.data as unknown;
    if (typeof data === "string") return data;
    if (data && typeof data === "object" && "reason" in data) {
      const reason = (data as { reason?: unknown }).reason;
      if (reason) return String(reason);
    }
  }
  return "Checkout didn't open — try again in a moment.";
}

function LevelButton({ card, autoStart }: { card: LevelCard; autoStart: boolean }) {
  const { isAuthenticated } = useConvexAuth();
  const navigate = useNavigate();
  const createMembershipCheckout = useAction(api.garden.stripe.createMembershipCheckout);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  const btnClass = card.recommended ? "g-btn g-btn-citron" : "g-btn g-btn-ghost";

  const startCheckout = useCallback(async () => {
    if (!card.level) return;
    setError(null);
    setPending(true);
    try {
      const { url } = await createMembershipCheckout({ level: card.level });
      window.location.assign(url);
    } catch (err) {
      setError(checkoutErrorMessage(err));
      setPending(false);
    }
  }, [card.level, createMembershipCheckout]);

  // They picked this tier before they had an account. _app.tsx sent them
  // back here with ?level=, so open checkout rather than asking again.
  useEffect(() => {
    if (!autoStart || !isAuthenticated || started.current) return;
    started.current = true;
    void startCheckout();
  }, [autoStart, isAuthenticated, startCheckout]);

  if (!card.level) {
    // Free tier — nothing to check out, just an account.
    return (
      <Link to="/signup" className={btnClass} style={{ marginTop: 14, alignSelf: "flex-start" }}>
        Sign up free
      </Link>
    );
  }

  function handleClick() {
    if (!isAuthenticated) {
      // One choice, not two: remember the tier, then send them to sign up.
      setPendingIntent(`/join?level=${card.level}`);
      navigate("/signup");
      return;
    }
    void startCheckout();
  }

  return (
    <div style={{ marginTop: 14 }}>
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className={btnClass}
        style={pending ? { opacity: 0.6, cursor: "wait" } : undefined}
      >
        {pending ? "Opening checkout…" : `Join — ${card.price}`}
      </button>
      {error && (
        <p className="g-hint" style={{ marginTop: 8, maxWidth: "34ch" }}>
          {error}
        </p>
      )}
    </div>
  );
}

export default function JoinPage() {
  const membership = useQuery(api.garden.memberships.getMyMembership);
  const [searchParams] = useSearchParams();
  const resumeLevel = searchParams.get("level");

  return (
    <GardenPage wide>
      <SiteHeader />

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

      {membership && (
        <p className="g-hint" style={{ marginTop: 16 }}>
          You're already a member.{" "}
          <Link to="/settings" style={{ textDecoration: "underline" }}>
            Manage billing in Settings.
          </Link>
        </p>
      )}

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
              style={{
                display: "flex",
                flexDirection: "column",
                ...(level.recommended ? { borderColor: "var(--g-citron)" } : {}),
              }}
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
              {level.note && (
                <p className="g-hint" style={{ marginTop: 10 }}>
                  {level.note}
                </p>
              )}
              <div style={{ marginTop: "auto" }}>
                <LevelButton card={level} autoStart={level.level === resumeLevel} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <p className="g-hint" style={{ marginTop: 20 }}>
        Covered by a church or sponsor? A coverage code gets you full
        membership at no cost — the link they gave you starts with /c/.
      </p>
    </GardenPage>
  );
}
