// Celebrations: the notifications worth a card on the canvas and at the top
// of Today on a phone. Someone cheered you on, offered help, backed you or
// gave to you, or a fund awarded you. The pure rules both places share; no
// React, no Convex calls.
//
// A celebration is a notification (api.notifications.listCelebrations) whose
// card isn't done yet. Closing the card, "Got it", or its button marks it done
// (notifications.finishCelebration). Reading the inbox doesn't: Messages
// marks everything read on sight, before the canvas has had its turn.

import { AWARD_TYPES } from "../../convex/celebrationTypes";

export { AWARD_TYPES, CELEBRATION_TYPES, isCelebrationType } from "../../convex/celebrationTypes";

/** One celebration as api.notifications.listCelebrations returns it. */
export type CelebrationLike = {
  _id: string;
  type: string;
  title: string;
  message: string;
  linkUrl: string | null;
  createdAt: number;
  /** The person behind it, when they let themselves be named. */
  from: { userId: string; profileId: string; name: string; imageUrl: string | null } | null;
  /** The project it's about, when there is one. Optional: an older backend
   *  doesn't send these three. */
  project?: { title: string; href: string } | null;
  /** The fund behind an award. */
  fund?: { name: string; href: string } | null;
  /** The money, for a backing, a gift or an award. */
  amountCents?: number | null;
};

// ——————————————————————————————————————————————————————————————
// Card ids
// ——————————————————————————————————————————————————————————————

const CARD_PREFIX = "celebration:";

/** The canvas card id for a celebration: `celebration:<notification id>`. */
export function celebrationCardId(notificationId: string): `celebration:${string}` {
  return `${CARD_PREFIX}${notificationId}`;
}

/** The notification behind a canvas card id, or null for any other card. */
export function celebrationIdOf(cardId: string | null | undefined): string | null {
  return cardId && cardId.startsWith(CARD_PREFIX) && cardId.length > CARD_PREFIX.length ? cardId.slice(CARD_PREFIX.length) : null;
}

// ——————————————————————————————————————————————————————————————
// What the card says
// ——————————————————————————————————————————————————————————————

const KICKERS: Record<string, string> = {
  encouragement: "Cheer",
  help_offered: "Offer of help",
  backing_received: "Backing",
  gift_received: "Support",
  fund_award: "Award",
  grant_proposal_approved: "Grant approved",
};

/** The small label over the card: "Cheer", "Award". */
export function celebrationKicker(type: string): string {
  return KICKERS[type] ?? "For you";
}

/** The kinds that carry someone's own words. */
const WORDS_TYPES: ReadonlySet<string> = new Set(["encouragement", "help_offered"]);

/** Their own words lead a cheer or an offer; anything else leads with what happened. */
export function leadsWithTheirWords(c: Pick<CelebrationLike, "type" | "message">): boolean {
  return WORDS_TYPES.has(c.type) && c.message.trim() !== "";
}

/** Each kind's mark, so the cards tell apart at a glance: hands clapping
 * for a cheer, a handshake for an offer of help, coins for a backing, a gift
 * for a gift, a trophy for an award. Names, not components: this file has no
 * React. The canvas and the phone map them to icons. */
export type CelebrationIcon = "clap" | "handshake" | "coins" | "gift" | "trophy";

const ICONS: Record<string, CelebrationIcon> = {
  encouragement: "clap",
  help_offered: "handshake",
  backing_received: "coins",
  gift_received: "gift",
  fund_award: "trophy",
  grant_proposal_approved: "trophy",
};

export function celebrationIcon(type: string): CelebrationIcon | null {
  return ICONS[type] ?? null;
}

/** Money leads a backing, a gift or an award: the amount, set large. */
export function leadsWithAmount(c: Pick<CelebrationLike, "type" | "amountCents">): boolean {
  return !WORDS_TYPES.has(c.type) && (c.amountCents ?? 0) > 0;
}

/** An award from a fund: confetti the first time it shows. */
export function isAward(c: Pick<CelebrationLike, "type">): boolean {
  return AWARD_TYPES.has(c.type);
}

/** What the button does. A named person: "Say thanks" opens a conversation
 * with them. Otherwise it goes where the notification points. */
export type CelebrationButton =
  | { kind: "thanks"; label: string; userId: string }
  | { kind: "link"; label: string; href: string };

export function celebrationButton(c: Pick<CelebrationLike, "from" | "linkUrl">): CelebrationButton | null {
  if (c.from) return { kind: "thanks", label: "Say thanks", userId: c.from.userId };
  if (!c.linkUrl) return null;
  return { kind: "link", label: linkLabel(c.linkUrl), href: c.linkUrl };
}

function linkLabel(href: string): string {
  if (href.startsWith("/fund/")) return "See the fund";
  if (href.startsWith("/settings")) return "Get paid";
  if (href.startsWith("/projects/") || href.startsWith("/story/")) return "See the project";
  return "See it";
}

// ——————————————————————————————————————————————————————————————
// Links on the names
// ——————————————————————————————————————————————————————————————

export type TextLink = { text: string; href: string };

/** The names a celebration mentions, each with its page: the person, the
 * project, the fund. "Someone" is never one of them. */
export function celebrationLinks(c: Pick<CelebrationLike, "from" | "project" | "fund">): TextLink[] {
  const links: TextLink[] = [];
  if (c.from?.name) links.push({ text: c.from.name, href: `/profile/${c.from.profileId}` });
  if (c.project?.title) links.push({ text: c.project.title, href: c.project.href });
  if (c.fund?.name) links.push({ text: c.fund.name, href: c.fund.href });
  return links;
}

export type TextPart = { text: string; href?: string };

/** `text` cut into plain parts and linked parts: the first time each link's
 * words appear, they link. A name that isn't in the text (renamed since)
 * simply isn't linked. Longer names are placed first, so a project called
 * "Dana" can't take Dana Lee's link. */
export function linkParts(text: string, links: readonly TextLink[]): TextPart[] {
  const spans: { start: number; end: number; href: string }[] = [];
  for (const link of [...links].sort((a, b) => b.text.length - a.text.length)) {
    if (!link.text) continue;
    let from = 0;
    while (from <= text.length) {
      const start = text.indexOf(link.text, from);
      if (start < 0) break;
      const end = start + link.text.length;
      if (spans.every((s) => end <= s.start || start >= s.end)) {
        spans.push({ start, end, href: link.href });
        break;
      }
      from = start + 1;
    }
  }
  spans.sort((a, b) => a.start - b.start);
  const parts: TextPart[] = [];
  let at = 0;
  for (const s of spans) {
    if (s.start > at) parts.push({ text: text.slice(at, s.start) });
    parts.push({ text: text.slice(s.start, s.end), href: s.href });
    at = s.end;
  }
  if (at < text.length) parts.push({ text: text.slice(at) });
  return parts;
}

// ——————————————————————————————————————————————————————————————
// Confetti, once per award per browser
// ——————————————————————————————————————————————————————————————

const CELEBRATED_KEY = "canvas.celebrated";

/** The awards this browser has already thrown confetti for. A per-viewer
 * nicety: if storage is blocked, the worst case is confetti twice. */
export function celebratedIds(): Set<string> {
  try {
    const raw = window.localStorage.getItem(CELEBRATED_KEY);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    return new Set(Array.isArray(list) ? list.filter((x): x is string => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}

export function rememberCelebrated(ids: readonly string[]): void {
  try {
    // The newest 50 are plenty: an award is rare, and its notification goes after 90 days.
    const all = [...celebratedIds(), ...ids].slice(-50);
    window.localStorage.setItem(CELEBRATED_KEY, JSON.stringify(all));
  } catch {
    // Storage blocked: nothing to remember it in.
  }
}

/** The awards in `list` this browser hasn't celebrated yet. */
export function awardsToCelebrate(list: readonly Pick<CelebrationLike, "_id" | "type">[], done: ReadonlySet<string>): string[] {
  return list.filter((c) => isAward(c) && !done.has(c._id)).map((c) => c._id);
}
