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
import { celebrationCard, type DeskCard } from "./deskCards";

const NOW = Date.UTC(2026, 9, 1);

function award(): DeskCard {
  return celebrationCard(
    {
      _id: "n2",
      type: "fund_award",
      title: "The Sophia Fund awarded you $500",
      message: "Small Acts",
      linkUrl: "/fund/abiding-practice",
      createdAt: NOW,
      from: null,
      amountCents: 50_000,
      fund: { name: "The Sophia Fund", href: "/fund/abiding-practice" },
    },
    ["all"],
    (cents) => `$${cents / 100}`,
  );
}

function render(card: DeskCard, open: boolean) {
  return renderToStaticMarkup(
    <MemoryRouter>
      <DeskCardView
        card={card}
        place={{ x: 24, y: 24, w: 1000, h: 640, r: 0, opacity: 1, z: 30 }}
        open={open}
        inert={false}
        vh={800}
        onOpen={() => {}}
        onClose={() => {}}
      />
    </MemoryRouter>,
  );
}

// The big trophy's box: sized by the paper side, and the only thing in it.
const BIG = /<div style="width:42%;max-width:260px;aspect-ratio:1;opacity:(\d);transform:scale\(([\d.]+)\)/;

describe("An opened award's paper side", () => {
  it("is its trophy, large, and says none of what the panel says", () => {
    const html = render(award(), true);
    const big = html.match(BIG);
    expect(big?.slice(1)).toEqual(["1", "1"]);
    // The big mark fills its box, rather than a fixed size.
    expect(html).toMatch(/width:42%[^>]*><svg[^>]*width="100%"[^>]*height="100%"/);
    // The kicker, and the amount and the fund's name with their rule, are
    // faded out (the panel beside them says each once).
    expect(html).toMatch(/<p style="[^"]*opacity:0[^"]*">AWARD<\/p>/);
    expect(html).toMatch(/<div style="[^"]*opacity:0[^"]*"><span[^>]*><\/span><h3[^>]*>\$500<\/h3><p[^>]*>The Sophia Fund<\/p><\/div>/);
    // The small corner trophy is gone too.
    expect(html).toMatch(/<svg[^>]*width="32"[^>]*style="[^"]*opacity:0/);
  });

  it("is the card as it was while resting: the corner trophy, the kicker, the amount and the fund", () => {
    const html = render(award(), false);
    expect(html.match(BIG)?.slice(1)).toEqual(["0", "0.85"]);
    expect(html).toMatch(/<p style="[^"]*opacity:1[^"]*">AWARD<\/p>/);
    expect(html).toMatch(/<div style="[^"]*opacity:1[^"]*"><span[^>]*><\/span><h3[^>]*>\$500<\/h3><p[^>]*>The Sophia Fund<\/p><\/div>/);
    expect(html).toMatch(/<svg[^>]*width="32"[^>]*style="[^"]*opacity:1/);
  });
});
