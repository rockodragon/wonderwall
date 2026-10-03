import { describe, expect, it } from "vitest";
import { descriptionBlocks, descriptionPlainText } from "./descriptionBlocks";

describe("descriptionBlocks", () => {
  it("is empty for nothing", () => {
    expect(descriptionBlocks(undefined)).toEqual([]);
    expect(descriptionBlocks("  \n ")).toEqual([]);
  });

  it("splits paragraphs on blank lines and keeps a single newline inside one", () => {
    expect(descriptionBlocks("One line\nsame paragraph\n\nNext one")).toEqual([
      { type: "text", text: "One line\nsame paragraph" },
      { type: "text", text: "Next one" },
    ]);
  });

  it("reads headings, bullets, numbered items and quotes the way people type them", () => {
    const text = [
      "## Why we're here",
      "We love our neighbors through our **craft**.",
      "",
      "We back work that:",
      "- points to what is true, good and beautiful",
      "* is made by people, for people",
      "",
      "1. Show up",
      "2. Critique the work",
      "> Nothing gets made alone.",
    ].join("\n");
    expect(descriptionBlocks(text)).toEqual([
      { type: "heading", text: "Why we're here", level: 2 },
      { type: "text", text: "We love our neighbors through our **craft**." },
      { type: "text", text: "We back work that:" },
      { type: "list", items: ["points to what is true, good and beautiful", "is made by people, for people"] },
      { type: "list", items: ["Show up", "Critique the work"], ordered: true },
      { type: "quote", text: "Nothing gets made alone." },
    ]);
  });

  it("doesn't take *italic* at the start of a line for a bullet", () => {
    expect(descriptionBlocks("*Anyone* is welcome.")).toEqual([{ type: "text", text: "*Anyone* is welcome." }]);
  });

  it("gives plain sentences for a meta description", () => {
    expect(descriptionPlainText("**Our mission** is to love our neighbor.\n\n- through our craft")).toBe(
      "Our mission is to love our neighbor. through our craft",
    );
  });
});
