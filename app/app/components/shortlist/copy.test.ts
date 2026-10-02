import { describe, expect, it } from "vitest";
import { needYouText } from "./copy";

describe("needYouText", () => {
  it("agrees with the number", () => {
    expect(needYouText(1)).toBe("1 needs you");
    expect(needYouText(4)).toBe("4 need you");
  });
});
