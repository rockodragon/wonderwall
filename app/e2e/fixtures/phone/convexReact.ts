// Preview-only stand-in for convex/react. Every query is answered from
// data.ts by the function's name; every mutation and action is a no-op that
// resolves. No Convex transport, no production data.

import { getFunctionName, type FunctionReference } from "convex/server";
import { answers, replies } from "./data";

export class ConvexReactClient {
  constructor(_url: string) {}
}

/** `?visitor` in the address: the page as someone with no account sees it
 *  (a public page only; the shell sends a visitor elsewhere to sign in). */
function asVisitor(): boolean {
  return new URLSearchParams(window.location.search).has("visitor");
}

export function useConvexAuth() {
  return { isAuthenticated: !asVisitor(), isLoading: false };
}

const warned = new Set<string>();
// The real hook hands back the same object until the data changes; so does
// this, per function and arguments, so effects keyed on a result settle.
const cache = new Map<string, unknown>();

export function useQuery(fn: FunctionReference<"query">, args?: unknown): unknown {
  const name = getFunctionName(fn);
  if (args === "skip") return undefined;
  if (name === "profiles:getMyProfile" && asVisitor()) return null;
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

// A mutation that a screen reads the answer of (a new project's id) gets
// its sample reply; every other one resolves to nothing.
export function useMutation(fn: FunctionReference<"mutation">) {
  const reply = replies[getFunctionName(fn)];
  return reply === undefined ? NOOP : async () => reply;
}

export function useAction(fn: FunctionReference<"action">) {
  const reply = replies[getFunctionName(fn)];
  return reply === undefined ? NOOP : async (args?: unknown) => (typeof reply === "function" ? reply(args) : reply);
}
