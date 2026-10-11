import { ConvexError } from "convex/values";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TICKET_CLAIM_REFUSED, type TicketClaimResult } from "../../convex/garden/ticketLink";
import { claimPendingTickets, stashTicketSession } from "./pendingTicket";

const KEY = "pendingTicketSessions";
const SESSION = "cs_test_a1B2c3D4e5F6g7H8i9J0";
const OTHER = "cs_live_Z9y8X7w6V5u4T3s2R1q0";

function fakeStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
}

/** The session ids still waiting in storage. */
function stashed(): string[] {
  return Object.keys(JSON.parse(localStorage.getItem(KEY) ?? "{}"));
}

describe("claimPendingTickets", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", fakeStorage());
  });

  it("drops a ticket once it is claimed", async () => {
    stashTicketSession(SESSION);
    const claim = vi.fn().mockResolvedValue("claimed" satisfies TicketClaimResult);
    expect(await claimPendingTickets(claim)).toBe(false);
    expect(claim).toHaveBeenCalledWith({ sessionId: SESSION });
    expect(stashed()).toEqual([]);
  });

  it("keeps a ticket waiting on a not_found, and says so", async () => {
    stashTicketSession(SESSION);
    const claim = vi.fn().mockResolvedValue("not_found" satisfies TicketClaimResult);
    expect(await claimPendingTickets(claim)).toBe(true);
    expect(stashed()).toEqual([SESSION]);
  });

  it("drops a refused claim: asking again won't change it", async () => {
    stashTicketSession(SESSION);
    const claim = vi
      .fn()
      .mockRejectedValue(new ConvexError({ code: TICKET_CLAIM_REFUSED, reason: "That ticket stays a guest ticket." }));
    expect(await claimPendingTickets(claim)).toBe(false);
    expect(stashed()).toEqual([]);
  });

  it("keeps a ticket waiting on any other coded error", async () => {
    stashTicketSession(SESSION);
    const claim = vi.fn().mockRejectedValue(new ConvexError({ code: "unauthenticated", reason: "Sign in first." }));
    expect(await claimPendingTickets(claim)).toBe(true);
    expect(stashed()).toEqual([SESSION]);
  });

  it("keeps a ticket waiting on a plain error", async () => {
    stashTicketSession(SESSION);
    const claim = vi.fn().mockRejectedValue(new Error("Server Error"));
    expect(await claimPendingTickets(claim)).toBe(true);
    expect(stashed()).toEqual([SESSION]);
  });

  it("settles each ticket on its own", async () => {
    stashTicketSession(SESSION);
    stashTicketSession(OTHER);
    const claim = vi.fn(async ({ sessionId }: { sessionId: string }) => {
      if (sessionId === SESSION) throw new ConvexError({ code: TICKET_CLAIM_REFUSED });
      return "not_found" as const;
    });
    expect(await claimPendingTickets(claim)).toBe(true);
    expect(stashed()).toEqual([OTHER]);
  });
});
