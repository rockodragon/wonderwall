import type { QueryCtx } from "../_generated/server";

/** Shared raw settings lookup for scheduled loops and operator previews. */
export async function getLoopRow(ctx: Pick<QueryCtx, "db">, key: string) {
  return ctx.db.query("engagementLoops").withIndex("by_key", (q) => q.eq("key", key)).first();
}
