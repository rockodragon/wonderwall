import { beforeEach, describe, expect, it, vi } from "vitest";

// useDirectory with useQuery stubbed: `asked` records every call's args, in
// order, and `answers` decides what comes back for a given limit (undefined:
// still loading). React's hooks are test-support/fakeHooks.ts, so the hook
// runs again whenever its state changes, as it would on a page.
const mock = vi.hoisted(() => ({
  asked: [] as unknown[],
  answer: (_args: { limit: number }): unknown => undefined,
}));
vi.mock("convex/react", () => ({
  useQuery: (_fn: unknown, args: unknown) => {
    mock.asked.push(args);
    return args === "skip" ? undefined : mock.answer(args as { limit: number });
  },
}));
vi.mock("react", async () => (await import("../../test-support/fakeHooks")).fakeReact);

import { renderHook } from "../../test-support/fakeHooks";
import { useDirectory } from "./useDirectory";

const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ _id: `p${i}`, name: `Person ${i}` }));
/** A directory of `total` people that answers every limit at once. */
const everyone = (total: number) => (args: { limit: number }) => ({
  people: rows(Math.min(args.limit, total)),
  total,
  visitor: false,
});
const lastAsked = () => mock.asked[mock.asked.length - 1];

beforeEach(() => {
  mock.asked = [];
  mock.answer = everyone(100);
});

describe("useDirectory", () => {
  it("asks for one page with the filters, then a page more on Load more", () => {
    const hook = renderHook(useDirectory, { query: "ana", interests: ["Film"] });
    expect(lastAsked()).toEqual({ query: "ana", interests: ["Film"], communitySlug: undefined, near: undefined, limit: 24 });
    expect(hook.result.people).toHaveLength(24);
    expect(hook.result.end).toEqual({ kind: "more", remaining: 76 });

    hook.result.loadMore();
    expect(lastAsked()).toMatchObject({ query: "ana", limit: 48 });
    expect(hook.result.people).toHaveLength(48);
    hook.result.loadMore();
    expect(lastAsked()).toMatchObject({ limit: 72 });
  });

  it("starts over at one page when a filter changes", () => {
    const hook = renderHook(useDirectory, { query: "ana" });
    hook.result.loadMore();
    expect(lastAsked()).toMatchObject({ limit: 48 });
    hook.rerender({ query: "bo" });
    expect(lastAsked()).toMatchObject({ query: "bo", limit: 24 });
    hook.rerender({ query: "bo", interests: ["Music"] });
    expect(lastAsked()).toMatchObject({ interests: ["Music"], limit: 24 });
  });

  it("keeps the last list up while the next answer loads, and Load more waits for it", () => {
    const hook = renderHook(useDirectory, { query: "ana" });
    // The new search hasn't answered yet.
    mock.answer = () => undefined;
    hook.rerender({ query: "anab" });
    expect(hook.result.loading).toBe(true);
    expect(hook.result.people).toHaveLength(24); // still the last answer
    hook.result.loadMore();
    expect(lastAsked()).toMatchObject({ query: "anab", limit: 24 }); // not 48: page one first
    // Once it answers, Load more works again.
    mock.answer = everyone(100);
    hook.rerender({ query: "anab" });
    expect(hook.result.loading).toBe(false);
    hook.result.loadMore();
    expect(lastAsked()).toMatchObject({ query: "anab", limit: 48 });
  });

  it("asks nothing when skipped, and has nothing", () => {
    const hook = renderHook(useDirectory, "skip");
    expect(lastAsked()).toBe("skip");
    expect(hook.result.people).toBeUndefined();
    expect(hook.result.total).toBeUndefined();
    expect(hook.result.end).toBeNull();
    expect(hook.result.loading).toBe(false);
    hook.result.loadMore();
    expect(lastAsked()).toBe("skip");
  });

  it("tells a visitor whose one letter isn't a search, and no one else", () => {
    mock.answer = (args) => ({ ...everyone(100)(args), visitor: true });
    expect(renderHook(useDirectory, { query: "J" }).result.hint).toBe("Type 2 or more letters to search.");
    expect(renderHook(useDirectory, { query: "Jo" }).result.hint).toBeNull();
    mock.answer = everyone(100);
    expect(renderHook(useDirectory, { query: "J" }).result.hint).toBeNull();
  });

  it("sends Near me rounded, and no empty search or Discipline", () => {
    renderHook(useDirectory, { query: "", interests: [], near: { pos: { lat: 36.162712, lng: -86.781601 }, radius: 25 } });
    expect(lastAsked()).toEqual({
      query: undefined,
      interests: undefined,
      communitySlug: undefined,
      near: { lat: 36.16, lng: -86.78, radius: 25 },
      limit: 24,
    });
  });
});
