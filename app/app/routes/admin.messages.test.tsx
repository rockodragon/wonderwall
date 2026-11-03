import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { AdminErrorBoundary } from "../components/admin/AdminUi";
import AdminMessagesPage from "./admin.messages";

const state = vi.hoisted(() => ({ admin: true as boolean | undefined, query: vi.fn() }));
vi.mock("../lib/useIsAdmin", () => ({ useIsAdmin: () => state.admin }));
vi.mock("convex/react", () => ({ useQuery: (...args: unknown[]) => state.query(...args) }));
function render() {
  return renderToStaticMarkup(
    <MemoryRouter>
      <AdminMessagesPage />
    </MemoryRouter>,
  );
}

const WEEK = 7 * 24 * 60 * 60 * 1000;
// Monday 2026-11-02 and the 12 Mondays before it, oldest first.
const THIS_MONDAY = Date.UTC(2026, 10, 2);
const week = (i: number, over: Record<string, unknown> = {}) => ({
  weekStart: THIS_MONDAY - (12 - i) * WEEK,
  messages: 0,
  conversationsStarted: 0,
  senders: 0,
  startedReplied: 0,
  medianReplyMinutes: null,
  ...over,
});
const REPORT = {
  weeks: Array.from({ length: 13 }, (_, i) =>
    i === 12
      ? week(i, { messages: 12, conversationsStarted: 3, senders: 4, startedReplied: 1, medianReplyMinutes: 35 })
      : i === 11
        ? week(i, { messages: 400, conversationsStarted: 20, senders: 30, startedReplied: 15, medianReplyMinutes: 90 })
        : week(i),
  ),
  periods: {
    recent: { messages: 1234, conversationsStarted: 40, startedReplied: 30, medianReplyMinutes: 120 },
    before: { messages: 980, conversationsStarted: 50, startedReplied: 20, medianReplyMinutes: 4320 },
  },
  kinds: [
    { kind: "project", started: 5, replied: 4, medianReplyMinutes: 35 },
    { kind: "host", started: 7, replied: 7, medianReplyMinutes: 10 },
    { kind: "admin", started: 2, replied: 0, medianReplyMinutes: null },
    { kind: "member", started: 21, replied: 9, medianReplyMinutes: 180 },
  ],
  responses: { replied: 20, readNoReply: 8, unread: 7 },
  depth: { one: 15, twoToThree: 10, fourToNine: 6, tenPlus: 4 },
};

beforeEach(() => {
  state.admin = true;
  state.query.mockReset();
  state.query.mockReturnValue(REPORT);
});

describe("messages report page", () => {
  it("shows the four headline numbers with the four weeks before", () => {
    const html = render();
    expect(html).toContain("Counts only. No one&#x27;s messages are shown.");
    // Each tile: its label, this period's number, and the period before it.
    const tile = (label: string, now: string, was: string) =>
      expect(html).toMatch(new RegExp(`${label}</dt><dd[^>]*>${now}</dd><dd[^>]*>was ${was}<`));
    tile("Messages", "1,234", "980");
    tile("Conversations started", "40", "50");
    // 30 of 40 answered, against 20 of 50.
    tile("Answered", "75%", "40%");
    // 120 minutes, against 3 days.
    tile("Typical wait", "2h", "3d");
  });

  it("lists the weeks newest first, with the date, count, starts and answered share", () => {
    const html = render();
    expect(html.indexOf("Nov 2")).toBeGreaterThan(-1);
    expect(html.indexOf("Nov 2")).toBeLessThan(html.indexOf("Oct 26"));
    expect(html.indexOf("Oct 26")).toBeLessThan(html.indexOf("Aug 10"));
    expect(html).toContain("this week");
    expect(html).toContain(">400<");
    expect(html).toContain(">75%<");
    // The busiest week fills its bar; this week's 12 of 400 is 3%.
    expect(html).toContain("width:100%");
    expect(html).toContain("width:3%");
    // A week with nothing has no answered share to give.
    expect(html).toContain(">–<");
  });

  it("names who starts them in plain words, with answered share and wait", () => {
    const html = render();
    for (const label of ["Member to member", "About a project", "Host to guest", "From an admin"]) expect(html).toContain(label);
    expect(html.indexOf("Member to member")).toBeLessThan(html.indexOf("About a project"));
    expect(html.indexOf("About a project")).toBeLessThan(html.indexOf("Host to guest"));
    expect(html.indexOf("Host to guest")).toBeLessThan(html.indexOf("From an admin"));
    expect(html).toContain(">43%<"); // 9 of 21
    expect(html).toContain(">3h<");
    expect(html).toContain(">100%<");
  });

  it("shows what happens next and how long conversations run", () => {
    const html = render();
    for (const label of ["Answered", "Read only", "Unread", "1 message", "2–3", "4–9", "10 or more"]) expect(html).toContain(label);
    expect(html).toContain(">20<");
    expect(html).toContain(">8<");
    expect(html).toContain(">7<");
    expect(html).toContain(">15<");
    expect(html).toContain(">4<");
  });

  it("says counting while the report loads", () => {
    state.query.mockReturnValue(undefined);
    expect(render()).toContain("Counting");
  });

  it("shows access denied to a non-admin and asks for nothing", () => {
    state.admin = false;
    const html = render();
    expect(html).toContain("Access Denied");
    expect(html).not.toContain("Each week");
    expect(state.query).not.toHaveBeenCalled();
  });

  it("keeps the loading state visible while access is unresolved", () => {
    state.admin = undefined;
    expect(render()).toContain("Checking access");
    expect(state.query).not.toHaveBeenCalled();
  });

  it("holds a server error to one line", () => {
    const boundary = new AdminErrorBoundary({ fallback: "Couldn't count messages right now.", children: null });
    boundary.state = AdminErrorBoundary.getDerivedStateFromError(new Error("boom"));
    const html = renderToStaticMarkup(boundary.render());
    expect(html).toContain('role="alert"');
    expect(html).toContain("Couldn&#x27;t count messages right now.");
  });
});
