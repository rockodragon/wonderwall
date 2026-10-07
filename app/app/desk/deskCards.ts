// What goes on the desk, built from the app's own data. Pure: the Desk
// component hands in what its queries returned, and this decides which cards
// exist, which view each one belongs to, and what each says
// (docs/features/desktop-desk-palette.md, "Cards").
//
// Money words come from CLAIMS or are reused verbatim from the pages that
// already say them (today.tsx, give.tsx, fund.$slug.tsx). Amounts are exact:
// the caller passes the app's own formatter.

import { CLAIMS } from "../constants/claims";
import { isRaising } from "../lib/browse/projectsFilter";
import { hostNamesLine, type EventHost, hostLabels, type HostLabel } from "../lib/eventHosts";
import { ctaLabel, eventCta, type EventCta, type EventTierLike } from "../lib/eventCta";
import { coverOf, fundingOf, moneyOf, pickProjects, type PickableProject } from "../lib/projectPick";
import { gigPhrase, leadRoles, projectKindLabel, rolePay, type GigLike, type OpenRoleLike } from "../lib/projectKind";
import { GARDEN_SLUG } from "../lib/communitySlugs";
import { richDocExcerpt } from "../lib/richText";
import { isStage, resolveStage, stageLabel } from "../lib/stage";
import type { DeskCommunity, DeskCardId, DeskView } from "./deskState";
import { hashSeed } from "../components/AbstractCover";
import { actionTarget, updateCardId } from "../lib/updates";
import {
  celebrationButton,
  celebrationCardId,
  celebrationIcon,
  celebrationKicker,
  celebrationLinks,
  isAward,
  leadsWithAmount,
  leadsWithTheirWords,
  type CelebrationButton,
  type CelebrationIcon,
  type CelebrationLike,
  type TextLink,
} from "../lib/celebrations";
import { shortDay } from "../lib/dates";
import type { ShortlistButton } from "./shortlistCards";
import { isEventListed } from "../../convex/eventWindow";

// ——————————————————————————————————————————————————————————————
// Types
// ——————————————————————————————————————————————————————————————

export type DeskCardKind = "celebration" | "update" | "event" | "fund" | "grant" | "project" | "person" | "org";

/** What the opened card's button does. An RSVP is a mutation; the rest are
 * links. An Update's button records the press (api.updates.click) and then
 * goes where its link says: in the app, or to another site in a new tab. A
 * Shortlist card's buttons follow the item's state (shortlistCards.ts). A
 * celebration's button marks it done, then says thanks or goes to its link
 * (lib/celebrations.ts). */
export type DeskAction =
  | { kind: "link"; label: string; href: string }
  | { kind: "rsvp"; label: string; eventId: string }
  | { kind: "update"; label: string; href: string; external: boolean; updateId: string }
  | { kind: "celebration"; button: CelebrationButton; notificationId: string }
  | { kind: "shortlist"; buttons: ShortlistButton[] };

/** One labelled line in an opened card's panel: "Stage", "Planning". A row
 * that isn't true of the card isn't in the list. */
export type DeskFact = { label: string; value: string };

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
  face: {
    kicker: string;
    title: string;
    foot: string | null;
    /** A celebration's mark beside the kicker (lib/celebrations.ts). */
    icon?: CelebrationIcon;
    /** The foot is a signature, set in handwriting: an award's fund. */
    script?: boolean;
    /** The title is an amount, set as large as a paper note's. */
    large?: boolean;
    /** A small mono tag in the face's lower-right corner, at rest only: an
     *  organization's "ORG", in place of a kicker at the top. */
    tag?: string;
  };
  detail: {
    meta: string;
    title: string;
    host: string | null;
    /** An event's hosts as links (components/HostedBy.tsx); `host` is the
     *  same line as plain text, for anything that can't hold links. */
    hosts?: HostLabel[];
    description: string;
    /** Small print beside the button: "3 going", "Tax-deductible". */
    aside: string | null;
    /** Labelled rows under the description (a project's stage, funding, roles,
     * pay; a Shortlist role's pay and closing date). Absent on cards that
     * don't have any. */
    facts?: readonly DeskFact[];
    action: DeskAction | null;
    /** A Shortlist card's status line: "Mara invited you Sep 30 · Waiting on you". */
    status?: string;
    /** Names in the title and description that link to their pages: a
     *  celebration's person, project and fund. */
    links?: readonly TextLink[];
  };
  /** The full page for this card. */
  href: string;
  /** Events only. */
  eventId?: string;
  /** Updates only. */
  updateId?: string;
  /** Celebrations only: the notification it reads from, and its type. */
  notificationId?: string;
  celebrationType?: string;
  /** People only: the profile to ask for a bio when the card opens. */
  profileId?: string;
  /** A Shortlist role or project: the project, whose id picks the cover
   *  when there's no picture (a role's card wears its project's). */
  projectId?: string;
};

export type DeskEventInput = {
  _id: string;
  title: string;
  description?: string | null;
  datetime: number;
  endTime?: number | null;
  location?: string | null;
  locationType?: string | null;
  coverImageUrl?: string | null;
  /** The still for a pasted reel or video link, used when there is no cover. */
  mediaPreviewUrl?: string | null;
  attendeeCount?: number;
  hosts?: (EventHost | null | undefined)[];
  status?: string | null;
  ticketTiers?: readonly EventTierLike[] | null;
  externalTicketUrl?: string | null;
  externalTicketPriceCents?: number | null;
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
  /** The server's own read of "asking for backing" (a goal, the raising
   * stage or an active tier); an older backend leaves it off. */
  raising?: boolean;
  /** A recurring gig's summary, as api.garden.projects.listProjects sends it. */
  gig?: GigLike | null;
  /** The open roles, as api.garden.projects.listProjects sends them. */
  openRoles?: readonly OpenRoleLike[] | null;
};

export type DeskPersonInput = {
  _id: string;
  name: string;
  imageUrl?: string | null;
  interests?: readonly string[] | null;
};

/** An organization as api.organizations.list returns it: the same rows the
 * Organizations tab on /people shows. */
export type DeskOrgInput = {
  _id: string;
  name: string;
  slug: string;
  /** "Nonprofit", "Church", "Collective" (organizationRules.ORG_CATEGORIES). */
  category?: string | null;
  tagline?: string | null;
  location?: string | null;
  logoUrl?: string | null;
  /** Current members. */
  peopleCount?: number;
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

/** One Update, as api.updates.listMine returns it. */
export type DeskUpdateInput = {
  _id: string;
  title: string;
  body: string;
  imageUrl: string | null;
  actionLabel: string | null;
  actionUrl: string | null;
};

/** One celebration, as api.notifications.listCelebrations returns it. */
export type DeskCelebrationInput = CelebrationLike;

export type DeskInput = {
  now: number;
  /** Unread celebrations, newest first (lib/celebrations.ts). */
  celebrations: readonly DeskCelebrationInput[];
  /** The Updates this member should see, in the order the server gave. */
  updates: readonly DeskUpdateInput[];
  events: readonly DeskEventInput[];
  /** Events already in Needs you (rule 2: going or hosting this week). Today
   *  lists them above its cards, so its next-event card skips them. */
  needsYouEventIds?: ReadonlySet<string> | readonly string[];
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
/** Celebrations, then Updates, take the first slots on the desk, at most this
 * many between them; the Today view shows all of them. */
export const ALL_VIEW_UPDATES = 2;

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
  return shortDay(ms).toUpperCase();
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

/** Something someone did for you: a cheer, an offer of help, a backing, a
 * gift, an award. Each kind wears its own mark (hands clapping, a handshake,
 * coins, a gift, a trophy) beside the accent kicker. A cheer or an offer
 * leads with their words, with the person's photo when they're named and
 * have one. Money leads with the amount, set large. An award is a paper note,
 * like the fund's, signed with the fund's name in handwriting. */
export function celebrationCard(c: DeskCelebrationInput, sections: DeskView[], money: (cents: number) => string): DeskCard {
  const id = celebrationCardId(c._id);
  const kicker = celebrationKicker(c.type).toUpperCase();
  const icon = celebrationIcon(c.type) ?? undefined;
  const award = isAward(c);
  const amount = leadsWithAmount(c) && c.amountCents ? money(c.amountCents) : null;
  const button = celebrationButton(c);

  let face: DeskCard["face"];
  if (award) {
    // The amount, else what was approved; signed by the fund.
    const title = amount ?? (plainText(c.message, 140) || c.title);
    face = c.fund ? { kicker, title, foot: c.fund.name, icon, script: true } : { kicker, title, foot: amount ? c.title : null, icon };
  } else if (leadsWithTheirWords(c)) {
    const words = plainText(c.message, 140);
    face = { kicker, title: c.type === "encouragement" ? `“${words}”` : words, foot: c.title, icon };
  } else if (amount) {
    face = { kicker, title: amount, foot: c.title, icon, large: true };
  } else {
    face = { kicker, title: c.title, foot: plainText(c.message, 140) || null, icon };
  }

  return {
    id,
    kind: "celebration",
    sections,
    note: award,
    tone: toneFor(id),
    image: award ? null : c.from?.imageUrl || null,
    face,
    detail: {
      meta: `${kicker} · ${dateKicker(c.createdAt)}`,
      title: c.title,
      host: null,
      // Their words whole, line breaks and all.
      description: c.message,
      aside: null,
      action: button ? { kind: "celebration", button, notificationId: c._id } : null,
      links: celebrationLinks(c),
    },
    href: c.linkUrl ?? `/today?card=${id}`,
    notificationId: c._id,
    celebrationType: c.type,
  };
}

/** An Update from the house: a dark card (or a picture) with the kicker UPDATE,
 * and the whole text and button once it's open. */
export function updateCard(u: DeskUpdateInput, sections: DeskView[]): DeskCard {
  const id = updateCardId(u._id);
  const target = u.actionLabel && u.actionUrl ? actionTarget(u.actionUrl) : null;
  return {
    id,
    kind: "update",
    sections,
    note: false,
    tone: toneFor(id),
    image: u.imageUrl || null,
    face: { kicker: "UPDATE", title: u.title, foot: null },
    detail: {
      meta: "UPDATE",
      title: u.title,
      host: null,
      // Plain text, kept whole: the panel keeps its line breaks.
      description: u.body,
      aside: null,
      action:
        target && u.actionLabel
          ? { kind: "update", label: u.actionLabel, href: target.href, external: target.kind === "external", updateId: u._id }
          : null,
    },
    href: `/today?card=${id}`,
    updateId: u._id,
  };
}

/** The button on an event's card: lib/eventCta.ts decides what the event
 *  asks of a person, this turns it into the desk's button. Tickets, another
 *  site's link and approval all go to the event page; a plain RSVP is made
 *  right here. */
function eventAction(cta: EventCta, eventId: string): DeskAction {
  const label = ctaLabel(cta);
  switch (cta.kind) {
    case "applied":
    case "join":
    case "guestRsvp":
    case "none":
      return { kind: "rsvp", label, eventId };
    default:
      return { kind: "link", label, href: `/events/${eventId}` };
  }
}

/** `now` lets an event that has ended read as ended; a caller with no clock
 *  leaves it off. */
export function eventCard(e: DeskEventInput, sections: DeskView[], now?: number): DeskCard {
  const id: DeskCardId = `event:${e._id}`;
  const foot = eventFoot(e);
  const going = e.attendeeCount ?? 0;
  const hostLine = hostNamesLine(e.hosts);
  const page = `/events/${e._id}`;
  const action = eventAction(eventCta(e, { now }), e._id);
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
      hosts: hostLabels(e.hosts),
      description: plainText(e.description),
      // Only a real number: nothing at zero.
      aside: going > 0 ? `${going} going` : null,
      action,
    },
    href: page,
    eventId: e._id,
  };
}

export function fundCard(f: DeskFundInput, money: (cents: number) => string): DeskCard {
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

export function grantCard(amountCents: number, money: (cents: number) => string): DeskCard {
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

/** "2 open: Writer, Director" · "3 open: Writer, Director +1". Null when no
 * role is open. */
export function rolesLine(roles: readonly { title: string }[] | null | undefined): string | null {
  const titles = (roles ?? []).map((r) => r.title.trim()).filter(Boolean);
  if (titles.length === 0) return null;
  const shown = titles.slice(0, 2).join(", ");
  const more = titles.length > 2 ? ` +${titles.length - 2}` : "";
  return `${titles.length} open: ${shown}${more}`;
}

/** "$370 of $1,000 · 37%" · "$1,200 of $1,000 · Goal reached". The percent
 * is left off while nothing has come in (never "0%"), and is never 100
 * before the goal is met. Null for a project that isn't asking for money. */
export function fundingLine(p: DeskProjectInput, money: (cents: number) => string): string | null {
  const funded = fundingOf(p, money);
  if (!funded) return null;
  const raisedCents = p.raisedCents ?? 0;
  const base = `${funded.raised} of ${funded.goal}`;
  if (raisedCents >= (p.goal ?? 0) * 100) return `${base} · Goal reached`;
  const pct = Math.min(99, funded.pct);
  return pct >= 1 ? `${base} · ${pct}%` : base;
}

/** "Drummer · $200; Singer · Open to proposals". */
function paidRolesLine(roles: readonly OpenRoleLike[]): string {
  return roles
    .map((r) => [r.title.trim(), rolePay(r)].filter(Boolean).join(" · "))
    .join("; ");
}

/** The rows of an opened project card, top to bottom: the paid role (on the
 * Jobs and gigs list), stage, schedule, funding, open roles, pay. A paid
 * posting's stage is only shown when its owner set one; the derived "Forming
 * team" would read as an invitation to apply. A project that is raising
 * without a goal (an active tier) says it is open to backing.
 *
 * `onJobsAndGigs`: the card was opened from the Jobs and gigs list, where a
 * project with a paid role leads with that role and its pay. */
export function projectFacts(
  p: DeskProjectInput,
  money: (cents: number) => string,
  opts: { onJobsAndGigs?: boolean } = {},
): DeskFact[] {
  const facts: DeskFact[] = [];
  const lead = leadRoles(p, opts.onJobsAndGigs ?? false);
  if (lead.length > 0) facts.push({ label: lead.length === 1 ? "Paid role" : "Paid roles", value: paidRolesLine(lead) });
  if (p.kind !== "paid" || isStage(p.stage)) facts.push({ label: "Stage", value: stageLabel(resolveStage(p)) });
  const when = p.kind === "paid" ? gigPhrase(p.gig) : null;
  if (when) facts.push({ label: "Schedule", value: when });
  const funding = fundingLine(p, money) ?? (p.kind === "passion" && isRaising(p) ? "Open to backing" : null);
  if (funding) facts.push({ label: "Funding", value: funding });
  // The roles the lead row did not already name.
  const others = lead.length > 0 ? (p.openRoles ?? []).filter((r) => !lead.includes(r)) : p.openRoles;
  const roles = rolesLine(others);
  if (roles) facts.push({ label: "Roles", value: roles });
  const pay = p.kind === "paid" ? moneyOf(p) : null;
  if (pay) facts.push({ label: "Pay", value: pay });
  return facts;
}

/**
 * A project on the desk. The first line says what it is (lib/projectKind):
 * "JOB", "RECURRING GIG · FRIDAYS 8–10PM", "VOLUNTEER", or the stage for a
 * project. On the Jobs and gigs list a project with a paid role leads with
 * that role and its pay instead: "ROLE ON HARBOR MURAL · PAID", the role as
 * the title, its pay in the foot.
 */
export function projectCard(
  p: DeskProjectInput,
  sections: DeskView[],
  money: (cents: number) => string,
  opts: { onJobsAndGigs?: boolean } = {},
): DeskCard {
  const id: DeskCardId = `project:${p._id}`;
  const onJobsAndGigs = opts.onJobsAndGigs ?? false;
  const role = leadRoles(p, onJobsAndGigs)[0] ?? null;
  const kind = projectKindLabel(p, { onJobsAndGigs }).toUpperCase();
  const kicker = p.kind === "paid" || role ? kind : stageLabel(resolveStage(p)).toUpperCase();
  const owner = p.creator?.name ?? null;
  const title = role ? role.title : p.title;

  return {
    id,
    kind: "project",
    sections,
    note: false,
    tone: toneFor(id),
    image: coverOf(p),
    face: {
      kicker,
      title,
      foot: role ? ([rolePay(role), owner ?? p.community?.name].filter(Boolean).join(" · ") || null) : (owner ?? p.community?.name ?? null),
    },
    detail: {
      meta: `${kind} · ${(p.community?.name ?? "The Garden").toUpperCase()}`,
      title,
      host: owner ? `By ${owner}` : null,
      description: plainText(p.blurb || richDocExcerpt(p.body, 400)),
      aside: null,
      facts: projectFacts(p, money, { onJobsAndGigs }),
      action: { kind: "link", label: "See project", href: `/projects/${p._id}` },
    },
    href: `/projects/${p._id}`,
  };
}

export function personCard(p: DeskPersonInput): DeskCard {
  const id: DeskCardId = `person:${p._id}`;
  const interest = (p.interests ?? []).find((t) => !t.startsWith("other:")) ?? null;
  return {
    id,
    kind: "person",
    sections: ["people"],
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

/** "1 person" · "12 people". */
export function peopleLine(n: number): string {
  return `${n} ${n === 1 ? "person" : "people"}`;
}

/**
 * An organization: a logo (or a monogram) with its name. A small "ORG" tag in
 * the lower-right corner says what it is, since an organization sits among
 * people in the same grid; there is no kicker at the top. Opened, the tagline
 * stands for "about" and the button goes to its page.
 */
export function orgCard(o: DeskOrgInput, sections: DeskView[] = ["people"]): DeskCard {
  const id: DeskCardId = `org:${o._id}`;
  // "Other" is the catch-all a category falls back to, which says nothing.
  const category = o.category?.trim() && o.category.trim() !== "Other" ? o.category.trim() : null;
  const location = o.location?.trim() || null;
  const people = o.peopleCount ?? 0;
  const where = [category, location].filter(Boolean).join(" · ");
  return {
    id,
    kind: "org",
    sections,
    note: false,
    tone: toneFor(id),
    image: o.logoUrl || null,
    face: { kicker: "", tag: "ORG", title: o.name, foot: where || (people > 0 ? peopleLine(people) : null) },
    detail: {
      meta: ["ORGANIZATION", category?.toUpperCase()].filter(Boolean).join(" · "),
      title: o.name,
      host: location,
      description: plainText(o.tagline),
      // Only a real number: nothing at zero.
      aside: people > 0 ? peopleLine(people) : null,
      action: { kind: "link", label: "See organization", href: `/orgs/${o.slug}` },
    },
    href: `/orgs/${o.slug}`,
  };
}

/**
 * Every card the desk can show for this member and community, in the order
 * they take slots: Updates first, then events soonest first, the fund, the
 * monthly grant, the featured project, other projects, then followed people
 * (who stand in on People until its own list arrives).
 *
 * Celebrations (someone did something for you) come first, then Updates from
 * the house: between them the first two rest on the desk, and the Today view
 * opens with all of them. They count against the six on the default desk, so
 * the events give way (the third first), never the fund, the grant or the
 * featured project.
 */
export function buildDeskCards(input: DeskInput, community: DeskCommunity): DeskCard[] {
  const needsYou = new Set(input.needsYouEventIds);
  const money = input.formatMoney;

  const celebrationCards = input.celebrations.map((c, i) => {
    const sections: DeskView[] = ["today"];
    if (i < ALL_VIEW_UPDATES) sections.push("all");
    return celebrationCard(c, sections, money);
  });
  const celebrating = celebrationCards.filter((c) => c.sections.includes("all")).length;
  const updateCards = input.updates.map((u, i) => {
    const sections: DeskView[] = ["today"];
    if (i < ALL_VIEW_UPDATES - celebrating) sections.push("all");
    return updateCard(u, sections);
  });
  const resting = celebrating + updateCards.filter((c) => c.sections.includes("all")).length;

  const { featured, open, gigs } = pickProjects(input.projects.filter((p) => inCommunity(p, community)));
  const hasFund = community === "garden" && input.fund !== null;
  // Slots left for events once the Updates, the notes and the featured project have theirs.
  const fixed = resting + (hasFund ? 1 : 0) + (input.grant ? 1 : 0) + (featured ? 1 : 0);
  const eventSlots = Math.max(0, Math.min(ALL_VIEW_EVENTS, ALL_VIEW_MAX - fixed));

  const events = input.events
    // Through the day after it ends (eventWindow.ts): running ones stay, so
    // a person can still join late.
    .filter((e) => isEventListed(e, input.now) && inCommunity(e, community))
    .sort((a, b) => a.datetime - b.datetime);
  // Today's next event, unless Needs you already lists it: then the one after.
  const next = events.find((e) => !needsYou.has(e._id));
  const eventCards = events.map((e, i) => {
    const sections: DeskView[] = ["events"];
    if (i < eventSlots) sections.push("all");
    if (e === next) sections.push("today");
    return eventCard(e, sections, input.now);
  });

  const cards: DeskCard[] = [...celebrationCards, ...updateCards, ...eventCards];

  // The fund belongs to The Garden; The Exchange doesn't show it.
  if (community === "garden" && input.fund) cards.push(fundCard(input.fund, money));
  if (input.grant) cards.push(grantCard(input.grant.amountCents, money));

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
};

/** Cards whose picture side, once open, is a mouse click target for the
 * full page: a project, an event, a person or an organization. The yellow button stays the
 * keyboard way there. A card with no picture side (a sheet) has nothing to
 * click. */
export function picturePage(card: Pick<DeskCard, "kind" | "image" | "note" | "href">): string | null {
  if (opensAsSheet(card)) return null;
  return card.kind === "project" || card.kind === "event" || card.kind === "person" || card.kind === "org" ? card.href : null;
}

/** A card with no picture and no designed face (a paper note has one) opens
 * as a centered sheet, the detail panel alone: with nothing to show on the
 * picture side, there is no picture side. */
export function opensAsSheet(card: Pick<DeskCard, "image" | "note">): boolean {
  return !card.image && !card.note;
}

/** Cards in a view. */
export function cardsInView(cards: readonly DeskCard[], view: DeskView): DeskCard[] {
  return cards.filter((c) => c.sections.includes(view));
}
