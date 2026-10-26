// renderHook for a hook made only of useState, useRef, useMemo and useCallback
// (no effects, no DOM), without a DOM renderer: the test mocks "react" with
// `fakeReact`, and renderHook runs the hook as React would, slot by slot, again
// whenever a setter is called (synchronously, as inside act()).
//
//   vi.mock("react", async () => (await import("../../test-support/fakeHooks")).fakeReact);
//   const hook = renderHook(useThing, firstProps);
//   hook.result.doSomething();     // re-renders
//   hook.rerender(nextProps);
//
// One hook at a time: a second renderHook starts the slots over.

type Slot = { value: unknown; deps?: readonly unknown[] };

let slots: Slot[] = [];
let at = 0;
let render: (() => void) | null = null;

const sameDeps = (a: readonly unknown[] | undefined, b: readonly unknown[] | undefined) =>
  !!a && !!b && a.length === b.length && a.every((x, i) => Object.is(x, b[i]));

function useState<T>(initial: T | (() => T)): [T, (next: T | ((was: T) => T)) => void] {
  const i = at++;
  if (!(i in slots)) slots[i] = { value: typeof initial === "function" ? (initial as () => T)() : initial };
  const set = (next: T | ((was: T) => T)) => {
    const was = slots[i].value as T;
    const value = typeof next === "function" ? (next as (w: T) => T)(was) : next;
    if (Object.is(value, was)) return;
    slots[i].value = value;
    render?.();
  };
  return [slots[i].value as T, set];
}

function useRef<T>(initial: T): { current: T } {
  const i = at++;
  if (!(i in slots)) slots[i] = { value: { current: initial } };
  return slots[i].value as { current: T };
}

function useMemo<T>(make: () => T, deps: readonly unknown[]): T {
  const i = at++;
  if (!(i in slots) || !sameDeps(slots[i].deps, deps)) slots[i] = { value: make(), deps };
  return slots[i].value as T;
}

function useCallback<T>(fn: T, deps: readonly unknown[]): T {
  return useMemo(() => fn, deps);
}

/** What the mocked "react" module exports. */
export const fakeReact = { useState, useRef, useMemo, useCallback };

export function renderHook<P, R>(hook: (props: P) => R, props: NoInfer<P>): { readonly result: R; rerender: (next: P) => void } {
  slots = [];
  let current = props;
  let result: R;
  render = () => {
    at = 0;
    result = hook(current);
  };
  render();
  return {
    get result() {
      return result;
    },
    rerender(next: P) {
      current = next;
      render?.();
    },
  };
}
