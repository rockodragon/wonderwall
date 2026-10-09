// Host guest list: merges the three places a person can be "on" an event
// (applications, RSVPs, paid ticket purchases) into one row per person.
// Pure and server-free — the frontend imports the summary + CSV helpers.

export type GuestStatus = "going" | "pending" | "declined";

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
    const uKey = g.userId ? `u:${g.userId}` : null;
    const eKey = email ? `e:${email}` : null;
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

/** The one way an amount of cents reads in dollars: "$25", "$12.50",
 *  "$1,500". The event page, the event cards, the community list and the
 *  guest CSV all use it. */
export function formatDollars(cents: number): string {
  const d = cents / 100;
  return `$${d.toLocaleString("en-US", {
    minimumFractionDigits: Number.isInteger(d) ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

/** What a guest row says about money: "Paid $25", "Sent to PayPal" (left
 *  for the organizer's PayPal; we can't see whether they paid), or "Free". */
export function paidLabel(r: Pick<GuestRow, "paidCents" | "sentToPayPal">): string {
  if (r.paidCents != null && r.paidCents > 0) return `Paid ${formatDollars(r.paidCents)}`;
  return r.sentToPayPal ? "Sent to PayPal" : "Free";
}

function csvCell(v: string): string {
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function guestsToCsv(rows: GuestRow[]): string {
  const head = ["Name", "Email", "Status", "Tickets", "Other guests", "Paid", "Added"];
  const lines = rows.map((r) =>
    [
      r.name,
      r.email,
      r.status,
      String(r.tickets),
      r.guestNames ?? "",
      r.paidCents != null && r.paidCents > 0 ? formatDollars(r.paidCents) : r.sentToPayPal ? "Sent to PayPal" : "Free",
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
