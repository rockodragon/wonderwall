import { ConvexError } from "convex/values";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { untilSignedIn } from "./untilSignedIn";

const notSignedIn = () => new ConvexError({ code: "unauthenticated", reason: "Sign in first." });

describe("untilSignedIn", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("returns what the call returns, after one call", async () => {
    const fn = vi.fn().mockResolvedValue("saved");
    expect(await untilSignedIn(fn)).toBe("saved");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("waits out a session that hasn't reached the client yet", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(notSignedIn())
      .mockRejectedValueOnce(new ConvexError({ code: "not_signed_in" }))
      .mockResolvedValueOnce("saved");
    const result = untilSignedIn(fn, { delayMs: 400 });
    await vi.advanceTimersByTimeAsync(400);
    expect(fn).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(400);
    expect(await result).toBe("saved");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("gives up after `tries` calls and throws the not-signed-in error", async () => {
    const err = notSignedIn();
    const fn = vi.fn().mockRejectedValue(err);
    const result = untilSignedIn(fn, { tries: 4, delayMs: 100 });
    const caught = result.catch((e) => e);
    await vi.runAllTimersAsync();
    expect(await caught).toBe(err);
    expect(fn).toHaveBeenCalledTimes(4);
  });

  it("does not wait after the last try", async () => {
    const fn = vi.fn().mockRejectedValue(notSignedIn());
    const caught = untilSignedIn(fn, { tries: 2, delayMs: 100 }).catch((e) => e);
    await vi.advanceTimersByTimeAsync(100);
    expect(await caught).toBeInstanceOf(ConvexError);
    expect(fn).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("defaults to 8 calls", async () => {
    const fn = vi.fn().mockRejectedValue(notSignedIn());
    const caught = untilSignedIn(fn).catch((e) => e);
    await vi.runAllTimersAsync();
    await caught;
    expect(fn).toHaveBeenCalledTimes(8);
  });

  it("throws any other error after one call", async () => {
    const refused = new ConvexError({ code: "invite_invalid", reason: "That code didn't work." });
    const fn = vi.fn().mockRejectedValue(refused);
    const caught = untilSignedIn(fn).catch((e) => e);
    await vi.runAllTimersAsync();
    expect(await caught).toBe(refused);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("throws a plain error after one call", async () => {
    // Production redacts a plain Error's message, so it can't be told apart
    // from "not signed in" — and isn't retried.
    const plain = new Error("Server Error");
    const fn = vi.fn().mockRejectedValue(plain);
    const caught = untilSignedIn(fn).catch((e) => e);
    await vi.runAllTimersAsync();
    expect(await caught).toBe(plain);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
