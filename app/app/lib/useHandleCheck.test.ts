import { describe, expect, it, vi } from "vitest";
import { ConvexError } from "convex/values";
import { claimPendingAddress, pendingAddressStep } from "./useHandleCheck";

// What a save does with the address field, before it saves anything:
// nothing to claim, a name already refused (no second ask, no second
// message), or a claim for the server to decide. Settings' Save Profile and
// onboarding's Continue both go through this.
describe("the address field in a save", () => {
  it("claims a changed address the rules and the check haven't refused", () => {
    expect(pendingAddressStep({ handle: "ada.new", unchanged: false, refused: false })).toBe("claim");
  });
  it("stops on one already refused, without asking the server again", () => {
    expect(pendingAddressStep({ handle: "taken", unchanged: false, refused: true })).toBe("refused");
  });
  it("leaves a blank or unchanged field alone", () => {
    expect(pendingAddressStep({ handle: "", unchanged: false, refused: false })).toBe("none");
    expect(pendingAddressStep({ handle: "ada", unchanged: true, refused: false })).toBe("none");
  });
});

describe("claimPendingAddress", () => {
  it("claims a changed address and lets the save go on", async () => {
    const claim = vi.fn(async () => ({ handle: "ada.new" }));
    expect(await claimPendingAddress({ handle: "ada.new", unchanged: false, refused: false }, claim)).toEqual({
      ok: true,
      claimed: true,
    });
    expect(claim).toHaveBeenCalledWith("ada.new");
  });

  it("lets a blank or unchanged field through without asking the server", async () => {
    const claim = vi.fn();
    expect(await claimPendingAddress({ handle: "", unchanged: false, refused: false }, claim)).toEqual({
      ok: true,
      claimed: false,
    });
    expect(await claimPendingAddress({ handle: "ada", unchanged: true, refused: false }, claim)).toEqual({
      ok: true,
      claimed: false,
    });
    expect(claim).not.toHaveBeenCalled();
  });

  it("holds the save on an address already refused, with nothing more to say", async () => {
    const claim = vi.fn();
    expect(await claimPendingAddress({ handle: "taken", unchanged: false, refused: true }, claim)).toEqual({
      ok: false,
      error: null,
    });
    expect(claim).not.toHaveBeenCalled();
  });

  it("holds the save on an address the server then refuses, with its reason", async () => {
    const claim = vi.fn(async () => {
      throw new ConvexError({ code: "handle_taken", reason: "That address is taken." });
    });
    expect(await claimPendingAddress({ handle: "ada", unchanged: false, refused: false }, claim)).toEqual({
      ok: false,
      error: "That address is taken.",
    });
  });
});
