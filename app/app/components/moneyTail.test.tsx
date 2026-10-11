import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { SlotPaymentPanel } from "./GigSchedule";
import { ProjectTile } from "./ProjectTile";

const payment = vi.hoisted(() => ({ current: null as unknown }));

vi.mock("convex/react", () => ({
  useQuery: () => payment.current,
  useMutation: () => async () => {},
  useAction: () => async () => {},
}));

afterEach(() => {
  vi.restoreAllMocks();
  payment.current = null;
});

// React marks the seams between text pieces; they are not in the page.
const plain = (html: string) => html.replace(/<!-- -->/g, "");

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

const paymentRow = {
  isHost: true,
  artistName: "Ada",
  links: [],
  amountDollars: 12.5,
  paidAt: 1_700_000_000_000,
  paidAmountCents: 1250,
  paidMethod: "venmo",
  paidConfirmedAt: undefined,
};

describe("SlotPaymentPanel", () => {
  it("writes the agreed amount and the paid amount with their cents", () => {
    payment.current = paymentRow;
    const html = plain(renderToString(<SlotPaymentPanel slotId="gigSlots:d1" />));
    expect(html).toContain("$12.50 per date");
    expect(html).toContain("Marked paid $12.50 via Venmo");
  });

  it("writes whole dollars bare", () => {
    payment.current = { ...paymentRow, amountDollars: 300, paidAmountCents: 30000 };
    const html = plain(renderToString(<SlotPaymentPanel slotId="gigSlots:d1" />));
    expect(html).toContain("$300 per date");
    expect(html).toContain("Marked paid $300 via Venmo");
  });

  it("says the amount is as agreed when there isn't one", () => {
    payment.current = { ...paymentRow, amountDollars: undefined, paidAt: undefined };
    expect(plain(renderToString(<SlotPaymentPanel slotId="gigSlots:d1" />))).toContain("Amount as agreed");
  });
});

describe("ProjectTile", () => {
  it("writes what's raised with its cents and the goal with its grouping, in any browser locale", () => {
    germanBrowser();
    const html = plain(
      renderToString(
        <MemoryRouter>
          <ProjectTile
            project={{
              projectId: "p1",
              title: "Harbor Mural",
              kind: "passion",
              stage: "idea",
              role: "Lead",
              raising: true,
              goal: 5000,
              raisedCents: 1250,
              openRoles: [],
            }}
          />
        </MemoryRouter>,
      ),
    );
    expect(html).toContain("$12.50 of $5,000 raised");
  });
});
