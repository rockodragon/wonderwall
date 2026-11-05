import { describe, expect, it } from "vitest";
import { NAV_ITEMS } from "./ui";

// One order for the public header, the app rail and the phone bar (Rick,
// 2026-11-05: "the projects need to be foremost vs the people").
describe("NAV_ITEMS", () => {
  it("leads with Projects, then Events, then People", () => {
    expect(NAV_ITEMS.slice(0, 3).map((item) => item.to)).toEqual(["/projects", "/events", "/people"]);
  });
});
