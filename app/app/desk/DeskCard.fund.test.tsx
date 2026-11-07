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
import { fundCard } from "./deskCards";
import { fundFrom } from "./deskInput";
import { SOPHIA_FUND_SLUG } from "../lib/namedFunds";

// Rick, 2026-11-06: the fund card's preview carries Nyla's icon, its button
// says Give and learn more, and it goes to /fund/sophia.
function card() {
  const input = fundFrom({ org: { slug: SOPHIA_FUND_SLUG, name: "Abiding Practice" }, balanceCents: 0 });
  if (!input) throw new Error("expected the Sophia fund");
  return fundCard(input, (cents) => `$${cents / 100}`);
}

function render(open: boolean) {
  return renderToStaticMarkup(
    <MemoryRouter>
      <DeskCardView
        card={card()}
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

describe("The fund card", () => {
  it("opens to the fund's icon on its paper, with Give and learn more to /fund/sophia", () => {
    const html = render(true);
    expect(html).toContain('src="/fund/sophia-icon.webp"');
    expect(html).toContain("Give and learn more");
    expect(html).toContain('href="/fund/sophia"');
    expect(html).not.toContain("/fund/abiding-practice");
  });

  it("rests as a paper note of words, with no picture", () => {
    expect(render(false)).not.toContain("sophia-icon");
  });
});
