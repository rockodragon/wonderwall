import { describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { SophiaFundView } from "./fund.$slug";

vi.mock("convex/react", () => ({
  useQuery: () => undefined,
  useMutation: () => async () => {},
  useAction: () => async () => {},
  useConvexAuth: () => ({ isAuthenticated: false, isLoading: false }),
}));

// The fund's totals used to be written in currency style ("$500.00") while
// the rest of the page said "$500". They follow the one money rule now.
describe("SophiaFundView totals", () => {
  it("writes whole dollars bare and cents only when there are some", () => {
    const html = renderToString(
      <MemoryRouter>
        <SophiaFundView
          name="The Sophia Grant Fund"
          orgName="The Garden"
          availableCents={50000}
          grantedCents={12550}
          ledgerList={null}
          oneTimeHref={null}
          monthlyHref={null}
          gaveThanks={false}
        />
      </MemoryRouter>,
    );
    expect(html).toContain("$500<");
    expect(html).toContain("$125.50");
    expect(html).toContain("$625.50");
    expect(html).not.toContain("$500.00");
  });
});
