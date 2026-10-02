/** Up to two letters for an avatar with no picture: first and last word
 *  ("Rick Moy" → "RM"), or the first two letters of a single name. "·"
 *  when there's no name yet. */
export function initialsOf(name: string | null | undefined): string {
  if (!name) return "·";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : (parts[0] ?? "").slice(0, 2);
  return letters.toUpperCase() || "·";
}
