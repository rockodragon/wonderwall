import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";

vi.mock("convex/react", () => ({
  useQuery: () => undefined,
  useMutation: () => async () => ({ ok: true }),
  useAction: () => async () => ({ ok: true }),
  useConvexAuth: () => ({ isAuthenticated: false, isLoading: false }),
}));
vi.mock("@posthog/react", () => ({ usePostHog: () => undefined }));

import { DeskCardView } from "./DeskCard";
import { orgCard, type DeskCard, type DeskOrgInput } from "./deskCards";

function org(extra: Partial<DeskOrgInput> = {}): DeskCard {
  return orgCard({
    _id: "o1",
    name: "Abiding Practice",
    slug: "abiding-practice",
    category: "Collective",
    tagline: "Spiritual formation for artists",
    location: "San Diego, CA",
    logoUrl: "https://img/ap.png",
    peopleCount: 3,
    ...extra,
  });
}

function render(card: DeskCard, open: boolean) {
  return renderToStaticMarkup(
    <MemoryRouter>
      <DeskCardView
        card={card}
        place={{ x: 24, y: 24, w: 243, h: 324, r: 0, opacity: 1, z: 30 }}
        open={open}
        inert={false}
        vh={800}
        onOpen={() => {}}
        onClose={() => {}}
      />
    </MemoryRouter>,
  );
}

// The face's words and tag, without the opened panel's.
const FACE_TAG = /<span aria-hidden="true" style="([^"]*)">ORG<\/span>/;

describe("A resting organization card", () => {
  it("has no ORGANIZATION kicker at the top, and says ORG in the lower right corner", () => {
    const html = render(org(), false);
    expect(html).not.toContain(">ORGANIZATION<");
    const tag = html.match(FACE_TAG)?.[1] ?? "";
    expect(tag).toMatch(/right:22px/);
    expect(tag).toMatch(/bottom:22px/);
    expect(tag).toMatch(/text-transform:uppercase/);
    expect(tag).toMatch(/font-size:12px/);
    expect(tag).toMatch(/opacity:0\.9/);
  });

  it("keeps the name and foot clear of the tag", () => {
    const html = render(org(), false);
    // ORG at 12px with 0.2em tracking is 29px; the foot leaves that and a gap.
    expect(html).toMatch(/<p style="[^"]*padding-right:39px[^"]*">Collective · San Diego, CA<\/p>/);
    // Without a foot, the name's last line shares the tag's row.
    const bare = render(org({ category: null, location: null, peopleCount: 0 }), false);
    expect(bare).toMatch(/<h3 style="[^"]*padding-right:39px[^"]*">Abiding Practice<\/h3>/);
  });

  it("is still an organization to a screen reader", () => {
    const html = render(org(), false);
    expect(html).toContain('aria-label="Organization, Abiding Practice, Collective · San Diego, CA"');
  });

  it("puts the logo's plate at the top edge, edge to edge, over the top two-thirds", () => {
    const html = render(org(), false);
    // The picture area starts at the card's top, flush on both sides, and leaves the band below.
    expect(html).toMatch(/style="position:absolute;top:0;left:0;right:0;bottom:36%;opacity:1/);
    // The plate fills it, square-cornered (the card's clip rounds it), with the logo inset by a modest margin.
    expect(html).toMatch(/background:#DEDBD2;border-radius:0;padding:11%/);
    expect(html).toMatch(/<img[^>]*src="https:\/\/img\/ap\.png"[^>]*object-fit:contain[^>]*object-position:center"/);
  });

  it("centers a larger monogram in that same area when there is no logo", () => {
    const html = render(org({ logoUrl: null }), false);
    expect(html).not.toContain(">ORGANIZATION<");
    // 127px at this card's width (a monogram was 92px before): a square, centered.
    expect(html).toMatch(/<div aria-hidden="true" style="position:absolute;top:0;left:0;right:0;bottom:36%;display:flex;align-items:center;justify-content:center[^"]*"><span style="[^"]*width:127px;height:127px[^"]*">AP<\/span>/);
    expect(html).toMatch(/>ORG<\/span>/);
  });
});

describe("An opened organization card", () => {
  it("lets the tag go, and puts the plate back as a mat inside the picture side", () => {
    const html = render(org(), true);
    expect(html.match(FACE_TAG)?.[1]).toMatch(/opacity:0/);
    expect(html).toMatch(/style="position:absolute;top:28px;left:28px;right:28px;bottom:28px;opacity:1/);
    expect(html).toMatch(/top:14%;bottom:14%;box-sizing:border-box;background:#DEDBD2;border-radius:8px;padding:56px/);
    // The panel's meta line is as it was.
    expect(html).toMatch(/ORGANIZATION ·<\/span> <span[^>]*>COLLECTIVE<\/span>/);
  });
});
