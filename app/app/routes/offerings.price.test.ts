import { afterEach, describe, expect, it, vi } from "vitest";
import { formatPrice } from "./offerings";

vi.mock("convex/react", () => ({ useQuery: () => undefined, useMutation: () => async () => {}, useAction: () => async () => {} }));

afterEach(() => vi.restoreAllMocks());

describe("formatPrice", () => {
  it("is Free for nothing, and the shared money rule otherwise", () => {
    expect(formatPrice(undefined)).toBe("Free");
    expect(formatPrice(0)).toBe("Free");
    expect(formatPrice(2500)).toBe("$25");
    expect(formatPrice(1250)).toBe("$12.50");
  });

  // It used the browser's locale, so a German browser read "$1.234,50".
  it("writes US dollars the same way in any browser locale", () => {
    const original = Number.prototype.toLocaleString;
    vi.spyOn(Number.prototype, "toLocaleString").mockImplementation(function (
      this: number,
      locales?: Intl.LocalesArgument,
      options?: Intl.NumberFormatOptions,
    ) {
      return original.call(this, locales ?? "de-DE", options);
    });
    expect(formatPrice(123450)).toBe("$1,234.50");
  });
});
