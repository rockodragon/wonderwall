// What we say about money — the ONE place the site's money sentences live.
//
// Twin of docs/marketing/claims.md, word for word. Pages import from here
// instead of writing their own version, so a number or a promise changes in
// one place. Before this file the same claim was hand-written on a dozen
// surfaces, and when the backing split changed (2026-09-18: the platform's
// 10% comes out of the backing) most of them kept promising "you keep all of
// it." claims.test.ts scans the site for the phrases we dropped so they
// can't come back.
//
// Rules (the full "never say" list is in the doc):
//   - no "you keep 100%" / "the backer covers our fee"
//   - nothing that sells money being public (ledgers, "in the open")
//   - no payout speed, no promise to a person, no claim we can't prove

export const CLAIMS = {
  whatItIs:
    "creatives.exchange is where creatives find paid work, get backed by people who believe in them, and apply for grants.",
  join: "Joining is free.",
  backing: "When someone backs you for $100, you get $90. The other $10 runs the platform.",
  backingShort: "You keep 90% of what a backer gives you.",
  largeGift: "On the part of any gift over $1,000, we take 5%, not 10%.",
  payout: "For now we keep track of what you're owed and pay it out to you ourselves.",
  hostSplit: "Hosting is free. You keep 90% of what you sell.",
  membership:
    "Membership is $10 a month. It lets you apply to paid work, respond to gigs, and ask a grant fund to back your project.",
  pool: "Half of every membership goes into a project pool. Members propose projects, and a review team decides.",
  grantFund:
    "The Garden's grant fund is run by Abiding Practice, a 501(c)(3), so gifts to it are tax-deductible. About 87% of each gift is granted.",
  patron: "Back a specific person or project. 90% goes to them. You can be named on the work, or stay anonymous.",
  coverage: "$10 a month covers one creative's membership. A covered membership is a full membership.",
  partner: "Post paid work with the pay stated up front, or offer your space. Creatives respond, and you pick.",
  theGarden:
    "The platform is open to any creative. The Garden is the Christian creative community on it, and it is where this started.",
} as const;

/** Phrases we dropped. claims.test.ts fails if any shows up in site source —
 * copy, comments and all — so the old promises can't drift back in. */
export const BANNED_PHRASES: RegExp[] = [
  /keeps? 100%/i,
  /keep all of it/i,
  /you get \$100/i,
  /covers? (our|the platform) fee/i,
  /public ledgers?/i,
  /in the open/i,
  /posted publicly/i,
  /every dollar (is|shows|on|in|reaches|that)/i,
  /see every dollar/i,
  /show the receipts/i,
  /free and stays free/i,
];
