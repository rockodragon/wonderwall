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
    expect(html).toContain(">Off<");
    expect(html).toContain("Turn on");
    expect(html).toContain("Try the next page");
    expect(html).toContain("2 skipped: not enough history to tell");
    // The older-conversations note is about New members and invites only.
    expect(html).not.toContain("Older conversations");
  });
  it("names each row's email state, says what to do, and filters on it", () => {
    state.query.mockImplementation((fn, args) => {
      if (args === "skip") return undefined;
      const name = getFunctionName(fn);
      if (name.endsWith(":getUnreadReminder")) return { enabled: false };
      if (name.endsWith(":getMyProfile")) return { userId: "users:me" };
      const row = (key: string, reason: string, ownerId?: string) => ({
        candidateKey: key, reason: "unanswered", userId: key, profileId: key, name: key, sourceAt: Date.UTC(2026, 9, 28, 20),
        ownerId, lastContact: null, contact: { eligible: false, reason },
      });
      return {
        items: [row("Emma", "no_email", "users:me"), row("Royce", "loop_off"), row("JB", "email_off")],
        isDone: true, nextCursor: null, coverage: { returned: 3, scanned: 25, unknown: 0, migrationComplete: true },
      };
    });
    const html = render();
    expect(html).toContain("No email 1");
    expect(html).toContain("Reminder off 1");
    expect(html).toContain("Email off 1");
    expect(html).toContain("Turn on the reminder above and it emails them once.");
    expect(html).toContain("Yours");
  });
  it("skips data queries and hides controls from a non-admin", () => {
    state.admin = false;
    const html = render();
    expect(html).not.toContain("Turn on");
    expect(html).not.toContain("Unanswered messages");
    expect(state.query.mock.calls.every(([, args]) => args === "skip")).toBe(true);
  });
  it("keeps the loading state visible while access is unresolved", () => {
    state.admin = undefined;
    expect(render()).toContain("Checking access");
  });
});
