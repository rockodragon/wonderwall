// Which notifications are worth celebrating on the canvas (and at the top of
// Today on a phone): someone cheered you on, offered help, backed you, gave
// to you, or a fund awarded you. Pure, so the app imports it too
// (app/lib/celebrations.ts). notifications.listCelebrations reads these.

export const CELEBRATION_TYPES = [
  "encouragement",
  "help_offered",
  "backing_received",
  "gift_received",
  "fund_award",
  "grant_proposal_approved",
] as const;

export type CelebrationType = (typeof CELEBRATION_TYPES)[number];

const CELEBRATION_SET: ReadonlySet<string> = new Set(CELEBRATION_TYPES);

export function isCelebrationType(type: string): type is CelebrationType {
  return CELEBRATION_SET.has(type);
}

/** Awards from a fund: the canvas throws confetti the first time one shows,
 * and the email goes out right away. */
export const AWARD_TYPES: ReadonlySet<string> = new Set(["fund_award", "grant_proposal_approved"]);

/** The rest wait for the one daily email (supportDigest.ts): at most one a
 * day about cheers, offers of help, backings and gifts. */
export const DIGEST_TYPES: ReadonlySet<string> = new Set(CELEBRATION_TYPES.filter((t) => !AWARD_TYPES.has(t)));
