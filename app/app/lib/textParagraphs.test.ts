import { describe, expect, it } from "vitest";
import { textParagraphs } from "./textParagraphs";

describe("textParagraphs", () => {
  it("splits on blank lines, trims, and drops the empty ones", () => {
    expect(textParagraphs("One line.\n\n  Two.  \n \n\nThree\ncontinues.")).toEqual(["One line.", "Two.", "Three\ncontinues."]);
    expect(textParagraphs("")).toEqual([]);
    expect(textParagraphs(null)).toEqual([]);
  });

  it("cleans each paragraph first, so one that cleans to nothing goes too", () => {
    expect(textParagraphs("**Bold** start.\n\n**\n\nEnd.", (p) => p.replace(/\*\*/g, ""))).toEqual(["Bold start.", "End."]);
  });
});
