import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NOW_TICK_MS, getNow, subscribeNow } from "./useNow";

// The clock's store, as useSyncExternalStore drives it: subscribe, read.
// The tab is a stand-in document that can be hidden and shown.
const tab = Object.assign(new EventTarget(), { visibilityState: "visible" as DocumentVisibilityState });
function show(state: DocumentVisibilityState) {
  tab.visibilityState = state;
  tab.dispatchEvent(new Event("visibilitychange"));
}

const START = new Date(2026, 9, 2, 12).getTime();
let leave: (() => void)[] = [];
const subscribe = (listener: () => void) => leave.push(subscribeNow(listener));

beforeEach(() => {
  vi.useFakeTimers({ now: START, toFake: ["setInterval", "clearInterval", "Date"] });
  vi.stubGlobal("document", tab);
  tab.visibilityState = "visible";
});

afterEach(() => {
  leave.forEach((off) => off());
  leave = [];
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("useNow's clock", () => {
  it("ticks once a minute, the same now for every reader", () => {
    const desk = vi.fn();
    const palette = vi.fn();
    subscribe(desk);
    subscribe(palette);
    expect(getNow()).toBe(START);
    vi.advanceTimersByTime(NOW_TICK_MS - 1);
    expect(desk).not.toHaveBeenCalled();
    expect(getNow()).toBe(START);
    vi.advanceTimersByTime(1);
    expect(desk).toHaveBeenCalledTimes(1);
    expect(palette).toHaveBeenCalledTimes(1);
    expect(getNow()).toBe(START + NOW_TICK_MS);
  });

  it("runs one timer, however many read it", () => {
    subscribe(() => {});
    subscribe(() => {});
    subscribe(() => {});
    expect(vi.getTimerCount()).toBe(1);
  });

  it("ticks again when the tab comes back into view, not when it goes", () => {
    const reader = vi.fn();
    subscribe(reader);
    show("hidden");
    expect(reader).not.toHaveBeenCalled();
    // A hidden tab's timers are slowed or stopped: the minute can pass unseen.
    vi.setSystemTime(START + 30 * 60_000);
    expect(getNow()).toBe(START);
    show("visible");
    expect(reader).toHaveBeenCalledTimes(1);
    expect(getNow()).toBe(START + 30 * 60_000);
  });

  it("starts from the time it is for the first reader, not the last tick before", () => {
    subscribe(() => {});
    leave.pop()!();
    vi.setSystemTime(START + 3 * 60 * 60_000);
    subscribe(() => {});
    expect(getNow()).toBe(START + 3 * 60 * 60_000);
  });

  it("stops, timer and tab both, when the last reader leaves", () => {
    const reader = vi.fn();
    subscribe(reader);
    subscribe(() => {});
    leave.forEach((off) => off());
    leave = [];
    expect(vi.getTimerCount()).toBe(0);
    vi.setSystemTime(START + 60 * 60_000);
    show("visible");
    expect(getNow()).toBe(START);
    expect(reader).not.toHaveBeenCalled();
  });

  it("keeps ticking for whoever stays when one reader leaves", () => {
    const stays = vi.fn();
    subscribe(stays);
    subscribe(() => {});
    leave.pop()!();
    vi.advanceTimersByTime(NOW_TICK_MS);
    expect(stays).toHaveBeenCalledTimes(1);
  });
});
