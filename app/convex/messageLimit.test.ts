import { describe, expect, it } from "vitest";
import { coldLimitMessage, coldMessageLimit } from "./messaging";

describe("cold message limit", () => {
  it("gives members ten times the free limit", () => {
    expect(coldMessageLimit(false)).toBe(5);
    expect(coldMessageLimit(true)).toBe(50);
  });

  it("tells a free account that replies don't count and members get more", () => {
    expect(coldLimitMessage(false)).toContain("Replies don't count");
    expect(coldLimitMessage(false)).toContain("Members can send 50");
    expect(coldLimitMessage(true)).not.toContain("Members can send");
  });
});
