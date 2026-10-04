// Which name an email goes out under. Pure — no Node SDKs, importable from
// plain Convex code, from the "use node" provider, and from vitest.
//
// Two kinds of sender:
//   platform  — mail about the account itself, to people who may not be in
//               the community: sign-in codes, ticket receipts, notes to
//               someone with no account. Sent as "TheCreative.exchange".
//   community — what happens inside the community: invites accepted,
//               messages, project and event activity, updates, digests,
//               waitlist approval. Sent under the community's name, so a
//               Garden member sees The Garden and not an unfamiliar brand.
//
// Which community's name goes on a community email is pickSenderCommunity
// below; the database reads that feed it are in senderCommunity.ts.
//
// Only the display name changes. The address stays the verified sending
// address (EMAIL_FROM, or DEFAULT_FROM in resendProvider.ts).

export type EmailSender = "platform" | "community";

/** The same four values as the `category` on sendNotificationEmail. */
export type EmailCategoryName = "activity" | "digest" | "announcements" | "transactional";

export const PLATFORM_NAME = "TheCreative.exchange";

/** Preference-gated categories are what happens in the community. The
 * "transactional" category is the one with no unsubscribe link; it is mostly
 * receipts and notes to non-members, so it stays on the platform sender
 * unless the caller says otherwise (waitlist approval does). */
export function defaultSenderFor(category: EmailCategoryName | undefined): EmailSender {
  return category === "activity" || category === "digest" || category === "announcements"
    ? "community"
    : "platform";
}

/** The few hostOrgs fields the choice needs; a hostOrgs row fits. */
export interface SenderCommunity {
  _id: string;
  name: string;
  kind: string;
  status?: string;
}

/** A community a person belongs to, and when they joined it. */
export interface SenderMembership<C extends SenderCommunity = SenderCommunity> {
  community: C;
  joinedAt: number;
}

/** An open community: kind "community" and active. A missing status reads
 * as active, the same as everywhere else hostOrgs is read (communities.ts).
 * A fund or the platform row isn't one, nor is a pending or archived
 * community. */
export function isActiveCommunity(org: Pick<SenderCommunity, "kind" | "status">): boolean {
  return org.kind === "community" && (org.status ?? "active") === "active";
}

/** Which community a community email is from, in order:
 *   1. the community the email is about (`explicit`), if it's active;
 *   2. the recipient's own community: the one they're an active member of,
 *      or when they're in several, the default community if they're in it,
 *      else the one they joined first;
 *   3. the default community (The Garden);
 *   4. null — the caller keeps the platform sender.
 * Callers pass `memberships` as the recipient's active memberships; the
 * communities in them are checked for being open here. */
export function pickSenderCommunity<C extends SenderCommunity>(args: {
  explicit?: C | null;
  memberships?: SenderMembership<C>[];
  defaultCommunity?: C | null;
}): C | null {
  const { explicit, defaultCommunity } = args;
  if (explicit && isActiveCommunity(explicit)) return explicit;

  const open = (args.memberships ?? []).filter((m) => isActiveCommunity(m.community));
  if (open.length === 1) return open[0].community;
  if (open.length > 1) {
    const inDefault = defaultCommunity
      ? open.find((m) => m.community._id === defaultCommunity._id)
      : undefined;
    if (inDefault) return inDefault.community;
    // Array.prototype.sort is stable, so equal join times keep their order.
    return [...open].sort((a, b) => a.joinedAt - b.joinedAt)[0].community;
  }

  return defaultCommunity ?? null;
}

/** Strips what could break a header line (CR/LF and other control
 * characters) and collapses runs of spaces. Empty when nothing is left. */
export function cleanDisplayName(name: string | null | undefined): string {
  if (!name) return "";
  return name
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** The display name an email should carry, or undefined to keep the
 * configured default. A community sender with no name (The Garden isn't
 * seeded, or its name is blank) falls back to the default rather than
 * sending under an empty name. */
export function chooseFromName(args: {
  sender: EmailSender;
  communityName?: string | null;
}): string | undefined {
  if (args.sender !== "community") return undefined;
  return cleanDisplayName(args.communityName) || undefined;
}

/** `from` with its display name replaced: ("Old <a@b.co>", "The Garden") →
 * "The Garden <a@b.co>". The address is kept as is. `from` can be a bare
 * address or "Name <address>"; if no address can be found in it, or no name
 * is given, it comes back unchanged. */
export function withDisplayName(from: string, name: string | undefined): string {
  const clean = cleanDisplayName(name);
  if (!clean) return from;

  const bracketed = from.match(/<([^<>]+)>\s*$/);
  const address = (bracketed ? bracketed[1] : from).trim();
  if (!/^[^\s<>"@]+@[^\s<>"@]+$/.test(address)) return from;

  // RFC 5322 "specials" need a quoted string. "The Garden" doesn't; a name
  // like "St. Mary's Garden" does (the period).
  const needsQuotes = /[()<>[\]:;@\\,."]/.test(clean);
  const shown = needsQuotes ? `"${clean.replace(/[\\"]/g, "\\$&")}"` : clean;
  return `${shown} <${address}>`;
}
