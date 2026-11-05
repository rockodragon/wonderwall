// Search by meaning for People and Projects (convex/smartSearch.ts rank).
//
// useSmartRank(kind, query, enabled) answers { query, ranked, pending }:
//   - query / ranked are a SETTLED pair: the search and the hits ranked for it
//     (ids with scores, closest first). ranked undefined means names only.
//   - A short search, a visitor, or enabled=false settles at once, names only.
//   - While a call is in flight the LAST settled pair stays up with
//     pending: true, so the list neither blanks nor flashes name-only hits.
//   - A late answer for a search that is no longer current is cached but
//     doesn't redraw; an error settles as names only and is not cached.
//
// The decision logic is plain functions (below) so it tests without React.

import { useConvexAuth, useAction } from "convex/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../convex/_generated/api";
import { meaningQuery, type SearchHit } from "./searchRules";

export type SmartKind = "people" | "projects";
export type Settled = { query: string; ranked: SearchHit[] | undefined };
export type SmartRank = Settled & { pending: boolean };

/** Answers kept so retyping a search is instant. */
export const CACHE_MAX = 50;

/** One search as a cache key, or null when it is names only (too short). */
export function rankKey(kind: SmartKind, query: string | null | undefined): string | null {
  const q = meaningQuery(query);
  return q ? `${kind}:${q.toLowerCase().replace(/\s+/g, " ")}` : null;
}

/** Remember an answer, dropping the oldest past `max`. */
export function cachePut(cache: Map<string, SearchHit[]>, key: string, ranked: SearchHit[], max = CACHE_MAX): void {
  cache.delete(key);
  cache.set(key, ranked);
  while (cache.size > max) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

/** Whether an answer for `answered` is still wanted when `current` is the search now. */
export function isCurrent(current: string | null, answered: string): boolean {
  return current === answered;
}

/**
 * What to hand the page for this render, and which call (if any) to make.
 * `failed` is the key of a search whose call errored: it stays names only.
 */
export function planRank(input: {
  enabled: boolean;
  signedIn: boolean;
  kind: SmartKind;
  query: string;
  cache: ReadonlyMap<string, SearchHit[]>;
  last: Settled | null;
  failed: string | null;
}): { out: SmartRank; key: string | null; fetch: boolean } {
  const { query, last } = input;
  const key = input.enabled && input.signedIn ? rankKey(input.kind, query) : null;
  if (!key) return { out: { query, ranked: undefined, pending: false }, key: null, fetch: false };
  const hit = input.cache.get(key);
  if (hit) return { out: { query, ranked: hit, pending: false }, key, fetch: false };
  if (input.failed === key) return { out: { query, ranked: undefined, pending: false }, key, fetch: false };
  // In flight: keep what was on screen. With nothing yet (a page opened on a
  // search), names only until the answer lands.
  const shown = last ?? { query, ranked: undefined };
  return { out: { ...shown, pending: true }, key, fetch: true };
}

// Module-level so a search typed before survives leaving and returning.
const answers = new Map<string, SearchHit[]>();

export function useSmartRank(kind: SmartKind, query: string, enabled: boolean): SmartRank {
  const { isAuthenticated } = useConvexAuth();
  const rank = useAction(api.smartSearch.rank);
  const [, bump] = useState(0);
  const failed = useRef<string | null>(null);
  const last = useRef<Settled | null>(null);
  const current = useRef<string | null>(null);

  const plan = planRank({
    enabled,
    signedIn: isAuthenticated,
    kind,
    query,
    cache: answers,
    last: last.current,
    failed: failed.current,
  });
  current.current = plan.key;
  if (failed.current !== plan.key) failed.current = null;
  if (!plan.out.pending) last.current = { query: plan.out.query, ranked: plan.out.ranked };

  const key = plan.key;
  const wanted = plan.fetch;
  useEffect(() => {
    if (!key || !wanted) return;
    const asked = meaningQuery(query) ?? "";
    rank({ kind, query: asked })
      .then((hits) => {
        // A late answer is still the right answer for its own search: kept,
        // so going back to it is instant, but only the current one redraws.
        cachePut(answers, key, hits);
        if (isCurrent(current.current, key)) bump((n) => n + 1);
      })
      .catch(() => {
        if (!isCurrent(current.current, key)) return;
        failed.current = key;
        bump((n) => n + 1);
      });
    // One call per distinct search; `query` is part of `key`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, wanted, kind, rank]);

  const { query: shownQuery, ranked, pending } = plan.out;
  // A stable object, so a page can list it as a dependency.
  return useMemo(() => ({ query: shownQuery, ranked, pending }), [shownQuery, ranked, pending]);
}
