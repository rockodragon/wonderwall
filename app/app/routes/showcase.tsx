// /showcase — November 6 at Lightchurch, Encinitas. Every link in the
// Instagram push points here (docs/marketing/showcase-open-call.md), so it is
// public, prerendered, and readable with no account.
//
// ONE TICKET, ONE PRICE, ONE ASK (Rick, 2026-09-25). The page used to run a
// juried open call beside a two-tier ticket ($25 creative, $75 patron), six
// ways to take part and a grid of personas. All of that is gone: art is
// submitted from a member's profile in the app (the FAQ points there), not
// through a form on this page, and we are not sorting people into
// creatives and patrons. Everyone gets the same $25 ticket; generosity beyond
// it is something we ask for later, not something the ticket tries to
// extract. If this page starts growing roles, tiers or an application again,
// that is a product decision to take back to Rick, not a copy edit.
//
// The ask is the ticket, right under the poem. With no checkout yet
// (TICKET_URL is null) the ticket overlay takes an email and promises the
// link — the address is saved on its own before any optional question
// (see TicketModal in ../garden/showcase-modals). convex/showcase.ts's
// `apply` is that write; it also lands the email on the waitlist.
//
// The FAQ uses native <details>/<summary> rather than a React accordion:
// every answer stays in the prerendered HTML for crawlers and answer engines,
// and the keyboard support comes free. Don't "upgrade" it to JS.
//
// The hero drawing is inverted (filter: invert(1)) rather than re-exported:
// it's ink on white paper, and the Garden shell is paper on ink.
//
// The route-level ErrorBoundary is a net, not a plan: nothing on this page
// may make a query the page can't live without. If a decorative query ever
// comes back, give it its own component behind its own error boundary.

import { useState } from "react";
import type { ReactNode } from "react";
import { useMutation } from "convex/react";
import { Link, useRouteError } from "react-router";
import { api } from "../../convex/_generated/api";
import { GardenErrorState, GardenPage, SectionLabel } from "../garden/ui";
import { TicketModal } from "../garden/showcase-modals";
import type { TicketDetails } from "../garden/showcase-modals";
import "../garden/garden.css";

export function meta() {
  return [
    {
      title:
        "The Creative Economy We All Need — November 6, Encinitas | creatives.exchange",
    },
    {
      name: "description",
      content:
        "A night of creative work at Lightchurch, Encinitas. One ticket, $25, and every ticket goes into the grant fund. November 6, 2026.",
    },
    {
      property: "og:title",
      content: "The Creative Economy We All Need — November 6, Encinitas",
    },
    {
      property: "og:description",
      content:
        "A night of creative work at Lightchurch, Encinitas. One ticket, $25. Every ticket goes into the grant fund.",
    },
    { property: "og:type", content: "website" },
    // Absolute — a relative og:image doesn't unfurl on Instagram, iMessage
    // or Slack. The drawing is 1330x795; large-summary cards letterbox it.
    { property: "og:image", content: OG_IMAGE },
    { property: "og:image:width", content: "1330" },
    { property: "og:image:height", content: "795" },
    { name: "twitter:card", content: "summary_large_image" },
    {
      name: "twitter:title",
      content: "The Creative Economy We All Need — November 6, Encinitas",
    },
    {
      name: "twitter:description",
      content:
        "A night of creative work at Lightchurch, Encinitas. One ticket, $25. Every ticket goes into the grant fund.",
    },
    { name: "twitter:image", content: OG_IMAGE },
  ];
}

/** The backstop: a designed sentence and a way home, never a stack frame. */
export function ErrorBoundary() {
  useRouteError();
  return (
    <GardenPage>
      <div style={{ marginTop: 28 }}>
        <GardenErrorState message="This page isn't loading right now — try again in a moment." />
      </div>
    </GardenPage>
  );
}

const OG_IMAGE = "https://creatives.exchange/showcase/table-drawing.jpg";

const EVENT_DATE = "Friday, November 6, 2026";
const EVENT_PLACE = "Lightchurch, Encinitas, California";

// The one ticket. Same price for everyone.
const TICKET = {
  label: "Admission",
  price: "$25",
  note: "The same ticket for everyone.",
} as const;

// Per-event ticketing isn't built — events use an off-platform payment link
// (docs/events-video-hosting-prd.md). Null until there's a real checkout URL;
// the ticket overlay takes an email until then.
const TICKET_URL: string | null = null;

// The opening is a poem, and it is set as one: stanzas, and line breaks
// where the writer put them. Never let a tidy-up collapse these into
// sentences.
const OPENING = [
  [
    "Creatives keep making work no one sees.",
    "Patrons keep looking for work worth backing.",
  ],
  [
    "The church wants it donated.",
    "The gallery wants the faith left out.",
    "And the people who'd pay for the honest thing",
    "can't find the person who made it.",
  ],
  [
    "So we're building the third way.",
    "Makers. Backers. Partners.",
    "And a community that shows up for all.",
  ],
  [
    "November 6 is the first night.",
    "It's just the beginning.",
    "Come and see.",
  ],
] as const;

// ————— Page-local CSS —————
//
// What inline styles can't express: the <details> marker, the [open] state,
// hover, and the verse's hanging indent.
const PAGE_CSS = `
.sc-faq > summary { list-style: none; cursor: pointer; }
.sc-faq > summary::-webkit-details-marker { display: none; }
.sc-faq > summary::marker { content: ""; }
.sc-faq > summary:hover .sc-faq-q { color: var(--g-citron); }
.sc-faq > summary .sc-faq-mark::after { content: "+"; }
.sc-faq[open] > summary .sc-faq-mark::after { content: "–"; }
.sc-ticket:hover { border-color: var(--g-citron); }

/* Verse. Each line is a block so the writer's break is the one you see; the
   hanging indent means a line too long for a phone wraps INTO itself rather
   than looking like a new line. No text-wrap: balance — it would re-break
   the writer's lines. */
.sc-verse .sc-stanza {
  margin: 0 0 1.15em;
  max-width: 46ch;
}
.sc-verse .sc-stanza:last-child { margin-bottom: 0; }
.sc-verse .sc-stanza > span {
  display: block;
  padding-left: 1.1em;
  text-indent: -1.1em;
  font-size: clamp(16.5px, 3.6vw, 20px);
  line-height: 1.55;
  color: var(--g-paper);
}
.sc-verse .sc-stanza:last-child > span:last-child { color: var(--g-citron); }
`;

// ————— Small presentational pieces —————

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section style={{ marginTop: 56 }}>
      <SectionLabel>{label}</SectionLabel>
      <hr className="g-rule" style={{ margin: "10px 0 22px" }} />
      {children}
    </section>
  );
}

function P({ children }: { children: ReactNode }) {
  return (
    <p style={{ fontSize: 16.5, lineHeight: 1.65, marginTop: 14 }}>{children}</p>
  );
}

function FactLine({ k, v }: { k: string; v: string }) {
  return (
    <div
      style={{
        display: "flex",
        gap: 16,
        alignItems: "baseline",
        padding: "9px 0",
        borderBottom: "1px solid var(--g-hairline)",
      }}
    >
      <span className="g-label" style={{ minWidth: 96, flexShrink: 0 }}>
        {k}
      </span>
      <span style={{ fontSize: 15.5, color: "var(--g-paper)" }}>{v}</span>
    </div>
  );
}

/** A native disclosure styled as a Garden card. See the header. */
function Faq({ q, children }: { q: string; children: ReactNode }) {
  return (
    <details className="g-card sc-faq" style={{ padding: 0 }}>
      <summary
        style={{
          display: "flex",
          gap: 14,
          alignItems: "baseline",
          justifyContent: "space-between",
          padding: "15px 20px",
        }}
      >
        <span
          className="sc-faq-q"
          style={{ color: "var(--g-paper)", fontSize: 16.5, lineHeight: 1.4 }}
        >
          {q}
        </span>
        <span
          className="g-mono sc-faq-mark"
          aria-hidden="true"
          style={{ color: "var(--g-citron)", fontSize: 18, flexShrink: 0 }}
        />
      </summary>
      <div style={{ padding: "0 20px 18px", fontSize: 15.5, lineHeight: 1.65 }}>
        {children}
      </div>
    </details>
  );
}

// ————— Page —————

export default function Showcase() {
  const apply = useMutation(api.showcase.apply);
  const answer = useMutation(api.showcase.answerApplication);

  const [ticketOpen, setTicketOpen] = useState(false);
  const [ticketBusy, setTicketBusy] = useState(false);
  const [ticketError, setTicketError] = useState<string | null>(null);
  const [ticketDone, setTicketDone] = useState(false);
  // The address the overlay actually saved, so the optional answers after it
  // attach to the right row.
  const [ticketEmail, setTicketEmail] = useState("");

  function errorText(err: unknown): string {
    const raw = err instanceof Error ? err.message : String(err);
    // Convex prefixes thrown errors with its own framing; the visitor should
    // read the sentence we wrote, not a stack frame.
    const match = raw.match(/Uncaught Error:\s*(.+?)(\n|$)/);
    return (match?.[1] ?? raw).slice(0, 200);
  }

  /** Saves the address, alone, before anything else is asked. */
  async function notifyTicket(value: string) {
    setTicketBusy(true);
    setTicketError(null);
    try {
      await apply({ email: value });
      setTicketEmail(value.trim());
      setTicketDone(true);
    } catch (err) {
      setTicketError(errorText(err));
    } finally {
      setTicketBusy(false);
    }
  }

  /** The optional name/city/interests after the email. Pure upside: the
      email is already saved, so a failure here is recorded and swallowed. */
  async function submitTicketDetails(details: TicketDetails) {
    if (!ticketEmail) return;
    try {
      await answer({
        email: ticketEmail,
        name: details.name || undefined,
        city: details.city || undefined,
        interests: details.interests?.length ? details.interests : undefined,
      });
    } catch (err) {
      console.warn("[showcase] ticket details not saved", err);
    }
  }

  function openTicket() {
    setTicketError(null);
    setTicketDone(false);
    setTicketOpen(true);
  }

  return (
    <GardenPage>
      <style>{PAGE_CSS}</style>

      {/* Hero */}
      <div style={{ marginTop: 18 }}>
        <img
          src="/showcase/table-drawing.jpg"
          alt="Line drawing of people around a long table making things — playing guitar, throwing pottery, working with tools, reading."
          style={{
            width: "100%",
            marginBottom: 26,
            borderRadius: 6,
            filter: "invert(1)",
            display: "block",
          }}
        />

        <span className="g-badge g-badge-citron">November 6 · Encinitas</span>
        <h1 className="g-h" style={{ marginTop: 16 }}>
          Friends, neighbors&hellip;
        </h1>

        <div className="sc-verse" style={{ marginTop: 20 }}>
          {OPENING.map((stanza, i) => (
            <p key={i} className="sc-stanza">
              {stanza.map((line) => (
                <span key={line}>{line}</span>
              ))}
            </p>
          ))}
        </div>
      </div>

      {/* The one ask, right under "Come and see." */}
      <Section label="Get your ticket">
        <button
          type="button"
          className="g-card sc-ticket"
          onClick={openTicket}
          aria-label={`Get your ticket, ${TICKET.price}`}
          style={{
            display: "flex",
            gap: 16,
            alignItems: "baseline",
            width: "100%",
            textAlign: "left",
            background: "transparent",
            color: "inherit",
            fontFamily: "inherit",
            fontSize: "inherit",
            cursor: "pointer",
          }}
        >
          <span
            className="g-h"
            style={{ fontSize: 30, color: "var(--g-citron)", flexShrink: 0 }}
          >
            {TICKET.price}
          </span>
          <span style={{ flex: 1 }}>
            <span style={{ color: "var(--g-paper)", display: "block" }}>
              One ticket
            </span>
            <span className="g-hint" style={{ display: "block", marginTop: 4 }}>
              {TICKET.note}
            </span>
          </span>
          <span
            className="g-badge g-badge-line"
            style={{ flexShrink: 0, whiteSpace: "nowrap" }}
          >
            Save your space
          </span>
        </button>
        <P>
          Every ticket goes into the grant fund, the money that backs
          creatives' projects. Can't be in Encinitas? The livestream is free.
        </P>
      </Section>

      <Section label="The details">
        <FactLine k="When" v={EVENT_DATE} />
        <FactLine k="Where" v={EVENT_PLACE} />
        <FactLine k="Admission" v={`${TICKET.price}, the same for everyone`} />
        <FactLine k="Also" v="Livestreamed free, and recorded" />
      </Section>

      <Section label="Questions people ask">
        <div style={{ display: "grid", gap: 10 }}>
          <Faq q="What does it cost?">
            {TICKET.price}, and it's the same ticket for everyone. It's a
            benefit for the grant fund, so what you pay at the door goes back
            out to creatives as project money. The livestream is free.
          </Faq>
          <Faq q="Do I have to be a creative to come?">
            No. Anyone can come, and everyone buys the same ticket.
          </Faq>
          <Faq q="How do I submit my work?">
            From your profile in the app. Add your work to{" "}
            <Link to="/settings" style={{ color: "var(--g-citron)" }}>
              your profile
            </Link>{" "}
            and that's where we'll see it. There's no separate form.
          </Faq>
          <Faq q="Do I have to pay for a membership?">
            No, and a ticket doesn't sign you up for one.{" "}
            <Link to="/join" style={{ color: "var(--g-citron)" }}>
              Membership
            </Link>{" "}
            is separate.
          </Faq>
          <Faq q="Is the work all religious?">
            No. What we want to platform is redemptive work: work that embodies
            truth, goodness and beauty. Sometimes that includes church hurt.
          </Faq>
        </div>
      </Section>

      <Section label="See you there">
        <button type="button" className="g-btn g-btn-citron" onClick={openTicket}>
          Get your ticket · {TICKET.price}
        </button>
      </Section>

      <TicketModal
        open={ticketOpen}
        tier={TICKET}
        ticketUrl={TICKET_URL}
        submitting={ticketBusy}
        error={ticketError}
        done={ticketDone}
        onNotify={notifyTicket}
        onSubmitDetails={submitTicketDetails}
        onClose={() => setTicketOpen(false)}
      />
    </GardenPage>
  );
}
