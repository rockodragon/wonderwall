// Which brand the site wears (docs/features/garden-brand-domains.md).
//
// The Garden's own domains wear The Garden's brand: its disc in the
// top-left, its favicon and home-screen icons, "The Garden" in Jost. Every
// other host (thecreative.exchange, previews, localhost) stays
// TheCreative.exchange. Accounts are the same everywhere; only the chrome
// changes.
//
// The brand is decided once, before the page paints, by BRAND_BOOT (an
// inline script in root.tsx's <head>): it sets <html data-brand> and, on a
// Garden page, the icons and the Jost stylesheet. CSS keyed on data-brand
// swaps what prerendered pages show; components that render only in the
// browser read useBrand(). Never read the hostname during render: the
// prerendered HTML was built without one, and a mismatch is React #418.
//
// The hosts here are the paint-time copy of hostOrgs.domains for
// the-garden (convex/garden/communityDomains.ts), which tags waitlist and
// signup. Change one, change both.

import { useSyncExternalStore } from "react";
import type { BrandId } from "./brandConfig";

export * from "./brandConfig";

/** The brand BRAND_BOOT settled on. "exchange" on the server and during
 *  hydration (the prerendered HTML's brand), the page's real one right after. */
export function useBrand(): BrandId {
  return useSyncExternalStore(subscribeNever, readBrand, () => "exchange");
}

function readBrand(): BrandId {
  return document.documentElement.dataset.brand === "garden" ? "garden" : "exchange";
}

// The brand is fixed for the life of the page; there is nothing to watch.
function subscribeNever() {
  return () => {};
}
