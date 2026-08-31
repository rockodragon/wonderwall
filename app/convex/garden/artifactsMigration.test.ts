import { describe, expect, it } from "vitest";
import { deriveProjectTitle, mapArtifactToProject } from "./artifactsMigration";
import type { Id } from "../_generated/dataModel";

describe("deriveProjectTitle", () => {
  it("uses the artifact's own title when present", () => {
    expect(deriveProjectTitle({ type: "image", title: "Back-room mural" })).toBe(
      "Back-room mural",
    );
  });

  it("borrows the opening words of untitled text pieces", () => {
    const content = "A 32-page risograph love letter to one neighborhood, drawn on foot.";
    expect(deriveProjectTitle({ type: "text", content })).toBe(
      "A 32-page risograph love letter to one neighborhood,…",
    );
  });

  it("short untitled text is used whole, no trailing ellipsis", () => {
    expect(deriveProjectTitle({ type: "text", content: "Five songs." })).toBe(
      "Five songs.",
    );
  });

  it("falls back to a type-based label when there's nothing else to go on", () => {
    expect(deriveProjectTitle({ type: "video" })).toBe("Untitled video");
    expect(deriveProjectTitle({ type: "audio" })).toBe("Untitled audio");
    expect(deriveProjectTitle({ type: "link" })).toBe("Untitled link");
    expect(deriveProjectTitle({ type: "text" })).toBe("Untitled");
  });
});

describe("mapArtifactToProject", () => {
  const userId = "u1" as Id<"users">;
  const base = {
    _id: "a1" as Id<"artifacts">,
    profileId: "p1" as Id<"profiles">,
    createdAt: 111,
  };

  it("always migrates as a passion project, no budget, active", () => {
    const p = mapArtifactToProject({ ...base, type: "image", title: "Mural" }, userId);
    expect(p).toMatchObject({
      userId,
      kind: "passion",
      title: "Mural",
      status: "active",
      createdAt: 111,
    });
    expect(p).not.toHaveProperty("budget");
  });

  it("text content becomes the blurb", () => {
    const p = mapArtifactToProject(
      { ...base, type: "text", content: "One wall, fourteen feet." },
      userId,
    );
    expect(p.blurb).toBe("One wall, fourteen feet.");
  });

  it("non-text types carry no blurb", () => {
    const p = mapArtifactToProject({ ...base, type: "video", mediaUrl: "https://x.test/v" }, userId);
    expect(p.blurb).toBeUndefined();
  });

  it("image mediaUrl becomes photoUrl", () => {
    const p = mapArtifactToProject(
      { ...base, type: "image", mediaUrl: "https://x.test/img.jpg" },
      userId,
    );
    expect(p.photoUrl).toBe("https://x.test/img.jpg");
  });

  it("link type falls back to ogImageUrl for photoUrl when no mediaUrl", () => {
    const p = mapArtifactToProject(
      { ...base, type: "link", ogImageUrl: "https://x.test/og.jpg" },
      userId,
    );
    expect(p.photoUrl).toBe("https://x.test/og.jpg");
  });

  it("audio/text types carry no photoUrl", () => {
    const p = mapArtifactToProject({ ...base, type: "audio" }, userId);
    expect(p.photoUrl).toBeUndefined();
  });
});
