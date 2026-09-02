import { Link } from "react-router";
import { LEGAL_ENTITY } from "../legal/entity";

export type LegalSection = {
  heading: string;
  /** Rendered as <p>, in order, under the heading. */
  paragraphs?: string[];
  /** Bulleted list after the paragraphs. */
  bullets?: string[];
  /** Paragraphs after the bullets — a lead-in to a second list, or a closing note. */
  trailing?: string[];
  /** A second bulleted list, after `trailing`. */
  trailingBullets?: string[];
};

/**
 * Shared chrome for the Terms and Privacy pages: card, numbered sections,
 * ownership footer. Both documents are plain data (see routes/legal.terms.tsx
 * and routes/legal.privacy.tsx) so the prose stays reviewable without reading
 * around JSX — counsel edits strings, not markup.
 *
 * Section numbers derive from array order and are never written into the
 * heading text, so inserting a clause renumbers the document for free.
 *
 * The "Last updated" / "Effective" pair sits at the END of the document,
 * below a rule, not under the heading — the reader wants the terms, and the
 * dates are what they check afterwards. There is deliberately no footer:
 * ownership is stated inside each document (Terms §1, Privacy §1, and both
 * Contact sections), so repeating it as page chrome was noise.
 */
function Paragraphs({ items }: { items: string[] }) {
  return (
    <>
      {items.map((text, i) => (
        <p
          key={i}
          className="mt-3 text-gray-700 dark:text-gray-300 leading-relaxed"
        >
          {text}
        </p>
      ))}
    </>
  );
}

function Bullets({ items }: { items: string[] }) {
  return (
    <ul className="mt-3 space-y-2 list-disc pl-5">
      {items.map((text, i) => (
        <li key={i} className="text-gray-700 dark:text-gray-300 leading-relaxed">
          {text}
        </li>
      ))}
    </ul>
  );
}

export function LegalDocument({
  title,
  lastUpdated,
  effectiveDate,
  sections,
}: {
  title: string;
  lastUpdated: string;
  effectiveDate: string;
  sections: LegalSection[];
}) {
  const isPrivacy = title.startsWith("Privacy");
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 px-4 py-10">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <Link
            to="/"
            className="text-xl font-bold text-gray-900 dark:text-white"
          >
            {LEGAL_ENTITY.product}
          </Link>
          <Link
            to={isPrivacy ? "/legal/terms" : "/legal/privacy"}
            className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
          >
            {isPrivacy ? "Terms of Service" : "Privacy Policy"}
          </Link>
        </div>

        <article className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-700 p-8 sm:p-10">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            {title}
          </h1>

          <div className="mt-8 space-y-10">
            {sections.map((section, i) => (
              <section key={section.heading}>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                  {i + 1}. {section.heading}
                </h2>
                {section.paragraphs && <Paragraphs items={section.paragraphs} />}
                {section.bullets && <Bullets items={section.bullets} />}
                {section.trailing && <Paragraphs items={section.trailing} />}
                {section.trailingBullets && (
                  <Bullets items={section.trailingBullets} />
                )}
              </section>
            ))}
          </div>

          <p className="mt-12 pt-6 border-t border-gray-200 dark:border-gray-700 text-sm text-gray-500 dark:text-gray-400">
            Last updated: {lastUpdated}
            <br />
            Effective date: {effectiveDate}
          </p>
        </article>
      </div>
    </div>
  );
}
