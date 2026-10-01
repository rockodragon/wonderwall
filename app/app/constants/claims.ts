// What we say about money — where the site's money sentences are defined.
//
// Twin of docs/marketing/claims.md, word for word. Every React page imports
// from here instead of writing its own version. Some surfaces CAN'T import
// this file — the static /about pages, the print flyers, and the server's
// SPLITS.duesSentence — so they carry hand copies. claims.md lists them, and
// claims.test.ts checks them: the server twin must match exactly, and the
// static files are scanned for the phrases we dropped. Before this file the same claim was hand-written on a dozen
// surfaces, and when the backing split changed (2026-09-18: the platform's
// 10% comes out of the backing) most of them kept promising "you keep all of
// it." claims.test.ts scans the site for the phrases we dropped so they
// can't come back.
//
// Rules (the full "never say" list is in the doc):
//   - no "you keep 100%" / "the backer covers our fee"
//   - nothing that sells money being public (ledgers, "in the open")
//   - no payout speed, no promise to a person, no claim we can't prove

/** Where a member's dues go — the one line a member ever hears about the
 * split (Rick, 2026-09-18). It replaced "$5 funds other creatives' projects ·
 * $5 runs the place": a fixed dollar figure breaks the day a membership isn't
 * $10. Server-side twin: SPLITS.duesSentence in convex/garden/capabilities.ts. */
const DUES_YOURS = "Half of your membership funds grants for other creatives.";
const DUES_EVERY = "Half of every membership funds grants for other creatives.";

export const CLAIMS = {
  whatItIs:
    "TheCreative.exchange is where creatives find paid work, get backed by people who believe in them, and apply for grants.",
  join: "Joining is free.",
  backing: "When someone backs you for $100, you get $90. The other $10 runs the platform.",
  backingShort: "You keep 90% of what a backer gives you.",
  processingFee: "Card processing is added on top of your backing.",
  classProcessingFee: "Card processing is added on top of the class price.",
  largeGift: "On the part of any gift over $1,000, we take 5%, not 10%.",
  payout: "For now we keep track of what you're owed and pay it out to you ourselves.",
  hostSplit: "Hosting is free. You keep 90% of what you sell.",
  membership:
    "Membership is $10 a month. It lets you apply to paid work, respond to gigs, and ask a grant fund to back your project.",
  dues: DUES_YOURS,
  duesEvery: DUES_EVERY,
  // Deliberately loose. The plan splits the other half between the community
  // and the platform (40/10); the code today sends all of it to the platform.
  // "Keeps this running" is true both ways and promises neither.
  duesOtherHalf: "The other half keeps this running.",
  /** Short labels under the two halves wherever the split is drawn as two cells. */
  duesCellFunds: "funds grants for other creatives",
  duesCellRest: "keeps this running",
  pool: `${DUES_EVERY} Members propose projects, and a review team decides.`,
  grantFund:
    "The Sophia Fund, The Garden's grant fund, is run by Abiding Practice, a 501(c)(3), so gifts to it are tax-deductible. About 87% of each gift is granted.",
  /** The Sophia Fund's open call (Rick, 2026-09-29). The amount itself is
   * computed on the page (fund.$slug.tsx NAMED_FUNDS seedCents). Proposing
   * takes a paid membership (capabilities.ts pool.propose). */
  sophiaSchedule: "The first grants go out in November, from projects submitted in October.",
  grantFundDeductible: "Abiding Practice is a 501(c)(3), so your gift is tax-deductible.",
  ticketFund:
    "Every ticket goes into the Sophia Fund, an artist grant fund that backs projects by creatives in the community. Creatives propose projects, and a review team decides.",
  patron: "Back a specific person or project. 90% goes to them. You can be named on the work, or stay anonymous.",
  coverage: "$10 a month covers one creative's membership. A covered membership is a full membership.",
  partner: "Post paid work with the pay stated up front, or offer your space. Creatives respond, and you pick.",
  theGarden:
    "The platform is open to any creative. The Garden is the Christian creative community on it, and it is where this started.",
  /** Member-directed giving (docs/features/member-directed-giving.md). The
   * dollar amount is never in a claim: the page computes it from the
   * member's own invoice. Server twins: GIVING_SENTENCES in
   * convex/garden/giving.ts, checked by claims.test.ts. */
  memberDirected: "Each month you choose who gets your monthly grant: a creative, a project, or the grant fund.",
  memberDirectedDefault: "If you don't pick within a week, it goes to the grant fund.",
  memberDirectedFull: "What you give goes to them in full.",
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
  /runs the place/i,
  /\$5 funds/i,
];
