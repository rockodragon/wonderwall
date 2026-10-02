import { describe, expect, it } from "vitest";
import { buildSignedInTools, type SignedInDeps } from "./paletteConfig";

const deps: SignedInDeps = {
  profileName: "Rick",
  imageUrl: null,
  initials: "R",
  isAdmin: false,
  badgeCount: 0,
  community: "garden",
  active: null,
  invite: { label: "Invite someone", onSelect: () => {} },
  onSwitchCommunity: () => {},
  onSignOut: () => {},
};

describe("the palette's Projects menu", () => {
  const projects = buildSignedInTools(deps).find((t) => t.id === "projects")!;

  it("browses, starts a project, hires someone, then the Grant Fund", () => {
    expect(projects.items.map((i) => i.label)).toEqual(["Browse projects", "Start a project", "Hire someone", "Grant Fund"]);
  });
  it("opens each create flow as a card on the desk", () => {
    const byLabel = Object.fromEntries(projects.items.map((i) => [i.label, i.to]));
    expect(byLabel["Start a project"]).toBe("/today?view=projects&create=project");
    expect(byLabel["Hire someone"]).toBe("/today?view=projects&create=hire");
  });
});
