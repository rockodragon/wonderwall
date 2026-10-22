import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { getFunctionName } from "convex/server";
import { GoalProgress, SupportModal, tierPriceLabel } from "./projects";
import { TierManager } from "./projects.$id";

// What each query on these pages answers, by function name.
const answers = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));
const auth = vi.hoisted(() => ({ signedIn: true }));

vi.mock("convex/react", () => ({
  useQuery: (ref: unknown) => answers.current[getFunctionName(ref as never)],
  useMutation: () => async () => {},
  useAction: () => async () => {},
  useConvexAuth: () => ({ isAuthenticated: auth.signedIn, isLoading: false }),
}));

afterEach(() => {
  vi.restoreAllMocks();
  answers.current = {};
  auth.signedIn = true;
});

/** A browser set to German: anything that doesn't pin a locale reads "12,5". */
function germanBrowser() {
  const original = Number.prototype.toLocaleString;
  vi.spyOn(Number.prototype, "toLocaleString").mockImplementation(function (
    this: number,
    locales?: Intl.LocalesArgument,
    options?: Intl.NumberFormatOptions,
  ) {
    return original.call(this, locales ?? "de-DE", options);
  });
}

// React marks the seams between text pieces; they are not in the page.
const plain = (html: string) => html.replace(/<!-- -->/g, "");

describe("GoalProgress", () => {
  it("writes the raised amount with its cents, and the goal in whole dollars", () => {
    germanBrowser();
    const html = plain(renderToString(<GoalProgress raisedCents={1250} goal={1000} />));
    expect(html).toContain(">$12.50</span> of $1,000<");
  });

  it("writes whole dollars bare", () => {
    expect(plain(renderToString(<GoalProgress raisedCents={42000} goal={1000} />))).toContain(
      ">$420</span> of $1,000<",
    );
  });
});

describe("tierPriceLabel", () => {
  it("says $12.50 once, $12.50/mo, and the twelve months as /yr", () => {
    germanBrowser();
    expect(tierPriceLabel({ priceCents: 1250, billing: "one_time" }, "financial_one_time")).toBe("$12.50");
    expect(tierPriceLabel({ priceCents: 1250, billing: "monthly" }, "financial_recurring")).toBe("$12.50/mo");
    expect(tierPriceLabel({ priceCents: 1250 }, "financial_recurring")).toBe("$12.50/mo");
    expect(tierPriceLabel({ priceCents: 1250, billing: "monthly" }, "financial_annual")).toBe("$150/yr");
    expect(tierPriceLabel({ priceCents: 12345, billing: "monthly" }, "financial_annual")).toBe("$1,481.40/yr");
  });
});

describe("SupportModal", () => {
  it("writes each backer's amount and each tier's price by the one money rule", () => {
    germanBrowser();
    answers.current = {
      "garden/support:listSupportForProject": [
        { _id: "s1", supporterName: "Ada", type: "financial_one_time", amountCents: 1250, status: "backed" },
        { _id: "s2", supporterName: "Bo", type: "financial_recurring", amountCents: 1250, status: "pledged" },
        { _id: "s3", supporterName: "Cy", type: "financial_annual", amountCents: 150000, status: "backed" },
      ],
      "garden/patronTiers:listTiers": [
        { _id: "t1", name: "Friend", priceCents: 1250, billing: "monthly", benefits: [] },
      ],
    };
    const html = plain(
      renderToString(
        <MemoryRouter>
          <SupportModal project={{ _id: "projects:p1", title: "A film" }} mode="back" onClose={() => {}} />
        </MemoryRouter>,
      ),
    );
    expect(html).toContain("· $12.50 backed");
    expect(html).toContain("· $12.50/mo pledged");
    expect(html).toContain("· $1,500/yr");
    expect(html).toContain(">$12.50/mo<");
  });
});

describe("SupportModal presets", () => {
  it("offers $10, $25, $50 and Other amount, and hides the amount box until asked", () => {
    answers.current = { "garden/support:listSupportForProject": [], "garden/patronTiers:listTiers": [] };
    const html = plain(
      renderToString(
        <MemoryRouter>
          <SupportModal project={{ _id: "projects:p1", title: "A film" }} mode="back" onClose={() => {}} />
        </MemoryRouter>,
      ),
    );
    expect(html).toContain("$10/mo");
    expect(html).toContain("$25/mo");
    expect(html).toContain("$50/mo");
    expect(html).toContain("Other amount");
    expect(html).not.toContain("Continue to checkout");
  });
});

describe("SupportModal for a visitor with no account", () => {
  it("opens on a one-time backing, and asks for the name it will show", () => {
    auth.signedIn = false;
    answers.current = { "garden/support:listSupportForProject": [], "garden/patronTiers:listTiers": [] };
    const html = plain(
      renderToString(
        <MemoryRouter>
          <SupportModal project={{ _id: "projects:p1", title: "A film" }} mode="back" onClose={() => {}} />
        </MemoryRouter>,
      ),
    );
    expect(html).toContain(">$10<");
    expect(html).not.toContain("/mo");
    expect(html).toContain("Your name, as it shows on the project");
  });

  it("asks a member for no name: their profile's is used", () => {
    answers.current = { "garden/support:listSupportForProject": [], "garden/patronTiers:listTiers": [] };
    const html = plain(
      renderToString(
        <MemoryRouter>
          <SupportModal project={{ _id: "projects:p1", title: "A film" }} mode="back" onClose={() => {}} />
        </MemoryRouter>,
      ),
    );
    expect(html).not.toContain("Your name, as it shows on the project");
  });
});

describe("TierManager", () => {
  it("shows a $12.50 tier as $12.50, not rounded to $13", () => {
    answers.current = {
      "garden/patronTiers:listAllTiers": [
        { _id: "t1", name: "Friend", priceCents: 1250, billing: "monthly", isActive: true, benefits: [] },
        { _id: "t2", name: "Founder", priceCents: 50000, billing: "one_time", isActive: true, benefits: [] },
      ],
    };
    const html = plain(renderToString(<TierManager projectId={"projects:p1" as never} />));
    expect(html).toContain(">$12.50/mo<");
    expect(html).toContain(">$500<");
    expect(html).not.toContain("$13");
  });
});
