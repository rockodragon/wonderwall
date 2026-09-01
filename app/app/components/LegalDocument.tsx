import { Link } from "react-router";
import { LEGAL_ENTITY, OWNERSHIP_LINE } from "../legal/entity";

export type LegalSection = {
  heading: string;
  /** Rendered as <p>, in order, under the heading. */
  paragraphs?: string[];
  /** Rendered as a bulleted list after the paragraphs. */
  bullets?: string[];
};

/**
 * Shared chrome for the Terms and Privacy pages: card, numbered sections,
 * ownership footer. Both documents are plain data (see routes/legal.terms.tsx
 * and routes/legal.privacy.tsx) so the prose stays reviewable without reading
 * around JSX — counsel edits strings, not markup.
 *
 * Section numbers are derived from array order, never written into the
 * heading text, so inserting a clause renumbers the document for free.
 */
export function LegalDocument({
  title,
  effectiveDate,
  intro,
  sections,
}: {
  title: string;
  effectiveDate: string;
  intro: string[];
  sections: LegalSection[];
}) {
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
            to={title.startsWith("Privacy") ? "/legal/terms" : "/legal/privacy"}
            className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
          >
            {title.startsWith("Privacy") ? "Terms of Service" : "Privacy Policy"}
          </Link>
        </div>

        <article className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-700 p-8 sm:p-10">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            {title}
          </h1>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            Effective {effectiveDate}
          </p>

          <div className="mt-6 space-y-4">
            {intro.map((text, i) => (
              <p
                key={i}
                className="text-gray-700 dark:text-gray-300 leading-relaxed"
              >
                {text}
              </p>
            ))}
          </div>

          <div className="mt-10 space-y-10">
            {sections.map((section, i) => (
              <section key={section.heading}>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                  {i + 1}. {section.heading}
                </h2>
                <div className="mt-3 space-y-4">
                  {section.paragraphs?.map((text, j) => (
                    <p
                      key={j}
                      className="text-gray-700 dark:text-gray-300 leading-relaxed"
                    >
                      {text}
                    </p>
                  ))}
                </div>
                {section.bullets && section.bullets.length > 0 && (
                  <ul className="mt-3 space-y-2 list-disc pl-5">
                    {section.bullets.map((text, j) => (
                      <li
                        key={j}
                        className="text-gray-700 dark:text-gray-300 leading-relaxed"
                      >
                        {text}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ))}
          </div>
        </article>

        <p className="text-center text-sm text-gray-500 dark:text-gray-400">
          {OWNERSHIP_LINE}
        </p>
      </div>
    </div>
  );
}
