// A row of chips that never wraps: the ones that don't fit fold into a
// "More" menu. This decides which stay on the row. Pure, so it can be tested
// without a browser; the desk measures the widths.

/**
 * The indices of the chips that stay on the row, in order.
 *
 * - `widths[i]` is chip i's width in px.
 * - `available` is the room for the chips (and the More button, if any fold).
 * - `gap` sits between neighbours; `moreWidth` is the More button's width.
 * - `activeIndex` is the chip that is switched on; it never folds, so the row
 *   always shows which one is chosen. Pass -1 for none.
 *
 * If everything fits, nothing folds and the More button isn't needed.
 * Otherwise chips fill from the front, leaving room for the More button.
 */
export function visibleChips(
  widths: readonly number[],
  opts: { available: number; gap: number; moreWidth: number; activeIndex?: number },
): number[] {
  const { available, gap, moreWidth } = opts;
  const n = widths.length;
  const all = widths.reduce((sum, w) => sum + w, 0) + gap * Math.max(0, n - 1);
  if (all <= available) return widths.map((_, i) => i);

  const activeIndex = opts.activeIndex ?? -1;
  const keep = new Set<number>();
  let used = moreWidth;
  if (activeIndex >= 0 && activeIndex < n) {
    keep.add(activeIndex);
    used += gap + widths[activeIndex];
  }
  for (let i = 0; i < n; i++) {
    if (keep.has(i)) continue;
    const next = used + gap + widths[i];
    if (next > available) break;
    keep.add(i);
    used = next;
  }
  return [...keep].sort((a, b) => a - b);
}
