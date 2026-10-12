import { describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { PostOfferingForm } from "./offerings";

vi.mock("convex/react", () => ({
  useQuery: () => undefined,
  useMutation: () => async () => {},
  useAction: () => async () => {},
  useConvexAuth: () => ({ isAuthenticated: true, isLoading: false }),
}));
vi.mock("@posthog/react", () => ({ usePostHog: () => undefined }));

const paidClass = {
  _id: "offerings:o1",
  title: "Figure drawing",
  description: "Weekly.",
  format: "class",
  priceCents: 1250,
  tags: [],
};

// The click-through on 10/12 found a $12.50 class couldn't be posted or
// edited: the price box only took whole dollars, and its summary read "$12.5".
describe("PostOfferingForm price", () => {
  it("takes cents and sums the price up by the money rule", () => {
    const html = renderToString(
      <MemoryRouter>
        <PostOfferingForm offering={paidClass} onClose={() => {}} />
      </MemoryRouter>,
    );
    expect(html).toContain("$12.50");
    expect(html).not.toMatch(/\$12\.5(?!0)/);
    expect(html).toContain('placeholder="Price (USD)"');
    expect(html).toMatch(/step="0\.01"/);
  });
});
