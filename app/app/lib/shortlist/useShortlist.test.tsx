import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { NOW_TICK_MS, getNow, subscribeNow } from "../../hooks/useNow";
import { DAY, NOW, sampleShortlist } from "./fixtures";
import { needsYou } from "./needsYou";
import { useShortlist } from "./useShortlist";

// The query answers with the sample Shortlist; the clock is the real shared one.
const data = sampleShortlist();
vi.mock("convex/react", () => ({ useQuery: () => data }));

/** What one reader (the desk, the palette) makes of the Shortlist. */
function Reader() {
  const state = useShortlist();
  return <i>{state.status === "ready" ? `${state.now}/${state.needs.length}` : "loading"}</i>;
}
const read = () => renderToString(<><Reader /><Reader /></>).match(/<i>([^<]*)<\/i>/g);

let off = () => {};
beforeEach(() => {
  vi.useFakeTimers({ now: NOW, toFake: ["setInterval", "clearInterval", "Date"] });
  off = subscribeNow(() => {});
});
afterEach(() => {
  off();
  vi.useRealTimers();
});

describe("useShortlist's now", () => {
  it("is the shared clock's, so two readers agree on now and on Needs you", () => {
    const [desk, palette] = read()!;
    expect(desk).toBe(`<i>${NOW}/${needsYou(data, NOW).length}</i>`);
    expect(palette).toBe(desk);
  });

  it("moves with the clock: a week's window moves on while the member is here", () => {
    const before = needsYou(data, NOW).length;
    vi.setSystemTime(NOW + 2 * DAY - NOW_TICK_MS);
    vi.advanceTimersByTime(NOW_TICK_MS);
    const later = getNow();
    expect(later).toBe(NOW + 2 * DAY);
    const after = needsYou(data, later).length;
    expect(after).not.toBe(before);
    const [desk, palette] = read()!;
    expect(desk).toBe(`<i>${later}/${after}</i>`);
    expect(palette).toBe(desk);
  });
});
