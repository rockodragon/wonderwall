// The Garden's front door: "/" on its own addresses (createthegarden.com,
// garden.thecreative.exchange).
//
// Rick, 2026-10-09: "we promote projects and giving foremost. elevate those
// above events. and its too busy. maybe a stack of cards for each type that
// lures viewer in to cycle through them. CTA needs to be strong: share your
// project, and give some of our grant money away - we trust your vote."
//
// So the first screen is The Garden's line and the two things it asks:
// share your project, and give some of the grant money away. Each sits on a
// stack of real cards to flip through (CardStack): its projects, then the
// Sophia Grant Fund with the projects asking for backing. Events come after,
// smaller, and the page closes on the rest of the description and Join.
//
// The Garden's words (tagline, description) come from host tools; nothing
// about The Garden is written here. Money lines come from CLAIMS. The cards
// are the Canvas's own, built by its rules (buildDeskCards). It renders in the
// browser only: the edge serves this path on a Garden address as the plain
// app shell (functions/_middleware.ts), and the brand is known after
// hydration (useBrand).

import { useConvexAuth, useQuery } from "convex/react";
import { useMemo, type ReactNode } from "react";
import { Link } from "react-router";
import { ArrowRight } from "@phosphor-icons/react";
import { api } from "../../convex/_generated/api";
import { SiteHeader } from "../components/SiteHeader";
import { CLAIMS } from "../constants/claims";
import { buildDeskCards, type DeskCard } from "../desk/deskCards";
import { toDeskInput } from "../desk/deskInput";
import { DESK_PATH } from "../desk/deskState";
import { CARD_BUTTON_CLASS, DESK, DESK_SANS, DESK_TINT, FOCUS_RING_CLASS, deskSurfaceStyle } from "../desk/tokens";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { formatMoney } from "../garden/ui";
import { GARDEN_SLUG } from "../lib/communitySlugs";
import { SOPHIA_FUND_SLUG } from "../lib/namedFunds";
import { stripInlineMarks } from "../lib/richText";
import { GARDEN_NAME } from "../../convex/garden/brandHosts";
import { CardStack, type StackItem } from "./CardStack";
import { GardenDisc } from "./GardenMark";

/** The two calls' stacks, and the smaller one for events; smaller again on a
 *  phone, so the first call is in the first screen. */
const CALL = { w: 250, h: 336 };
const CALL_PHONE = { w: 210, h: 282 };
const EVENT = { w: 210, h: 284 };
const EVENT_PHONE = { w: 190, h: 256 };
/** The Garden's Canvas: its warm dark, as members see it (tokens.ts DESK_TINT). */
const TINT = DESK_TINT.garden;
/** A title longer than this runs past a card's three lines and gets cut
 *  mid-word, so it ends at a whole word within TITLE_MAX instead. Shorter
 *  ones ("A Creative Renaissance is Beginning") fit and stay whole. */
const TITLE_CUT_OVER = 44;
const TITLE_MAX = 32;

const ACCENT_BUTTON = `${CARD_BUTTON_CLASS} bg-[#FFE066] text-[#121212] hover:bg-[#FFEA94]`;
/** Join (or Go to your canvas): solid light, so it carries weight as the page's
 *  close without a third yellow beside the two calls. */
const CLOSE_BUTTON = `${CARD_BUTTON_CLASS} min-w-[240px] bg-[#F4F4F2] text-[#121212] hover:bg-white`;
/** The two calls fill their column. 15px and a tighter side, so "Give some of
 *  our grant money away" stays on one line at the narrowest column. */
const CALL_BUTTON = `${ACCENT_BUTTON} w-full px-4! text-[15px]! whitespace-nowrap`;

/** A Canvas card as the home page shows it. An event's date goes on its own
 *  chip, over the poster's lettering. A project's stage ("PLANNING", "JOB")
 *  is dropped: it tells a visitor nothing. The fund keeps its name, set
 *  plainly at the top of the paper, not as a mono label. A long title ends
 *  at a whole word. */
export function forShelf(card: DeskCard): StackItem {
  const title = card.face.title.length > TITLE_CUT_OVER ? cutAtWord(card.face.title, TITLE_MAX) : card.face.title;
  const face = { ...card.face, kicker: "", title };
  return {
    card: { ...card, face },
    stamp: card.kind === "event" && card.face.kicker ? card.face.kicker : undefined,
    label: card.kind === "fund" ? card.detail.title : undefined,
  };
}

export function cutAtWord(text: string, max: number): string {
  const words = text.split(/\s+/);
  let out = "";
  for (const w of words) {
    if ((out ? out.length + 1 : 0) + w.length > max) break;
    out = out ? `${out} ${w}` : w;
  }
  return `${(out || text.slice(0, max)).replace(/[\s,;:.\-–—]+$/, "")}…`;
}

// The page's own CSS: the gutter, the browser's own surfaces (selection) in
// the Canvas's colors, and the manifesto note settling onto the page.
const PAGE_CSS = `
.garden-home { --gutter: 20px; }
@media (min-width: 768px) { .garden-home { --gutter: 48px; } }
.garden-home ::selection { background: ${DESK.accent}; color: ${DESK.accentInk}; }
html:has(.garden-home) { scrollbar-color: ${TINT.dot} ${TINT.surface}; background: ${TINT.surface}; }
.garden-home .gh-wrap { max-width: 1280px; margin-inline: auto; padding-inline: var(--gutter); }
.garden-home .gh-note { transform: rotate(1.5deg); }
@media (min-width: 768px) { .garden-home .gh-note { transform: rotate(2.5deg); } }
`;

export function GardenHome() {
  const { isAuthenticated } = useConvexAuth();
  const phone = useMediaQuery("(max-width: 767px)");
  const call = phone ? CALL_PHONE : CALL;
  const event = phone ? EVENT_PHONE : EVENT;
  const garden = useQuery(api.garden.communityDomains.getCommunityLanding, { slug: GARDEN_SLUG });
  const events = useQuery(api.events.list, { upcoming: true });
  const projects = useQuery(api.garden.projects.listProjects);
  const fundPage = useQuery(api.garden.allocations.getFundPage, { hostOrgSlug: SOPHIA_FUND_SLUG });

  // The Canvas's cards for The Garden, built as a member's Canvas builds them:
  // projects featured first, events in date order, the fund's available amount.
  const cards = useMemo(() => {
    const input = toDeskInput({ updates: [], events, projects, fundPage, favorites: null, giving: null }, Date.now(), formatMoney);
    return buildDeskCards(input, "garden");
  }, [events, projects, fundPage]);

  const projectItems = cards.filter((c) => c.kind === "project").map(forShelf);
  // Where grant money goes: the fund first, then the projects asking for backing.
  const raising = new Set((projects ?? []).filter((p) => p.raising).map((p) => `project:${p._id}`));
  const givingItems = cards.filter((c) => c.kind === "fund" || raising.has(c.id)).map(forShelf);
  const eventItems = cards.filter((c) => c.kind === "event").map(forShelf);

  // The description's paragraphs: the first under the line, the rest on the
  // paper note that closes the page.
  const paragraphs = (garden?.description ?? "")
    .split(/\n\s*\n/)
    .map((p) => stripInlineMarks(p).trim())
    .filter(Boolean);
  const [lead, ...rest] = paragraphs;

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
      <SiteHeader />

      <main>
        <section className="gh-wrap grid gap-x-12 gap-y-9 pt-5 pb-4 md:gap-y-14 md:pt-14 xl:grid-cols-12">
          <div className="min-w-0 xl:col-span-5 xl:pt-10">
            <h1
              className="m-0"
              style={{
                fontSize: "clamp(2.125rem, 1.5rem + 3vw, 4rem)",
                fontWeight: 500,
                lineHeight: 1.02,
                letterSpacing: "-0.028em",
                textWrap: "balance",
                minHeight: "1em",
              }}
            >
              {garden?.tagline ? stripInlineMarks(garden.tagline) : garden === null ? GARDEN_NAME : null}
            </h1>
            {lead && (
              <p className="m-0 mt-4 max-w-[30rem] text-lg md:mt-6 md:text-xl" style={{ lineHeight: 1.55, color: DESK.textSoft, textWrap: "pretty" }}>
                {lead}
              </p>
            )}
          </div>

          <div className="grid min-w-0 gap-x-10 gap-y-14 md:grid-cols-2 md:gap-y-16 xl:col-span-7">
            <Call
              id="gh-projects"
              title="Projects"
              more={{ to: "/projects", label: "See more projects" }}
              stack={<CardStack items={projectItems} width={call.w} height={call.h} label="project" loading={projects === undefined} />}
            >
              <Link to="/projects?new=project" className={CALL_BUTTON}>
                Share your project
              </Link>
            </Call>
            <Call
              id="gh-giving"
              title="Giving"
              stack={
                <CardStack
                  items={givingItems}
                  width={call.w}
                  height={call.h}
                  label="card"
                  loading={fundPage === undefined || projects === undefined}
                  nudgeAfter={800}
                />
              }
            >
              <Link to="/give" className={CALL_BUTTON}>
                {CLAIMS.giveAway}
              </Link>
              <p className="m-0 mt-3 text-base" style={{ color: DESK.textSoft }}>
                {CLAIMS.trustYourVote}
              </p>
            </Call>
          </div>
        </section>

        <section className="gh-wrap mt-20 grid gap-x-16 gap-y-16 md:mt-28 lg:grid-cols-12">
          {(events === undefined || eventItems.length > 0) && (
            <div className="min-w-0 lg:col-span-5">
              <Call
                id="gh-events"
                title="Events"
                more={{ to: "/events", label: "See more events" }}
                stack={<CardStack items={eventItems} width={event.w} height={event.h} label="event" loading={events === undefined} />}
              />
            </div>
          )}
          <div className="min-w-0 lg:col-span-7 lg:pt-16">
            {rest.length > 0 && (
              <div
                className="gh-note max-w-[440px] rounded p-7 md:p-9"
                style={{ background: DESK.paper, color: DESK.paperInk, boxShadow: "0 10px 30px rgba(0,0,0,.45)" }}
              >
                {rest.map((p, i) => (
                  <p key={i} className="m-0 text-[17px]" style={{ lineHeight: 1.6, marginTop: i ? 16 : 0, textWrap: "pretty" }}>
                    {p}
                  </p>
                ))}
                {/* Rick, 2026-10-09: mention patrons, low on the note. A
                    platform line (patrons are everywhere), not The Garden's
                    own words, so it lives here and not in host tools. */}
                <p className="m-0 mt-6 text-[17px]" style={{ lineHeight: 1.45 }}>
                  <Link
                    to="/for/patrons"
                    className={`rounded font-semibold underline decoration-1 underline-offset-4 ${FOCUS_RING_CLASS}`}
                    style={{ color: DESK.paperInk }}
                  >
                    Reimagining what it means to be a patron
                    <ArrowRight size={16} weight="bold" aria-hidden className="ml-1.5 inline-block align-[-2px]" />
                  </Link>
                </p>
              </div>
            )}
            <div className="mt-10">
              {isAuthenticated ? (
                <Link to={DESK_PATH} className={CLOSE_BUTTON}>
                  Go to your canvas
                </Link>
              ) : (
                <Link to="/signup" className={CLOSE_BUTTON}>
                  Join The Garden
                </Link>
              )}
            </div>
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

/** One of the page's asks: its name, the stack to flip through, the call, and
 *  under it a quieter link to see more of them. */
function Call({
  id,
  title,
  more,
  stack,
  children,
}: {
  id: string;
  title: string;
  more?: { to: string; label: string };
  stack: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="min-w-0 max-w-[340px]">
      <h2 id={id} className="m-0" style={{ fontSize: "clamp(1.6rem, 1.3rem + 1vw, 2rem)", fontWeight: 500, letterSpacing: "-0.02em", lineHeight: 1.1 }}>
        {title}
      </h2>
      {/* On a phone the call comes first, under the heading, so it's in the
          first screen; the stack follows. From md, the stack, then the call.
          "See more" is last either way. */}
      <div className="flex flex-col">
        <div className="order-2 mt-6 md:order-1 md:mt-4">{stack}</div>
        {children && <div className="order-1 mt-4 md:order-2 md:mt-6">{children}</div>}
        {more && (
          <div className="order-3 mt-5">
            <Link
              to={more.to}
              className={`inline-flex items-center gap-2 rounded text-[15px] font-normal no-underline underline-offset-4 hover:underline ${FOCUS_RING_CLASS}`}
              style={{ color: DESK.textSoft }}
            >
              {more.label}
              <ArrowRight size={15} aria-hidden />
            </Link>
          </div>
        )}
      </div>
    </section>
  );
}
