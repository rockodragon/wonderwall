// The People directory (convex/profiles.ts directory) a page at a time, for
// /people (routes/search.tsx) and the desk's People › Everyone.
//
// The first answer is one page (DIRECTORY_PAGE people); Load more asks for a
// page more. A new search, Discipline, community or Near me starts over at
// one page. While the next answer loads, the last one stays up (from the
// same community), so typing or Load more doesn't blank the list. The server
// decides what a visitor may see; `end` says how the list ends for this
// caller (lib/browse/directoryPage.ts).

import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useCallback, useMemo, useRef, useState } from "react";
import { api } from "../../convex/_generated/api";
import { DIRECTORY_PAGE } from "../../convex/directoryRules";
import { directoryEnd, directoryNear, type DirectoryEnd } from "./browse/directoryPage";
import type { NearMe } from "./browse/nearMe";

type DirectoryAnswer = FunctionReturnType<typeof api.profiles.directory>;
export type DirectoryPerson = DirectoryAnswer["people"][number];

export type DirectoryFilters = {
  query?: string;
  /** Any of these (the Discipline multi-select); none is everyone. */
  interests?: readonly string[];
  communitySlug?: string;
  near?: NearMe | null;
};

export type Directory = {
  /** The people on show, in the directory's order. undefined while the first answer loads. */
  people: DirectoryPerson[] | undefined;
  /** How many match in all. */
  total: number | undefined;
  end: DirectoryEnd;
  /** Ask for one more page. */
  loadMore: () => void;
  /** A newer answer (another page, a new search) is on its way. */
  loading: boolean;
};

export function useDirectory(filters: DirectoryFilters | "skip"): Directory {
  const args =
    filters === "skip"
      ? null
      : {
          query: filters.query || undefined,
          interests: filters.interests && filters.interests.length > 0 ? [...filters.interests] : undefined,
          communitySlug: filters.communitySlug,
          near: directoryNear(filters.near),
        };
  const key = JSON.stringify(args);
  const [paging, setPaging] = useState({ key, limit: DIRECTORY_PAGE });
  const limit = paging.key === key ? paging.limit : DIRECTORY_PAGE;
  const answer = useQuery(api.profiles.directory, args ? { ...args, limit } : "skip");

  // The last answer, while the next one loads. Another community starts clean.
  const community = args?.communitySlug ?? "";
  const last = useRef<{ community: string; answer: DirectoryAnswer } | null>(null);
  if (answer !== undefined) last.current = { community, answer };
  const page = answer ?? (args && last.current?.community === community ? last.current.answer : undefined);

  const loadMore = useCallback(() => setPaging({ key, limit: limit + DIRECTORY_PAGE }), [key, limit]);
  const end = useMemo(() => directoryEnd(page), [page]);

  return {
    people: page?.people,
    total: page?.total,
    end,
    loadMore,
    loading: !!args && answer === undefined,
  };
}
