import { ConvexError } from "convex/values";
import { describe, expect, it, vi } from "vitest";
import type { Id } from "../../convex/_generated/dataModel";
import { joinWithInvite } from "./joinWithInvite";

const GARDEN = "hostOrgs:garden" as Id<"hostOrgs">;

describe("joinWithInvite", () => {
  it("joins with the code, agreeing", async () => {
    const join = vi.fn().mockResolvedValue({ ok: true });
    expect(await joinWithInvite(join, GARDEN, "K7M4QD")).toBeNull();
    expect(join).toHaveBeenCalledWith({ hostOrgId: GARDEN, agreed: true, inviteCode: "K7M4QD" });
  });

  it("waits out a new session that isn't signed in yet", async () => {
    vi.useFakeTimers();
    const join = vi
      .fn()
      .mockRejectedValueOnce(new ConvexError({ code: "unauthenticated" }))
      .mockResolvedValueOnce({ ok: true });
    const result = joinWithInvite(join, GARDEN, "K7M4QD");
    await vi.runAllTimersAsync();
    expect(await result).toBeNull();
    expect(join).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it("stops at a refused code and says why", async () => {
    const join = vi
      .fn()
      .mockRejectedValue(new ConvexError({ code: "invite_invalid", reason: "That code isn't from a member of The Garden." }));
    expect(await joinWithInvite(join, GARDEN, "NOPE")).toBe("That code isn't from a member of The Garden.");
    expect(join).toHaveBeenCalledTimes(1);
  });
});
