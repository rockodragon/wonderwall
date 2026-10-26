import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { ShareHint } from "./ShareHint";

// The one-time note on your own profile: what the share buttons hold, or,
// without an address, that the address comes first, on the site's own domain.
const site = vi.hoisted(() => ({ brand: "exchange" as "exchange" | "garden" }));
vi.mock("../brand/brands", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../brand/brands")>()),
  useBrand: () => site.brand,
}));

function hint(hasHandle: boolean) {
  return renderToStaticMarkup(
    <MemoryRouter>
      <ShareHint hasHandle={hasHandle} onClose={() => {}} />
    </MemoryRouter>,
  );
}

describe("ShareHint", () => {
  // The buttons it names are tiles on a phone and pills from `sm` up
  // (components/ownPageButton.ts): the note says what is on screen at each.
  it("with an address, names Share and My code as they read at each width", () => {
    site.brand = "exchange";
    const html = hint(true);
    expect(html).toContain(
      '<strong><span class="sm:hidden">Share profile</span><span class="hidden sm:inline">Share your profile</span></strong>',
    );
    expect(html).toContain(
      '<strong><span class="sm:hidden">My code</span><span class="hidden sm:inline">Show my code</span></strong>',
    );
    expect(html).not.toContain("/settings#address");
  });

  it("without one, asks for it first, on the site's own address", () => {
    site.brand = "exchange";
    expect(hint(false)).toContain("thecreative.exchange/@yourname");
    expect(hint(false)).toContain('href="/settings#address"');
    site.brand = "garden";
    expect(hint(false)).toContain("createthegarden.com/@yourname");
  });
});
