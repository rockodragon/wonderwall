// Convex's HTTP query API, for the edge. A Pages Function can't hold the
// WebSocket the app uses, so functions/* ask a public query over plain HTTP
// (POST /api/query) instead. Pure: the edge bundles it.
//
// functions/[handle].ts and functions/embed/[handle].ts read through this.
// functions/events/[id].ts, e/[slug].ts, j/[id].ts and _middleware.ts still
// carry their own copy of the same fetch and can move here.

/** Production's deployment, for a Function whose env has no CONVEX_URL. */
export const CONVEX_URL = "https://courteous-rabbit-750.convex.cloud";

/**
 * A public query's answer, or null when the query itself answers nothing.
 * Throws when Convex can't be reached, answers with an error, or takes longer
 * than `timeoutMs`, so a caller can tell "nobody" from "couldn't ask".
 */
export async function convexQuery<T>(
  convexUrl: string,
  path: string,
  args: Record<string, unknown>,
  timeoutMs = 3000,
): Promise<T | null> {
  const res = await fetch(`${convexUrl}/api/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, args, format: "json" }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`Convex answered ${res.status} for ${path}`);
  const data = (await res.json()) as { status?: string; value?: T | null };
  if (data?.status !== "success") throw new Error(`Convex couldn't answer ${path}`);
  return data.value ?? null;
}
