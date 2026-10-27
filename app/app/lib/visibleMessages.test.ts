import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { observeVisibleMessageReads } from "./visibleMessages";

let intersect: IntersectionObserverCallback;
let tab: EventTarget & { visibilityState: string; hasFocus: () => boolean };
let win: EventTarget;
let focused = true;
const nodes = ["a", "b"].map(id => ({ dataset: { inboundMessageId: id } }));
const root = { querySelectorAll: () => nodes } as unknown as HTMLElement;
let stop: (() => void) | undefined;

beforeEach(() => {
  vi.useFakeTimers();
  focused = true;
  tab = Object.assign(new EventTarget(), { visibilityState: "visible", hasFocus: () => focused });
  win = new EventTarget();
  vi.stubGlobal("document", tab);
  vi.stubGlobal("window", win);
  vi.stubGlobal("IntersectionObserver", class {
    constructor(callback: IntersectionObserverCallback) { intersect = callback; }
    observe() {}
    disconnect() {}
  });
});
afterEach(() => { stop?.(); vi.unstubAllGlobals(); vi.useRealTimers(); });
function seen(index: number, visible = true) {
  intersect([{ target: nodes[index], isIntersecting: visible, intersectionRatio: visible ? 1 : 0 } as unknown as IntersectionObserverEntry], {} as IntersectionObserver);
}

describe("observed message reads", () => {
  it("does not read on mount, hidden tabs, unfocused windows or nonintersecting messages", async () => {
    const onRead = vi.fn(async () => {});
    stop = observeVisibleMessageReads(root, onRead);
    await vi.advanceTimersByTimeAsync(200);
    expect(onRead).not.toHaveBeenCalled();
    tab.visibilityState = "hidden";
    seen(0);
    await vi.advanceTimersByTimeAsync(200);
    expect(onRead).not.toHaveBeenCalled();
    tab.visibilityState = "visible";
    focused = false;
    tab.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(200);
    expect(onRead).not.toHaveBeenCalled();
    focused = true;
    win.dispatchEvent(new Event("focus"));
    await vi.advanceTimersByTimeAsync(200);
    expect(onRead).toHaveBeenCalledExactlyOnceWith(["a"]);
    seen(1, false);
    await vi.advanceTimersByTimeAsync(200);
    expect(onRead).toHaveBeenCalledTimes(1);
  });

  it("retries failed observations, deduplicates successful reads and stops on cleanup", async () => {
    const onRead = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue(undefined);
    stop = observeVisibleMessageReads(root, onRead);
    seen(0);
    await vi.advanceTimersByTimeAsync(1200);
    expect(onRead).toHaveBeenCalledTimes(2);
    seen(0);
    await vi.advanceTimersByTimeAsync(200);
    expect(onRead).toHaveBeenCalledTimes(2);
    seen(1);
    stop();
    await vi.advanceTimersByTimeAsync(200);
    expect(onRead).toHaveBeenCalledTimes(2);
  });
});
