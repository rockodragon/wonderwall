import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import {
  filterTables,
  fullnessSegments,
  tablePrice,
  type TableSummary,
} from "./presentation";
import { TableCard } from "./TableCard";
const summary: TableSummary = {
  _id: "t1",
  name: "A shared studio",
  slug: "shared-studio",
  format: "Visual art",
  memberCount: 8,
  capacity: 12,
};
const html = (table: TableSummary, preview = false) =>
  renderToStaticMarkup(
    <MemoryRouter>
      <TableCard table={table} preview={preview} />
    </MemoryRouter>,
  );
describe("Table card public projection", () => {
  it("retains its canonical route with a fixed approximate fullness ring", () => {
    const markup = html({ ...summary, photoUrl: "/campaign/church.jpg" });
    expect(markup).toContain('href="/tables/shared-studio"');
    expect(markup).toContain('class="tables-photo"');
    expect(markup.match(/<circle/g)).toHaveLength(10);
    expect(markup).toContain("4 chairs available");
    expect(markup).not.toContain("Sponsor");
  });
  it("works without inventing photo or roster data", () => {
    const markup = html(summary);
    expect(markup).toContain("tables-photo-empty");
    expect(markup).not.toContain("<img");
    expect(markup).not.toContain("roster-person");
  });
  it("includes anonymous guest and checkout reservations in rough fullness", () => {
    const markup = html({ ...summary, memberCount: 2, spotsRemaining: 3 });
    expect(markup.match(/class="tables-ring-taken"/g)).toHaveLength(8);
    expect(markup.match(/<circle/g)).toHaveLength(10);
    expect(markup).toContain("3 chairs available");
    expect(markup).not.toContain("Guest participant");
  });
  it("uses the member count when remaining capacity isn't available", () => {
    expect(
      html({ ...summary, spotsRemaining: null }).match(
        /class="tables-ring-taken"/g,
      ),
    ).toHaveLength(7);
  });
  it("renders creation preview without a false clickable destination", () => {
    const markup = html(summary, true);
    expect(markup).toContain("<article");
    expect(markup).not.toContain("href=");
  });
});
describe("independent membership and enrollment price", () => {
  it.each([
    [{}, "Free"],
    [{ priceCents: 2500 }, "$25.00 one time"],
    [{ membershipRequired: true }, "Included with membership"],
    [
      { membershipRequired: true, priceCents: 2500 },
      "Membership + $25.00 one time",
    ],
  ])("renders policy %j", (policy, expected) =>
    expect(tablePrice(policy)).toBe(expected),
  );
  it("clamps the approximate ring without treating segments as seats", () => {
    expect(fullnessSegments(8, 12)).toBe(7);
    expect(fullnessSegments(100, 6)).toBe(10);
    expect(fullnessSegments(5)).toBe(0);
  });
});
describe("browse filters use real occurrence data", () => {
  const now = new Date(2026, 9, 3, 12).getTime();
  const filters = {
    search: "",
    topic: "All",
    free: false,
    online: false,
    month: false,
    location: "",
    community: "all",
  };
  const rows: TableSummary[] = [
    summary,
    {
      ...summary,
      _id: "t2",
      priceCents: 3000,
      host: { name: "Marta" },
      nextEvent: {
        id: "event1",
        title: "Studio",
        datetime: new Date(2026, 9, 20, 12).getTime(),
        location: "Pasadena",
        locationType: "online",
      },
    },
    {
      ...summary,
      _id: "t3",
      nextEvent: {
        id: "event2",
        title: "Next month",
        datetime: new Date(2026, 10, 20, 12).getTime(),
      },
    },
  ];
  it("searches actual hosts and topics", () => {
    expect(
      filterTables(rows, { ...filters, search: "marta" }, now).map(
        (row) => row._id,
      ),
    ).toEqual(["t2"]);
    expect(filterTables(rows, { ...filters, topic: "Music" }, now)).toEqual([]);
  });
  it("filters free price independently of access", () =>
    expect(
      filterTables(rows, { ...filters, free: true }, now).map((row) => row._id),
    ).toEqual(["t1", "t3"]));
  it("uses real online and location data", () => {
    expect(
      filterTables(rows, { ...filters, online: true }, now).map(
        (row) => row._id,
      ),
    ).toEqual(["t2"]);
    expect(
      filterTables(rows, { ...filters, location: "Pasadena" }, now).map(
        (row) => row._id,
      ),
    ).toEqual(["t2"]);
  });
  it("this month requires a future occurrence in this month", () =>
    expect(
      filterTables(rows, { ...filters, month: true }, now).map(
        (row) => row._id,
      ),
    ).toEqual(["t2"]));
});
