// /give after the decision: "Give more" is a plus-up. On a project that is a
// backing, so it waits for FF_BACKING; a creative's and the grant fund's do
// not, and neither does the monthly grant itself.

import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { DoneBlock, plusUpOpen } from "./give";

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
  useConvexAuth: () => ({ isAuthenticated: true, isLoading: false }),
}));
vi.mock("../hooks/useAnalytics", () => ({ useAnalytics: () => ({ capture: () => {} }) }));

afterEach(() => {
  flags.backing = true;
});

// React marks the seams between text pieces; they are not in the page.
const plain = (html: string) => html.replace(/<!-- -->/g, "");

const base = { giftId: "memberGifts:g1" as never, amountCents: 1500, visible: true };
const toProject = { ...base, target: "project" as const, projectId: "projects:p1" as never, projectTitle: "Harbor Mural" };
const toCreative = { ...base, target: "creative" as const, recipientUserId: "users:u1" as never, recipientName: "Mo Diaz" };
const toFund = { ...base, target: "fund" as const };

const done = (d: Parameters<typeof DoneBlock>[0]["done"]) =>
  plain(
    renderToString(
      <MemoryRouter>
        <DoneBlock done={d} capture={() => {}} />
      </MemoryRouter>,
    ),
  );

describe("plusUpOpen", () => {
  it("closes only the project plus-up while backing is closed", () => {
    flags.backing = false;
    expect(plusUpOpen("project")).toBe(false);
    expect(plusUpOpen("creative")).toBe(true);
    expect(plusUpOpen("fund")).toBe(true);
  });
  it("opens it with backing", () => {
    expect(plusUpOpen("project")).toBe(true);
  });
});

describe("after giving to a project", () => {
  it("asks for more money when backing is open", () => {
    const html = done(toProject);
    expect(html).toContain("Give more to Harbor Mural?");
    expect(html).toContain("One-time gift");
  });

  it("asks for nothing while backing is closed (FF_BACKING)", () => {
    flags.backing = false;
    const html = done(toProject);
    expect(html).toContain("You gave $15 to Harbor Mural.");
    expect(html).not.toContain("Give more to");
    expect(html).not.toContain("One-time gift");
    expect(html).not.toContain("Skip");
  });
});

describe("after giving to a creative or the fund", () => {
  it("still asks for more while backing is closed: those are not backings", () => {
    flags.backing = false;
    expect(done(toCreative)).toContain("Give more to Mo Diaz?");
    expect(done(toFund)).toContain("Give more to the Sophia Grant Fund?");
  });
});
