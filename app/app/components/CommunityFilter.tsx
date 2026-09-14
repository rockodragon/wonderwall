// Shared "which community am I looking at" filter for the five browse pages
// (Projects, Events x2, Classes, Tables). Every browse row already carries
// `community: { name, slug } | null` — this is just the memory layer on top:
// a chip row plus a hook that resolves the selected community slug (or
// "all") from the URL, falling back to localStorage, falling back to "all".
//
// Two things are deliberately independent of each other:
//   - `selected` (what to filter rows by) always honors an explicit
//     `?community=<slug>` URL param, even for a community the signed-in
//     user doesn't belong to — that's what makes communities.$slug.tsx's
//     "Browse everything in {name}" links work for a non-member visitor.
//   - `communities` (what chips to render) is always scoped to the
//     signed-in user's own *active* memberships — a person can only
//     quick-switch between communities they're actually in.
// The "stale remembered value" rule below (falling back to "all" once a
// community is no longer active) only applies to the localStorage-sourced
// default, not to an explicit URL param — an explicit link should keep
// working regardless of membership.

import { useCallback, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

const STORAGE_KEY = "ce.community";
const PARAM = "community";
const ALL = "all";

export type CommunitySummary = {
  _id: string;
  name: string;
  slug: string;
  role: string;
  status: string;
  isHome: boolean;
};

function readStored(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStored(value: string) {
  try {
    if (value === ALL) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // Private window, cleared site data, storage disabled — filtering still
    // works for this session, it just won't be remembered next visit.
  }
}

/**
 * The selected community filter, remembered across visits.
 *
 * Priority: `?community=<slug>` URL param (when present it also becomes the
 * remembered value) > `localStorage["ce.community"]` > "all". A signed-out
 * user (or one with no active communities) gets an empty `communities` list
 * and resolves to "all" with no chips to show.
 */
export function useCommunityContext() {
  const [searchParams, setSearchParams] = useSearchParams();
  const communitiesRaw = useQuery(api.garden.communities.listMyCommunities);
  const loaded = communitiesRaw !== undefined;
  const communities = useMemo(
    () => (communitiesRaw ?? []).filter((c) => c.status === "active"),
    [communitiesRaw],
  );
  const activeSlugs = useMemo(() => new Set(communities.map((c) => c.slug)), [communities]);

  const urlValue = searchParams.get(PARAM);

  // The URL param is the ONLY live copy of "selected" — every page and the
  // sidebar CommunitySwitcher each call this hook independently, and
  // useSearchParams() is the one piece of state React Router keeps in sync
  // across all of them automatically. This hook used to also mirror the
  // value into a local useState (seeded from localStorage), which meant
  // every caller carried its own private copy: switching to "all" from one
  // page cleared that page's copy and the URL, but a sibling instance (most
  // visibly the sidebar switcher) kept its stale copy and kept showing the
  // old community. Seeding the URL from localStorage once, below, instead
  // of tracking it in component state, keeps there from being a second copy
  // to go stale.
  useEffect(() => {
    if (urlValue || !loaded) return;
    const stored = readStored();
    if (!stored || !activeSlugs.has(stored)) return;
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        params.set(PARAM, stored);
        return params;
      },
      { replace: true },
    );
  }, [urlValue, loaded, activeSlugs, setSearchParams]);

  useEffect(() => {
    if (urlValue) writeStored(urlValue);
  }, [urlValue]);

  const selected = urlValue || ALL;

  const setSelected = useCallback(
    (next: string) => {
      writeStored(next);
      setSearchParams(
        (prev) => {
          const params = new URLSearchParams(prev);
          if (next === ALL) params.delete(PARAM);
          else params.set(PARAM, next);
          return params;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  return { selected, setSelected, communities };
}

/**
 * Looks up a display name for `slug` — first among the user's own
 * communities (already loaded), else among any already-fetched rows that
 * happen to carry it (covers a deep link into a community the viewer isn't
 * a member of), else the slug itself as a last resort.
 */
export function communityNameFor(
  slug: string,
  communities: CommunitySummary[],
  rows?: readonly { community?: { name: string; slug: string } | null }[],
): string {
  const mine = communities.find((c) => c.slug === slug);
  if (mine) return mine.name;
  const fromRows = rows?.find((r) => r.community?.slug === slug)?.community?.name;
  return fromRows ?? slug;
}

/**
 * The quiet one-line replacement for the old chip row (community-ux.md §2/§6):
 * "In {name}. Show everything" — plain text + link, not a control (the
 * control is the sidebar CommunitySwitcher now). Renders nothing when
 * `selected === "all"`. `rows` is the page's already-fetched list, used as a
 * last-resort name lookup for a community the viewer isn't a member of (a
 * deep-linked `?community=` slug) — same fallback communityNameFor always had.
 */
export function CommunityContextLine({
  selected,
  setSelected,
  communities,
  rows,
  variant,
}: {
  selected: string;
  setSelected: (slug: string) => void;
  communities: CommunitySummary[];
  rows?: readonly { community?: { name: string; slug: string } | null }[];
  variant: "garden" | "app";
}) {
  if (selected === ALL) return null;
  const name = communityNameFor(selected, communities, rows);

  if (variant === "garden") {
    return (
      <p className="g-hint" style={{ marginBottom: 16 }}>
        In {name}.{" "}
        <button
          type="button"
          onClick={() => setSelected(ALL)}
          className="g-mono"
          style={{
            color: "var(--g-citron)",
            background: "none",
            border: "none",
            padding: 0,
            cursor: "pointer",
            textDecoration: "underline",
          }}
        >
          Show everything
        </button>
      </p>
    );
  }

  return (
    <p
      className="text-sm mb-6"
      style={{ color: "var(--garden-dim)", fontFamily: "var(--garden-font-body)" }}
    >
      In {name}.{" "}
      <button
        type="button"
        onClick={() => setSelected(ALL)}
        className="underline underline-offset-2 hover:opacity-80"
        style={{ color: "var(--garden-citron)" }}
      >
        Show everything
      </button>
    </p>
  );
}
