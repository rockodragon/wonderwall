// Tickets paid for but not yet on an account. AP's Payment Link redirects
// back with ?session=<Stripe checkout session id>; the event page stashes
// it here, and once the buyer is signed in (now, or after they make an
// account) claimPendingTickets hands each one to
// garden/eventRsvps:claimTicketBySession. The webhook may land a few
// seconds after the redirect, so a "not_found" stays stashed for a retry;
// anything older than a week is dropped.

import { isCheckoutSessionId, type TicketClaimResult } from "../../convex/garden/ticketLink";

const KEY = "pendingTicketSessions";
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

type Stash = Record<string, number>; // session id → when it was stashed

function read(): Stash {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    const now = Date.now();
    const out: Stash = {};
    for (const [id, at] of Object.entries(raw)) {
      if (isCheckoutSessionId(id) && typeof at === "number" && now - at < MAX_AGE_MS) out[id] = at;
    }
    return out;
  } catch {
    return {};
  }
}

function write(stash: Stash): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(stash));
  } catch {
    // Storage disabled — the email match in getMyRsvpStatus is the fallback.
  }
}

export function stashTicketSession(sessionId: string): void {
  if (!isCheckoutSessionId(sessionId)) return;
  const stash = read();
  if (!stash[sessionId]) write({ ...stash, [sessionId]: Date.now() });
}

/** Claims every stashed ticket. Returns true while any is still waiting on
 * the webhook. */
export async function claimPendingTickets(
  claim: (args: { sessionId: string }) => Promise<TicketClaimResult>,
): Promise<boolean> {
  const stash = read();
  let waiting = false;
  for (const id of Object.keys(stash)) {
    try {
      const result = await claim({ sessionId: id });
      if (result === "not_found") waiting = true;
      else delete stash[id];
    } catch {
      waiting = true;
    }
  }
  write(stash);
  return waiting;
}
