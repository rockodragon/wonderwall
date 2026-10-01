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
// The ask is the ticket, right under the poem. It goes to the event's own
// page (EVENT_PATH), which takes the RSVP and the payment through Abiding
// Practice's Stripe Payment Link; the AP webhook adds the buyer to the event.
// The old email-capture overlay (TicketModal in ../garden/showcase-modals)
// is no longer used here.
//
// The FAQ uses native <details>/<summary> rather than a React accordion:
// every answer stays in the prerendered HTML for crawlers and answer engines,
// and the keyboard support comes free. Don't "upgrade" it to JS.
//
// The hero is the Abiding Creatives poster, used as is (it's already
// light-on-dark).
//
// The route-level ErrorBoundary is a net, not a plan: nothing on this page
// may make a query the page can't live without. If a decorative query ever
// comes back, give it its own component behind its own error boundary.

import type { ReactNode } from "react";
import { Link, useNavigate, useRouteError } from "react-router";
import { GardenErrorState, GardenPage, SectionLabel } from "../garden/ui";
import "../garden/garden.css";
import { CLAIMS } from "../constants/claims";

export function meta() {
  return [
    {
      title:
        "The Creative Economy We All Need — November 6, Encinitas | TheCreative.exchange",
    },
    {
      name: "description",
      content:
        "A night of creative work at Lightchurch, Encinitas. Tickets $25, and every ticket goes into the Sophia Fund. November 6, 2026.",
    },
    {
      property: "og:title",
      content: "The Creative Economy We All Need — November 6, Encinitas",
    },
    {
      property: "og:description",
      content:
        "A night of creative work at Lightchurch, Encinitas. Tickets $25. Every ticket goes into the Sophia Fund.",
    },
    { property: "og:type", content: "website" },
    // Absolute — a relative og:image doesn't unfurl on Instagram, iMessage
    // or Slack. The drawing is 1330x795; large-summary cards letterbox it.
    { property: "og:image", content: OG_IMAGE },
    { property: "og:image:width", content: "1200" },
    { property: "og:image:height", content: "630" },
    { name: "twitter:card", content: "summary_large_image" },
    {
      name: "twitter:title",
      content: "The Creative Economy We All Need — November 6, Encinitas",
    },
    {
      name: "twitter:description",
      content:
        "A night of creative work at Lightchurch, Encinitas. Tickets $25. Every ticket goes into the Sophia Fund.",
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

const OG_IMAGE = "https://thecreative.exchange/showcase/abiding-creatives-og.jpg";

const EVENT_DATE = "Friday, November 6, 2026";
const EVENT_PLACE = "Lightchurch, Encinitas, California";

const TICKET = {
  label: "Admission",
  price: "$25",
} as const;

// The November 6 event on the platform. Its page sells the ticket.
const EVENT_PATH = "/events/kd7atbz3s1t2rccgt4pn10pvd98cdz62";

// The opening is a poem, and it is set as one: stanzas, and line breaks
// where the writer put them. Never let a tidy-up collapse these into
// sentences.
const OPENING = [
  [
    "The Church is re-awakening to the power of the arts",
    "And learning how to become her patron again",
  ],
  [
    "Seeing creatives as our missionaries of Beauty,",
    "Revealing the Heart of The Creator to our culture",
  ],
  [
    "The time to build bridges is now",
    "And artists are the evangelists",
  ],
  [
    "A new creative community is forming",
    "A Garden for: Makers. Backers. And Partners.",
  ],
  [
    "November 6th is the first night.",
    "Come and See.",
  ],
  ["The Renaissance is waiting"],
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
}
/* Wherever a line fits, it stays one line — the writer's breaks, not the
   column's (Rick, 2026-09-28: "The Church is re-awakening…" was wrapping
   under the old 46ch cap). A phone is too narrow for the longest lines at a
   readable size, so there they wrap with the hanging indent below. */
@media (min-width: 600px) {
  .sc-verse .sc-stanza > span { white-space: nowrap; }
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
  const navigate = useNavigate();
  // Tickets are sold on the event itself: its page takes the RSVP and the
  // payment (AP's Stripe Payment Link), and the AP webhook adds the buyer to
  // the event. This page only sends people there.
  function openTicket() {
    navigate(EVENT_PATH);
  }

  return (
    <GardenPage>
      <style>{PAGE_CSS}</style>

      {/* Hero */}
      <div style={{ marginTop: 18 }}>
        {/* The event poster (Rick, 2026-09-28). Already light-on-dark, so no
            invert; capped so a portrait poster doesn't push the page down. */}
        <img
          src="/showcase/abiding-creatives-poster.jpg"
          alt="Abiding Creatives — an evening to showcase and support creative communities. Music by Shua and John Van Deusen. November 6, 6pm, Light Church Encinitas. Best Pizza & Brew."
          width={792}
          height={1118}
          style={{
            width: "100%",
            maxWidth: 520,
            height: "auto",
            marginBottom: 26,
            borderRadius: 6,
            display: "block",
          }}
        />

        <span className="g-badge g-badge-citron">November 6 · Encinitas</span>
        <h1 className="g-h" style={{ marginTop: 16 }}>
          A Creative Renaissance is Beginning
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
      <Section label="Tickets">
        <button
          type="button"
          className="g-card sc-ticket"
          onClick={openTicket}
          aria-label={`Buy tickets, ${TICKET.label} ${TICKET.price}`}
          style={{
            display: "flex",
            flexWrap: "wrap",
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
          <span style={{ flex: "1 1 160px" }}>
            <span style={{ color: "var(--g-paper)", display: "block" }}>
              {TICKET.label}
            </span>
            <span
              className="g-h"
              style={{ fontSize: 30, color: "var(--g-paper)", display: "block", marginTop: 2 }}
            >
              {TICKET.price}
            </span>
          </span>
          <span
            className="g-btn g-btn-citron"
            style={{ flexShrink: 0, whiteSpace: "nowrap", alignSelf: "center" }}
          >
            Buy tickets
          </span>
        </button>
        <P>
          {CLAIMS.ticketFund}{" "}
          <Link to="/fund/sophia" style={{ color: "var(--g-citron)" }}>
            About the Sophia Fund →
          </Link>
        </P>
      </Section>


      <Section label="The details">
        <FactLine k="When" v={EVENT_DATE} />
        <FactLine k="Where" v={EVENT_PLACE} />
        <FactLine k="Admission" v={TICKET.price} />
      </Section>

      {/* Art is submitted from a profile in the app, not a form here. Its
          own section with the steps spelled out, below the details (Rick,
          2026-09-28). A signed-out visitor goes through sign-in first. */}
      <Section label="Show your work">
        <P>
          Art for November 6 comes from profiles on TheCreative.exchange. To be
          considered:
        </P>
        <ol style={{ margin: "14px 0 0", paddingLeft: 22, display: "grid", gap: 8, fontSize: 16.5, lineHeight: 1.6 }}>
          <li>
            <Link to="/signup" style={{ color: "var(--g-citron)" }}>
              Create an account
            </Link>
            . You'll need an invite code, or you can request to join.
          </li>
          <li>Open your profile and find <strong style={{ color: "var(--g-paper)" }}>Work &amp; Portfolio</strong>.</li>
          <li>
            Press <strong style={{ color: "var(--g-paper)" }}>+ Add</strong> and add the pieces you'd want
            shown: a photo, a video or a link, with a line about each.
          </li>
        </ol>
        <P>We'll see your work there. There's no separate form.</P>
        <div style={{ marginTop: 18 }}>
          <Link to="/settings" className="g-btn g-btn-citron">
            Submit your work →
          </Link>
        </div>
      </Section>

      <Section label="Questions people ask">
        <div style={{ display: "grid", gap: 10 }}>
          <Faq q="What does it cost?">
            {TICKET.price} a ticket. Every ticket goes into
            the Sophia Fund, an artist grant fund that backs projects by
            creatives in the community.{" "}
            <Link to="/fund/sophia" style={{ color: "var(--g-citron)" }}>
              About the Sophia Fund →
            </Link>
          </Faq>
          <Faq q="Do I have to be a creative to come?">
            No. Anyone can come.
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
            truth, goodness and beauty.
          </Faq>
        </div>
      </Section>

      <Section label="See you there">
        <button type="button" className="g-btn g-btn-citron" onClick={openTicket}>
          Buy tickets · {TICKET.price}
        </button>
      </Section>

    </GardenPage>
  );
}
