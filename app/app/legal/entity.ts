/**
 * The single source of truth for who, legally, is behind creatives.exchange.
 *
 * The Terms of Service and Privacy Policy both read from here rather than
 * hardcoding the company name, so a rename or an entity change is one edit
 * instead of a hunt through prose.
 *
 * Values below are taken from DeepLight's own published legal pages for its
 * other product, UpSight (getupsight.com/terms and /privacy), so the two
 * products state the same company, the same governing law, and the same
 * contact convention:
 *
 *   - "DeepLight" is the company's own spelling, capital L. Its Terms §8.2
 *     names "DeepLight" and its logos as trademarks, so this is the mark,
 *     not a stylization to normalize away.
 *   - Delaware is the governing law and venue in UpSight's Terms §14.2–14.3.
 *   - The Contact section there lists an email address and no postal address,
 *     so this one does the same rather than inventing a notice address.
 *
 * See docs/entity-structure-research.md: as of 2026-08-30 the entity shape
 * (for-profit vs. foundation, and DeepLight's relationship to the grant pool)
 * was still an open question for the attorney. These documents state DeepLight
 * as owner and operator because that is the decision handed down; they do not
 * resolve the charitable-arm question, and the Terms deliberately say nothing
 * about tax-deductibility.
 */

export const LEGAL_ENTITY = {
  /** The company's own spelling — capital L. A trademark, per UpSight ToS §8.2. */
  company: "DeepLight",

  /** The product. Lowercase everywhere in the UI — see routes/faq.tsx. */
  product: "creatives.exchange",
  /** What members call it conversationally, used after first mention. */
  shortName: "The Exchange",

  /** Governing law and venue, matching DeepLight's other product. */
  jurisdiction: "the State of Delaware, United States",
  courts: "the federal or state courts located in Delaware",

  /** Matches the contact address the FAQ already publishes (routes/faq.tsx). */
  contactEmail: "hello@creatives.exchange",
  privacyEmail: "hello@creatives.exchange",

  /** Bump both when either document changes materially. */
  termsUpdated: "September 2026",
  termsEffective: "September 1, 2026",
  privacyUpdated: "September 2026",
  privacyEffective: "September 1, 2026",

  /** Footer line, matching "© 2025 DeepLight. All rights reserved." on UpSight. */
  copyrightYear: "2026",
} as const;

/** The ownership line. One string, so it reads identically everywhere. */
export const OWNERSHIP_LINE = `${LEGAL_ENTITY.product} is owned and operated by ${LEGAL_ENTITY.company}.`;
