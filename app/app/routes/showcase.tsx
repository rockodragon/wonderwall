// /showcase — the November 6 open call. This is the destination every piece
// of the Instagram acquisition push points at (docs/marketing/
// showcase-open-call.md), so it is public, prerendered, and readable with
// no account.
//
// The page sells a SHOW, not a membership. A juried open call converts far
// better on cold social traffic than "join our community" does: it has a
// deadline, it confers status, it's free to enter, and the account is the
// byproduct of applying rather than the ask. Membership is mentioned once,
// in the FAQ, as what happens after — never as the price of entry. If
// someone edits this page toward "sign up for The Garden," the conversion
// mechanic is gone; keep the call the subject.
//
// THE APPLICATION LEADS. It is the first thing under the hero, on its own
// raised, citron-edged surface, because the traffic here is cold, mobile and
// one swipe deep: the ask has to be reachable without a scroll, and a panel
// that is visibly a different surface from the page reads as the thing to do
// rather than as more page. Everything that used to sit between the hero and
// the form — the pitch, the facts, the ways to take part — is persuasion for
// people who didn't convert on sight, so it belongs after the ask, not in
// front of it. The "closes CLOSE_DATE, rolling selection" line sits BELOW the
// panel for the same reason: a deadline is a reason to finish, not a hurdle
// to read before starting.
//
// LENGTH IS A FEATURE OF THE FAILURE MODE. Every rewrite of this page has
// grown it, and a long page on cold mobile traffic is a page nobody reaches
// the bottom of. The prose here has been cut to roughly half of what it was
// and should stay that way: short declarative sentences, no triads, no
// "not X but Y" reversals. If a paragraph explains the same thing a FAQ
// item already answers, delete the paragraph, not the FAQ.
//
// GRIDS, NOT LISTS, for the two card sets. A vertical stack of five or six
// cards is five or six screens of thumb travel on a phone and buries whatever
// is last; a two-column grid halves the height, and a grid has a FIRST ROW,
// which is the only piece of hierarchy this page needs. auto-fit collapses it
// to one column on narrow phones, so nothing is lost where the stack was
// fine. Order in the source is order on screen — treat the first two entries
// of each grid as the positioning decision they are.
//
// PATRONS ARE HALF THE ROOM, not a footnote. The fundraiser only works if
// people with money show up, so they get their own way to take part
// ("back"), their own persona card, and the Give · Receive · Grow section
// frames the whole economy in the site's own tagline. Both grids now put the
// patron in the TOP ROW, beside the creative it pays for: "Back the work"
// sits next to "Show your craft," and the patron persona sits next to the
// musician.
// A patron who has to scroll past four creative cards to find themselves has
// already read the page as not-for-them. Anything that pushes patrons back
// down either grid is a regression.
//
// The form's first step is still the email, saved alone, before any other
// question. An abandoned application still leaves a contactable person, and
// the list is the only asset Meta cannot delete. convex/showcase.ts's `apply`
// also writes that email to the waitlist. The rest is a four-step stepper in
// a MODAL (../garden/showcase-modals): by the time the email is saved the
// only thing that matters is finishing, and a centered overlay with the page
// blurred behind it removes every other thing to click, while four small
// steps ask less at once than one long form does. Closing it is safe by
// construction — the email is already stored — so Escape and a scrim click
// both dismiss without a confirm, and the panel here stays as the way back in.
//
// THE MODALS LIVE IN THEIR OWN MODULE and this route owns all the state:
// the email, which overlay is open, submitting/error/done, and every Convex
// call. The modals are given props and hand back answers; they never touch
// `api`. That split is what lets the ticket overlay reuse `showcase.apply` —
// "tell me when tickets open" is the same list write as step one of an
// application — without two components racing to own the same email.
//
// The price badges are BUTTONS that open the ticket overlay, not links to
// the form. There is no checkout yet (TICKET_URL is null), and a patron who
// taps "$75" and lands on a dead div is gone; the overlay takes their email
// and promises the link, which is worth more than the sale we can't take.
// They stay real <button>s with their price and tier in the accessible name.
//
// The FAQ uses native <details>/<summary> rather than a React accordion.
// Collapsed markup that a crawler (or an answer engine) can't read is worse
// than no FAQ at all, and <details> keeps every answer in the prerendered
// HTML while still rendering closed, with keyboard support we'd otherwise
// have to write. Don't "upgrade" it to JS. It stays below the apply area:
// an FAQ above the ask answers objections nobody has yet.
//
// "What do you make?" uses the canonical INTERESTS vocabulary from
// constants/interests.ts, the same axis People, Projects and Offerings use.
// This page used to invent its own nine-item discipline list, which meant an
// applicant who became a member had to describe themselves twice and the two
// answers could never be joined. One vocabulary, everywhere. The chips
// themselves now render inside ApplyModal.
//
// The hero drawing is inverted (filter: invert(1)) rather than re-exported:
// it's ink on white paper, and the Garden shell is paper on ink. Inversion
// turns the pen lines into light on dark and costs nothing at build time.
//
// NOTHING DECORATIVE MAY TAKE THIS PAGE DOWN. Convex's useQuery THROWS during
// render when its query cannot be served — the function not pushed yet to the
// deployment this client points at, a renamed export, a bad deploy. Called in
// the body of this component, that throw is a throw from the whole route: the
// page is replaced by React Router's error boundary, and the way it actually
// presented on localhost was worse than a blank screen — the markup was still
// on screen and every button was dead, including the ticket overlay, because
// the component that owns all the modal state had crashed. The applied-so-far
// count is a vanity number on a fundraiser page. It now lives in its own
// component (AppliedCount) which makes its own useQuery call, wrapped in a
// class error boundary (QuietBoundary) that renders null, so the blast radius
// of a broken publicStats is one line of grey text instead of the application
// form. Any future query that the page is complete without belongs in the
// same shape: its own component, behind its own boundary, never in the body
// of Showcase. The test is one question — if this query dies, can a stranger
// still leave their email? The answer has to stay yes.
//
// The route-level ErrorBoundary below is the SECOND line of defence, not the
// first. It follows join.tsx's pattern (useRouteError + GardenErrorState
// inside GardenPage) so that an unexpected throw shows a designed sentence
// rather than the router's raw error screen. It is a net, not a plan:
// anything we can scope to a boundary of its own gets scoped there instead,
// because a net still costs the whole page.
//
// THE "WHO THIS IS FOR" CARDS TELL THEIR STORY. On hover the card lifts and
// its body arrives one sentence at a time over about five seconds, so someone
// browsing watches a card talk to them instead of skimming five grey quotes.
// It is CSS, not a JS timer: per-line transition-delay off :hover and
// :focus-within (see PAGE_CSS). That matters for more than elegance — a
// JS-driven reveal would have to decide what the server renders, and for a
// prerendered page whose whole job is being read by crawlers and unfurlers
// the answer has to be "all of it." Every sentence is in the DOM and in the
// prerendered HTML at all times; only opacity and transform move, so a screen
// reader reads the card whether or not a pointer is anywhere near it.
// Anything without hover (the inverse of @media (hover: none)) and anyone who
// asked for prefers-reduced-motion gets the whole card immediately, and the
// cards take focus so a keyboard gets the same reveal a mouse does.

import { Component, useId, useState } from "react";
import type { ReactNode } from "react";
import { useMutation, useQuery } from "convex/react";
import { Link, useRouteError } from "react-router";
import { api } from "../../convex/_generated/api";
import { GardenErrorState, GardenPage, SectionLabel } from "../garden/ui";
import { ApplyModal, TicketModal } from "../garden/showcase-modals";
import type { ApplyAnswers, TicketDetails } from "../garden/showcase-modals";
import "../garden/garden.css";

export function meta() {
  return [
    { title: "Open call — show your work November 6 | creatives.exchange" },
    {
      name: "description",
      content:
        "Twenty Christian creatives will show work on November 6 in Encinitas. Free to apply, no membership required. Rolling selection, applications close October 22.",
    },
    { property: "og:title", content: "Open call: show your work November 6" },
    {
      property: "og:description",
      content:
        "Painters, apparel makers, musicians, photographers. Free to apply. Closes October 22.",
    },
    { property: "og:type", content: "website" },
    // Absolute, like every other route here — a relative og:image doesn't
    // unfurl on Instagram, iMessage or Slack, and this link's whole job is
    // to be pasted into those. The drawing is 1330x795 (1.67:1) rather than
    // the 1.91:1 ideal; large-summary cards letterbox it rather than crop.
    { property: "og:image", content: OG_IMAGE },
    { property: "og:image:width", content: "1330" },
    { property: "og:image:height", content: "795" },
    { name: "twitter:card", content: "summary_large_image" },
    {
      name: "twitter:title",
      content: "Open call: show your work November 6",
    },
    {
      name: "twitter:description",
      content:
        "Painters, apparel makers, musicians, photographers. Free to apply. Closes October 22.",
    },
    { name: "twitter:image", content: OG_IMAGE },
  ];
}

/** The backstop. Same shape as join.tsx's: a designed sentence and a way
    home, never a stack frame. Every throw we can anticipate should be caught
    closer to where it happens — see the header — but a route with an
    application form on it must never be able to render the router's default
    error page. */
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
const CLOSE_DATE = "October 22";
/** Hard backstop for a decision — a few days after CLOSE_DATE, and well
    clear of the show so selected work has time to actually get here. The
    page promises ROLLING review (read on arrival, decided continuously)
    with this as the outer bound. If CLOSE_DATE moves, move this with it and
    keep it before EVENT_DATE. */
const DECISION_BY = "October 26";
const SPOTS = 20;


// Admission. November 6 is a ticketed fundraiser for the Grant Fund
// (docs/handoff/nov6-backings.md). The page states the prices plainly so
// nobody discovers them after being accepted — but it does NOT argue about
// who has to pay. An earlier draft leant on "nobody goes free, us included",
// which closes a loophole nobody was trying to use and answers generosity
// with a rule. Giving here has to be willful, not extracted: say what the
// money does (it becomes grants for creatives) and let people choose it.
// If a line here starts justifying the fee, it has already lost.
//
// Two prices, one room. The creatives this call recruits are the people
// least able to absorb a benefit ticket, and the patrons are who the
// fundraiser is actually aimed at — one flat price would either price out
// the applicants or leave donor money on the table.
const TICKET_TIERS = [
  {
    label: "Creative",
    price: "$25",
    // Identity, not a checklist of activities. The old line listed what
    // you'd be DOING on the night ("showing, playing, selling"), so anyone
    // who makes things but isn't in the show read it as not-for-them and
    // priced themselves into the patron tier or out of the room.
    note: "For anyone who makes things.",
  },
  {
    label: "Patron",
    price: "$75",
    note: "Covers your seat and helps cover someone else's.",
  },
] as const;

/** Short form for the facts table. */
const TICKET_SUMMARY = "$25 creative · $75 patron";

/** The table fee. Named rather than inlined because it appears in three
    places (the participation card, the apparel persona, the FAQ) and they
    must not drift. */
const TABLE_FEE = "$50";

// Per-event ticketing isn't built — docs/events-video-hosting-prd.md keeps it
// out of scope, and events use an off-platform payment link instead. So this
// stays null until there's a real checkout URL to point at. Prices above show
// either way; only the button waits on this. The ticket overlay reads it: with
// a URL it sends people to checkout, without one it takes their email.
const TICKET_URL: string | null = null;

// THE DOOR HAS TO SAY WHO IT IS FOR. Every lane card used to open the same
// panel headed "Apply to show your work" — so a volunteer offering to work
// the door, a photographer offering to shoot, and a patron offering money
// were all told to submit work for judging. The click target was right and
// the destination was a lie.
//
// `lane` is the entry point someone used; this map is what the panel says
// back to them. Three things vary, and all three matter: the VERB (a patron
// doesn't "apply", a volunteer doesn't "submit"), whether a jury is
// mentioned at all (only the lanes that are actually juried), and whether
// the application asks about work (a volunteer has no piece to describe).
//
// `exhibit` is the default because the page's headline ask is the open call;
// anyone arriving without a lane is answering that.
type LaneCopy = {
  heading: string;
  hint: string;
  cta: string;
  /** What the panel says once the email is banked. */
  saved: string;
  /** Whether the stepper asks for a portfolio link and "what would you
      bring" — false for lanes where there is no submitted work. */
  asksAboutWork: boolean;
  /** The interests question in this lane's language, and its short label
      for the step bar. A patron makes nothing; asked "what do you make?"
      the honest answer is "nothing" and the chip list reads as a test they
      just failed. The list is the same canonical vocabulary either way —
      only the question changes. */
  interestsHeading: string;
  interestsLabel: string;
};

const LANE_COPY: Record<string, LaneCopy> = {
  exhibit: {
    heading: "Apply to show your craft.",
    hint: "Your email saves first, so you can finish the rest whenever.",
    cta: "Start",
    saved: "A few more questions and the jury has something to read.",
    interestsHeading: "What do you make?",
    interestsLabel: "What you make",
    asksAboutWork: true,
  },
  perform: {
    heading: "Apply to play or read.",
    hint: "Music and spoken word both. Sets are paid.",
    cta: "Start",
    saved: "Tell us what you'd play and we'll sort the running order.",
    interestsHeading: "What do you play or write?",
    interestsLabel: "What you play",
    asksAboutWork: true,
  },
  vend: {
    heading: "Ask for a table.",
    hint: `Tables are ${TABLE_FEE} and there aren't many.`,
    cta: "Start",
    saved: "Tell us what you'd sell and we'll come back about a table.",
    interestsHeading: "What do you make?",
    interestsLabel: "What you make",
    asksAboutWork: true,
  },
  document: {
    heading: "Offer to shoot the night.",
    hint: "Photo or video. Credited, and your footage stays yours.",
    cta: "Count me in",
    saved: "Tell us what you shoot and we'll be in touch about access.",
    interestsHeading: "What do you shoot?",
    interestsLabel: "What you shoot",
    asksAboutWork: true,
  },
  volunteer: {
    heading: "Sign up to volunteer.",
    hint: "Setup, the door, teardown. No application, no jury.",
    cta: "Count me in",
    saved: "We'll be in touch about the shift.",
    interestsHeading: "What are you into?",
    interestsLabel: "Your interests",
    asksAboutWork: false,
  },
  back: {
    heading: "Back the work.",
    hint: "Patron tickets, commissions, or money straight into the grant fund.",
    cta: "Count me in",
    saved: "We'll be in touch about how you'd like to back it.",
    interestsHeading: "What do you want to back?",
    interestsLabel: "What you back",
    asksAboutWork: false,
  },
};

const DEFAULT_LANE = "exhibit";

// The opening is a poem, and it is set as one: stanzas, and line breaks
// where the writer put them. That is the whole reason it exists as an array
// of arrays rather than a paragraph — prose reflows, verse does not, and a
// line landing in the wrong place is the difference between a reading and a
// shrug. Never let a build tool or a "tidy-up" collapse these into
// sentences.
//
// It replaced a "Why this exists" section that said the same things in
// worse order. The argument is identical (creatives can't reach the people
// who'd pay; the two rooms available each demand an amputation); the poem
// just refuses to explain itself, which is why it lands.
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

// ————— Line drawings —————
//
// Inline SVG in the same continuous-pen style as the hero drawing, rather
// than icons from a set: this page's whole visual language is one unbroken
// ink line, and a geometric icon font next to that drawing reads as a
// different product. Loose, slightly-off curves on purpose — a perfect
// circle looks machine-made beside a hand-drawn table.
//
// currentColor throughout, so they inherit whatever the surrounding text is
// and need no dark-mode variant.

function Ink({
  d,
  label,
  size = 44,
}: {
  d: string;
  label: string;
  size?: number;
}) {
  return (
    <svg
      viewBox="0 0 64 64"
      role="img"
      aria-label={label}
      style={{ width: size, height: size, display: "block" }}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={d} />
    </svg>
  );
}

/** A framed piece on a wall, hung slightly crooked. */
const INK_FRAME =
  "M13 17 L50 14 L52 44 L15 47 Z M13 17 C22 23 30 21 36 28 C40 33 46 30 52 36 M8 54 L57 51";
/** A guitar body with a neck, and a mic stand behind it. */
const INK_PLAY =
  "M22 52 C13 52 10 43 15 37 C19 32 26 34 28 28 C30 22 27 17 31 14 M31 14 C36 17 33 23 34 29 C36 36 43 36 44 43 C45 50 37 55 30 53 M22 41 C25 38 30 38 33 41 M46 50 L46 22 M41 18 C41 13 51 13 51 18 C51 23 41 23 41 18";
/** A table with things on it. */
const INK_TABLE =
  "M8 34 L56 31 M12 34 L14 52 M52 31 L54 49 M20 33 L20 25 L29 24 L30 32 M35 32 C35 26 44 26 44 31";
/** A camera, held. */
const INK_CAMERA =
  "M11 24 L24 22 L27 17 L40 16 L44 21 L55 20 L57 45 L13 49 Z M34 25 C41 25 44 31 42 36 C40 41 32 42 29 37 C26 32 29 25 34 25 M17 28 L21 28";
/** A tee laid flat, one sleeve shorter than the other. */
const INK_SHIRT =
  "M24 16 L14 21 L10 31 L18 35 L20 30 L20 50 C28 53 38 53 45 50 L45 30 L47 35 L55 30 L50 20 L41 16 M24 16 C27 23 38 23 41 16";
/** A brush at an angle, over the stroke it just made. */
const INK_BRUSH =
  "M15 51 C10 46 12 38 19 38 L37 18 C40 15 46 20 43 23 L25 43 C28 48 21 56 15 51 M9 58 C19 53 27 58 38 54 C46 51 52 54 56 58";
/** Two hands cupped under a sprout — give, and what grows out of it. */
const INK_HANDS =
  "M11 34 C11 46 20 55 32 55 C44 55 53 46 53 34 M32 31 C32 22 26 17 19 18 C20 26 25 31 32 31 M32 31 C32 21 39 16 46 17 C45 26 39 31 32 31 M32 31 L32 44";
/** One hand up, offered — the volunteer's answer. Fingers uneven on
    purpose, like the rest of these. */
const INK_HAND =
  "M20 55 C15 47 12 40 13 34 C14 29 20 30 21 35 L23 41 L23 16 C23 12 29 12 29 16 L29 33 M29 23 C29 19 35 19 35 23 L35 33 M35 26 C35 22 41 22 41 26 L41 34 M41 30 C41 26 47 26 47 30 C47 41 45 49 39 54";

// The ways to take part. "back" is the patron lane and it lives in the same
// grid as the creative ones on purpose: a patron is a participant, not an
// audience member, and splitting the lists into "make" and "give" put the
// money on the other side of a wall from the work. It is SECOND in the
// array, which is the right half of the first row — see the header.
//
// Six entries, not five: "volunteer" is a real lane (we need hands before
// and after the doors) and it also squares the grid, so no row is left with
// an orphan card. Structurally a ParticipationOption from
// ../garden/showcase-modals, plus an `ink` the modal ignores.
const PARTICIPATION = [
  {
    value: "exhibit",
    // The LABEL is copy and moves freely; the VALUE is stored data, written
    // into applications by convex/showcase.ts, and does not.
    label: "Show your craft",
    note: "Physical or digital. Not all of it has to be in the room.",
    ink: INK_FRAME,
  },
  {
    value: "back",
    label: "Back the work",
    note: "Patron ticket, a commission, or money into the grant fund. You meet who it goes to.",
    ink: INK_HANDS,
  },
  {
    value: "perform",
    label: "Play or read",
    note: "Music and spoken word both. Paid. Set length depends on how many play.",
    ink: INK_PLAY,
  },
  {
    value: "vend",
    label: "Sell at a table",
    note: `${TABLE_FEE}, and there aren't many. You keep what you sell.`,
    ink: INK_TABLE,
  },
  {
    value: "document",
    label: "Shoot the night",
    note: "Photo or video. Credited, and your footage stays yours.",
    ink: INK_CAMERA,
  },
  {
    value: "volunteer",
    label: "Volunteer on the night",
    note: "Hands for setup, the door and teardown.",
    ink: INK_HAND,
  },
] as const;

type Participation = (typeof PARTICIPATION)[number]["value"];

/** The modal hands back plain strings. Narrow them here — this is the edge
    where the page's vocabulary meets the mutation's union, and an unknown
    value should be dropped on the client rather than rejected by Convex
    after the applicant has already hit send. */
function asParticipation(values: string[] | undefined): Participation[] {
  return (values ?? []).filter((v): v is Participation =>
    PARTICIPATION.some((p) => p.value === v),
  );
}

// ————— Page-local CSS —————
//
// The things inline styles genuinely can't express: the ::marker pseudo-
// elements that hide the browser's default <details> triangle, the [open]
// state that flips + to −, hover, and — since the who-cards learned to tell
// their story — media queries and per-line transition-delay. Kept here rather
// than in garden.css because nothing else in the system uses a disclosure or
// a staggered reveal yet; promote either the second a second page needs it.
const PAGE_CSS = `
.sc-faq > summary { list-style: none; cursor: pointer; }
.sc-faq > summary::-webkit-details-marker { display: none; }
.sc-faq > summary::marker { content: ""; }
.sc-faq > summary:hover .sc-faq-q { color: var(--g-citron); }
.sc-faq > summary .sc-faq-mark::after { content: "+"; }
.sc-faq[open] > summary .sc-faq-mark::after { content: "–"; }
.sc-ticket:hover { border-color: var(--g-citron); }

/* "Who this is for" — the card grows and tells its story one line at a time.
   The reveal is nothing but opacity/transform on elements that are ALWAYS in
   the DOM (and therefore always in the prerendered HTML and always readable
   by a screen reader); per-line timing rides in on --sc-delay/--sc-dur, which
   WhoCard computes so the last sentence lands at ~5s no matter how many
   sentences a card has. */
/* Verse. Each line is a block so the writer's break is the one you see; the
   hanging indent means a line too long for a phone wraps INTO itself rather
   than looking like a new line. text-wrap: balance would re-break the lines
   on our behalf, which is exactly what poetry must not allow. */
.sc-verse .sc-stanza {
  margin: 0 0 1.15em;
  max-width: 46ch;
}
.sc-verse .sc-stanza:last-child { margin-bottom: 0; }
.sc-verse .sc-stanza > span {
  display: block;
  padding-left: 1.1em;
  text-indent: -1.1em;
  /* Deliberately NOT text-wrap: nowrap (overflows a phone) and NOT balance
     (re-breaks the writer's lines). Default wrapping plus the hanging
     indent above: a line too long to fit continues, visibly indented, and
     still reads as one line. */
  font-size: clamp(16.5px, 3.6vw, 20px);
  line-height: 1.55;
  color: var(--g-paper);
}
/* The closing stanza is the invitation; let it carry the accent. */
.sc-verse .sc-stanza:last-child > span:last-child { color: var(--g-citron); }

.sc-who { position: relative; }
/* The lane cards are buttons now, so they have to read as pressable. Same
   citron-edge treatment the ticket badges use, for the same reason. */
.sc-lane { transition: border-color 160ms ease, transform 160ms ease; }
.sc-lane:hover, .sc-lane:focus-visible { border-color: var(--g-citron); }
@media (prefers-reduced-motion: no-preference) {
  .sc-lane:hover { transform: translateY(-1px); }
}
.sc-who:focus-visible { outline: 2px solid var(--g-citron); outline-offset: 3px; }
.sc-who-line { display: block; }
.sc-who-line + .sc-who-line { margin-top: 7px; }

/* Gated on a real hovering pointer, which is the inverse of
   @media (hover: none): a phone can never hover, so a phone is never shown a
   card it has to hover to read. Everything below is additive to a card that
   already reads correctly without it. */
@media (hover: hover) and (pointer: fine) {
  .sc-who {
    transition: transform 320ms ease, box-shadow 320ms ease, border-color 320ms ease;
  }
  /* transform, not width/height/padding: the grid keeps its geometry and the
     neighbours stay where they were. z-index so the grown card sits over them. */
  .sc-who:hover,
  .sc-who:focus-within {
    transform: scale(1.03);
    box-shadow: 0 18px 44px rgba(0, 0, 0, 0.5);
    border-color: var(--g-citron);
    z-index: 2;
  }
  .sc-who .sc-who-line {
    opacity: 0;
    transform: translateY(6px);
    /* No delay on the way OUT, so leaving resets every line together and the
       next hover replays the whole story from the first sentence. */
    transition: opacity 180ms ease, transform 180ms ease;
  }
  .sc-who:hover .sc-who-line,
  .sc-who:focus-within .sc-who-line {
    opacity: 1;
    transform: none;
    transition-duration: var(--sc-dur, 1200ms);
    transition-delay: var(--sc-delay, 0ms);
  }
}

/* Non-negotiable, and last so it wins on equal specificity: someone who asked
   for less motion gets the card whole and still, hover or not. */
@media (prefers-reduced-motion: reduce) {
  .sc-who,
  .sc-who:hover,
  .sc-who:focus-within {
    transition: none;
    transform: none;
    box-shadow: none;
  }
  .sc-who .sc-who-line,
  .sc-who:hover .sc-who-line,
  .sc-who:focus-within .sc-who-line {
    opacity: 1;
    transform: none;
    transition: none;
  }
}
`;

// ————— Keeping a decoration from killing the page —————

/** An error boundary that swallows. Its only job is to stop a decorative
    subtree taking the route with it (see the header). It renders NOTHING on
    failure rather than a "couldn't load" strip, because the thing it wraps is
    a thing the page is complete without, and a visible apology for a missing
    vanity number is worse than silence.

    A class, because React has no hook equivalent of componentDidCatch /
    getDerivedStateFromError and has said it isn't adding one. This is the one
    place in the file where a class is the correct tool. */
class QuietBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    // Swallowed for the visitor, not for us — a publicStats that throws
    // usually means the functions aren't deployed, and whoever has the
    // console open should be told once.
    console.warn(
      "showcase: a decorative subtree failed and was dropped",
      error,
    );
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

/** The vanity counter, isolated. It makes the useQuery call ITSELF, which is
    the whole point: the throw has somewhere small to land. Renders nothing
    while the query is in flight, nothing if the count is missing, and nothing
    at all if the query is dead — the rest of the page never notices. */
function AppliedCount() {
  const stats = useQuery(api.showcase.publicStats);
  if (stats?.total == null) return null;
  return (
    <p className="g-hint" style={{ marginTop: 14 }}>
      {stats.total} creatives have applied so far.
    </p>
  );
}

// ————— Small presentational pieces —————

function Section({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
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

/** Both card grids: two columns where there's room, one on a narrow phone.
    auto-fit rather than a media query so the breakpoint is the content's,
    not a guess about devices. */
function CardGrid({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        display: "grid",
        gap: 12,
        gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
      }}
    >
      {children}
    </div>
  );
}

/** How long the whole body takes to arrive on hover — the founder's number,
    "should take like five seconds." It is the TOTAL, divided across whatever
    sentences a card happens to have, not a per-line delay. */
const WHO_REVEAL_MS = 5000;

/** One sentence per revealed line. The bodies below stay single strings
    because that is how prose should read in source and how it should land in
    the prerendered HTML; the split happens here, at render, purely so the CSS
    has something to stagger. Falls back to the whole body as one line if a
    body ever arrives without sentence punctuation. */
function sentences(body: string): string[] {
  const parts = (body.match(/[^.!?]+[.!?]*\s*/g) ?? [])
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length ? parts : [body];
}

/** One of the "who this is for" cards. The heading is the person's own
    sentence about themselves, not our description of them — that's the line
    that makes a stranger stop scrolling and think "that's me." The drawing
    is there so the cards can be told apart at a glance on a phone, where
    they otherwise read as one grey wall of quotes. Stacked rather than
    side-by-side now that two sit in a row: at half width there isn't room
    for a drawing in the gutter. */
function WhoCard({
  quote,
  who,
  body,
  ink,
}: {
  quote: string;
  who: string;
  body: string;
  ink: string;
}) {
  // Split evenly rather than at a fixed step: a two-sentence card and a
  // three-sentence one both finish at WHO_REVEAL_MS, and neither sits there
  // doing nothing for two seconds waiting for its last line.
  const lines = sentences(body);
  const slot = Math.round(WHO_REVEAL_MS / lines.length);

  return (
    <div
      className="g-card sc-who"
      /* Focusable so that :focus-within gives a keyboard the same reveal a
         mouse gets. Nothing in here is a control, so there is no role to
         give it; a tab stop on a paragraph is the cost of not making the
         paragraph mouse-only. */
      tabIndex={0}
      style={{ height: "100%" }}
    >
      <span
        style={{ color: "var(--g-citron)", display: "block", marginBottom: 12 }}
      >
        <Ink d={ink} label={who} size={38} />
      </span>
      <div className="g-label" style={{ color: "var(--g-citron)" }}>{who}</div>
      <p className="g-h" style={{ fontSize: 19, marginTop: 8, lineHeight: 1.3 }}>
        “{quote}”
      </p>
      {/* Every sentence is rendered, always. The animation is CSS on top of
          markup that is already correct — never a condition on whether the
          text exists. */}
      <p style={{ fontSize: 15.5, lineHeight: 1.6, marginTop: 10 }}>
        {lines.map((line, i) => (
          <span
            key={line}
            className="sc-who-line"
            style={
              {
                "--sc-delay": `${i * slot}ms`,
                "--sc-dur": `${slot}ms`,
              } as React.CSSProperties
            }
          >
            {line}
          </span>
        ))}
      </p>
    </div>
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

/** One beat of Give · Receive · Grow. Citron key, one line of value — if a
    beat needs a paragraph the economy is too complicated to pitch. */
function Beat({ word, line }: { word: string; line: string }) {
  return (
    <div
      style={{
        display: "flex",
        gap: 16,
        alignItems: "baseline",
        padding: "10px 0",
        borderBottom: "1px solid var(--g-hairline)",
      }}
    >
      <span
        className="g-label"
        style={{ minWidth: 80, flexShrink: 0, color: "var(--g-citron)" }}
      >
        {word}
      </span>
      <span style={{ fontSize: 15.5, lineHeight: 1.55 }}>{line}</span>
    </div>
  );
}

/** A native disclosure styled as a Garden card. See PAGE_CSS for why this
    isn't a React accordion. */
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
      <div
        style={{
          padding: "0 20px 18px",
          fontSize: 15.5,
          lineHeight: 1.65,
        }}
      >
        {children}
      </div>
    </details>
  );
}

// ————— Page —————

export default function Showcase() {
  const apply = useMutation(api.showcase.apply);
  const answer = useMutation(api.showcase.answerApplication);

  // The application. `email` is banked the moment step one submits, which is
  // why every other flag here can be thrown away without losing anything.
  const [email, setEmail] = useState("");
  const [applyOpen, setApplyOpen] = useState(false);
  const [applyBusy, setApplyBusy] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [applyDone, setApplyDone] = useState(false);
  const [emailSaved, setEmailSaved] = useState(false);
  /** Someone coming back to a finished application. They still get the
      stepper — re-submitting overwrites, which is how you add the better
      photo you took last week — but the copy shouldn't pretend we've never
      met. */
  const [returning, setReturning] = useState(false);

  // The ticket overlay. Its own flags: a patron mid-ticket and an applicant
  // mid-application are two different people on two different pages, and
  // sharing one `busy` would spin both.
  const [tier, setTier] = useState<
    { label: string; price: string; note: string } | null
  >(null);
  const [ticketBusy, setTicketBusy] = useState(false);
  const [ticketError, setTicketError] = useState<string | null>(null);
  const [ticketDone, setTicketDone] = useState(false);
  // The address the ticket overlay actually saved — see notifyTicket.
  const [ticketEmail, setTicketEmail] = useState("");
  // The lane someone entered through. It drives BOTH the ticked box in the
  // application and every word on the panel and in the modal — the door has
  // to say who it's for, not just open.
  const [lane, setLane] = useState<string>(DEFAULT_LANE);
  const laneCopy = LANE_COPY[lane] ?? LANE_COPY[DEFAULT_LANE];

  const applyHeadingId = useId();

  function errorText(err: unknown): string {
    const raw = err instanceof Error ? err.message : String(err);
    // Convex prefixes thrown errors with its own framing; the applicant
    // should read the sentence we wrote, not a stack frame.
    const match = raw.match(/Uncaught Error:\s*(.+?)(\n|$)/);
    return (match?.[1] ?? raw).slice(0, 200);
  }

  /** Step one, and the only thing on the page that must not fail quietly. */
  /** Saves one address, alone. Both doors call this: the panel's form and
      step one of the overlay. It is the only place the email is written, so
      the two entry points cannot drift apart on what "saved" means. */
  async function submitEmailValue(value: string) {
    const address = value.trim();
    if (!address) return;
    setApplyBusy(true);
    setApplyError(null);
    try {
      const result = await apply({ email: address });
      setEmail(address);
      setReturning(result.answered);
      setEmailSaved(true);
    } catch (err) {
      setApplyError(errorText(err));
    } finally {
      setApplyBusy(false);
    }
  }

  async function submitEmail(e: React.FormEvent) {
    e.preventDefault();
    await submitEmailValue(email);
    setApplyOpen(true);
  }

  /** Steps two through four, handed back in one object by the stepper. */
  async function submitAnswers(answers: ApplyAnswers) {
    setApplyBusy(true);
    setApplyError(null);
    try {
      const participation = asParticipation(answers.participation);
      await answer({
        email,
        name: answers.name || undefined,
        city: answers.city || undefined,
        instagram: answers.instagram || undefined,
        interests: answers.interests?.length ? answers.interests : undefined,
        portfolioUrl: answers.portfolioUrl || undefined,
        workDescription: answers.workDescription || undefined,
        participation: participation.length ? participation : undefined,
      });
      setApplyDone(true);
    } catch (err) {
      setApplyError(errorText(err));
    } finally {
      setApplyBusy(false);
    }
  }

  /** "Tell me when tickets open" is the same write as step one — the email
      lands on the waitlist and in the application table, and whoever left it
      gets the link the day there is one. */
  async function notifyTicket(value: string) {
    setTicketBusy(true);
    setTicketError(null);
    try {
      await apply({ email: value });
      // Remember WHICH address this overlay saved. The page-level `email`
      // belongs to the application panel and may be blank or somebody
      // else's; writing the follow-up answers against that would attach a
      // ticket-buyer's name to the wrong row, or throw because no such
      // application exists.
      setTicketEmail(value.trim());
      setTicketDone(true);
    } catch (err) {
      setTicketError(errorText(err));
    } finally {
      setTicketBusy(false);
    }
  }

  /** Steps 2 and 3 of the ticket overlay. These are pure upside: the email
      is already saved by the time this can run, so a failure here must
      never look like the signup failed. It is recorded and swallowed. */
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

  /** Entering the application from a specific lane card.
      The application is keyed on an email we don't have yet unless they've
      already given one, so an unsaved visitor is sent to the panel that
      collects it rather than into a modal that would fail on submit. Their
      lane is remembered either way and ticked once the modal opens. */
  function startLane(value: string) {
    setLane(value);
    setApplyError(null);
    setApplyOpen(true);
  }


  function openTicket(next: { label: string; price: string; note: string }) {
    setTier(next);
    setTicketError(null);
    setTicketDone(false);
  }

  return (
    <GardenPage>
      <style>{PAGE_CSS}</style>

      {/* Hero */}
      <div style={{ marginTop: 18 }}>
        {/* The drawing opens the page. It is the only thing here that says
            what the night looks like before a word is read. */}
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

        <span className="g-badge g-badge-citron">Open call</span>
        <h1 className="g-h" style={{ marginTop: 16 }}>
          Friends, neighbors&hellip;
        </h1>

        {/* Verse, not prose. Each line is its own element so the break is
            the writer's and not the viewport's; on a narrow phone a line too
            long to fit wraps with a hanging indent (see .sc-verse in
            PAGE_CSS) so a wrap still reads as one line continuing rather
            than as a new one starting. */}
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

      {/* THE TICKET IS THE FIRST ASK, right under "Come and see." The two
          people this night needs are creatives and patrons, and the two
          tiers ARE those two people. The six lanes below are real, but they
          open on vendors, volunteers and camera crew — the tail wagging the
          dog on a fundraiser. */}
      <Section label="Get your ticket">
        <P>
          Every ticket goes into the grant fund — the money that backs
          creatives' projects. It's the simplest way to put something into the
          creative economy on your way through the door.
        </P>
        <div style={{ display: "grid", gap: 12, marginTop: 16 }}>
          {TICKET_TIERS.map((t) => (
            <button
              key={t.label}
              type="button"
              className="g-card sc-ticket"
              onClick={() => openTicket(t)}
              aria-label={`Get your ${t.label.toLowerCase()} ticket, ${t.price}`}
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
                style={{ fontSize: 26, color: "var(--g-citron)", flexShrink: 0 }}
              >
                {t.price}
              </span>
              <span style={{ flex: 1 }}>
                <span style={{ color: "var(--g-paper)", display: "block" }}>
                  {t.label}
                </span>
                <span className="g-hint" style={{ display: "block", marginTop: 4 }}>
                  {t.note}
                </span>
              </span>
              <span
                className="g-badge g-badge-line"
                style={{ flexShrink: 0, whiteSpace: "nowrap" }}
              >
                {/* One label either way. "Notify me" made the card read as
                    a mailing-list sign-up during the weeks before checkout
                    exists, which is the wrong promise for a ticket tier —
                    "Save your space" is true now AND once it sells. */}
                Save your space
              </span>
            </button>
          ))}
        </div>
        <P>Can't be in Encinitas? The livestream is free.</P>
      </Section>

      {/* No instruction line under this grid. "Join us as…" already says the
          choice is one of these, and a sentence telling someone to pick one
          is a sentence explaining a grid of six buttons. */}
      <Section label="Join us as…">
        <div style={{ marginTop: 18 }}>
          <CardGrid>
            {PARTICIPATION.map((p) => (
              // The whole card is the button. Every lane on this grid was a
              // dead <div> — someone read "Volunteer on the night", agreed,
              // and had nowhere to click. Entering here ticks that lane in
              // the application, so the card and the form agree about what
              // they just said yes to.
              <button
                key={p.value}
                type="button"
                className="g-card sc-lane"
                onClick={() => startLane(p.value)}
                aria-label={`Take part: ${p.label}`}
                style={{
                  height: "100%",
                  display: "flex",
                  gap: 16,
                  alignItems: "flex-start",
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
                  style={{ color: "var(--g-citron)", flexShrink: 0, marginTop: 2 }}
                >
                  <Ink d={p.ink} label={p.label} size={38} />
                </span>
                <span>
                  <span
                    style={{
                      color: "var(--g-paper)",
                      fontSize: 16.5,
                      display: "block",
                    }}
                  >
                    {p.label}
                  </span>
                  <span className="g-hint" style={{ display: "block", marginTop: 6 }}>
                    {p.note}
                  </span>
                </span>
              </button>
            ))}
          </CardGrid>
        </div>
      </Section>



      {/* The positioning. Unpaid faith or faithless funding, and a third
          option. Five short sentences, and it does not get longer. */}
      {/* Facts before persuasion — a creative deciding whether to apply is
          scanning for the date, the cost and the catch. */}
      <Section label="The details">
        <FactLine k="When" v={EVENT_DATE} />
        <FactLine k="Where" v={EVENT_PLACE} />
        <FactLine k="Spots" v={`${SPOTS}, selected from applications`} />
        <FactLine k="To apply" v="Free" />
        <FactLine k="Admission" v={TICKET_SUMMARY} />
        <FactLine k="Closes" v={`${CLOSE_DATE}, but selection is rolling`} />
        <FactLine k="Also" v="Livestreamed free, and recorded" />
        {/* Decorative, and behind its own boundary for exactly that reason.
            If publicStats throws, this line disappears and nothing else on
            the page changes. See the header. */}
        <QuietBoundary>
          <AppliedCount />
        </QuietBoundary>
      </Section>

      {/* Show your craft | Back the work in the first row. See the header. */}

      {/* The economy, in the site's own tagline. This sits high on the page
          on purpose: an applicant who finds out at acceptance that they have
          to buy a ticket feels bait-and-switched, and it's a fundraiser, so
          there is no version of this where we hide it. Three lines, because
          three paragraphs is where this section was and nobody read it. */}
      <Section label="Give · Receive · Grow">
        <div style={{ marginBottom: 8 }}>
          <Beat
            word="Give"
            line="Patrons buy a ticket and buy work. That is where the money comes from."
          />
          <Beat
            word="Receive"
            line={`The ${SPOTS} creatives get shown, credited and paid.`}
          />
          <Beat
            word="Grow"
            line="What's left goes into the grant fund, which backs the next projects."
          />
        </div>

      </Section>

      {/* Patrons first, beside the musician. See the header. */}
      <Section label="Who this is for">
        <CardGrid>
          <WhoCard
            who="Patrons"
            ink={INK_HANDS}
            quote="I want to back someone specific, not a cause."
            body="Buy a patron ticket and you'll meet the twenty, see what they made and know where your money went. Buy the piece off the wall if you want it."
          />
          <WhoCard
            who="Musicians"
            ink={INK_PLAY}
            quote="I'm not allowed to write anything that isn't a worship song."
            body="Play the songs nobody will program, to a room that came to listen. Sets are paid. Spoken word counts."
          />
          <WhoCard
            who="Photographers"
            ink={INK_CAMERA}
            quote="My portfolio is full of other people's weddings."
            body="Hang your own work, or shoot the night — photo or video — and get credited. Either way it stays yours."
          />
          <WhoCard
            who="Painters"
            ink={INK_BRUSH}
            quote="I don't want to be collected for my subject matter."
            body="Galleries won't hang it. The church asks you to donate it. Bring the piece you can't place anywhere."
          />
          <WhoCard
            who="Apparel"
            ink={INK_SHIRT}
            quote="I'm a designer. I'm not a Jesus-merch guy."
            body={`Your drops go out to a feed that won't show them to anyone who'd wear them. A table is ${TABLE_FEE} and there aren't many. What you sell is yours.`}
          />
        </CardGrid>
      </Section>

      {/* Below the apply area on purpose. An FAQ above the ask answers
          objections nobody has yet; below it, it catches the people who
          scrolled past. */}
      {/* The ask, first and on its own surface. Lighter than the page and
          citron-edged so it reads as a panel laid on top rather than as the
          next paragraph. */}
      <section
        id="apply"
        aria-labelledby={applyHeadingId}
        style={{
          marginTop: 28,
          padding: "24px 24px 26px",
          borderRadius: 10,
          border: "1px solid var(--g-citron)",
          background: "rgba(247, 247, 244, 0.05)",
          boxShadow: "0 14px 38px rgba(0, 0, 0, 0.45)",
        }}
      >
        {emailSaved ? (
          // The email is banked. This stays as the way back into the stepper
          // if they dismissed it, and as proof we have their address.
          <div>
            <div className="g-label" style={{ color: "var(--g-citron)" }}>
              {applyDone ? "Application received" : "Email saved"}
            </div>
            <p
              className="g-h"
              id={applyHeadingId}
              style={{ fontSize: 22, marginTop: 10 }}
            >
              {applyDone
                ? `We'll be in touch by ${DECISION_BY}.`
                : `You're on the list as ${email}.`}
            </p>
            <p className="g-hint" style={{ marginTop: 8 }}>
              {applyDone
                ? "Want to change what you sent? Open it again and resubmit."
                : laneCopy.saved}
            </p>
            <button
              className="g-btn g-btn-ghost"
              type="button"
              onClick={() => setApplyOpen(true)}
              style={{ marginTop: 14 }}
            >
              {applyDone ? "Review answers" : "Finish application"}
            </button>
          </div>
        ) : (
          <form onSubmit={submitEmail}>
            <div className="g-label">Free · no account · 20 seconds</div>
            <p
              className="g-h"
              id={applyHeadingId}
              style={{ fontSize: 24, marginTop: 10 }}
            >
              {laneCopy.heading}
            </p>
            <p className="g-hint" style={{ marginTop: 8 }}>
              {laneCopy.hint}
            </p>
            <div
              style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}
            >
              <input
                className="g-input"
                style={{ flex: "1 1 240px" }}
                type="email"
                required
                autoComplete="email"
                aria-label="Your email"
                placeholder="you@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <button
                className="g-btn g-btn-citron"
                type="submit"
                disabled={applyBusy}
                style={{ opacity: applyBusy ? 0.6 : 1 }}
              >
                {applyBusy ? "Saving…" : laneCopy.cta}
              </button>
            </div>
            {applyError && (
              <p style={{ color: "var(--g-citron)", fontSize: 14, marginTop: 10 }}>
                {applyError}
              </p>
            )}
          </form>
        )}
      </section>

      {/* Below the panel on purpose — a deadline is a reason to finish, not
          a hurdle to read before starting. */}
      <p className="g-hint" style={{ marginTop: 12 }}>
        Applications close {CLOSE_DATE}. Selection is rolling, so the earlier
        you send yours, the more of the {SPOTS} spots are left.
      </p>

      <Section label="Questions people ask">
        <div style={{ display: "grid", gap: 10 }}>
          <Faq q="How does selection work?">
            A few of us read every application and pick {SPOTS}. We care that
            the work is finished and that it's yours. Follower counts don't
            come into it. You don't need an account, a membership or a
            portfolio site. A link to your Instagram grid is a fine
            submission.
          </Faq>
          <Faq q="When do I hear back?">
            We read applications as they arrive rather than waiting for the
            deadline, so applying early means hearing early, and spots do
            fill. You'll hear either way within a few days, and by{" "}
            {DECISION_BY} at the latest. If it's a no, we keep what you sent.
            The next call opens in January.
          </Faq>
          <Faq q="What does it cost?">
            Applying is free and showing work is free. Admission is{" "}
            {TICKET_SUMMARY}, and a table is {TABLE_FEE}. It's a benefit for
            the grant fund, so what you pay at the door goes back out to
            creatives as project money.
          </Faq>
          <Faq q="Can I volunteer instead of showing work?">
            Yes. We need hands for setup, the door and teardown, and it's the
            easiest way in if you'd rather be useful than hang something.
            Pick "volunteer on the night" on your application and we'll be
            in touch about the shift.
          </Faq>
          <Faq q="I'm not a creative. Can I come?">
            Yes, and it's the reason the night works. Buy a patron ticket.
            There's nothing to apply for, you just come, meet the twenty
            people showing and buy what you like.
          </Faq>
          <Faq q="Do I have to pay for a membership?">
            No, and applying doesn't sign you up for one.{" "}
            <Link to="/join" style={{ color: "var(--g-citron)" }}>
              Membership
            </Link>{" "}
            is separate and has nothing to do with whether you're selected.
          </Faq>
          <Faq q="Does the work have to be physical?">
            No. The night is a mix of physical and digital. If it's an object
            it has to reach Encinitas by November 6 and we can't cover
            shipping. If it's a screen, a recording or a file, distance stops
            mattering.
          </Faq>
          <Faq q="Does my work have to be religious?">
            No. What we want to platform is redemptive work: work that
            embodies truth, goodness and beauty. Sometimes that includes
            church hurt. Bring the honest thing, not the safe one.
          </Faq>
        </div>
      </Section>

      {/* Repeat the asks at the end. Someone who read the whole page is the
          most convinced reader it has, and until now the last thing they
          met was an FAQ item — the page simply stopped. Both primary paths
          appear again, in the same words, so nobody has to scroll back up
          hunting for the thing they just decided to do. */}
      <Section label="Ready?">
        <div
          style={{
            display: "flex",
            gap: 12,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <button
            type="button"
            className="g-btn g-btn-citron"
            onClick={() => startLane("exhibit")}
          >
            Apply to show your craft
          </button>
          {TICKET_TIERS.map((t) => (
            <button
              key={t.label}
              type="button"
              className="g-btn g-btn-ghost"
              onClick={() => openTicket(t)}
              aria-label={`Get your ${t.label.toLowerCase()} ticket, ${t.price}`}
            >
              {t.label} ticket · {t.price}
            </button>
          ))}
        </div>
        <p className="g-hint" style={{ marginTop: 14 }}>
          Applications close {CLOSE_DATE}. Selection is rolling, so the
          earlier you send yours, the more of the {SPOTS} spots are left.
        </p>
      </Section>

      <ApplyModal
        open={applyOpen}
        email={email}
        returning={returning}
        emailSaved={emailSaved}
        onEmail={submitEmailValue}
        participationOptions={PARTICIPATION}
        intent={{
          key: lane,
          title: laneCopy.heading,
          submitLabel: laneCopy.cta === "Start" ? "Send application" : "Count me in",
          asksAboutWork: laneCopy.asksAboutWork,
          interestsHeading: laneCopy.interestsHeading,
          interestsLabel: laneCopy.interestsLabel,
        }}
        preselect={lane}
        submitting={applyBusy}
        error={applyError}
        done={applyDone}
        onSubmit={submitAnswers}
        onClose={() => setApplyOpen(false)}
      />

      <TicketModal
        open={tier != null}
        tier={tier}
        ticketUrl={TICKET_URL}
        submitting={ticketBusy}
        error={ticketError}
        done={ticketDone}
        onNotify={notifyTicket}
        onSubmitDetails={submitTicketDetails}
        onClose={() => setTier(null)}
      />
    </GardenPage>
  );
}
