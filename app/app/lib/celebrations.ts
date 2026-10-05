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

/** Their own words lead a cheer or an offer; anything else leads with what happened. */
export function leadsWithTheirWords(c: Pick<CelebrationLike, "type" | "message">): boolean {
  return (c.type === "encouragement" || c.type === "help_offered") && c.message.trim() !== "";
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
