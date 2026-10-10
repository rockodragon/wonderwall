import { describe, expect, it } from "vitest";
import { ConvexError } from "convex/values";
import { errorCode, errorMessage, isNotSignedIn } from "./convexError";

describe("errorMessage", () => {
  it("reads the reason off a ConvexError payload", () => {
    expect(errorMessage(new ConvexError({ code: "bad", reason: "Needs a real amount." }))).toBe("Needs a real amount.");
  });

  it("reads a plain string payload", () => {
    expect(errorMessage(new ConvexError("Event is full."))).toBe("Event is full.");
  });

  it("reads an object payload that has only a reason", () => {
    expect(errorMessage(new ConvexError({ reason: "Sign in first." }))).toBe("Sign in first.");
  });

  it("falls back for anything else", () => {
    expect(errorMessage(new Error("Server Error"))).toBe("Something went wrong — try again.");
    expect(errorMessage(new ConvexError(""))).toBe("Something went wrong — try again.");
    expect(errorMessage(new ConvexError({ code: "bad" }))).toBe("Something went wrong — try again.");
    expect(errorMessage(new ConvexError({ code: "bad", reason: "" }))).toBe("Something went wrong — try again.");
    expect(errorMessage(undefined)).toBe("Something went wrong — try again.");
    expect(errorMessage(null)).toBe("Something went wrong — try again.");
  });

  it("uses the caller's fallback instead", () => {
    expect(errorMessage(new Error("Server Error"), "Couldn't open billing — try again.")).toBe(
      "Couldn't open billing — try again.",
    );
    expect(errorMessage(new ConvexError({ code: "bad" }), "Couldn't save that.")).toBe("Couldn't save that.");
  });

  it("prefers the server's words over the fallback", () => {
    expect(errorMessage(new ConvexError("Event is full."), "Couldn't join.")).toBe("Event is full.");
    expect(errorMessage(new ConvexError({ reason: "Not yours." }), "Couldn't join.")).toBe("Not yours.");
  });
});

describe("errorCode", () => {
  it("reads the code off an object payload", () => {
    expect(errorCode(new ConvexError({ code: "blocked", reason: "x" }))).toBe("blocked");
  });

  it("is undefined for a string payload, a plain Error, or nothing", () => {
    expect(errorCode(new ConvexError("Event is full."))).toBeUndefined();
    expect(errorCode(new Error("boom"))).toBeUndefined();
    expect(errorCode(undefined)).toBeUndefined();
  });
});

describe("isNotSignedIn", () => {
  it("accepts both codes the server uses", () => {
    expect(isNotSignedIn(new ConvexError({ code: "not_signed_in" }))).toBe(true);
    expect(isNotSignedIn(new ConvexError({ code: "unauthenticated", reason: "Sign in first." }))).toBe(true);
  });

  it("rejects other codes, string payloads, and plain errors", () => {
    expect(isNotSignedIn(new ConvexError({ code: "invite_invalid" }))).toBe(false);
    expect(isNotSignedIn(new ConvexError("unauthenticated"))).toBe(false);
    expect(isNotSignedIn(new Error("Not authenticated"))).toBe(false);
    expect(isNotSignedIn(undefined)).toBe(false);
  });
});
