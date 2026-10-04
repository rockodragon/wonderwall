/** The words to show for a failed Tables call. A server refusal
 * (ConvexError) carries its reason on `data`; the message of anything else
 * is the next best thing. */
export function tableErrorMessage(cause: unknown, fallback: string): string {
  const data = (cause as { data?: unknown } | null)?.data;
  if (data && typeof data === "object" && "reason" in data)
    return String((data as { reason: unknown }).reason);
  return cause instanceof Error && cause.message ? cause.message : fallback;
}
