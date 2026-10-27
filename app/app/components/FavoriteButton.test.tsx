import { BookmarkSimple } from "@phosphor-icons/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { FavoriteButton } from "./FavoriteButton";

const scene = vi.hoisted(() => ({ saved: false }));
vi.mock("convex/react", () => ({ useQuery: () => scene.saved, useMutation: () => async () => {} }));
vi.mock("@posthog/react", () => ({ usePostHog: () => undefined }));

beforeEach(() => {
  scene.saved = false;
});

const bookmark = (weight: "fill" | "regular", size: number) =>
  renderToStaticMarkup(<BookmarkSimple size={size} weight={weight} aria-hidden="true" />);

describe("FavoriteButton as an icon (a save on a post)", () => {
  const icon = (extra: Record<string, unknown> = {}) =>
    renderToStaticMarkup(<FavoriteButton targetType="project" targetId="p1" name="Songs of Safety" look="icon" {...extra} />);

  it("is a bare 24px bookmark in a 44px button, with no words or pill", () => {
    const html = icon();
    expect(html).toContain("h-11 w-11");
    expect(html).toContain(bookmark("regular", 24));
    expect(html).not.toContain("border");
    expect(html).not.toMatch(/>Save</);
    expect(html).not.toContain("Following");
  });

  it("is named for what it saves: Save, then Saved, with the project's title", () => {
    expect(icon()).toMatch(/h-11 w-11[^>]*aria-label="Save Songs of Safety"|aria-label="Save Songs of Safety"[^>]*h-11 w-11/);
    scene.saved = true;
    expect(icon()).toMatch(/h-11 w-11[^>]*aria-label="Saved Songs of Safety"|aria-label="Saved Songs of Safety"[^>]*h-11 w-11/);
  });

  it("says Save or Saved alone when the page gives no name", () => {
    const html = icon({ name: undefined });
    expect(html).toContain('aria-label="Save"');
    expect(html).toContain("h-11 w-11");
  });

  it("fills the bookmark once saved", () => {
    expect(icon()).not.toContain(bookmark("fill", 24));
    scene.saved = true;
    const html = icon();
    expect(html).toContain(bookmark("fill", 24));
    expect(html).not.toContain(bookmark("regular", 24));
  });

  it("is the same save for a role", () => {
    const html = renderToStaticMarkup(<FavoriteButton targetType="role" targetId="r1" name="Cellist" look="icon" />);
    expect(html).toContain('aria-label="Save Cellist"');
    expect(html).toContain("h-11 w-11");
  });

  it("is no different for a follow: a person is followed with its words", () => {
    const html = renderToStaticMarkup(<FavoriteButton targetType="profile" targetId="u1" look="icon" />);
    expect(html).toContain("Follow");
    expect(html).not.toContain("h-11 w-11");
  });
});

describe("FavoriteButton's default look", () => {
  it("is still the worded pill", () => {
    const html = renderToStaticMarkup(<FavoriteButton targetType="project" targetId="p1" name="Songs of Safety" />);
    expect(html).toContain('aria-label="Save Songs of Safety"');
    expect(html).toContain("rounded-full font-medium border");
    expect(html).toContain(bookmark("regular", 16));
    expect(html).toMatch(/Save<\/button>/);
    expect(html).not.toContain("h-11 w-11");
  });
});
