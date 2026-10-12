// Preview-only stand-in for convex/react. Every query is answered from
// data.ts by the function's name; every mutation and action is a no-op that
// resolves. No Convex transport, no production data.

import { getFunctionName, type FunctionReference } from "convex/server";
import { answers } from "./data";

export class ConvexReactClient {
  constructor(_url: string) {}
}

export function useConvexAuth() {
  return { isAuthenticated: true, isLoading: false };
}

const warned = new Set<string>();
// The real hook hands back the same object until the data changes; so does
// this, per function and arguments, so effects keyed on a result settle.
const cache = new Map<string, unknown>();

export function useQuery(fn: FunctionReference<"query">, args?: unknown): unknown {
  const name = getFunctionName(fn);
  if (args === "skip") return undefined;
  const answer = answers[name];
  if (answer === undefined) {
    if (!warned.has(name)) {
      warned.add(name);
      console.warn(`[phone preview] no sample answer for ${name}`);
    }
    return undefined;
  }
  if (typeof answer !== "function") return answer;
  const key = `${name}:${JSON.stringify(args ?? null)}`;
  if (!cache.has(key)) cache.set(key, answer(args));
  return cache.get(key);
}

const NOOP = async () => undefined;

export function useMutation(_fn: FunctionReference<"mutation">) {
  return NOOP;
}

export function useAction(_fn: FunctionReference<"action">) {
  return NOOP;
}
