// The one daily email about what people did for you (docs/features/
// celebrations.md, "Email"): cheers, offers of help, backings and gifts,
// gathered into a single message instead of one email each. Rick,
// 2026-10-04: one message a day is the most we want at this stage. Awards
// from a fund still email right away (celebrationTypes.ts AWARD_TYPES).
//
// The notifications themselves are the source. A row goes in the email once
// (`digestedAt`), and only while it's still news: one the person has already
// read in Messages, or closed on the canvas, is left out. Nobody gets an
// email on a day with nothing in it. It goes as an "activity" email, so the
// existing opt-out and unsubscribe apply.

import { internalMutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { DIGEST_TYPES } from "./celebrationTypes";
import { scheduleNotificationEmail } from "./emailHelpers";
import { escapeHtml } from "./email/template";
import { celebrationContext, type CelebrationContext } from "./notifications";

/** How far back a run looks. A row older than this that somehow wasn't sent
 * (the job didn't run for days) is stale news and is skipped. */
export const DIGEST_LOOKBACK_DAYS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

/** The email lists this many things, then says how many more. */
export const DIGEST_MAX_LINES = 10;

type DigestRow = {
  userId: Id<"users">;
  type: string;
  title: string;
  message: string;
  createdAt: number;
  readAt?: number;
  celebratedAt?: number;
  digestedAt?: number;
};

/** Rows still waiting for the email, grouped by person, oldest first within
 * each person so the email reads in the order things happened. Pure. */
export function pickDigestRows<T extends DigestRow>(rows: readonly T[], now: number): Map<Id<"users">, T[]> {
  const since = now - DIGEST_LOOKBACK_DAYS * DAY_MS;
  const byUser = new Map<Id<"users">, T[]>();
  for (const n of rows) {
    if (!DIGEST_TYPES.has(n.type)) continue;
    if (n.createdAt < since) continue;
    if (n.digestedAt !== undefined || n.readAt !== undefined || n.celebratedAt !== undefined) continue;
    const list = byUser.get(n.userId) ?? [];
    list.push(n);
    byUser.set(n.userId, list);
  }
  for (const list of byUser.values()) list.sort((a, b) => a.createdAt - b.createdAt);
  return byUser;
}

/** Words in a line that link somewhere: the person's name, the project's
 * title. `href` is an app path; the template makes it absolute for mail. */
export type DigestLink = { text: string; href: string };

/** The links for one notification: the person (when it names one) and the
 * project (when it has one). Pure. */
export function digestLinks(context: Pick<CelebrationContext, "from" | "project">): DigestLink[] {
  const links: DigestLink[] = [];
  if (context.from) links.push({ text: context.from.name, href: `/profile/${context.from.profileId}` });
  if (context.project) links.push({ text: context.project.title, href: context.project.href });
  return links;
}

/** The title, escaped, with each link's text wrapped in an anchor at its
 * first occurrence. Matched on the raw title and escaped piece by piece, so a
 * name can't match inside an entity like &amp;. A link whose text isn't in the
 * title is left out, and so is "Someone" (a hidden supporter has nothing to
 * link to). Two links never share the same words: a later one skips past
 * words an earlier one already took, so there's never an anchor in an anchor. */
function linkTitle(title: string, links: readonly DigestLink[]): string {
  const taken: { start: number; end: number; href: string }[] = [];
  for (const { text, href } of links) {
    if (!text || text === "Someone") continue;
    const overlaps = (start: number) => taken.some((t) => start < t.end && start + text.length > t.start);
    let start = title.indexOf(text);
    while (start !== -1 && overlaps(start)) start = title.indexOf(text, start + 1);
    if (start !== -1) taken.push({ start, end: start + text.length, href });
  }
  taken.sort((a, b) => a.start - b.start);

  let out = "";
  let at = 0;
  for (const t of taken) {
    const anchor = `<a href="${escapeHtml(t.href)}" style="color:#111111;text-decoration:underline">${escapeHtml(title.slice(t.start, t.end))}</a>`;
    out += escapeHtml(title.slice(at, t.start)) + anchor;
    at = t.end;
  }
  return out + escapeHtml(title.slice(at));
}

/** One line of the email: what happened (the person and project linked), then
 * their words in quotes for a cheer or an offer, or the rest of the notice
 * ("$25.00 a month", "Connect your bank in Settings to get it.") for money.
 * What they wrote is never linked. */
export function digestLine(n: Pick<DigestRow, "type" | "title" | "message">, links: readonly DigestLink[]): string {
  const title = linkTitle(n.title, links);
  const message = n.message.trim();
  if (!message) return title;
  if (n.type === "encouragement" || n.type === "help_offered") return `${title}: “${escapeHtml(message)}”`;
  return `${title} — ${escapeHtml(message)}`;
}

/** The email for one person's day. One thing: its own words are the subject
 * (plain text, so never linked). More: the first, and how many more. Each row
 * carries the links for its line. */
export function buildSupportDigestEmail(
  rows: readonly (Pick<DigestRow, "type" | "title" | "message"> & { links: readonly DigestLink[] })[],
): {
  subject: string;
  previewText: string;
  heading: string;
  body: string;
  ctaText: string;
  ctaUrl: string;
} {
  const first = rows[0]?.title ?? "";
  const subject = rows.length > 1 ? `${first}, and ${rows.length - 1} more` : first;
  const shown = rows.slice(0, DIGEST_MAX_LINES).map((r) => digestLine(r, r.links));
  const hidden = rows.length - shown.length;
  const lines = hidden > 0 ? [...shown, `And ${hidden} more.`] : shown;
  return {
    subject,
    previewText: subject,
    heading: subject,
    body: lines.join("<br><br>"),
    ctaText: rows.length > 1 ? "See them" : "See it",
    ctaUrl: "/today",
  };
}

/** Daily (crons.ts). Small at this scale: a few days of notifications, read
 * once through the default creation-time index. */
export const sendSupportDigest = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const recent = await ctx.db
      .query("notifications")
      .withIndex("by_creation_time", (q) => q.gt("_creationTime", now - DIGEST_LOOKBACK_DAYS * DAY_MS))
      .collect();

    let people = 0;
    for (const [userId, rows] of pickDigestRows(recent, now)) {
      const lines = await Promise.all(
        rows.map(async (n) => ({
          type: n.type,
          title: n.title,
          message: n.message,
          links: digestLinks(await celebrationContext(ctx, n)),
        })),
      );
      await scheduleNotificationEmail(ctx, { userId, category: "activity", ...buildSupportDigestEmail(lines) });
      // Marked whether or not the person takes activity email: either way
      // these rows have had their turn.
      for (const n of rows) await ctx.db.patch(n._id, { digestedAt: now });
      people += 1;
    }
    return { people };
  },
});
