import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router";
import type { BrandId } from "../brand/brands";

// The desk's top-left on The Garden's own domains (docs/features/
// garden-brand-domains.md): its lockup in place of the mono community line.
let brand: BrandId = "exchange";
vi.mock("../brand/brands", async (original) => ({
  ...(await original<typeof import("../brand/brands")>()),
  useBrand: () => brand,
}));
vi.mock("../lib/useInviteLink", () => ({
  useInviteLink: () => ({ loading: true, inviteLink: undefined, url: "", displayUrl: "", copied: false }),
}));

const { DeskHeader } = await import("./DeskHeader");

function header(view: "all" | "people", community: "garden" | "exchange" = "garden") {
  return renderToString(
    <MemoryRouter>
      <DeskHeader
        view={view}
        community={community}
        greeting="Good evening, Rick."
        greetingReady
        count={view === "all" ? null : 12}
        stuck={false}
        inert={false}
        onMeasure={() => {}}
      />
    </MemoryRouter>,
  );
}

describe("DeskHeader brand", () => {
  beforeEach(() => {
    brand = "exchange";
  });

  it("keeps the mono line on TheCreative.exchange", () => {
    const html = header("all");
    expect(html).toContain("The Garden<!-- --> · <!-- -->Your desk");
    expect(html).not.toContain("<svg");
  });

  it("leads with The Garden's lockup on its own domains, without the view's name", () => {
    brand = "garden";
    const home = header("all");
    expect(home).toContain("<svg");
    expect(home).toContain("Jost");
    expect(home).toContain(">The Garden</span>");
    expect(home).not.toContain("Your desk");
    expect(home).toContain("Good evening, Rick.");

    const people = header("people");
    expect(people).toContain(">The Garden</span>");
    expect(people).toContain("<svg");
  });

  it("names the Exchange in words when that community is shown on a Garden domain", () => {
    brand = "garden";
    const html = header("all", "exchange");
    expect(html).not.toContain("<svg");
    expect(html).toContain("The Exchange");
  });
});
