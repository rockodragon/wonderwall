// Host guest list: merges the three places a person can be "on" an event
// (applications, RSVPs, paid ticket purchases) into one row per person.
// Pure and server-free — the frontend imports the summary + CSV helpers.

export type GuestStatus = "going" | "pending" | "declined";

export interface GuestRow {
  key: string;
  name: string;
  email: string;
  status: GuestStatus;
  paidCents: number | null;
  addedAt: number;
}

export interface GuestInput {
  userId?: string | null;
  name: string;
  email?: string | null;
  status: GuestStatus;
  paidCents?: number | null;
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
        name: g.name,
        email,
        status: g.status,
        paidCents: g.paidCents ?? null,
        addedAt: g.addedAt,
      });
    } else {
      if (RANK[g.status] > RANK[existing.status]) existing.status = g.status;
      if (g.paidCents != null) existing.paidCents = (existing.paidCents ?? 0) + g.paidCents;
      if (!existing.email && email) existing.email = email;
      if (!existing.name || existing.name === "Anonymous") existing.name = g.name;
      existing.addedAt = Math.min(existing.addedAt, g.addedAt);
    }
    if (eKey && !keyAlias.has(eKey)) keyAlias.set(eKey, key);
  }
  return [...byKey.values()].sort((a, b) => a.addedAt - b.addedAt);
}

export function summarizeGuests(rows: Pick<GuestRow, "status" | "paidCents">[]): {
  going: number;
  paid: number;
  collectedCents: number;
} {
  let going = 0;
  let paid = 0;
  let collectedCents = 0;
  for (const r of rows) {
    if (r.status !== "going") continue;
    going += 1;
    if (r.paidCents != null && r.paidCents > 0) {
      paid += 1;
      collectedCents += r.paidCents;
    }
  }
  return { going, paid, collectedCents };
}

export function formatDollars(cents: number): string {
  const d = cents / 100;
  return `$${Number.isInteger(d) ? d.toString() : d.toFixed(2)}`;
}

function csvCell(v: string): string {
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function guestsToCsv(rows: GuestRow[]): string {
  const head = ["Name", "Email", "Status", "Paid", "Added"];
  const lines = rows.map((r) =>
    [
      r.name,
      r.email,
      r.status,
      r.paidCents != null && r.paidCents > 0 ? formatDollars(r.paidCents) : "Free",
      new Date(r.addedAt).toISOString().slice(0, 10),
    ]
      .map(csvCell)
      .join(","),
  );
  return [head.join(","), ...lines].join("\n");
}
