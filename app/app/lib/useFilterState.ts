import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";

/**
 * Debounces a fast-changing value (e.g. keystrokes) so downstream work
 * (a Convex query, a client-side filter pass) only re-runs `delay`ms after
 * the value stops changing.
 */
export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}

interface UseFilterStateOptions {
  /** URL query-string key for the free-text search value. Default "q". */
  queryParam?: string;
  /** URL query-string key for the multi-select tag values. Default "tags". */
  tagsParam?: string;
  /** Debounce applied to the returned `debouncedQuery`. Default 300ms. */
  debounceMs?: number;
}

/**
 * Syncs a free-text search query plus a multi-select set of tag/filter
 * values to the URL (via useSearchParams), so filter state is shareable,
 * deep-linkable, and survives back/forward navigation instead of living
 * only in React state.
 *
 * Shared by /search (People) and /events — both pages have a text search
 * box plus a multi-select tag-pill row; this hook holds the URL-sync
 * boilerplate for that shape once instead of duplicating it per page.
 */
export function useFilterState(options: UseFilterStateOptions = {}) {
  const { queryParam = "q", tagsParam = "tags", debounceMs = 300 } = options;
  const [searchParams, setSearchParams] = useSearchParams();

  const query = searchParams.get(queryParam) ?? "";
  const debouncedQuery = useDebounce(query, debounceMs);

  const tags = useMemo(() => {
    const raw = searchParams.get(tagsParam);
    return raw ? raw.split(",").filter(Boolean) : [];
  }, [searchParams, tagsParam]);

  // Per-keystroke updates use `replace` so typing doesn't fill up browser
  // history with one entry per character.
  const setQuery = useCallback(
    (next: string) => {
      setSearchParams(
        (prev) => {
          const params = new URLSearchParams(prev);
          if (next) params.set(queryParam, next);
          else params.delete(queryParam);
          return params;
        },
        { replace: true },
      );
    },
    [setSearchParams, queryParam],
  );

  const toggleTag = useCallback(
    (tag: string) => {
      setSearchParams((prev) => {
        const params = new URLSearchParams(prev);
        const current = (params.get(tagsParam) ?? "").split(",").filter(Boolean);
        const next = current.includes(tag)
          ? current.filter((t) => t !== tag)
          : [...current, tag];
        if (next.length) params.set(tagsParam, next.join(","));
        else params.delete(tagsParam);
        return params;
      });
    },
    [setSearchParams, tagsParam],
  );

  const clearTags = useCallback(() => {
    setSearchParams((prev) => {
      const params = new URLSearchParams(prev);
      params.delete(tagsParam);
      return params;
    });
  }, [setSearchParams, tagsParam]);

  return {
    // Raw URLSearchParams escape hatch, for page-specific filter state
    // (e.g. Events' favorites tab) that should live in the same URL.
    searchParams,
    setSearchParams,
    query,
    debouncedQuery,
    setQuery,
    tags,
    toggleTag,
    clearTags,
  };
}
