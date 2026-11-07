import { describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { SophiaFundView } from "./fund.$slug";
import { NAMED_FUNDS, SOPHIA_FUND_SLUG } from "../lib/namedFunds";
import { FUND_ACCOUNT_FIRST } from "../lib/fundGiveLinks";
import type { FundGiveLinks } from "../lib/fundGiveLinks";

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
          links={{ state: "none" }}
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

function render(links: FundGiveLinks) {
  const fund = NAMED_FUNDS[SOPHIA_FUND_SLUG];
  return renderToString(
    <MemoryRouter>
      <SophiaFundView
        name={fund.name}
        tagline={fund.tagline}
        about={fund.about}
        cover={fund.cover}
        orgName="Abiding Practice"
        availableCents={0}
        grantedCents={0}
        ledgerList={null}
        links={links}
        gaveThanks={false}
      />
    </MemoryRouter>,
  );
}

// Rick, 2026-11-06: Nyla's icon is the page's cover, and giving needs an
// account so the gift lands on it.
describe("SophiaFundView cover and Give", () => {
  it("shows the icon whole with Nyla's caption under it", () => {
    const html = render({ state: "none" });
    expect(html).toContain('src="/fund/sophia-icon.webp"');
    expect(html).toContain("made in remembrance by her sister Nyla");
    expect(html).toContain("Named in honor of a young artist");
    // Rick, 2026-11-06: the line on the fund's card stays on the page.
    expect(html).toContain("To honor artists of The True, The Good, and The Beautiful.");
  });

  it("sends a signed-out visitor to make an account first, then back", () => {
    const html = render({ state: "needsAccount", href: "/signup?redirect=%2Ffund%2Fsophia", returnTo: "/fund/sophia" });
    expect(html).toContain('href="/signup?redirect=%2Ffund%2Fsophia"');
    expect(html).toContain(FUND_ACCOUNT_FIRST.replace("'", "&#x27;"));
    expect(html).not.toContain("buy.stripe.com");
  });

  it("gives a signed-in person the link that names them", () => {
    const link = "https://buy.stripe.com/test?client_reference_id=fund-u-abc";
    const html = render({ state: "ready", oneTime: link, monthly: null });
    expect(html).toContain(`href="${link}"`);
    expect(html).not.toContain(FUND_ACCOUNT_FIRST.replace("'", "&#x27;"));
  });
});
