import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { GrantFundCredit } from "./story.$slug";

vi.mock("convex/react", () => ({
  useQuery: () => undefined,
  useMutation: () => async () => {},
  useAction: () => async () => {},
  useConvexAuth: () => ({ isAuthenticated: false, isLoading: false }),
}));

afterEach(() => vi.restoreAllMocks());

// React marks the seams between text pieces; they are not in the page.
const plain = (html: string) => html.replace(/<!-- -->/g, "");

describe("GrantFundCredit", () => {
  // It used the browser's locale, so a German browser read "$1.234,5".
  it("writes the award with its cents, in any browser locale", () => {
    const original = Number.prototype.toLocaleString;
    vi.spyOn(Number.prototype, "toLocaleString").mockImplementation(function (
      this: number,
      locales?: Intl.LocalesArgument,
      options?: Intl.NumberFormatOptions,
    ) {
      return original.call(this, locales ?? "de-DE", options);
    });
    const html = plain(
      renderToString(<GrantFundCredit credit={{ amount: 1234.5, period: "2026-09", orgName: "The Garden" }} />),
    );
    expect(html).toContain("— $1,234.50 · Sep 2026 · administered by The Garden");
  });

  it("writes whole dollars bare", () => {
    const html = plain(
      renderToString(<GrantFundCredit credit={{ amount: 500, period: "2026-09", orgName: "The Garden" }} />),
    );
    expect(html).toContain("— $500 · Sep 2026");
  });
});
