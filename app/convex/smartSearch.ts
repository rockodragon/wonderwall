// Smart search's meaning half (convex/searchRules.ts says how the two halves
// merge). The app calls `rank` with what someone typed, once the search box
// settles; it embeds the search, asks the vector index for the closest
// profiles or projects, and returns their ids with scores, closest first,
// above the relevance floor (relevantHits). The score window is applied
// later, by the list, among the hits it can actually show (rankByQuery).
//
// It returns ids only. The list the caller shows still decides who and what
// may appear (the directory query, listProjects), and the ids only order and
// admit from it: a project here is also checked to be listed and visible to
// the caller, so an id never names something they couldn't open.
//
// Signed-in people only: each search is an OpenAI call. A visitor's search,
// a search under MIN_MEANING_QUERY letters, or one over SEARCHES_PER_MINUTE
// returns [], and the search is names only (rankByQuery). A failed embedding
// call throws "search_unavailable", so the page doesn't remember [] as the
// answer and tries again the next time the search is typed.

import { v } from "convex/values";
import { action, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { currentUserId } from "./helpers";
import { fail } from "./errors";
import { generateEmbedding } from "./embeddings";
import { isListedProject } from "./moderationRules";
import { projectVisibleTo } from "./garden/projectVisibility";
import {
  SEARCHES_PER_MINUTE,
  SEARCH_MODEL,
  VECTOR_CANDIDATES,
  meaningQuery,
  relevantHits,
  type SearchHit,
} from "./searchRules";

const kindValidator = v.union(v.literal("people"), v.literal("projects"));
export type SearchKind = "people" | "projects";

/** The embeddings.entityType each search reads. */
const ENTITY: Record<SearchKind, string> = { people: "profile", projects: "project" };

export const rank = action({
  args: { kind: kindValidator, query: v.string() },
  handler: async (ctx, args): Promise<SearchHit[]> => {
    if (!(await currentUserId(ctx))) return [];
    const q = meaningQuery(args.query);
    if (!q) return [];
    // Over the per-minute limit: names only, no error.
    if (!(await ctx.runMutation(internal.smartSearch.takeSearchSlot, {}))) return [];
    let vector: number[];
    try {
      vector = await generateEmbedding(q);
    } catch (err) {
      // The provider's text never reaches the page. Throwing (not []) keeps
      // the page from remembering a failure as the answer.
      console.error("smartSearch.rank: embedding failed:", err instanceof Error ? err.message : String(err));
      return fail("search_unavailable", "Search by meaning is unavailable right now.");
    }
    const entityType = ENTITY[args.kind];
    const results = await ctx.vectorSearch("embeddings", "by_vector", {
      vector,
      limit: VECTOR_CANDIDATES,
      filter: (f) => f.eq("entityType", entityType),
    });
    const hits: SearchHit[] = await ctx.runQuery(internal.smartSearch.resolveHits, {
      kind: args.kind,
      results: results.map((r) => ({ _id: r._id, _score: r._score })),
    });
    return relevantHits(args.kind, hits);
  },
});

/** Takes one of the caller's SEARCHES_PER_MINUTE slots: false when they have
 * used them all in the last minute. Runs as the caller (rank's auth). Rows
 * older than a minute are deleted here, so the table stays a minute long. */
export const takeSearchSlot = internalMutation({
  args: {},
  handler: async (ctx): Promise<boolean> => {
    const userId = await currentUserId(ctx);
    if (!userId) return false;
    const now = Date.now();
    const rows = await ctx.db
      .query("searchCalls")
      .withIndex("by_userId_at", (q) => q.eq("userId", userId))
      .collect();
    let recent = 0;
    for (const row of rows) {
      if (row.at <= now - 60_000) await ctx.db.delete(row._id);
      else recent += 1;
    }
    if (recent >= SEARCHES_PER_MINUTE) return false;
    await ctx.db.insert("searchCalls", { userId, at: now });
    return true;
  },
});

/** The vector hits as entity ids with their scores: only vectors from the
 * current model, only things that still exist, and, for projects, only
 * listed ones the caller may see. Runs as the caller (rank's auth). */
export const resolveHits = internalQuery({
  args: {
    kind: kindValidator,
    results: v.array(v.object({ _id: v.id("embeddings"), _score: v.number() })),
  },
  handler: async (ctx, args) => {
    const viewerId = await currentUserId(ctx);
    const out: { id: string; score: number }[] = [];
    for (const r of args.results) {
      const row = await ctx.db.get(r._id);
      if (!row || row.model !== SEARCH_MODEL) continue;
      if (args.kind === "projects") {
        const id = ctx.db.normalizeId("projects", row.entityId);
        const project = id ? await ctx.db.get(id) : null;
        if (!project || !isListedProject(project) || !(await projectVisibleTo(ctx, project, viewerId))) continue;
      } else {
        const id = ctx.db.normalizeId("profiles", row.entityId);
        if (!id || !(await ctx.db.get(id))) continue;
      }
      out.push({ id: row.entityId, score: r._score });
    }
    return out;
  },
});
