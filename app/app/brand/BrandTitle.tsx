// The tab's title on a Garden domain: "Sign In - TheCreative.exchange" reads
// "Sign In - The Garden". Route meta() stays one string for every host (it is
// prerendered without one); this rewrites the title after React sets it, on
// every navigation. Link previews get the same swap at the edge
// (functions/_middleware.ts), since crawlers don't run this.

import { useEffect } from "react";
import { gardenText, useBrand } from "./brands";

export function BrandTitle() {
  const brand = useBrand();
  useEffect(() => {
    if (brand !== "garden") return;
    const fix = () => {
      const next = gardenText(document.title);
      if (next !== document.title) document.title = next;
    };
    fix();
    // React Router replaces the <title>'s text on each navigation.
    const observer = new MutationObserver(fix);
    observer.observe(document.head, { subtree: true, childList: true, characterData: true });
    return () => observer.disconnect();
  }, [brand]);
  return null;
}
