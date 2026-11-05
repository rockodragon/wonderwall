// The smart-search rules the server and the app share (convex/searchRules.ts):
// name words, the ranked-ids merge, and which searches are worth a meaning
// lookup. Re-exported so the app's imports stay under app/lib.

export { MIN_MEANING_QUERY, matchesNameWords, meaningQuery, rankByQuery } from "../../convex/searchRules";
export type { SearchHit } from "../../convex/searchRules";
