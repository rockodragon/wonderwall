// Smart search for People and Projects (2026-11-04, Rick: "text-based is
// defunct"). Two halves, merged into one list:
//
//   1. Names, by their words. "hal mont" finds Haley Montgomery: every word
//      typed is the start of a word in a person's name or organization, or
//      a project's title or its maker's name. A name is the one thing a
//      search by meaning can't find reliably, so it stays a word match.
//   2. Meaning, for everything else. A profile's bio, role, disciplines,
//      place, organization and what they're wondering, and a project's
//      title, write-up, topics, roles, place and pieces, are each turned into
//      an embedding (convex/embeddings.ts) when they change. A search is
//      embedded the same way and the closest ones come back
//      (convex/smartSearch.ts rank), above a floor (relevantHits) and then,
//      once the list has filtered what can be shown, cut to the ones within
//      SCORE_WINDOW of the best of those (rankByQuery).
//
// Name hits come first, in the list's own order, then the meaning hits,
// closest first. Pure (no Convex imports): the directory query, the
// embedding writers and the app's filters all read it.

/** The embedding model every stored search vector and every search uses.
 * A stored vector from another model (ada-002, before 2026-11-04) is
 * ignored until the backfill re-embeds it: vectors from two models don't
 * compare. */
export const SEARCH_MODEL = "text-embedding-3-small";

/** Below this many letters a search is names only: "mu" has no meaning to
 * find, and every keystroke would be a call. */
export const MIN_MEANING_QUERY = 3;

/** The longest search that is embedded. */
export const MAX_QUERY = 200;

/** How many stored vectors a search asks for: Convex's vector-search maximum,
 * so a list narrowed to a community or a follow list still finds its own. */
export const VECTOR_CANDIDATES = 256;

/** How many searches by meaning one person may make a minute (smartSearch.rank). */
export const SEARCHES_PER_MINUTE = 60;

/** The cut. A hit counts when its cosine similarity is at least the kind's
 * floor (relevantHits), and is shown when it is within SCORE_WINDOW of the
 * best hit THE LIST CAN SHOW (rankByQuery), so a search with one clear
 * answer doesn't drag in everything vaguely near it, and a better match
 * outside the list (another community) doesn't push out the list's own. Calibrated
 * 2026-11-04 on text-embedding-3-small with the live site's 215 projects
 * and a page of people, 29 searches judged by hand: real matches score
 * 0.30–0.50 on projects and 0.23–0.44 on people (a profile is short, so it
 * scores lower); nonsense ("quantum physics", "cheap car insurance") tops
 * out at 0.25 and 0.18, under both floors. ±0.02; worth rerunning once
 * every profile is indexed. */
export const MIN_SCORE = { people: 0.23, projects: 0.28 } as const;
export const SCORE_WINDOW = 0.1;

/** Lowercase words, accents dropped: "Café-Noir!" → ["cafe", "noir"]. */
export function searchWords(text: string | null | undefined): string[] {
  return (text ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

/** True when every word of `query` starts a word in one of `fields`:
 * "hal mont" matches "Haley Montgomery DALL". An empty query matches
 * nothing; there is nothing to match. */
export function matchesNameWords(fields: readonly (string | null | undefined)[], query: string): boolean {
  const wanted = searchWords(query);
  if (wanted.length === 0) return false;
  const words = fields.flatMap((f) => searchWords(f));
  return wanted.every((w) => words.some((word) => word.startsWith(w)));
}

/** A vector hit: an entity id and its cosine similarity. */
export type SearchHit = { id: string; score: number };

/**
 * `items` searched by `query`: the name hits first, in the list's own
 * order, then the meaning hits that are in `items` (and aren't name hits),
 * closest first, cut to the ones within SCORE_WINDOW of the best of THOSE
 * hits, each once. `ranked` is the hits smartSearch.rank returned (already
 * above the floor); absent (signed out, a short search, or the call failed)
 * it is names only. Items not in the list are never added: `ranked` only
 * orders and admits what the caller may already show, and the window is
 * measured among what is shown, so call this AFTER the other filters.
 */
export function rankByQuery<T>(
  items: readonly T[],
  opts: {
    query: string;
    id: (item: T) => string;
    names: (item: T) => readonly (string | null | undefined)[];
    ranked?: readonly SearchHit[] | null;
  },
): T[] {
  const named: T[] = [];
  const rest = new Map<string, T>();
  for (const item of items) {
    if (matchesNameWords(opts.names(item), opts.query)) named.push(item);
    else rest.set(opts.id(item), item);
  }
  const present = [...(opts.ranked ?? [])].filter((h) => rest.has(h.id)).sort((a, b) => b.score - a.score);
  const floor = (present[0]?.score ?? 0) - SCORE_WINDOW;
  const meant: T[] = [];
  for (const hit of present) {
    if (hit.score < floor) break;
    const item = rest.get(hit.id);
    if (item === undefined) continue;
    meant.push(item);
    rest.delete(hit.id);
  }
  return [...named, ...meant];
}

/** The vector hits above the kind's floor (MIN_SCORE), closest first, each
 * id once. The window comes later, once the list has filtered (rankByQuery). */
export function relevantHits(kind: keyof typeof MIN_SCORE, hits: readonly SearchHit[]): SearchHit[] {
  const seen = new Set<string>();
  const out: SearchHit[] = [];
  for (const hit of [...hits].sort((a, b) => b.score - a.score)) {
    if (hit.score < MIN_SCORE[kind]) break;
    if (seen.has(hit.id)) continue;
    seen.add(hit.id);
    out.push(hit);
  }
  return out;
}

/** A search as it is embedded: trimmed, cut to MAX_QUERY. Null when it is
 * too short to mean anything (names only). */
export function meaningQuery(query: string | null | undefined): string | null {
  const q = (query ?? "").trim().slice(0, MAX_QUERY);
  return q.length >= MIN_MEANING_QUERY ? q : null;
}

const joinParts = (parts: readonly (string | null | undefined | false)[]) =>
  parts
    .map((p) => (typeof p === "string" ? p.trim() : ""))
    .filter(Boolean)
    .join("\n");

/** What a person's embedding is made of: what their profile says about
 * them and what they're wondering. Only what the public profile shows. */
export function profileSearchText(p: {
  name: string;
  primaryRole?: string | null;
  bio?: string | null;
  interests?: readonly string[] | null;
  location?: string | null;
  orgName?: string | null;
  wondering?: string | null;
}): string {
  return joinParts([
    p.name,
    p.primaryRole,
    p.bio,
    p.interests?.length ? `Disciplines: ${p.interests.join(", ")}` : null,
    p.location ? `Based in ${p.location}` : null,
    p.orgName ? `With ${p.orgName}` : null,
    p.wondering ? `Wondering: ${p.wondering}` : null,
  ]);
}

/** What a project's embedding is made of. `place` is the place as a
 * visitor sees it (placeForViewer), never a street address. `pieces` are
 * its pieces of work, title and note. */
export function projectSearchText(p: {
  title: string;
  blurb?: string | null;
  body?: string | null;
  topics?: readonly string[] | null;
  roles?: readonly string[] | null;
  place?: string | null;
  maker?: string | null;
  pieces?: readonly { title?: string | null; description?: string | null }[] | null;
}): string {
  return joinParts([
    p.title,
    p.maker ? `By ${p.maker}` : null,
    p.blurb,
    p.body,
    p.topics?.length ? `Topics: ${p.topics.join(", ")}` : null,
    p.roles?.length ? `Looking for: ${p.roles.join(", ")}` : null,
    p.place ? `In ${p.place}` : null,
    ...(p.pieces ?? []).map((piece) => joinParts([piece.title, piece.description]).replace(/\n/g, " — ")),
  ]).slice(0, 8000);
}

/** Whether a stored embedding still matches what it would be made of now:
 * the same text, from the current model. Saves a call per unchanged save. */
export function embeddingIsCurrent(stored: { content: string; model?: string } | null, content: string): boolean {
  return !!stored && stored.model === SEARCH_MODEL && stored.content === content;
}
