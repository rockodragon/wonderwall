// What goes on the desk, built from the app's own data. Pure: the Desk
// component hands in what its queries returned, and this decides which cards
// exist, which view each one belongs to, and what each says
// (docs/features/desktop-desk-palette.md, "Cards").
//
// Money words come from CLAIMS or are reused verbatim from the pages that
// already say them (today.tsx, give.tsx, fund.$slug.tsx). Amounts are exact:
// the caller passes the app's own formatter.

import { CLAIMS } from "../constants/claims";
import { hostNamesLine, type EventHost } from "../lib/eventHosts";
import { isTicketedEvent } from "../lib/eventTickets";
import { coverOf, fundingOf, moneyOf, pickProjects, type PickableProject } from "../lib/projectPick";
import { GARDEN_SLUG } from "../lib/communitySlugs";
import { richDocExcerpt } from "../lib/richText";
import { resolveStage, stageLabel } from "../lib/stage";
import type { DeskCommunity, DeskCardId, DeskView } from "./deskState";
import { hashSeed } from "../components/AbstractCover";

// ——————————————————————————————————————————————————————————————
// Types
// ——————————————————————————————————————————————————————————————

export type DeskCardKind = "event" | "fund" | "grant" | "project" | "person";

/** What the opened card's button does. An RSVP is a mutation; the rest are links. */
export type DeskAction =
  | { kind: "link"; label: string; href: string }
  | { kind: "rsvp"; label: string; eventId: string };

export type DeskCard = {
  id: DeskCardId;
  kind: DeskCardKind;
  /** The views this card belongs to. "all" means it rests on the desk by default. */
  sections: DeskView[];
  /** A paper note (the fund, the monthly grant). */
  note: boolean;
  /** The dark hue behind the face when there's no picture. */
  tone: string;
  image: string | null;
  face: { kicker: string; title: string; foot: string | null };
  detail: {
    meta: string;
    title: string;
    host: string | null;
    description: string;
    /** Small print beside the button: "3 going", "Tax-deductible". */
    aside: string | null;
    action: DeskAction | null;
  };
  /** The full page for this card. */
  href: string;
  /** Events only. */
  eventId?: string;
  /** People only: the profile to ask for a bio when the card opens. */
  profileId?: string;
};

export type DeskEventInput = {
  _id: string;
  title: string;
  description?: string | null;
  datetime: number;
  location?: string | null;
  locationType?: string | null;
  coverImageUrl?: string | null;
  /** The still for a pasted reel or video link, used when there is no cover. */
  mediaPreviewUrl?: string | null;
  attendeeCount?: number;
  hosts?: (EventHost | null | undefined)[];
  ticketTiers?: readonly unknown[] | null;
  externalTicketUrl?: string | null;
  accessType?: string | null;
  priceCents?: number | null;
  requiresApproval?: boolean;
  community?: { name: string; slug: string } | null;
};

export type DeskProjectInput = PickableProject & {
  title: string;
  blurb?: string | null;
  body?: Parameters<typeof richDocExcerpt>[0];
  stage?: string;
  raisedCents?: number | null;
  location?: string | null;
  creator?: { name: string } | null;
  community?: { name: string; slug: string } | null;
  budgetType?: string;
  gig?: { status: string } | null;
};

export type DeskPersonInput = {
  _id: string;
  name: string;
  imageUrl?: string | null;
  interests?: readonly string[] | null;
};

export type DeskFundInput = {
  slug: string;
  /** "The Sophia Fund" */
  name: string;
  /** "Abiding Practice" */
  orgName: string;
  /** Seed plus balance, exactly as the fund page computes it. */
  availableCents: number;
  /** The fund's open call (CLAIMS.sophiaSchedule). */
  openCall?: string | null;
};

export type DeskInput = {
  now: number;
  events: readonly DeskEventInput[];
  /** Ids of the events the member has hearted. */
  favoriteEventIds: ReadonlySet<string> | readonly string[];
  people: readonly DeskPersonInput[];
  projects: readonly DeskProjectInput[];
  fund: DeskFundInput | null;
  /** The open monthly grant, if there is one. */
  grant: { amountCents: number } | null;
  /** The app's own money formatter (garden/ui formatMoney). */
  formatMoney: (cents: number) => string;
};

/** How many cards rest on the desk in the default view. */
export const ALL_VIEW_MAX = 6;
const ALL_VIEW_EVENTS = 3;

// ——————————————————————————————————————————————————————————————
// Small helpers
// ——————————————————————————————————————————————————————————————

// Dark, muted hues for a card with no picture. Picked from the card's id so a
// card keeps its color everywhere. Not EventCard's coverFallback on purpose:
// that is four neutral inks, and cards side by side on the desk need a hue.
const TONES = ["#1f2c2d", "#1c2539", "#2a2722", "#2b2030", "#2c2a1d", "#1d2a22", "#2d2222", "#22262e"];

export function toneFor(seed: string): string {
  return TONES[hashSeed(seed) % TONES.length];
}

/** A community filter, per the spec: The Garden shows its own content plus
 * content with no community; The Exchange shows everything. */
export function inCommunity(item: { community?: { slug: string } | null }, community: DeskCommunity): boolean {
  if (community === "exchange") return true;
  return item.community == null || item.community.slug === GARDEN_SLUG;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

/**
 * Plain text from whatever an author typed: rich text, HTML or markdown come
 * out as sentences. Cut at a word, with an ellipsis, past `max` characters.
 */
export function plainText(raw: string | null | undefined, max = 360): string {
  if (!raw) return "";
  const text = raw
    .replace(/<\s*(br|\/p|\/div|\/li|\/h[1-6])\s*\/?>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (m, e: string) => {
      if (e[0] === "#") {
        const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : "";
      }
      return ENTITIES[e.toLowerCase()] ?? m;
    })
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+\.)\s+/gm, "")
    .replace(/(\*\*|__|\*|`)/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,.;:!?-]+$/, "")}…`;
}

/** "Light Church" from "Light Church, 123 Main St, Carlsbad". A street address
 * keeps its number: "123 Main St". */
export function venueName(location: string | null | undefined): string {
  const parts = (location ?? "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return "";
  return /^\d/.test(parts[0]) && parts[1] ? `${parts[0]}, ${parts[1]}` : parts[0];
}

/** "OCT 2". The same date as EventCard's "Oct 2", capitalized for the mono
 * kicker; kept here so this module stays free of component imports. */
export function dateKicker(ms: number): string {
  return new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric" }).toUpperCase();
}

/** "7PM", "7:30PM" */
export function timeLabel(ms: number): string {
  return new Date(ms)
    .toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    .replace(":00", "")
    .replace(" ", "")
    .toUpperCase();
}

function eventFoot(e: DeskEventInput): string | null {
  if (e.locationType === "online") return "Online";
  return venueName(e.location) || null;
}

// ——————————————————————————————————————————————————————————————
// Cards
// ——————————————————————————————————————————————————————————————

function eventCard(e: DeskEventInput, sections: DeskView[]): DeskCard {
  const id: DeskCardId = `event:${e._id}`;
  const foot = eventFoot(e);
  const going = e.attendeeCount ?? 0;
  const hostLine = hostNamesLine(e.hosts);
  const ticketed = isTicketedEvent(e);
  const page = `/events/${e._id}`;
  const action: DeskAction = ticketed
    ? { kind: "link", label: "Get tickets", href: page }
    : e.requiresApproval
      ? { kind: "link", label: "Apply to Attend", href: page }
      : { kind: "rsvp", label: "I'm going", eventId: e._id };
  return {
    id,
    kind: "event",
    sections,
    note: false,
    tone: toneFor(id),
    image: e.coverImageUrl || e.mediaPreviewUrl || null,
    face: { kicker: dateKicker(e.datetime), title: e.title, foot },
    detail: {
      meta: [dateKicker(e.datetime), timeLabel(e.datetime), foot?.toUpperCase()].filter(Boolean).join(" · "),
      title: e.title,
      host: hostLine ? `Hosted by ${hostLine}` : null,
      description: plainText(e.description),
      // Only a real number: nothing at zero.
      aside: going > 0 ? `${going} going` : null,
      action,
    },
    href: page,
    eventId: e._id,
  };
}

function fundCard(f: DeskFundInput, money: (cents: number) => string): DeskCard {
  return {
    id: "fund",
    kind: "fund",
    sections: ["all", "projects", "today"],
    note: true,
    tone: toneFor("fund"),
    image: null,
    face: { kicker: f.name.toUpperCase(), title: money(f.availableCents), foot: "available to grant" },
    detail: {
      meta: "GRANT FUND",
      title: f.name,
      host: `Run by ${f.orgName}`,
      description: f.openCall ?? "",
      aside: CLAIMS.grantFundDeductibleShort,
      action: { kind: "link", label: "Give", href: `/fund/${f.slug}` },
    },
    href: `/fund/${f.slug}`,
  };
}

function grantCard(amountCents: number, money: (cents: number) => string): DeskCard {
  const amount = money(amountCents);
  return {
    id: "grant",
    kind: "grant",
    sections: ["all", "today"],
    note: true,
    tone: toneFor("grant"),
    image: null,
    face: { kicker: "YOUR MONTHLY GRANT", title: amount, foot: "to give this month" },
    detail: {
      meta: "YOUR MONTHLY GRANT",
      // The same two lines as the Today page's grant card and /give.
      title: `You have ${amount} to give.`,
      host: null,
      description: "Support a creative, a project, or the grant fund.",
      aside: null,
      action: { kind: "link", label: "Choose", href: "/give" },
    },
    href: "/give",
  };
}

function projectCard(p: DeskProjectInput, sections: DeskView[], money: (cents: number) => string): DeskCard {
  const id: DeskCardId = `project:${p._id}`;
  const kicker = p.kind === "paid" ? "PAID WORK" : stageLabel(resolveStage(p)).toUpperCase();
  const owner = p.creator?.name ?? null;

  // Same two lines the Today page prints under a project: what a passion
  // project has raised, and what a paid posting pays.
  let aside: string | null = null;
  const funded = fundingOf(p, money);
  if (funded) {
    aside = `${funded.raised} of ${funded.goal} raised`;
  } else if (p.kind === "paid") {
    aside = moneyOf(p);
  }

  return {
    id,
    kind: "project",
    sections,
    note: false,
    tone: toneFor(id),
    image: coverOf(p),
    face: { kicker, title: p.title, foot: owner ?? p.community?.name ?? null },
    detail: {
      meta: [kicker, p.community?.name.toUpperCase()].filter(Boolean).join(" · "),
      title: p.title,
      host: owner ? `By ${owner}` : null,
      description: plainText(p.blurb || richDocExcerpt(p.body, 400)),
      aside,
      action: { kind: "link", label: "See project", href: `/projects/${p._id}` },
    },
    href: `/projects/${p._id}`,
  };
}

function personCard(p: DeskPersonInput): DeskCard {
  const id: DeskCardId = `person:${p._id}`;
  const interest = (p.interests ?? []).find((t) => !t.startsWith("other:")) ?? null;
  return {
    id,
    kind: "person",
    sections: ["people", "fav"],
    note: false,
    tone: toneFor(id),
    image: p.imageUrl || null,
    face: { kicker: "FOLLOWING", title: p.name, foot: interest },
    detail: {
      meta: "FOLLOWING",
      title: p.name,
      host: null,
      // The bio isn't in the list of people you follow; the opened card asks
      // for the profile and fills it in.
      description: "",
      aside: null,
      action: { kind: "link", label: "See profile", href: `/profile/${p._id}` },
    },
    href: `/profile/${p._id}`,
    profileId: p._id,
  };
}

/**
 * Every card the desk can show for this member and community, in the order
 * they take slots: events soonest first, the fund, the monthly grant, the
 * featured project, other projects, then followed people.
 */
export function buildDeskCards(input: DeskInput, community: DeskCommunity): DeskCard[] {
  const hearted = new Set(input.favoriteEventIds);
  const money = input.formatMoney;

  const events = input.events
    .filter((e) => e.datetime > input.now && inCommunity(e, community))
    .sort((a, b) => a.datetime - b.datetime);
  const eventCards = events.map((e, i) => {
    const sections: DeskView[] = ["events"];
    if (i < ALL_VIEW_EVENTS) sections.push("all");
    if (i === 0) sections.push("today");
    if (hearted.has(e._id)) sections.push("fav");
    return eventCard(e, sections);
  });

  const cards: DeskCard[] = [...eventCards];

  // The fund belongs to The Garden; The Exchange doesn't show it.
  if (community === "garden" && input.fund) cards.push(fundCard(input.fund, money));
  if (input.grant) cards.push(grantCard(input.grant.amountCents, money));

  const { featured, open, gigs } = pickProjects(input.projects.filter((p) => inCommunity(p, community)));
  if (featured) cards.push(projectCard(featured, ["all", "projects"], money));
  for (const p of [...open, ...gigs]) cards.push(projectCard(p, ["projects"], money));

  for (const p of input.people) cards.push(personCard(p));

  return cards;
}

// ——————————————————————————————————————————————————————————————
// Row tail and empty view
// ——————————————————————————————————————————————————————————————

const TAIL_NOUN: Partial<Record<DeskView, string>> = {
  events: "events",
  projects: "projects",
  people: "people",
  fav: "favorites",
};

/** The card that ends a row that runs long: "All 12 events →". */
export function tailLabel(view: DeskView, count: number): string {
  return `All ${count} ${TAIL_NOUN[view] ?? "cards"} →`;
}

/** Cards in a view. */
export function cardsInView(cards: readonly DeskCard[], view: DeskView): DeskCard[] {
  return cards.filter((c) => c.sections.includes(view));
}
