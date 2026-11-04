// Host guest list: merges the three places a person can be "on" an event
// (applications, RSVPs, paid ticket purchases) into one row per person.
// Pure and server-free — the frontend imports the summary + CSV helpers.

import { csvCell } from "./csv";
import { formatCents } from "./money";

export type GuestStatus = "going" | "pending" | "declined";

/** Who a guest is, for the host's mix (eventGuestList.ts withGuestRoles):
 * what a host picked, what the buyer said after paying, or what their
 * profile says. */
export const GUEST_ROLES = ["creative", "patron", "partner", "church", "host", "unknown"] as const;
export type GuestRole = (typeof GUEST_ROLES)[number];

/** What a buyer can say they are ("Which are you?" after paying). */
export const SELF_GUEST_ROLES = ["creative", "patron", "partner", "church"] as const;

export function isGuestRole(role: string): role is GuestRole {
  return (GUEST_ROLES as readonly string[]).includes(role);
}

export const GUEST_ROLE_LABEL: Record<GuestRole, string> = {
  creative: "Creative",
  patron: "Patron",
  partner: "Partner",
  church: "Church",
  host: "Host",
  unknown: "Unknown",
};

const GUEST_ROLE_PLURAL: Record<GuestRole, string> = {
  creative: "creatives",
  patron: "patrons",
  partner: "partners",
  church: "churches",
  host: "hosts",
  unknown: "unknown",
};

/** "12 creatives", "1 church", "27 unknown". */
export function guestRoleCount(role: GuestRole, n: number): string {
  return `${n} ${n === 1 ? GUEST_ROLE_LABEL[role].toLowerCase() : GUEST_ROLE_PLURAL[role]}`;
}

/** A profile's role. Someone at a church comes as the church; then the
 * onramp they picked at signup (what the operator counts read,
 * garden/operatorCounts.ts); with none picked, the roles they hold. */
export function roleFromProfile(
  profile: { primaryRole?: string; patronRole?: boolean; partnerRole?: boolean } | null,
  atChurch: boolean,
): GuestRole {
  if (atChurch) return "church";
  if (!profile) return "unknown";
  const picked = profile.primaryRole;
  if (picked === "creative" || picked === "patron" || picked === "partner") return picked;
  if (profile.partnerRole) return "partner";
  if (profile.patronRole) return "patron";
  return "unknown";
}

/** Tickets going, by role. A buyer's other guests count as the buyer's role. */
export function guestMix(rows: Pick<GuestRow, "status" | "tickets" | "role">[]): Record<GuestRole, number> {
  const mix = Object.fromEntries(GUEST_ROLES.map((r) => [r, 0])) as Record<GuestRole, number>;
  for (const r of rows) {
    if (r.status !== "going") continue;
    mix[r.role ?? "unknown"] += r.tickets;
  }
  return mix;
}

const userGuestKey = (userId: string) => `u:${userId}`;
const emailGuestKey = (email: string) => `e:${normalizeGuestEmail(email)}`;

/** The key a guest's row gets in mergeGuests, for an RSVP on its own. */
export function guestKeyOf(g: { userId?: string | null; email?: string | null }): string | null {
  if (g.userId) return userGuestKey(g.userId);
  return g.email?.trim() ? emailGuestKey(g.email) : null;
}

/** Every key a role picked for this row may be filed under: the row's own,
 * its account's and its email's (a row merged from a request and a ticket
 * keeps one key but answers to both). */
export function guestTagKeys(row: Pick<GuestRow, "key" | "userId" | "email">): string[] {
  const keys = [row.key];
  if (row.userId) keys.push(userGuestKey(row.userId));
  if (row.email) keys.push(emailGuestKey(row.email));
  return [...new Set(keys)];
}

/** A key a host may tag: one mergeGuests makes from an account or an email. */
export function isTaggableGuestKey(key: string): boolean {
  return key.length <= 320 && /^(u:\S+|e:\S+@\S+)$/.test(key);
}

export interface GuestRow {
  key: string;
  /** Their account, when they have one: lets a host message them. */
  userId: string | null;
  name: string;
  email: string;
  status: GuestStatus;
  paidCents: number | null;
  /** Tickets this person holds (1 for anyone going without a count). */
  tickets: number;
  /** Names they gave for the other people on their tickets. */
  guestNames: string | null;
  /** Left for the organizer's PayPal link (eventRsvps.ts startPayPalTicket).
   *  Not proof they paid; the organizer's PayPal is. */
  sentToPayPal?: boolean;
  /** The request this person made, when they asked to join: lets a host approve or decline from the list. */
  applicationId: string | null;
  /** What they wrote when they asked to join. */
  message: string | null;
  addedAt: number;
  /** Who they are (withGuestRoles). Unset straight out of mergeGuests. */
  role?: GuestRole;
}

export interface GuestInput {
  userId?: string | null;
  name: string;
  email?: string | null;
  status: GuestStatus;
  paidCents?: number | null;
  tickets?: number | null;
  guestNames?: string | null;
  sentToPayPal?: boolean;
  applicationId?: string | null;
  message?: string | null;
  addedAt: number;
}

const RANK: Record<GuestStatus, number> = { declined: 0, pending: 1, going: 2 };

/** One row per person: matched on userId first, then lowercased email.
 * Paid amounts add up; the best status wins; the earliest date is kept. */
export function mergeGuests(inputs: GuestInput[]): GuestRow[] {
  const byKey = new Map<string, GuestRow>();
  const keyAlias = new Map<string, string>(); // email -> key of the row already holding it
  for (const g of inputs) {
    const email = (g.email ?? "").trim().toLowerCase();
    const uKey = g.userId ? userGuestKey(g.userId) : null;
    const eKey = email ? emailGuestKey(email) : null;
    const key =
      (uKey && byKey.has(uKey) ? uKey : null) ??
      (eKey && keyAlias.get(eKey)) ??
      uKey ??
      eKey ??
      `x:${byKey.size}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, {
        key,
        userId: g.userId ?? null,
        name: g.name,
        email,
        status: g.status,
        paidCents: g.paidCents ?? null,
        tickets: g.tickets ?? 1,
        guestNames: g.guestNames ?? null,
        sentToPayPal: !!g.sentToPayPal,
        applicationId: g.applicationId ?? null,
        message: g.message ?? null,
        addedAt: g.addedAt,
      });
    } else {
      if (RANK[g.status] > RANK[existing.status]) existing.status = g.status;
      if (g.paidCents != null) existing.paidCents = (existing.paidCents ?? 0) + g.paidCents;
      // The same person in two places (a request and a ticket) is one
      // person: keep the larger ticket count rather than adding.
      existing.tickets = Math.max(existing.tickets, g.tickets ?? 1);
      if (g.guestNames) existing.guestNames = existing.guestNames ? `${existing.guestNames}; ${g.guestNames}` : g.guestNames;
      if (g.sentToPayPal) existing.sentToPayPal = true;
      if (!existing.email && email) existing.email = email;
      if (!existing.name || existing.name === "Anonymous") existing.name = g.name;
      if (!existing.applicationId && g.applicationId) existing.applicationId = g.applicationId;
      if (!existing.userId && g.userId) existing.userId = g.userId;
      if (!existing.message && g.message) existing.message = g.message;
      existing.addedAt = Math.min(existing.addedAt, g.addedAt);
    }
    if (eKey && !keyAlias.has(eKey)) keyAlias.set(eKey, key);
  }
  return [...byKey.values()].sort((a, b) => a.addedAt - b.addedAt);
}

export function summarizeGuests(rows: (Pick<GuestRow, "status" | "paidCents"> & { tickets?: number })[]): {
  going: number;
  paid: number;
  collectedCents: number;
} {
  let going = 0;
  let paid = 0;
  let collectedCents = 0;
  for (const r of rows) {
    if (r.status !== "going") continue;
    going += r.tickets ?? 1;
    if (r.paidCents != null && r.paidCents > 0) {
      paid += 1;
      collectedCents += r.paidCents;
    }
  }
  return { going, paid, collectedCents };
}

/** What a guest row says about money: "Paid $25", "Sent to PayPal" (left
 *  for the organizer's PayPal; we can't see whether they paid), or "Free". */
export function paidLabel(r: Pick<GuestRow, "paidCents" | "sentToPayPal">): string {
  if (r.paidCents != null && r.paidCents > 0) return `Paid ${formatCents(r.paidCents)}`;
  return r.sentToPayPal ? "Sent to PayPal" : "Free";
}

export function guestsToCsv(rows: GuestRow[]): string {
  const head = ["Name", "Email", "Role", "Status", "Tickets", "Other guests", "Paid", "Added"];
  const lines = rows.map((r) =>
    [
      r.name,
      r.email,
      r.role ? GUEST_ROLE_LABEL[r.role] : "",
      r.status,
      String(r.tickets),
      r.guestNames ?? "",
      r.paidCents != null && r.paidCents > 0 ? formatCents(r.paidCents) : r.sentToPayPal ? "Sent to PayPal" : "Free",
      new Date(r.addedAt).toISOString().slice(0, 10),
    ]
      .map(csvCell)
      .join(","),
  );
  return [head.join(","), ...lines].join("\n");
}

const normalizeGuestEmail = (email: string) => email.trim().toLowerCase();

/** Which RSVP on an event is the viewer's. Their own account's row wins;
 * failing that, a row with no account whose email is one of the viewer's —
 * that's a ticket bought while signed out, then the buyer made an account
 * with the same email. Read-only: nothing is attached to the row, so
 * putting someone else's email on your profile can't take their ticket
 * away from them. */
export function findMyRsvp<R extends { userId?: unknown; email: string }>(
  rows: R[],
  userId: string,
  myEmails: (string | undefined | null)[],
): R | null {
  const own = rows.find((r) => r.userId && String(r.userId) === userId);
  if (own) return own;
  const emails = new Set(
    myEmails.filter((e): e is string => !!e).map(normalizeGuestEmail),
  );
  return rows.find((r) => !r.userId && emails.has(normalizeGuestEmail(r.email))) ?? null;
}
