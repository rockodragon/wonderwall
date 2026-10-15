import { describe, expect, it } from "vitest";
import { MAX_FAQ, normalizeFaq } from "./eventFaq";

describe("normalizeFaq", () => {
  it("leaves it alone when absent", () => {
    expect(normalizeFaq(undefined)).toEqual({});
  });
  it("trims and drops empty rows; an empty list clears", () => {
    expect(normalizeFaq([{ q: " Cost? ", a: " $20 " }, { q: "", a: " " }])).toEqual({ faq: [{ q: "Cost?", a: "$20" }] });
    expect(normalizeFaq([])).toEqual({ faq: [] });
  });
  it("refuses a half-filled row", () => {
    expect(normalizeFaq([{ q: "Cost?", a: "" }]).error).toMatch(/Add an answer/);
    expect(normalizeFaq([{ q: "", a: "x" }]).error).toMatch(/needs a question/);
  });
  it("caps the count", () => {
    const many = Array.from({ length: MAX_FAQ + 1 }, (_, i) => ({ q: `q${i}`, a: "a" }));
    expect(normalizeFaq(many).error).toMatch(/At most/);
  });
});
