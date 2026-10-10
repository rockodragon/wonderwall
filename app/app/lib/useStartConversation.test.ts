import { describe, expect, it } from "vitest";
import { ConvexError } from "convex/values";
import { BLOCKED_MESSAGE, startConversationError } from "./useStartConversation";

describe("startConversationError", () => {
  it("says a blocked pair can't message, whichever way the block goes", () => {
    expect(startConversationError(new ConvexError({ code: "blocked" }))).toBe("You can't message this person.");
    expect(BLOCKED_MESSAGE).toBe("You can't message this person.");
  });

  it("shows the server's own words for anything else it refuses with", () => {
    expect(startConversationError(new ConvexError("You blocked this person."))).toBe("You blocked this person.");
    expect(startConversationError(new ConvexError({ code: "x", reason: "Nope." }))).toBe("Nope.");
  });

  it("falls back to the generic line for a plain error", () => {
    expect(startConversationError(new Error("Server Error"))).toBe("Something went wrong — try again.");
  });
});
