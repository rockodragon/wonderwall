import { describe, expect, it } from "vitest";
import { ConvexError } from "convex/values";
import { errorMessage } from "./convexError";

describe("errorMessage", () => {
  it("reads the reason off a ConvexError payload", () => {
    expect(errorMessage(new ConvexError({ code: "bad", reason: "Needs a real amount." }))).toBe("Needs a real amount.");
  });

  it("reads a plain string payload", () => {
    expect(errorMessage(new ConvexError("Event is full."))).toBe("Event is full.");
  });

  it("falls back for anything else", () => {
    expect(errorMessage(new Error("Server Error"))).toBe("Something went wrong — try again.");
    expect(errorMessage(new ConvexError(""))).toBe("Something went wrong — try again.");
    expect(errorMessage(undefined)).toBe("Something went wrong — try again.");
  });
});
