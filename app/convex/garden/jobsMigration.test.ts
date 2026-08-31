import { describe, expect, it } from "vitest";
import { mapJobToProject, parseBudget } from "./jobsMigration";
import type { Id } from "../_generated/dataModel";

describe("parseBudget — free text to declared number", () => {
  it("clean amounts parse", () => {
    expect(parseBudget("$1,200")).toBe(1200);
    expect(parseBudget("500")).toBe(500);
  });
  it("ranges take the floor (the declared minimum is the honest number)", () => {
    expect(parseBudget("$500-$1000")).toBe(500);
  });
  it("non-numeric comp stays undefined", () => {
    expect(parseBudget("DOE")).toBeUndefined();
    expect(parseBudget(undefined)).toBeUndefined();
  });

  // Regression: a real production row read "1.5 Burritos/day" and the first
  // parser published it as a $1.50 budget on the public Projects page.
  it("refuses non-monetary units instead of inventing a budget", () => {
    expect(parseBudget("1.5 Burritos/day")).toBeUndefined();
    expect(parseBudget("20 hours/week")).toBeUndefined();
    expect(parseBudget("2 tacos")).toBeUndefined();
  });

  it("refuses implausibly tiny bare numbers, accepts explicit small amounts", () => {
    expect(parseBudget("1.5")).toBeUndefined();
    expect(parseBudget("$25")).toBe(25);
    expect(parseBudget("800")).toBe(800);
  });

  it("still accepts plain money phrasings", () => {
    expect(parseBudget("$2,500 total")).toBe(2500);
    expect(parseBudget("1200 USD")).toBe(1200);
  });
});

describe("mapJobToProject", () => {
  const job = {
    _id: "j1" as Id<"jobs">,
    posterId: "u1" as Id<"users">,
    title: "Mural artist",
    description: "One wall.",
    compensationRange: "$500",
    status: "Open",
    createdAt: 111,
    _creationTime: 222,
  };

  it("maps the basics, keeps original createdAt, marks legacy id", () => {
    const p = mapJobToProject(job);
    expect(p).toMatchObject({
      kind: "paid",
      title: "Mural artist",
      status: "active",
      legacyJobId: "j1",
      createdAt: 111,
    });
  });

  it("a job with no parseable budget archives rather than publishing", () => {
    const { compensationRange: _omitted, ...noComp } = job;
    expect(mapJobToProject(noComp).status).toBe("archived");
    expect(mapJobToProject({ ...job, compensationRange: "DOE" }).status).toBe(
      "archived",
    );
  });

  it("closed jobs archive", () => {
    expect(mapJobToProject({ ...job, status: "Closed" }).status).toBe("archived");
  });

  it("unparseable comp is preserved in the blurb, budget stays unset", () => {
    const p = mapJobToProject({ ...job, compensationRange: "DOE" });
    expect(p.budget).toBeUndefined();
    expect(p.blurb).toContain("Compensation: DOE");
  });

  it("parseable comp becomes the budget and is NOT duplicated in the blurb", () => {
    const p = mapJobToProject({ ...job, compensationRange: "$800" });
    expect(p.budget).toBe(800);
    expect(p.blurb).not.toContain("Compensation:");
  });
});
