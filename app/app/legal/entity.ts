/**
 * The single source of truth for who, legally, is behind creatives.exchange.
 *
 * The Terms of Service and Privacy Policy both read from here rather than
 * hardcoding the company name, so a rename or an entity change is one edit
 * instead of a hunt through prose.
 *
 * ---
 * BEFORE THESE PAGES GO LIVE, three values below need a human answer. They are
 * marked `NEEDS_COUNSEL` rather than guessed, because a wrong governing-law
 * clause or a missing notice address is worse than an obviously blank one —
 * a placeholder gets fixed, a plausible-looking wrong answer ships.
 *
 * See docs/entity-structure-research.md: as of 2026-08-30 the entity shape
 * (for-profit vs. foundation, and what Deeplight's relationship to the grant
 * pool is) was still an open question for the attorney. These documents state
 * Deeplight as owner and operator because that is the decision handed down;
 * they do not resolve the charitable-arm question, and §15 of the Terms
 * deliberately says nothing about tax-deductibility.
 */

const NEEDS_COUNSEL = {
  /** Full registered name incl. suffix — "Deeplight LLC"? "Deeplight, Inc."? */
  legalName: "Deeplight",
  /** Notice address. Required for a usable privacy contact under CCPA/GDPR. */
  mailingAddress: "[MAILING ADDRESS — pending]",
  /** Governing law and venue for disputes. */
  jurisdiction: "[STATE/COUNTRY — pending]",
} as const;

export const LEGAL_ENTITY = {
  /** How the company is referred to in running prose. */
  company: "Deeplight",
  legalName: NEEDS_COUNSEL.legalName,
  mailingAddress: NEEDS_COUNSEL.mailingAddress,
  jurisdiction: NEEDS_COUNSEL.jurisdiction,

  /** The product. Lowercase everywhere in the UI — see routes/faq.tsx. */
  product: "creatives.exchange",
  /** What members call it conversationally, used after first mention. */
  shortName: "The Exchange",

  /** Matches the contact address the FAQ already publishes (routes/faq.tsx). */
  contactEmail: "hello@creatives.exchange",
  privacyEmail: "hello@creatives.exchange",

  /** Bump both when either document changes materially. */
  termsEffective: "September 1, 2026",
  privacyEffective: "September 1, 2026",
} as const;

/** The ownership line. One string, so it reads identically everywhere. */
export const OWNERSHIP_LINE = `${LEGAL_ENTITY.product} is owned and operated by ${LEGAL_ENTITY.company}.`;
