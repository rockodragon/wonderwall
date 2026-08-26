// /ia — information architecture reference page (discussion-brief pivot,
// docs/creatives-exchange-discussion-brief.md). Built for the founder to
// walk prospective community partners through: what creatives.exchange is,
// what a community is, what a table is, the shared vocabulary, and how
// someone actually walks from the front page into a room. No Convex data —
// this is reference copy, static and shareable (no noindex, spec says so).
//
// Nesting diagram is plain divs + hairline borders + a left rule (no image,
// no external lib) per the build brief. Layers pulled from brief §1-2 and
// product plan §2.1/§6 (seat vs. seat-at-a-table).

import { Link, useRouteError } from "react-router";
import { GardenErrorState, GardenNav, GardenPage, SectionLabel, FactRow } from "../garden/ui";
import "../garden/garden.css";

export function meta() {
  return [
    { title: "How it fits together — creatives.exchange" },
    {
      name: "description",
      content:
        "The words we use, what each one means, and how someone actually gets from the front page into a room.",
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

// ————— Vocabulary table data (brief §2, product plan §2.1) —————

const VOCAB: { word: string; meaning: string; controlledBy: string }[] = [
  {
    word: "Creative",
    meaning: "A person making something — themselves.",
    controlledBy: "Themselves",
  },
  {
    word: "Patron",
    meaning: "Anyone pointing money at a person's work — themselves.",
    controlledBy: "Themselves",
  },
  {
    word: "Host",
    meaning: "The person who runs a community or a table.",
    controlledBy: "The community",
  },
  {
    word: "Community",
    meaning: "A named group with its own language and goals.",
    controlledBy: "Its leaders",
  },
  {
    word: "Table",
    meaning:
      "An ongoing gathering with a roster: class, cohort, critique night, mentorship circle.",
    controlledBy: "The host",
  },
  {
    word: "Event",
    meaning: "A one-off happening you attend.",
    controlledBy: "The host",
  },
  {
    word: "Seat",
    meaning: "Your membership standing, $10/mo.",
    controlledBy: "The platform",
  },
  {
    word: "Project",
    meaning:
      "A piece of work: passion = seeking support, paid = has a declared budget.",
    controlledBy: "The creative",
  },
  {
    word: "Offer",
    meaning: "A standing thing someone makes available: space, gear, audience, coaching.",
    controlledBy: "Whoever offers it",
  },
  {
    word: "Fellowship",
    meaning: "Substantial recurring support for one creative's work.",
    controlledBy: "The funder",
  },
];

// ————— Paths into a table (brief §6, plan §2.1/§4) —————

const PATHS: {
  n: number;
  title: string;
  sentence: string;
  status: string;
  built: boolean;
}[] = [
  {
    n: 1,
    title: "They browse",
    sentence:
      "Open tables and public events are visible with no account, across every community.",
    status: "Built — /tables",
    built: true,
  },
  {
    n: 2,
    title: "Someone invites them",
    sentence: "The host sends a link or QR; it opens straight onto the table.",
    status: "Built — invite kit",
    built: true,
  },
  {
    n: 3,
    title: "They come to an event first",
    sentence: "A public event is the front door; the ongoing table is what they stay for.",
    status: "Built — /garden/events with guest RSVP",
    built: true,
  },
  {
    n: 4,
    title: "They follow a person",
    sentence: "They see someone's work, then see what that person is part of.",
    status:
      "Portfolios and messaging exist in the core app. The link from a profile to their tables is NOT built yet.",
    built: false,
  },
  {
    n: 5,
    title: "A sponsor seats them",
    sentence: "A church buys seats and hands out a code; redeeming lands them seated.",
    status: "Built — /c/CODE",
    built: true,
  },
];

// ————— Open questions (brief §5.1, §5.3, plus the Offers question) —————

const QUESTIONS: { q: string; body: string; note?: string }[] = [
  {
    q: "Does a seat work everywhere, or per community?",
    body: "One seat = standing across all communities, versus pay each community separately (the Skool model).",
    note: "This decides whether moving between communities is real or aspirational.",
  },
  {
    q: "Offers — or Offers and Asks?",
    body: "Today one word covers what people make available. An ‘Ask’ would be the mirror: what someone needs (a space for a shoot, a drummer, a lens). Options: keep Offers only and let Projects carry the asking; add Asks as a peer; or rename the pair ‘Offers & Asks.’",
  },
  {
    q: "Whose words?",
    body: "One shared vocabulary everywhere, every word customizable per community, or split the difference (money words fixed, gathering words local).",
  },
];

export default function IAPage() {
  return (
    <GardenPage wide>
      <GardenNav />

      {/* ————— 1. Header ————— */}
      <div style={{ marginTop: 28, maxWidth: "62ch" }}>
        <h1 className="g-h" style={{ fontSize: "clamp(28px,5vw,40px)" }}>
          How it fits together
        </h1>
        <p style={{ marginTop: 12, fontSize: 15, lineHeight: 1.6 }}>
          The words we use, what each one means, and how someone actually
          gets from the front page into a room.
        </p>
      </div>

      {/* ————— 2. The three layers ————— */}
      <div style={{ marginTop: 44 }}>
        <SectionLabel>The three layers</SectionLabel>
        <div style={{ marginTop: 14 }}>
          <LayerBand
            label="creatives.exchange"
            detail="Platform — accounts, payments, entitlements, discovery"
          >
            <LayerBand
              label="Community"
              detail="The Garden · Abiding Practice · Table Art Society · The Rabbit Room — own name, look, language, goals"
            >
              <LayerBand label="Table" detail="One ongoing gathering with a roster" />
            </LayerBand>
          </LayerBand>
        </div>
        <p style={{ marginTop: 16, fontSize: 14.5, color: "var(--g-body)", lineHeight: 1.6 }}>
          A creative belongs to the platform, participates in communities,
          and sits at tables.
        </p>
      </div>

      {/* ————— 3. The vocabulary ————— */}
      <div style={{ marginTop: 44 }}>
        <SectionLabel>The vocabulary</SectionLabel>
        <div style={{ marginTop: 14, overflowX: "auto" }}>
          <table
            style={{
              width: "100%",
              minWidth: 560,
              borderCollapse: "collapse",
            }}
          >
            <thead>
              <tr>
                {["Word", "What it means", "Who controls it"].map((h) => (
                  <th
                    key={h}
                    className="g-label"
                    style={{
                      textAlign: "left",
                      padding: "0 12px 10px 0",
                      borderBottom: "1px solid var(--g-hairline)",
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {VOCAB.map((row) => (
                <tr key={row.word}>
                  <td
                    style={{
                      padding: "12px 12px 12px 0",
                      borderBottom: "1px solid var(--g-hairline)",
                      verticalAlign: "top",
                      whiteSpace: "nowrap",
                    }}
                  >
                    <span className="g-h" style={{ fontSize: 15 }}>
                      {row.word}
                    </span>
                  </td>
                  <td
                    style={{
                      padding: "12px 12px 12px 0",
                      borderBottom: "1px solid var(--g-hairline)",
                      verticalAlign: "top",
                      fontSize: 14.5,
                      color: "var(--g-body)",
                      lineHeight: 1.5,
                    }}
                  >
                    {row.meaning}
                  </td>
                  <td
                    style={{
                      padding: "12px 0",
                      borderBottom: "1px solid var(--g-hairline)",
                      verticalAlign: "top",
                      fontSize: 14.5,
                      color: "var(--g-muted)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {row.controlledBy}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p style={{ marginTop: 14, fontSize: 14.5, color: "var(--g-dim)", lineHeight: 1.6, maxWidth: "62ch" }}>
          Money words (Seat, Patron, Project, Fellowship) stay the same
          everywhere because they show up in receipts and public ledgers.
          Gathering words may vary by community — Abiding Practice says
          Cohorts, The Rabbit Room says Chapters. That's an open question,
          see below.
        </p>
      </div>

      {/* ————— 4. How someone gets into a table ————— */}
      <div style={{ marginTop: 44 }}>
        <SectionLabel>How someone gets into a table</SectionLabel>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))",
            gap: 14,
            marginTop: 14,
          }}
        >
          {PATHS.map((p) => (
            <div key={p.n} className="g-card">
              <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                <span className="g-mono" style={{ fontSize: 12.5, color: "var(--g-muted)" }}>
                  {String(p.n).padStart(2, "0")}
                </span>
                <div className="g-h" style={{ fontSize: 17 }}>
                  {p.title}
                </div>
              </div>
              <p style={{ marginTop: 10, fontSize: 14.5, color: "var(--g-body)", lineHeight: 1.55 }}>
                {p.sentence}
              </p>
              <div
                className="g-mono"
                style={{
                  marginTop: 12,
                  fontSize: 12,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  color: p.built ? "var(--g-muted)" : "var(--g-citron)",
                }}
              >
                {p.built ? "Status" : "Status — not built"}
              </div>
              <p
                className="g-mono"
                style={{
                  marginTop: 4,
                  fontSize: 12.5,
                  color: "var(--g-body)",
                  lineHeight: 1.5,
                }}
              >
                {p.status}
              </p>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 24 }}>
          <SectionLabel>What it costs to walk in</SectionLabel>
          <div
            className="g-card"
            style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 12 }}
          >
            <FactRow k="Open table" v="Free, no account" />
            <FactRow k="Members table" v="Needs a seat ($10/mo)" />
            <FactRow k="Cohort" v="Its own price, set by the host" />
            <FactRow k="Public event" v="Free to RSVP, no account" />
          </div>
        </div>
      </div>

      {/* ————— 4b. How the money works (brief §5.6) ————— */}
      <div style={{ marginTop: 44 }}>
        <SectionLabel>How the money works</SectionLabel>

        <div className="g-card" style={{ marginTop: 12, borderColor: "var(--g-citron)" }}>
          <p style={{ fontSize: 16, lineHeight: 1.6, color: "var(--g-paper)" }}>
            A seat is <strong>platform membership, not community membership</strong>.
          </p>
          <p style={{ fontSize: 15, lineHeight: 1.6, marginTop: 10 }}>
            A community can be entirely free to join. The $10/mo seat is what
            unlocks starting projects, applying to paid work, and joining
            members-tables — anywhere on the platform.
          </p>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))",
            gap: 14,
            marginTop: 14,
          }}
        >
          <div className="g-card">
            <div className="g-h" style={{ fontSize: 17 }}>
              There is no default community
            </div>
            <p style={{ fontSize: 14.5, lineHeight: 1.55, marginTop: 8 }}>
              You sign up to the platform, browse everything, and join open
              tables anywhere. Joining a community is a deliberate act — no
              one is dropped into a room they didn't choose.
            </p>
          </div>
          <div className="g-card">
            <div className="g-h" style={{ fontSize: 17 }}>
              You name your home community
            </div>
            <p style={{ fontSize: 14.5, lineHeight: 1.55, marginTop: 8 }}>
              The community share of your dues follows that choice, and you
              can change it. It stays an earned share rather than a finder's
              fee — a community keeps it by being worth being in.
            </p>
          </div>
          <div className="g-card">
            <div className="g-h" style={{ fontSize: 17 }}>
              Haven't picked one yet?
            </div>
            <p style={{ fontSize: 14.5, lineHeight: 1.55, marginTop: 8 }}>
              Then 90% of your dues fund other creatives' work, and 10% runs
              the platform. Nothing sits idle while you decide.
            </p>
          </div>
          <div className="g-card">
            <div className="g-h" style={{ fontSize: 17 }}>
              What a community sells
            </div>
            <p style={{ fontSize: 14.5, lineHeight: 1.55, marginTop: 8 }}>
              Its cohorts and classes — their price, they keep about 90% —
              plus the dues share from the people who call it home.
            </p>
          </div>
        </div>

        <p className="g-hint" style={{ marginTop: 14, maxWidth: "62ch" }}>
          Said plainly, because someone will ask: a free community whose
          members never buy seats earns nothing, and neither do we. That's the
          top of the funnel working as intended, not a hole in the model.
        </p>
      </div>

      {/* ————— 5. The open questions ————— */}
      <div style={{ marginTop: 44 }}>
        <SectionLabel>The open questions</SectionLabel>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))",
            gap: 14,
            marginTop: 14,
          }}
        >
          {QUESTIONS.map((item) => (
            <div key={item.q} className="g-card">
              <div className="g-h" style={{ fontSize: 16.5, lineHeight: 1.3 }}>
                {item.q}
              </div>
              <p style={{ marginTop: 10, fontSize: 14.5, color: "var(--g-body)", lineHeight: 1.55 }}>
                {item.body}
              </p>
              {item.note && (
                <p className="g-hint" style={{ marginTop: 10 }}>
                  {item.note}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ————— 6. Footer links ————— */}
      <div
        style={{
          marginTop: 48,
          paddingTop: 20,
          borderTop: "1px solid var(--g-hairline)",
          display: "flex",
          gap: 20,
          flexWrap: "wrap",
        }}
      >
        <Link to="/garden" className="g-nav">
          The Garden
        </Link>
        <Link to="/demo/app" className="g-nav">
          Walk the app
        </Link>
        <Link to="/tables" className="g-nav">
          Tables
        </Link>
        <Link to="/projects" className="g-nav">
          Projects
        </Link>
      </div>
    </GardenPage>
  );
}

// ————— The nesting diagram —————
// Pure divs: each band is a bordered box with a left accent rule; a nested
// band sits indented and inset inside its parent's padding, so containment
// reads from layout alone (no arrows, no image, no external diagram lib).
function LayerBand({
  label,
  detail,
  children,
}: {
  label: string;
  detail: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      style={{
        border: "1px solid var(--g-hairline)",
        borderLeft: "3px solid var(--g-citron)",
        borderRadius: 6,
        padding: "16px 18px",
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
        <span className="g-h" style={{ fontSize: 17 }}>
          {label}
        </span>
        <span style={{ fontSize: 13.5, color: "var(--g-muted)" }}>{detail}</span>
      </div>
      {children && <div style={{ marginTop: 16, paddingLeft: 20 }}>{children}</div>}
    </div>
  );
}
