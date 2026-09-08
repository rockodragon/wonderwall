import { INTERESTS } from "../constants/interests";

// Grouping rule for the Following page (docs/features/following.md §1 row 4).
// Pure so it can be unit-tested without rendering.
//
// A short list reads fine flat; only at `threshold` or more follows do
// groups earn their headings. Groups follow INTERESTS order, not
// alphabetical, so the page matches the order people picked from during
// onboarding. Someone with no interests — or a first interest that is no
// longer in INTERESTS — lands in "Other", the same bucket as the real
// interest "Other" (accepted in the spec).
export function groupFollows<
  T extends { favoritedAt: number; profile: { interests: string[] } },
>(
  items: T[],
  threshold = 6,
): { grouped: boolean; groups: { label: string; items: T[] }[] } {
  // Most recently followed first, in both the flat and grouped shapes.
  const sorted = [...items].sort((a, b) => b.favoritedAt - a.favoritedAt);

  if (sorted.length < threshold) {
    return { grouped: false, groups: [{ label: "", items: sorted }] };
  }

  const known: readonly string[] = INTERESTS;
  const byLabel = new Map<string, T[]>();
  for (const item of sorted) {
    const first = item.profile.interests[0];
    const label = first && known.includes(first) ? first : "Other";
    const bucket = byLabel.get(label);
    if (bucket) bucket.push(item);
    else byLabel.set(label, [item]);
  }

  const groups = INTERESTS.filter((label) => byLabel.has(label)).map(
    (label) => ({ label, items: byLabel.get(label) as T[] }),
  );

  return { grouped: true, groups };
}
