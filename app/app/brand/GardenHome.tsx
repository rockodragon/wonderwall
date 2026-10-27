// The Garden's front door: "/" on its own addresses (createthegarden.com,
// garden.thecreative.exchange).
//
// Rick, 2026-10-27: lead with the invitation, not with what The Garden is;
// show just enough to make someone want to join, not a page to browse. So
// the first screen is who it's for and what they find (CLAIMS.heroGarden),
// what's going on in real numbers, and Join. Then five rows, visual and words on
// alternating sides, one sentence each: the grant fund (explained, with the
// amount available), projects, events (a calendar of this month that opens
// the events page), people, and partners and patrons (wanted here too: one
// panel each, CLAIMS' own sentences, and the way into the patron page). The
// Garden's own words ("To love our neighbor through our craft", its
// description) come after, and Join once more closes the page.
//
// Before this (2026-10-09) the page opened on The Garden's line and two
// calls, each on a stack of cards to flip through. The stacks are gone: a
// visitor isn't here to browse.
//
// The Garden's words (tagline, description) come from host tools; nothing
// about The Garden is written here. Money lines come from CLAIMS. The cards'
// facts (covers, the fund's amount) are the Canvas's own, built by its rules
// (buildDeskCards). It renders in the browser only: the edge serves this
// path on a Garden address as the plain app shell (functions/_middleware.ts),
// and the brand is known after hydration (useBrand).

import { useConvexAuth, useQuery } from "convex/react";
import { useMemo, type ReactNode } from "react";
import { Link } from "react-router";
import { ArrowRight } from "@phosphor-icons/react";
import { api } from "../../convex/_generated/api";
import { PersonAvatar } from "../components/PersonAvatar";
import { SiteHeader } from "../components/SiteHeader";
import { CLAIMS } from "../constants/claims";
import { PROMISE_PATH, TERMS_PROMISE_LINK } from "../constants/promises";
import { buildDeskCards, type DeskCard } from "../desk/deskCards";
import { toDeskInput } from "../desk/deskInput";
import { DESK_PATH } from "../desk/deskState";
import { CARD_BUTTON_CLASS, DESK, DESK_SANS, DESK_TINT, FOCUS_RING_CLASS, deskSurfaceStyle } from "../desk/tokens";
import { formatMoney } from "../garden/ui";
import { GARDEN_SLUG } from "../lib/communitySlugs";
import { SOPHIA_FUND_SLUG } from "../lib/namedFunds";
import { stripInlineMarks } from "../lib/richText";
import { textParagraphs } from "../lib/textParagraphs";
import { DIRECTORY_PAGE } from "../../convex/directoryRules";
import { GARDEN_NAME } from "../../convex/garden/brandHosts";
import { GardenDisc } from "./GardenMark";

/** The Garden's Canvas: its warm dark, as members see it (tokens.ts DESK_TINT). */
const TINT = DESK_TINT.garden;
/** A cover's title ends at a whole word within this, so it never cuts
 *  mid-word under the picture. */
const TITLE_CUT_OVER = 44;
const TITLE_MAX = 32;
/** How many covers and faces the rows show: enough to see it's real. */
const COVERS = 2;
const FACES = 8;
/** The Garden's own note, at the end of the page: a pale green paper, so
 *  it isn't the fund's beige again (Rick, 2026-10-27). */
const NOTE = { paper: "#D9E6CD", ink: "#17201a" };

const ACCENT_BUTTON = `${CARD_BUTTON_CLASS} bg-[#FFE066] text-[#121212] hover:bg-[#FFEA94]`;
/** Join (or Go to your canvas) opens the page and closes it, in yellow and
 *  a size up, the same both times. */
const HERO_BUTTON = `${ACCENT_BUTTON} min-h-[52px] min-w-[220px] text-[17px]!`;

export function cutAtWord(text: string, max: number): string {
  const words = text.split(/\s+/);
  let out = "";
  for (const w of words) {
    if ((out ? out.length + 1 : 0) + w.length > max) break;
    out = out ? `${out} ${w}` : w;
  }
  return `${(out || text.slice(0, max)).replace(/[\s,;:.\-–—]+$/, "")}…`;
}

/** "34 projects · 3 events coming up · $10,420 to grant": what's going on,
 *  from the same data the page shows, only the parts that have loaded. A
 *  visitor reads it as what they'd be joining; nothing here is made up. */
export function whatsOn(counts: { projects?: number; events?: number; fund?: string }): string {
  const parts: string[] = [];
  if (counts.projects) parts.push(`${counts.projects} ${counts.projects === 1 ? "project" : "projects"}`);
  if (counts.events) parts.push(`${counts.events} ${counts.events === 1 ? "event" : "events"} coming up`);
  if (counts.fund) parts.push(`${counts.fund} to grant`);
  return parts.join(" · ");
}

/** This month as a calendar: its name, how many blank cells lead the 1st
 *  (Sunday first), its length, and the days that have an event. Pure, for
 *  tests; the browser's own time zone, which is where the visitor is. */
export function monthGrid(now: Date, eventTimes: number[]): { label: string; lead: number; days: number; marked: Set<number>; today: number } {
  const year = now.getFullYear();
  const month = now.getMonth();
  const marked = new Set<number>();
  for (const t of eventTimes) {
    const d = new Date(t);
    if (d.getFullYear() === year && d.getMonth() === month) marked.add(d.getDate());
  }
  return {
    label: now.toLocaleDateString("en-US", { month: "long", year: "numeric" }),
    lead: new Date(year, month, 1).getDay(),
    days: new Date(year, month + 1, 0).getDate(),
    marked,
    today: now.getDate(),
  };
}

// The page's own CSS: the gutter, the browser's own surfaces (selection) in
// the Canvas's colors, and the paper notes settling onto the page.
const PAGE_CSS = `
.garden-home { --gutter: 20px; }
@media (min-width: 768px) { .garden-home { --gutter: 48px; } }
.garden-home ::selection { background: ${DESK.accent}; color: ${DESK.accentInk}; }
html:has(.garden-home) { scrollbar-color: ${TINT.dot} ${TINT.surface}; background: ${TINT.surface}; }
.garden-home .gh-wrap { max-width: 1280px; margin-inline: auto; padding-inline: var(--gutter); }
.garden-home .gh-note { transform: rotate(1.5deg); }
@media (min-width: 768px) { .garden-home .gh-note { transform: rotate(2.5deg); } }
.garden-home .gh-fund { transform: rotate(-1.5deg); }
`;

export function GardenHome() {
  const { isAuthenticated } = useConvexAuth();
  const garden = useQuery(api.garden.communityDomains.getCommunityLanding, { slug: GARDEN_SLUG });
  const events = useQuery(api.events.list, { upcoming: true });
  const projects = useQuery(api.garden.projects.listProjects);
  const fundPage = useQuery(api.garden.allocations.getFundPage, { hostOrgSlug: SOPHIA_FUND_SLUG });
  // The People directory's first page, as a visitor sees it (the most a
  // visitor gets), for the faces: the first few who added a photo (Rick,
  // 2026-10-27), not initials.
  const people = useQuery(api.profiles.directory, { limit: DIRECTORY_PAGE });
  const faces = (people?.people ?? []).filter((p) => p.imageUrl).slice(0, FACES);

  // The Canvas's cards for The Garden, built as a member's Canvas builds them:
  // projects featured first, the fund's available amount.
  const cards = useMemo(() => {
    const input = toDeskInput({ updates: [], events, projects, fundPage, favorites: null, giving: null }, Date.now(), formatMoney);
    return buildDeskCards(input, "garden");
  }, [events, projects, fundPage]);

  const projectCards = cards.filter((c) => c.kind === "project");
  // The covers row shows projects that have a picture first: a plain tone
  // block says less than a photo does.
  const covers = [...projectCards.filter((c) => c.image), ...projectCards.filter((c) => !c.image)].slice(0, COVERS);
  const eventCount = cards.filter((c) => c.kind === "event").length;
  const fund = cards.find((c) => c.kind === "fund")?.face.title;
  const on = whatsOn({
    projects: projects ? projectCards.length : undefined,
    events: events ? eventCount : undefined,
    fund,
  });
  const calendar = useMemo(() => monthGrid(new Date(), (events ?? []).map((e) => e.datetime)), [events]);

  // The description's paragraphs: the first under The Garden's line, the
  // rest on the paper note beside it.
  const paragraphs = textParagraphs(garden?.description, stripInlineMarks);
  const [lead, ...rest] = paragraphs;
  const tagline = garden?.tagline ? stripInlineMarks(garden.tagline) : garden === null ? GARDEN_NAME : null;

  const join = isAuthenticated ? (
    <Link to={DESK_PATH} className={HERO_BUTTON}>
      Go to your canvas
    </Link>
  ) : (
    <Link to="/signup" className={HERO_BUTTON}>
      Join The Garden
    </Link>
  );

  return (
    <div
      className="garden-home min-h-screen overflow-x-clip"
      style={{
        fontFamily: DESK_SANS,
        color: DESK.text,
        ...deskSurfaceStyle(TINT),
      }}
    >
      <link rel="stylesheet" href="/tokens.css" />
      <style>{PAGE_CSS}</style>
      <SiteHeader growMark={TINT.surface} />

      <main>
        {/* 1. The invitation: words only (a sprout sat beside them for an
            afternoon; Rick, 2026-10-27: "not doing it for me"). */}
        <section className="gh-wrap pt-8 pb-2 md:pt-20 md:pb-4">
          <div className="max-w-[46rem]">
            <h1
              className="m-0"
              style={{
                fontSize: "clamp(2.125rem, 1.4rem + 2.8vw, 3.75rem)",
                fontWeight: 500,
                lineHeight: 1.04,
                letterSpacing: "-0.028em",
                textWrap: "balance",
              }}
            >
              {CLAIMS.heroGarden}
            </h1>
            <p className="m-0 mt-5 max-w-[34rem] text-lg md:mt-6 md:text-xl" style={{ lineHeight: 1.5, color: DESK.text, textWrap: "pretty" }}>
              {CLAIMS.heroGardenLine}
            </p>
            <p className="m-0 mt-4 text-base md:text-lg" style={{ lineHeight: 1.5, color: DESK.textSoft, minHeight: "1.5em" }}>
              {on}
            </p>
            <div className="mt-7 md:mt-9">{join}</div>
            {!isAuthenticated && (
              <p className="m-0 mt-5 text-[15px]" style={{ color: DESK.textSoft }}>
                Invite-only. {CLAIMS.join} Donors and patrons welcome too.
              </p>
            )}
          </div>
        </section>

        {/* 2. What's inside, one row each. */}
        <div className="gh-wrap mt-16 flex flex-col gap-16 md:mt-28 md:gap-24">
          <Row
            id="gh-fund"
            title="Grant fund"
            visual={<FundNote amount={fund} loading={fundPage === undefined} />}
          >
            {CLAIMS.grantFundHome}
            {fund && (
              <>
                {" "}
                <span style={{ color: DESK.text }}>Total available: {fund}.</span>
              </>
            )}
          </Row>
          <Row
            id="gh-projects"
            title="Projects"
            flip
            more={{ to: "/projects", label: "See the projects" }}
            visual={<Covers cards={covers} loading={projects === undefined} />}
          >
            Members post what they're making and what they've finished, ask for the people they need, and get backed.
          </Row>
          <Row id="gh-events" title="Events" visual={<Calendar grid={calendar} loading={events === undefined} />}>
            Concerts, showcases, workshops and gatherings, hosted by members. RSVP with a free account.
          </Row>
          <Row
            id="gh-people"
            title="People"
            flip
            more={{ to: "/people", label: "See who's here" }}
            visual={<Faces people={faces} loading={people === undefined} />}
          >
            Join fellow creatives, patrons and community members: musicians, filmmakers, painters, photographers, writers,
            designers and more.
          </Row>
          <Row
            id="gh-patrons"
            title="Partners and patrons"
            flip
            visual={<Ways />}
          >
            You're wanted here too.
          </Row>
        </div>

        {/* 3. Why we're here: The Garden's own words, and Join once more. */}
        <section aria-labelledby="gh-why" className="gh-wrap mt-20 grid gap-x-16 gap-y-12 md:mt-28 lg:grid-cols-12">
          <div className="min-w-0 lg:col-span-5">
            <h2 id="gh-why" className="m-0 text-[15px] font-medium" style={{ color: DESK.textQuiet }}>
              Why we're here
            </h2>
            <p
              className="m-0 mt-3"
              style={{
                fontSize: "clamp(1.9rem, 1.3rem + 2vw, 3rem)",
                fontWeight: 500,
                lineHeight: 1.05,
                letterSpacing: "-0.025em",
                textWrap: "balance",
                minHeight: "1em",
              }}
            >
              {tagline}
            </p>
            {lead && (
              <p className="m-0 mt-4 max-w-[30rem] text-lg md:mt-6 md:text-xl" style={{ lineHeight: 1.55, color: DESK.textSoft, textWrap: "pretty" }}>
                {lead}
              </p>
            )}
          </div>
          <div className="min-w-0 lg:col-span-7">
            {/* The note is only The Garden's own words. The patron link that
                sat low on it (Rick, 2026-10-09) is the Partners and patrons
                row now (Rick, 2026-10-27). */}
            {rest.length > 0 && (
              <div
                className="gh-note max-w-[440px] rounded p-7 md:p-9"
                style={{ background: NOTE.paper, color: NOTE.ink, boxShadow: "0 10px 30px rgba(0,0,0,.45)" }}
              >
                {rest.map((p, i) => (
                  <p key={i} className="m-0 text-[17px]" style={{ lineHeight: 1.6, marginTop: i ? 16 : 0, textWrap: "pretty" }}>
                    {p}
                  </p>
                ))}
              </div>
            )}
            <div className="mt-10">{join}</div>
            {/* What joining promises, for anyone who wants to read it first. */}
            <p className="m-0 mt-5">
              <Link
                to={PROMISE_PATH}
                className={`inline-flex items-center gap-1.5 rounded text-[15px] no-underline underline-offset-4 hover:underline ${FOCUS_RING_CLASS}`}
                style={{ color: DESK.textQuiet }}
              >
                {TERMS_PROMISE_LINK}
                <ArrowRight size={14} aria-hidden />
              </Link>
            </p>
          </div>
        </section>
      </main>

      <footer className="mt-20 border-t md:mt-28" style={{ borderColor: DESK.line }}>
        <div className="gh-wrap flex flex-col gap-5 py-8 text-[15px] md:flex-row md:items-center md:justify-between">
          <a
            href="https://thecreative.exchange"
            className={`inline-flex items-center gap-3 rounded no-underline underline-offset-4 hover:underline ${FOCUS_RING_CLASS}`}
            style={{ color: DESK.textQuiet }}
          >
            <GardenDisc size={20} />
            On TheCreative.exchange
          </a>
          <nav aria-label="Site" className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <a href="/about/" className={`rounded underline-offset-4 hover:underline ${FOCUS_RING_CLASS}`} style={{ color: DESK.textQuiet }}>
              About
            </a>
            {[
              { to: "/promise", label: "Our promise" },
              { to: "/legal/terms", label: "Terms" },
              { to: "/legal/privacy", label: "Privacy" },
              { to: "/legal/credits", label: "Credits" },
            ].map((l) => (
              <Link key={l.to} to={l.to} className={`rounded underline-offset-4 hover:underline ${FOCUS_RING_CLASS}`} style={{ color: DESK.textQuiet }}>
                {l.label}
              </Link>
            ))}
          </nav>
        </div>
      </footer>
    </div>
  );
}

/** One of the rows: its name and one sentence on one side, something real
 *  from inside on the other, both starting at the row's top. `flip` puts
 *  the visual on the left from md, so the rows alternate. On a phone the
 *  words come first, then the visual. `more` is a quiet link to the page
 *  itself, under the sentence: a way in, not a call. */
function Row({
  id,
  title,
  flip = false,
  more,
  visual,
  children,
}: {
  id: string;
  title: string;
  flip?: boolean;
  more?: { to: string; label: string };
  visual: ReactNode;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="grid min-w-0 gap-x-16 gap-y-7 md:grid-cols-12 md:items-start">
      <div className={`min-w-0 md:col-span-6 ${flip ? "md:order-2" : ""}`}>
        <h2 id={id} className="m-0" style={{ fontSize: "clamp(1.6rem, 1.3rem + 1vw, 2rem)", fontWeight: 500, letterSpacing: "-0.02em", lineHeight: 1.1 }}>
          {title}
        </h2>
        <p className="m-0 mt-3 max-w-[30rem] text-lg md:text-xl" style={{ lineHeight: 1.5, color: DESK.textSoft, textWrap: "pretty" }}>
          {children}
        </p>
        {more && (
          <p className="m-0 mt-4">
            <Link
              to={more.to}
              className={`inline-flex items-center gap-1.5 rounded text-[15px] no-underline underline-offset-4 hover:underline ${FOCUS_RING_CLASS}`}
              style={{ color: DESK.textQuiet }}
            >
              {more.label}
              <ArrowRight size={14} aria-hidden />
            </Link>
          </p>
        )}
      </div>
      <div className={`min-w-0 md:col-span-6 ${flip ? "md:order-1" : ""}`}>{visual}</div>
    </section>
  );
}

/** Patron and Partner, a panel each with CLAIMS' own sentence (money words
 *  are never written here), each opening its own page (Rick, 2026-10-27:
 *  "if you click on patron, it should go there"). Stacked until there's
 *  room for two. */
function Ways() {
  const ways = [
    { name: "Partner", line: CLAIMS.partner, to: "/for/partners", more: "For community partners" },
    { name: "Patron", line: CLAIMS.patron, to: "/for/patrons", more: "Reimagining what it means to be a patron" },
  ];
  return (
    <ul className="m-0 grid max-w-[560px] list-none gap-4 p-0 xl:grid-cols-2" aria-label="Ways to be part of The Garden">
      {ways.map((w) => (
        <li key={w.name} className="min-w-0">
          <Link
            to={w.to}
            className={`block h-full rounded-xl border border-[#333333] p-5 no-underline transition-colors hover:border-[#FFE066] ${FOCUS_RING_CLASS}`}
            style={{ background: DESK.panel }}
          >
            <h3 className="m-0 text-[17px] font-medium" style={{ color: DESK.text }}>
              {w.name}
            </h3>
            <p className="m-0 mt-2 text-[15px]" style={{ lineHeight: 1.5, color: DESK.textSoft, textWrap: "pretty" }}>
              {w.line}
            </p>
            <p className="m-0 mt-3 inline-flex items-center gap-1.5 text-[15px]" style={{ color: DESK.textQuiet }}>
              {w.more}
              <ArrowRight size={14} aria-hidden />
            </p>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** The fund's paper note: its name and what's available, as the Canvas's
 *  fund card has it. */
function FundNote({ amount, loading }: { amount: string | undefined; loading: boolean }) {
  return (
    <div
      className="gh-fund w-full max-w-[300px] rounded px-7 py-8 md:ml-auto md:mr-6"
      style={{ background: DESK.paper, color: DESK.paperInk, boxShadow: "0 10px 30px rgba(0,0,0,.45)", minHeight: 200 }}
      aria-hidden={loading || undefined}
    >
      <p className="m-0 text-[17px] font-medium">The Sophia Grant Fund</p>
      <p className="m-0 mt-10 text-[44px] font-medium leading-none" style={{ letterSpacing: "-0.03em" }}>
        {amount ?? " "}
      </p>
      <p className="m-0 mt-2 text-[15px]" style={{ opacity: 0.8 }}>
        available to grant
      </p>
    </div>
  );
}

/** Two project covers, still: a picture and a title each, no flipping. */
function Covers({ cards, loading }: { cards: DeskCard[]; loading: boolean }) {
  const shown = loading ? Array.from({ length: COVERS }, () => null) : cards;
  if (shown.length === 0) return null;
  return (
    <ul className="m-0 grid max-w-[440px] list-none grid-cols-2 gap-4 p-0 md:gap-5" aria-label="A few projects">
      {shown.map((card, i) => {
        const title = card ? (card.face.title.length > TITLE_CUT_OVER ? cutAtWord(card.face.title, TITLE_MAX) : card.face.title) : "";
        return (
          <li key={card?.id ?? i} className="min-w-0">
            <div
              className="aspect-[4/5] w-full overflow-hidden rounded-lg"
              style={{ background: card?.tone ?? DESK.panel, boxShadow: "0 8px 24px rgba(0,0,0,.4)" }}
            >
              {card?.image && <img src={card.image} alt="" className="h-full w-full object-cover" loading="lazy" />}
            </div>
            {card && (
              <>
                <p className="m-0 mt-2.5 text-[15px] font-medium leading-snug" style={{ color: DESK.text }}>
                  {title}
                </p>
                {card.face.foot && (
                  <p className="m-0 mt-0.5 truncate text-[14px]" style={{ color: DESK.textQuiet }}>
                    {card.face.foot}
                  </p>
                )}
              </>
            )}
          </li>
        );
      })}
    </ul>
  );
}

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

/** This month, with the days that have an event marked. The whole calendar
 *  opens the events page; nothing on the home page lists them. */
function Calendar({ grid, loading }: { grid: ReturnType<typeof monthGrid>; loading: boolean }) {
  const cells: (number | null)[] = [...Array.from({ length: grid.lead }, () => null), ...Array.from({ length: grid.days }, (_, i) => i + 1)];
  return (
    <Link
      to="/events"
      aria-label={`Events in ${grid.label}`}
      className={`block w-full max-w-[340px] rounded-xl border p-5 no-underline transition-colors md:ml-auto md:mr-6 ${FOCUS_RING_CLASS}`}
      style={{ background: DESK.panel, borderColor: DESK.lineStrong, color: DESK.text }}
    >
      <div className="flex items-baseline justify-between">
        <span className="text-[17px] font-medium">{grid.label}</span>
        <span className="inline-flex items-center gap-1.5 text-[14px]" style={{ color: DESK.textQuiet }}>
          All events
          <ArrowRight size={13} aria-hidden />
        </span>
      </div>
      <div className="mt-4 grid grid-cols-7 gap-y-1.5 text-center text-[14px]" aria-hidden="true">
        {WEEKDAYS.map((d, i) => (
          <span key={i} style={{ color: DESK.textQuiet }}>
            {d}
          </span>
        ))}
        {cells.map((day, i) => {
          const marked = day !== null && !loading && grid.marked.has(day);
          const today = day === grid.today;
          return (
            <span key={i} className="flex h-8 items-center justify-center">
              {day !== null && (
                <span
                  className="flex h-7 w-7 items-center justify-center rounded-full font-medium"
                  style={
                    marked
                      ? { background: DESK.accent, color: DESK.accentInk }
                      : today
                        ? { boxShadow: `inset 0 0 0 1px ${DESK.lineStrong}`, color: DESK.text }
                        : { color: DESK.textSoft }
                  }
                >
                  {day}
                </span>
              )}
            </span>
          );
        })}
      </div>
    </Link>
  );
}

/** A few of the people, as the directory shows them: those with a photo.
 *  Fewer than three and the row is only its sentence. */
function Faces({ people, loading }: { people: { name: string; imageUrl?: string | null }[]; loading: boolean }) {
  if (!loading && people.length < 3) return null;
  const shown = loading ? Array.from({ length: FACES }, () => null) : people.slice(0, FACES);
  return (
    <ul className="m-0 flex list-none flex-wrap gap-3 p-0 md:gap-4" aria-label="A few of the people">
      {shown.map((p, i) => (
        <li key={i} className="flex flex-col items-center gap-2" style={{ width: 72 }}>
          {p ? (
            <PersonAvatar name={p.name} imageUrl={p.imageUrl} size="lg" tone="muted" />
          ) : (
            <span className="h-14 w-14 rounded-full" style={{ background: DESK.panel }} />
          )}
          <span className="w-full truncate text-center text-[14px]" style={{ color: DESK.textQuiet }}>
            {p?.name.split(" ")[0] ?? " "}
          </span>
        </li>
      ))}
    </ul>
  );
}
