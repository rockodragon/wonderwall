// convex/stages.ts is the one copy of the project stage list, shared by the
// app and the server. These check it stays that way: pure, and the only copy.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as shared from "./stages";
import * as projectTeam from "./garden/projectTeam";

describe("convex/stages", () => {
  it("has no imports, so the app can load it and nothing server-side comes with it", () => {
    const source = readFileSync(new URL("./stages.ts", import.meta.url), "utf8");
    expect(source).not.toMatch(/^\s*import\s/m);
    expect(source).not.toMatch(/\brequire\(/);
  });

  it("lists the stages an owner can pick, with no releasing", () => {
    expect([...shared.STAGES]).toEqual(["planning", "raising", "forming", "working", "paused", "completed", "cancelled"]);
  });

  it("reads a stored releasing as Completed, and writes of it store completed", () => {
    expect(shared.resolveStage({ stage: "releasing", status: "active", kind: "passion" })).toBe("completed");
    expect(shared.stageLabel(shared.resolveStage({ stage: "releasing", kind: "paid" }))).toBe("Completed");
    expect(shared.canonicalStage("releasing")).toBe("completed");
    expect(shared.isStage("releasing")).toBe(false);
  });

  it("is what garden/projectTeam hands to anything that imported the stage helpers from there", () => {
    expect(projectTeam.STAGES).toBe(shared.STAGES);
    expect(projectTeam.isStage).toBe(shared.isStage);
    expect(projectTeam.stageLabel).toBe(shared.stageLabel);
    expect(projectTeam.resolveStage).toBe(shared.resolveStage);
  });

  it("is not copied into projectTeam", () => {
    const source = readFileSync(new URL("./garden/projectTeam.ts", import.meta.url), "utf8");
    expect(source).not.toMatch(/export const STAGES\s*=/);
    expect(source).not.toMatch(/function (isStage|stageLabel|resolveStage)\b/);
    expect(source).not.toMatch(/TWIN/);
  });
});
