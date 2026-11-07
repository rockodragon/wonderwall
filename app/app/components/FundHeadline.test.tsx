import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { FundHeadline } from "./FundHeadline";
import { fundFrom } from "../desk/deskInput";
import { SOPHIA_FUND_SLUG } from "../lib/namedFunds";

const money = (cents: number) => `$${(cents / 100).toLocaleString("en-US")}`;

function render(fund: Parameters<typeof FundHeadline>[0]["fund"]) {
  return renderToStaticMarkup(
    <MemoryRouter>
      <FundHeadline fund={fund} money={money} />
    </MemoryRouter>,
  );
}

// Rick, 2026-11-06: the visitor home showed the fund with no picture. Now
// it's the icon, with the name and amount over it, opening /fund/sophia.
describe("FundHeadline", () => {
  it("is the fund's icon with its name and amount over it, linking to its page", () => {
    const fund = fundFrom({ org: { slug: SOPHIA_FUND_SLUG, name: "Abiding Practice" }, balanceCents: 187_500 });
    const html = render(fund);
    expect(html).toContain('src="/fund/sophia-icon.webp"');
    expect(html).toContain("The Sophia Grant Fund");
    expect(html).toContain("$11,875");
    expect(html).toContain("available to grant");
    expect(html).toContain('href="/fund/sophia"');
  });

  it("holds its place while loading, and is nothing with no fund", () => {
    expect(render(undefined)).toContain("aspect-[4/5]");
    expect(render(null)).toBe("");
  });
});
