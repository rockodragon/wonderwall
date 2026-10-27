import { describe, expect, it } from "vitest";
import { STAGES, canonicalStage, isStage, resolveStage, stageLabel } from "./stage";
import * as shared from "../../convex/stages";

describe("resolveStage", () => {
  it("prefers an explicit stage", () => {
    expect(resolveStage({ stage: "working", status: "completed", kind: "paid" })).toBe("working");
  });
  it("reads a stored releasing as completed: Released is gone, Completed is the one finished stage", () => {
    expect(resolveStage({ stage: "releasing", status: "in_progress", kind: "paid" })).toBe("completed");
    expect(resolveStage({ stage: "releasing", status: "active", kind: "passion" })).toBe("completed");
    expect(resolveStage({ stage: "releasing", kind: "passion" })).toBe("completed");
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
  it("reads forming as Forming team regardless of kind", () => {
    expect(stageLabel("forming")).toBe("Forming team");
  });
  it("has a label for every stage", () => {
    for (const s of STAGES) expect(stageLabel(s)).toBeTruthy();
  });
  it("labels a stored releasing Completed, never Released", () => {
    expect(stageLabel(resolveStage({ stage: "releasing", kind: "passion" }))).toBe("Completed");
    // A raw stored word cast as a Stage (a card that skips resolveStage) reads the same.
    expect(stageLabel("releasing" as never)).toBe("Completed");
    for (const s of STAGES) expect(stageLabel(s)).not.toBe("Released");
  });
});

describe("STAGES", () => {
  it("lists what an owner can pick, with no releasing", () => {
    expect([...STAGES]).toEqual(["planning", "raising", "forming", "working", "paused", "completed", "cancelled"]);
    expect(STAGES as readonly string[]).not.toContain("releasing");
  });
});

describe("isStage", () => {
  it("accepts the seven stages and nothing else", () => {
    for (const s of STAGES) expect(isStage(s)).toBe(true);
    expect(isStage("active")).toBe(false);
    expect(isStage(undefined)).toBe(false);
    expect(isStage("releasing")).toBe(false);
  });
});

describe("canonicalStage", () => {
  it("keeps a stage, turns a retired word into its replacement, and says nothing for the rest", () => {
    for (const s of STAGES) expect(canonicalStage(s)).toBe(s);
    expect(canonicalStage("releasing")).toBe("completed");
    expect(canonicalStage("bogus")).toBeUndefined();
    expect(canonicalStage("constructor")).toBeUndefined();
    expect(canonicalStage(undefined)).toBeUndefined();
    expect(canonicalStage(3)).toBeUndefined();
  });
});

describe("the app and the server share one stage list", () => {
  it("are the same functions, not two copies", () => {
    expect(STAGES).toBe(shared.STAGES);
    expect(isStage).toBe(shared.isStage);
    expect(stageLabel).toBe(shared.stageLabel);
    expect(resolveStage).toBe(shared.resolveStage);
    expect(canonicalStage).toBe(shared.canonicalStage);
  });
});
