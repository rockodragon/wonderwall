import { beforeEach, describe, expect, it, vi } from "vitest";
import { isSafeIntentPath, setPendingIntent, takePendingIntent } from "./pendingIntent";

function fakeStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    _map: map,
  };
}

describe("isSafeIntentPath", () => {
  it("accepts a plain same-origin path", () => {
    expect(isSafeIntentPath("/join?level=seat")).toBe(true);
    expect(isSafeIntentPath("/projects/abc123")).toBe(true);
  });
  it("rejects protocol-relative and absolute URLs", () => {
    expect(isSafeIntentPath("//evil.com")).toBe(false);
    expect(isSafeIntentPath("https://evil.com")).toBe(false);
    expect(isSafeIntentPath("javascript://x")).toBe(false);
  });
  it("rejects non-paths", () => {
    expect(isSafeIntentPath("join")).toBe(false);
    expect(isSafeIntentPath(null)).toBe(false);
    expect(isSafeIntentPath(undefined)).toBe(false);
  });
});

describe("set/takePendingIntent", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", fakeStorage());
  });

  it("round-trips a safe path exactly once", () => {
    setPendingIntent("/join?level=seat");
    expect(takePendingIntent()).toBe("/join?level=seat");
    expect(takePendingIntent()).toBeNull();
  });

  it("never stores an unsafe path", () => {
    setPendingIntent("//evil.com");
    expect(takePendingIntent()).toBeNull();
  });

  it("drops an unsafe path that was already in storage", () => {
    localStorage.setItem("pendingIntent", "https://evil.com");
    expect(takePendingIntent()).toBeNull();
    // and clears it, so it can't be replayed later either
    expect(localStorage.getItem("pendingIntent")).toBeNull();
  });

  it("survives storage throwing", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {},
    });
    expect(() => setPendingIntent("/join")).not.toThrow();
    expect(takePendingIntent()).toBeNull();
  });
});
