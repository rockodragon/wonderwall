import { describe, expect, it } from "vitest";
import { isUnstagedPortfolioProject } from "./portfolioCompletedMigration";

describe("isUnstagedPortfolioProject", () => {
  it("picks a shared piece's project that was never staged", () => {
    expect(isUnstagedPortfolioProject({ origin: "portfolio", stage: undefined })).toBe(true);
  });
  it("leaves a stage someone chose alone", () => {
    expect(isUnstagedPortfolioProject({ origin: "portfolio", stage: "working" })).toBe(false);
  });
  it("never touches a posted project", () => {
    expect(isUnstagedPortfolioProject({ origin: "posted", stage: undefined })).toBe(false);
    expect(isUnstagedPortfolioProject({ origin: undefined, stage: undefined })).toBe(false);
  });
});
