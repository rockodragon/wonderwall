// /about/creatives, /about/patrons, /about/hosts, /about/partners — inside
// the app shell (Rick, 2026-09-29), replacing the static
// public/about/<audience>/index.html pages. Copy carried over as it was;
// "The Exchange" (retired name) became TheCreative.exchange and the dues
// line comes from CLAIMS.

import type { ReactNode } from "react";
import { Link, useParams } from "react-router";
import { CLAIMS } from "../constants/claims";
import { AboutShell, SectionLabel } from "./about";
import NotFound from "./404";

type Line = { lead?: string; rest?: string };
type Row = Line & { name: string; price?: string };
type Section = { label: string; rows: Row[] };
type Page = {
  title: string;
  heading: [string, string]; // plain, then the highlighted end
  lede: Line;
  sections: Section[];
  quote?: { text: string; creditLead: string; credit: string };
  statement?: ReactNode;
  cols?: { title: string; items: Line[] }[];
  ctas: { label: string; to: string; primary?: boolean }[];
  footer: string;
};

const PAGES: Record<string, Page> = {
  creatives: {
    title: "For creatives",
    heading: ["A seat, a project, and people who'll help you ", "make it."],
    lede: {
      rest: "TheCreative.exchange is a community of creatives — writers, musicians, designers, filmmakers, photographers — supported by patrons and by each other, making real work where they live.",
    },
    sections: [
      {
        label: "Ways to sit down",
        rows: [
          { name: "A seat", price: "$10/mo", lead: "Post one passion project", rest: "and let the community and its patrons support it. One active project at a time." },
          { name: "Five seats", price: "$25/mo", lead: "For the prolific", rest: "— run several projects at once, invite collaborators, keep momentum." },
          {
            name: "Host a table",
            price: "Free",
            lead: "Gather your people and curate their project space — hosting is free.",
            rest: "You keep 90% of anything you sell; the platform keeps 10%. Walk with other creatives as the person who sets the table.",
          },
        ],
      },
    ],
    quote: {
      text: "“Shua plays the San Diego music scene. His patron funds the work — he's free to play bars, festivals, wherever the music belongs.”",
      creditLead: "A living Fellowship",
      credit: "supported by a neighborhood church",
    },
    statement: (
      <>
        {CLAIMS.dues} {CLAIMS.duesOtherHalf}
      </>
    ),
    cols: [
      {
        title: "What you get to give",
        items: [
          { lead: "Support for local creatives", rest: "and their passion projects" },
          { lead: "Your time and expertise", rest: "— collaborating, mentoring" },
        ],
      },
      {
        title: "What you get",
        items: [
          { lead: "A network of collaborators", rest: "and real support" },
          { lead: "Projects to join and propose", rest: "from day one" },
          { lead: "A public story page", rest: "that shows what your work produces" },
        ],
      },
    ],
    ctas: [
      { label: "Take a seat", to: "/", primary: true },
      { label: "See how patrons support the work", to: "/about/patrons" },
    ],
    footer: "A home for creatives.",
  },
  patrons: {
    title: "For patrons",
    heading: ["Shape the creative economy of ", "your community."],
    lede: {
      rest: "TheCreative.exchange connects you with creatives — musicians, filmmakers, designers, writers — and gives you real ways to bring their work to life. Commission the mural. Fund the album. Host the event. Cover the seat. Then watch the work flourish in your community.",
    },
    sections: [
      {
        label: "Ways to build",
        rows: [
          { name: "Cover one seat", price: "$10/mo", lead: "Pay for one creative's place at a table.", rest: "You'll get their story updates, with your name in the credit line." },
          { name: "A Fellowship", price: "$500+/mo", lead: "Ongoing support for a named creative", rest: "doing outward-facing work. Your name stands on their public story page." },
          { name: "A Project", price: "$25–$5,000", lead: "One-time funding for a specific work", rest: "— a mural, an album, a film, an event — proposed by a creative or commissioned by you." },
          { name: "Seats at the table", price: "10 or 25 seats", lead: "Cover participation for creatives", rest: "in a community your organization cares about." },
          {
            name: "Your whole organization",
            price: "Contact us",
            lead: "Seats for every creative in your organization (a church, a business, a nonprofit)",
            rest: "— $10 a seat, any number of seats on one subscription. A covered seat is a full seat.",
          },
        ],
      },
    ],
    quote: {
      text: "Ongoing story updates as the work happens — photos, places, people reached. A page you can forward to your board without writing a report first.",
      creditLead: "Every gift becomes a story",
      credit: "public, shareable, credited to you",
    },
    ctas: [
      { label: "Support a creative", to: "/", primary: true },
      { label: "Cover a seat", to: "/" },
    ],
    footer: "Where creatives find the people who support their work.",
  },
  hosts: {
    title: "For hosts",
    heading: ["Get paid to gather the people you ", "already gather."],
    lede: {
      lead: "You're a creative who leads a community.",
      rest: "TheCreative.exchange gives you the tools — gather with like-minded people around tables, fund the work they're called to, and tell the stories that help the whole community grow.",
    },
    sections: [
      {
        label: "What a host does here",
        rows: [
          {
            name: "Gather",
            lead: "Tables for every kind of gathering",
            rest: "— open nights anyone can walk into, committed groups that run a season, virtual or in person. One place instead of five tools.",
          },
          {
            name: "Fund",
            lead: "Projects and Fellowships",
            rest: `— creatives propose, the community decides, patrons and sponsors fund. ${CLAIMS.duesEvery}`,
          },
          { name: "Tell the story", lead: "A public story page for every funded work", rest: "— the proof that draws your next creatives and patrons in." },
        ],
      },
      {
        label: "Getting started",
        rows: [
          {
            name: "Host a table",
            price: "Free",
            lead: "Hosting is free — and you keep 90% of anything you sell",
            rest: "(classes, cohorts, premium tiers); the platform keeps 10%. Every host keeps at least one table free or open. Money is never the only door.",
          },
          {
            name: "Your whole organization",
            price: "Contact us",
            lead: "Seats for every creative in your organization",
            rest: "— $10 a seat, any number of seats on one subscription. A covered seat is a full seat.",
          },
          { name: "Setup & support", price: "Contact us", lead: "We'll help you set up your tables", rest: "and get your first projects going." },
        ],
      },
    ],
    quote: {
      text: "Table Art Society runs nine-month tables of ten in San Diego. Abiding Practice hosts open virtual tables every week. Both run on TheCreative.exchange — without branching into two products.",
      creditLead: "Hosting here now",
      credit: "Table Art Society · Abiding Practice",
    },
    ctas: [{ label: "Talk to us about hosting", to: "/", primary: true }],
    footer: "Where creatives find the people who support their work.",
  },
  partners: {
    title: "For community partners",
    heading: ["Be the place it ", "happens."],
    lede: {
      lead: "A community partner is a local organization with something the scene needs",
      rest: "— a room, a stage, a channel, the materials themselves. Coffee shops, galleries, venues, libraries, supply shops, podcasts and channels that feature local work, churches with a building. You bring what you have; creatives bring the people. Your slow Tuesday becomes their show — and their crowd becomes your regulars.",
    },
    sections: [
      {
        label: "What you can offer",
        rows: [
          { name: "Space", lead: "A wall, a night, a stage.", rest: "The back room on a Tuesday. The month your walls sit empty." },
          { name: "Goods & services", lead: "Paint, clay, film, gear, studio time", rest: "— the materials of making. Ten free prints a month goes further than you'd think." },
          {
            name: "Audience & channels",
            lead: "Your feed, your feature slot, your foot traffic",
            rest: "— a podcast episode, a channel spotlight, a mailing list. Put local work in front of the people who already follow you, online or in the room.",
          },
          { name: "Money", lead: "Sponsor a table or a show", rest: "— when you want to fund the scene directly, that door is open too." },
        ],
      },
    ],
    quote: {
      text: "A full room on a Tuesday, and a credit on the work that came out of it.",
      creditLead: "The first proof",
      credit: "within a week of your first offer",
    },
    cols: [
      {
        title: "Why partners say yes",
        items: [
          { lead: "People in the room", rest: "on a dead night — people who come back" },
          { lead: "A standing place", rest: "in your city's creative conversation" },
          { lead: "A credit you can point at", rest: "— your name on every work made in your space" },
        ],
      },
      {
        title: "How it starts",
        items: [
          { lead: "Post one offer", rest: "— a night, a wall, ten prints a month" },
          { lead: "No fee, no contract, no minimum", rest: "— one-off is a complete relationship" },
          { lead: "Grow only if you want to", rest: "— one-off, recurring, or anchor. Most partners never need more than step one." },
        ],
      },
    ],
    ctas: [
      { label: "Offer a night", to: "/", primary: true },
      { label: "Talk to a host near you", to: "/about/hosts" },
    ],
    footer: "Where creatives find the people who support their work.",
  },
};

export function meta({ params }: { params: { audience?: string } }) {
  const page = params.audience ? PAGES[params.audience] : undefined;
  return [{ title: page ? `${page.title} — TheCreative.exchange` : "TheCreative.exchange" }];
}

function Text({ line }: { line: Line }) {
  return (
    <>
      {line.lead && <strong style={{ color: "var(--garden-paper)", fontWeight: 600 }}>{line.lead}</strong>}
      {line.lead && line.rest ? " " : null}
      {line.rest}
    </>
  );
}

export default function AboutAudience() {
  const { audience = "" } = useParams();
  const page = PAGES[audience];
  if (!page) return <NotFound />;

  return (
    <AboutShell>
      <p style={{ color: "var(--garden-dim)", fontSize: 14, margin: "0 0 10px" }}>
        <Link to="/about" style={{ color: "var(--garden-dim)" }}>
          About
        </Link>{" "}
        · {page.title}
      </p>
      <h1
        style={{
          color: "var(--garden-paper)",
          fontFamily: "var(--garden-font-display)",
          fontSize: "clamp(32px, 5.5vw, 48px)",
          lineHeight: 1.1,
          margin: 0,
        }}
      >
        {page.heading[0]}
        <span style={{ color: "var(--garden-citron)" }}>{page.heading[1]}</span>
      </h1>
      <p style={{ color: "var(--garden-body)", fontSize: 18, lineHeight: 1.6, margin: "18px 0 0" }}>
        <Text line={page.lede} />
      </p>

      {page.sections.map((section) => (
        <section key={section.label}>
          <SectionLabel>{section.label}</SectionLabel>
          <div
            className="rounded-xl overflow-hidden"
            style={{ border: "1px solid var(--garden-hairline-raised)" }}
          >
            {section.rows.map((row, i) => (
              <div
                key={row.name}
                className="p-5"
                style={{
                  backgroundColor: "var(--garden-ink-raised)",
                  borderTop: i === 0 ? undefined : "1px solid var(--garden-hairline)",
                }}
              >
                <div className="flex items-baseline justify-between gap-4 flex-wrap">
                  <span style={{ color: "var(--garden-paper)", fontSize: 18, fontWeight: 600 }}>{row.name}</span>
                  {row.price && (
                    <span style={{ color: "var(--garden-citron)", fontSize: 16, fontFamily: "var(--garden-font-mono)" }}>
                      {row.price}
                    </span>
                  )}
                </div>
                <p style={{ color: "var(--garden-body)", fontSize: 16, lineHeight: 1.55, margin: "8px 0 0" }}>
                  <Text line={row} />
                </p>
              </div>
            ))}
          </div>
        </section>
      ))}

      {page.quote && (
        <figure style={{ margin: "44px 0 0", paddingLeft: 20, borderLeft: "3px solid var(--garden-citron)" }}>
          <p
            style={{
              color: "var(--garden-paper)",
              fontFamily: "var(--garden-font-display)",
              fontSize: 22,
              lineHeight: 1.4,
              margin: 0,
            }}
          >
            {page.quote.text}
          </p>
          <figcaption style={{ color: "var(--garden-dim)", fontSize: 14, marginTop: 10 }}>
            <b style={{ color: "var(--garden-body)" }}>{page.quote.creditLead}</b> · {page.quote.credit}
          </figcaption>
        </figure>
      )}

      {page.statement && (
        <p
          style={{
            color: "var(--garden-paper)",
            fontFamily: "var(--garden-font-display)",
            fontSize: 24,
            lineHeight: 1.35,
            margin: "40px 0 0",
          }}
        >
          {page.statement}
        </p>
      )}

      {page.cols && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-8" style={{ marginTop: 40 }}>
          {page.cols.map((col) => (
            <div key={col.title}>
              <h3 style={{ color: "var(--garden-paper)", fontSize: 18, fontWeight: 600, margin: "0 0 12px" }}>
                {col.title}
              </h3>
              <ul className="flex flex-col gap-2.5" style={{ margin: 0, paddingLeft: 20, listStyle: "disc" }}>
                {col.items.map((item) => (
                  <li key={item.lead} style={{ color: "var(--garden-body)", fontSize: 16, lineHeight: 1.55 }}>
                    <Text line={item} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-3" style={{ marginTop: 40 }}>
        {page.ctas.map((cta) => (
          <Link
            key={cta.label}
            to={cta.to}
            className="rounded-lg px-5 py-3 transition-opacity hover:opacity-90"
            style={
              cta.primary
                ? { backgroundColor: "var(--garden-citron)", color: "#141414", fontSize: 13.5, fontWeight: 700 }
                : {
                    border: "1px solid var(--garden-hairline-raised)",
                    color: "var(--garden-paper)",
                    fontSize: 13.5,
                    fontWeight: 600,
                  }
            }
          >
            {cta.label}
          </Link>
        ))}
      </div>

      <p style={{ color: "var(--garden-dim)", fontSize: 14, margin: "48px 0 0" }}>{page.footer}</p>
    </AboutShell>
  );
}
