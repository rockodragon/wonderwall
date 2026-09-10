import { describe, expect, it } from "vitest";
import { STAGES, isStage, resolveStage, stageLabel } from "./stage";

describe("resolveStage", () => {
  it("prefers an explicit stage", () => {
    expect(resolveStage({ stage: "releasing", status: "in_progress", kind: "paid" })).toBe("releasing");
  });
  it("derives working from legacy in_progress", () => {
    expect(resolveStage({ status: "in_progress", kind: "paid" })).toBe("working");
  });
  it("derives completed from legacy completed", () => {
    expect(resolveStage({ status: "completed", kind: "passion" })).toBe("completed");
  });
  it("defaults paid to forming and passion to planning", () => {
    expect(resolveStage({ status: "active", kind: "paid" })).toBe("forming");
    expect(resolveStage({ status: "active", kind: "passion" })).toBe("planning");
    expect(resolveStage({ kind: "passion" })).toBe("planning");
  });
  it("ignores an unknown stage string", () => {
    expect(resolveStage({ stage: "bogus", status: "in_progress", kind: "paid" })).toBe("working");
  });
});

describe("stageLabel", () => {
  it("reads forming as Hiring on paid and Forming team on passion", () => {
    expect(stageLabel("forming", "paid")).toBe("Hiring");
    expect(stageLabel("forming", "passion")).toBe("Forming team");
  });
  it("has a label for every stage", () => {
    for (const s of STAGES) expect(stageLabel(s, "passion")).toBeTruthy();
  });
});

describe("isStage", () => {
  it("accepts the six stages and nothing else", () => {
    for (const s of STAGES) expect(isStage(s)).toBe(true);
    expect(isStage("active")).toBe(false);
    expect(isStage(undefined)).toBe(false);
  });
});
