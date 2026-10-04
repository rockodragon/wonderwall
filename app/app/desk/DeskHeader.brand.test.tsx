import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router";
import type { BrandId } from "../brand/brands";

// The desk's top-left (docs/features/garden-brand-domains.md): The Garden's
// lockup in place of the mono community line, whatever the address.
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

  it("leads with The Garden's lockup when the community is The Garden, on any address", () => {
    for (const b of ["exchange", "garden"] as const) {
      brand = b;
      const home = header("all");
      expect(home).toContain("<svg");
      expect(home).toContain("Jost");
      expect(home).toContain(">The Garden</span>");
      expect(home).not.toContain("Your desk");
      expect(home).toContain("Good evening, Rick.");
      expect(header("people")).toContain(">The Garden</span>");
    }
  });

  it("keeps the mono line for the Exchange community", () => {
    const html = header("all", "exchange");
    expect(html).not.toContain("<svg");
    expect(html).toContain("The Exchange<!-- --> · <!-- -->Your desk");
  });
});
