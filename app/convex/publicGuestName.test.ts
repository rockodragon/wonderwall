import { describe, expect, it } from "vitest";
import { publicGuestName } from "./events";

describe("publicGuestName", () => {
  it("shows a guest with no account as first name and last initial", () => {
    expect(publicGuestName("Jordan Baptiste vega")).toBe("Jordan V.");
    expect(publicGuestName("  JB  ")).toBe("JB");
    expect(publicGuestName("")).toBe("Guest");
  });
});
