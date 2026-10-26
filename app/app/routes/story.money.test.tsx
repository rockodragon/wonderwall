import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { GrantFundCredit, SupportCard } from "./story.$slug";

// Backing is off by default (FF_BACKING); each test says which way it is.
const flags = vi.hoisted(() => ({ backing: true }));
vi.mock("../lib/featureFlags", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/featureFlags")>()),
  get FF_BACKING() {
    return flags.backing;
  },
}));

vi.mock("convex/react", () => ({
  useQuery: () => undefined,
  useMutation: () => async () => {},
  useAction: () => async () => {},
  useConvexAuth: () => ({ isAuthenticated: false, isLoading: false }),
}));

afterEach(() => {
  vi.restoreAllMocks();
  flags.backing = true;
});

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

describe("SupportCard (the money block on a public story)", () => {
  const nobody = { count: 0, names: [], otherCount: 0 };
  const card = (over: Partial<Parameters<typeof SupportCard>[0]> = {}) =>
    plain(
      renderToString(
        <SupportCard
          projectId={"projects:p1" as never}
          acceptingSupport
          raisedCents={0}
          goalCents={null}
          backers={nobody}
          justBacked={false}
          {...over}
        />,
      ),
    );

  it("offers Support to a project taking it, when backing is open", () => {
    const html = card();
    expect(html).toContain(">Support<");
    expect(html).toContain("Be the first to back this.");
  });

  it("has no Support button and no invitation while backing is closed (FF_BACKING)", () => {
    flags.backing = false;
    // Nothing raised, nobody backed: nothing to show at all.
    expect(card()).toBe("");
    // Something already raised: the numbers stay, the button does not.
    const html = card({
      raisedCents: 25_000,
      goalCents: 100_000,
      backers: { count: 2, names: ["Ana", "Jo"], otherCount: 0 },
    });
    expect(html).toContain("$250 of $1,000");
    expect(html).toContain("Backed by Ana and Jo");
    expect(html).not.toContain(">Support<");
    expect(html).not.toContain("back this");
    expect(html).not.toContain("<form");
  });

  it("still thanks someone sent back from a payment made before backing closed", () => {
    flags.backing = false;
    const html = card({ justBacked: true });
    expect(html).toContain("Thank you.");
    expect(html).not.toContain(">Support<");
    expect(html).not.toContain("Be the first to back this.");
  });
});
