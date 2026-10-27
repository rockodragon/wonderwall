import { describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import type { Id } from "../../../convex/_generated/dataModel";
import { StageChip } from "./StageChip";

vi.mock("convex/react", () => ({
  useMutation: () => async () => {},
}));

const project = (extra: { stage?: string; status?: string } = {}) => ({
  _id: "projects:p1" as Id<"projects">,
  kind: "passion",
  ...extra,
});

const labels = (html: string) => [...html.matchAll(/<option[^>]*>([^<]*)<\/option>/g)].map((m) => m[1]);
const values = (html: string) => [...html.matchAll(/<option value="([^"]*)"/g)].map((m) => m[1]);

describe("StageChip", () => {
  it("offers the owner Planning, Raising, Forming team, Working, Paused, Completed, Cancelled, and no Released", () => {
    const html = renderToString(<StageChip project={project({ stage: "working" })} isOwner />);
    expect(labels(html)).toEqual(["Planning", "Raising", "Forming team", "Working", "Paused", "Completed", "Cancelled"]);
    expect(values(html)).not.toContain("releasing");
    expect(html).not.toContain("Released");
  });

  it("shows a project stored as releasing as Completed, in the chip and the menu", () => {
    const owner = renderToString(<StageChip project={project({ stage: "releasing" })} isOwner />);
    expect(owner).not.toContain("Released");
    expect(owner).toContain("Completed");
    // The select sits on Completed, so the owner is not offered a stage that is not there.
    expect(owner).toMatch(/<option value="completed" selected/);

    const visitor = renderToString(<StageChip project={project({ stage: "releasing" })} isOwner={false} />);
    expect(visitor).toContain("Completed");
    expect(visitor).not.toContain("Released");
    expect(visitor).not.toContain("<select");
  });
});
