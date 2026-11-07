// Funds that carry their own name and a short note, keyed by the org's slug.
// Moved out of routes/fund.$slug.tsx so the fund page and the desk's fund card
// read one constant (docs/features/desktop-desk-palette.md).

import { CLAIMS } from "../constants/claims";
import { GARDEN_ORIGIN } from "../../convex/garden/brandHosts";

/** The Sophia Fund's host org (Abiding Practice). */
export const SOPHIA_FUND_SLUG = "abiding-practice";

export type NamedFund = {
  name: string;
  /** The fund's own name in its address: /fund/<pathName>, never the host
   *  org's slug (Rick, 2026-11-06: one address, favoring the fund's name). */
  pathName?: string;
  /** The fund's Stripe Payment Link when its org row has none
   *  (hostOrgs.paymentLinkUrl, set by garden/givingLinks:setGivingLinks, wins). */
  paymentLinkUrl?: string;
  /** One line under the name, as on the fund's own card. */
  tagline?: string;
  about: string;
  openCall?: string;
  seedCents?: number;
  /** The fund page's cover picture, shown whole, with its caption under it. */
  cover?: { src: string; alt: string; caption: string };
  /** The card a shared link to the fund page unfurls to (1200×675). */
  shareImage?: string;
};

export const NAMED_FUNDS: Record<string, NamedFund> = {
  [SOPHIA_FUND_SLUG]: {
    name: "The Sophia Grant Fund",
    pathName: "sophia",
    // AP's link for the fund (Rick, 2026-11-06). Its after-payment redirect is
    // set in AP's Stripe to /fund/sophia?gave=1.
    paymentLinkUrl: "https://buy.stripe.com/cNi7sL62k5U95sd6YU4Rq03",
    // From the fund's card (Rick, 2026-11-06): keep it on the page.
    tagline: "To honor artists of The True, The Good, and The Beautiful.",
    openCall: CLAIMS.sophiaSchedule,
    // Money the fund holds that isn't in this ledger (Rick, 2026-09-29).
    // Tickets and gifts recorded here add to it; grants made come off it.
    // If it's ever entered as a ledger row, remove it here or it counts twice.
    seedCents: 1_000_000,
    // Rick's words, 2026-11-06.
    about:
      "Named in honor of a young artist who lost her life in a tragic accident, but left behind a great spiritual and creative legacy. The Sophia Grant is awarded to artists whose work fosters deep connection between the human and the Divine. Creating space at the table for sinners and saints to meet with their Maker.",
    cover: {
      src: "/fund/sophia-icon.webp",
      alt: "An icon of Sophia: her portrait under a gold halo, in a gold oval ringed with blue circles, on white with teal flourishes.",
      caption: "The above icon was made in remembrance by her sister Nyla.",
    },
    shareImage: `${GARDEN_ORIGIN}/fund/sophia-share.jpg`,
  },
};

/** What a fund has to give, the way its page computes it: the seed it holds
 *  outside the ledger (named funds only) plus the ledger's balance. */
export function availableCents(slug: string, balanceCents: number): number {
  return (NAMED_FUNDS[slug]?.seedCents ?? 0) + balanceCents;
}

/** Where a fund's page lives: its own name for a named fund (/fund/sophia),
 *  else its org's slug. Every link to a fund page is written with this, on the
 *  page and in what the server sends (award notices, proposal notices). */
export function fundPath(orgSlug: string): string {
  return `/fund/${NAMED_FUNDS[orgSlug]?.pathName ?? orgSlug}`;
}

/** The org slug behind a fund address's last part: "sophia" is
 *  abiding-practice; anything else is already an org slug (and older links
 *  such as /fund/abiding-practice still resolve). */
export function fundOrgSlug(pathPart: string): string {
  const named = Object.entries(NAMED_FUNDS).find(([, f]) => f.pathName === pathPart);
  return named ? named[0] : pathPart;
}

/** A fund org's giving links with the named fund's own link filled in when
 *  the org row has none. */
export function namedFundLinks<T extends { slug: string; paymentLinkUrl?: string | null }>(
  org: T,
): T & { paymentLinkUrl?: string | null } {
  const fallback = NAMED_FUNDS[org.slug]?.paymentLinkUrl;
  return org.paymentLinkUrl || !fallback ? org : { ...org, paymentLinkUrl: fallback };
}
