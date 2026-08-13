import { describe, expect, it } from "vitest";
import { mapJobToProject, parseBudget } from "./jobsMigration";

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
});

describe("mapJobToProject", () => {
  const job = {
    _id: "j1",
    posterId: "u1",
    title: "Mural artist",
    description: "One wall.",
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
