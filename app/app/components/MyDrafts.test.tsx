import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { DRAFTS_SHOWN, MyDrafts, OwnDrafts, draftsCardHeight } from "./MyDrafts";

// The drafts query answers with `scene.drafts`: undefined while it loads.
const scene = vi.hoisted(() => ({ drafts: undefined as unknown, asked: undefined as unknown }));
vi.mock("convex/react", async () => {
  const { getFunctionName } = await import("convex/server");
  return {
    useQuery: (fn: Parameters<typeof getFunctionName>[0], args?: unknown) => {
      if (getFunctionName(fn) !== "garden/projects:listMyDrafts") return undefined;
      scene.asked = args;
      return scene.drafts;
    },
  };
});

const draft = (i: number, extra: Record<string, unknown> = {}) => ({
  _id: `p${i}`,
  title: `Draft ${i}`,
  updatedAt: 1_000 - i,
  photoUrl: null,
  ...extra,
});

const card = (tone: "desk" | "page" = "page", className?: string) =>
  renderToStaticMarkup(
    <MemoryRouter>
      <MyDrafts tone={tone} className={className} />
    </MemoryRouter>,
  );

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

describe("MyDrafts", () => {
  it("draws nothing while the list loads, and nothing when there are no drafts", () => {
    scene.drafts = undefined;
    expect(card()).toBe("");
    scene.drafts = [];
    expect(card()).toBe("");
    expect(card("desk")).toBe("");
  });

  it("asks for the signed-in person's own list", () => {
    scene.drafts = [];
    card();
    expect(scene.asked).toEqual({});
  });

  it("shows the label Drafts and a row for each, a 44px link to the draft's page with 'Draft' on it", () => {
    scene.drafts = [draft(1), draft(2)];
    const html = card();
    expect(html).toContain('aria-label="Drafts"');
    expect(text(html)).toMatch(/^Drafts Draft 1 Draft Draft 2 Draft$/);
    const rows = html.match(/<a [^>]*>/g) ?? [];
    expect(rows.map((a) => a.match(/href="([^"]+)"/)?.[1])).toEqual(["/projects/p1", "/projects/p2"]);
    for (const row of rows) expect(row).toMatch(/class="[^"]*\bh-11\b/);
    // Keyboard users get the Canvas's focus ring.
    expect(html).toContain("focus-visible:outline-2");
  });

  it("draws a small square picture when there is one, and none when there isn't", () => {
    scene.drafts = [draft(1, { photoUrl: "/campaign/band.jpg" }), draft(2)];
    const html = card();
    expect(html.match(/<img /g)).toHaveLength(1);
    const img = html.match(/<img [^>]*>/)![0];
    expect(img).toContain('src="/campaign/band.jpg"');
    expect(img).toMatch(/\bh-8\b/);
    expect(img).toMatch(/\bw-8\b/);
    expect(img).toContain("object-cover");
  });

  it("lists up to three and says how many more under them", () => {
    scene.drafts = [1, 2, 3, 4, 5].map((i) => draft(i));
    const html = card();
    expect(DRAFTS_SHOWN).toBe(3);
    expect(html.match(/<a /g)).toHaveLength(3);
    expect(html).toContain("/projects/p3");
    expect(html).not.toContain("/projects/p4");
    expect(text(html)).toContain("+2 more");
  });

  it("has no more line at exactly three", () => {
    scene.drafts = [1, 2, 3].map((i) => draft(i));
    const html = card();
    expect(html.match(/<a /g)).toHaveLength(3);
    expect(text(html)).not.toContain("more");
  });

  it("takes the page's variables on a phone and the Canvas's tokens on a desktop, and its caller's spacing", () => {
    scene.drafts = [draft(1)];
    expect(card("page", "mb-6")).toContain("var(--app-surface-raised)");
    expect(card("page", "mb-6")).toContain("mb-6");
    expect(card("desk")).not.toContain("var(--app-");
  });

  it("keeps to the type scale: nothing under 12px, the dim 'Draft' in the soft tone", () => {
    scene.drafts = [1, 2, 3, 4].map((i) => draft(i));
    for (const tone of ["page", "desk"] as const) {
      const html = card(tone);
      expect(html).not.toMatch(/text-\[(?:\d|1[01])(?:\.\d+)?px\]/);
    }
    expect(card("page")).toMatch(/<span class="[^"]*"[^>]*style="color:var\(--app-text-muted\)">Draft<\/span>/);
    expect(card("desk")).toMatch(/<span class="[^"]*"[^>]*style="color:#D6D6D6">Draft<\/span>/);
  });

  it("knows how tall it draws, so the Canvas can keep clear of it", () => {
    expect(draftsCardHeight(1)).toBe(54 + 44);
    expect(draftsCardHeight(3)).toBe(54 + 3 * 44);
    expect(draftsCardHeight(4)).toBe(54 + 3 * 44 + 24);
    expect(draftsCardHeight(9)).toBe(draftsCardHeight(4));
  });
});

describe("OwnDrafts, on your own page", () => {
  const section = () =>
    renderToStaticMarkup(
      <MemoryRouter>
        <OwnDrafts />
      </MemoryRouter>,
    );

  it("draws nothing without drafts", () => {
    scene.drafts = [];
    expect(section()).toBe("");
    scene.drafts = undefined;
    expect(section()).toBe("");
  });

  it("lists every draft under a Drafts heading, not just three", () => {
    scene.drafts = [1, 2, 3, 4, 5].map((i) => draft(i));
    const html = section();
    expect(html).toMatch(/<h2[^>]*>Drafts<\/h2>/);
    expect(html.match(/<a /g)).toHaveLength(5);
    expect(text(html)).not.toContain("more");
  });
});
