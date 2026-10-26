import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { getFunctionName } from "convex/server";
import AdminAttentionPage from "./admin.attention";

const state = vi.hoisted(() => ({ admin: true as boolean | undefined, query: vi.fn() }));
vi.mock("../lib/useIsAdmin", () => ({ useIsAdmin: () => state.admin }));
vi.mock("convex/react", () => ({ useQuery: (...args: unknown[]) => state.query(...args), useMutation: () => vi.fn() }));
function render() { return renderToStaticMarkup(<MemoryRouter><AdminAttentionPage /></MemoryRouter>); }

beforeEach(() => {
  state.admin = true;
  state.query.mockClear();
  state.query.mockImplementation((fn, args) => {
    if (args === "skip") return undefined;
    if (getFunctionName(fn).endsWith(":getUnreadReminder")) return { enabled: false };
    return { items: [], isDone: false, nextCursor: "next", coverage: { returned: 0, scanned: 25, unknown: 2, migrationComplete: false } };
  });
});

describe("attention page", () => {
  it("shows the off-by-default control and honest coverage for an empty filtered page", () => {
    const html = render();
    expect(html).toContain("Enable reminder");
    expect(html).toContain("More source records are available");
    expect(html).toContain("legacy follow origins");
    expect(html).toContain("needs its bounded backfill");
  });
  it("skips data queries and hides controls from a non-admin", () => {
    state.admin = false;
    const html = render();
    expect(html).not.toContain("Enable reminder");
    expect(html).not.toContain("Unanswered messages");
    expect(state.query.mock.calls.every(([, args]) => args === "skip")).toBe(true);
  });
  it("keeps the loading state visible while access is unresolved", () => {
    state.admin = undefined;
    expect(render()).toContain("Checking access");
  });
});
