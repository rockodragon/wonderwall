// An image's own width ÷ height, measured in the browser — nothing in the
// schema stores a picture's size, so loading it is the only way to know its
// shape. Resets to null (unknown) whenever the url changes, so a recycled
// card never briefly shows the previous image's ratio while the new one loads.

import { useEffect, useState } from "react";

export function useImageAspect(url: string | null | undefined): number | null {
  const [ratio, setRatio] = useState<number | null>(null);
  useEffect(() => {
    setRatio(null);
    if (!url) return;
    let cancelled = false;
    const img = new window.Image();
    img.onload = () => {
      if (!cancelled && img.naturalWidth && img.naturalHeight) {
        setRatio(img.naturalWidth / img.naturalHeight);
      }
    };
    img.src = url;
    return () => {
      cancelled = true;
    };
  }, [url]);
  return ratio;
}

/** A cover wider than 6:5 — an old landscape cover, or a flyer kept whole —
 *  reads as a banner above the title, not a poster beside it
 *  (docs/features/cover-4x5.md). Unknown (still loading) counts as a poster. */
export function isWideCover(ratio: number | null): boolean {
  return ratio !== null && ratio > 1.2;
}
