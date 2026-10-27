// /promise — Our promise to creatives. Public, inside the app shell like
// /about: _app.tsx lists "/promise" in PUBLIC_EXACT_PATHS, so a visitor with
// no account reads it instead of landing on /login.
//
// The words are constants/promises.ts, and promises.test.ts pins each one to
// the code that keeps it. The same page serves both domains: the name and
// address come from shareSite (The Garden's on its domains). A link preview
// can't run this page, so functions/promise.ts writes its title and
// description into the HTML at the edge.

import { Link } from "react-router";
import { useBrand } from "../brand/brands";
import {
  PROMISE_HEADLINE_PARTS,
  PROMISE_NEXT,
  PROMISE_PAGE,
  PROMISE_TERMS_LINK,
  PROMISE_TERMS_NOTE,
  TERMS_PROMISES_HREF,
  creativePromises,
  promiseLede,
  type PromiseSite,
} from "../constants/promises";
import { PAGE_WIDTH } from "../lib/pageWidth";
import { displayLink, shareSite } from "../lib/profileShare";

export function meta() {
  return [
    { title: PROMISE_PAGE.title },
    { name: "description", content: PROMISE_PAGE.description },
    { property: "og:title", content: PROMISE_PAGE.title },
    { property: "og:description", content: PROMISE_PAGE.description },
  ];
}

/** A sentence a line, so no sentence breaks at any width; the last, "Get
 *  paid for it.", in the accent, as /about lights the end of its line. */
function Headline() {
  const last = PROMISE_HEADLINE_PARTS.length - 1;
  return (
    <h1
      className="text-[40px] leading-[1.06] sm:text-[52px] lg:text-[64px] sm:leading-[1.02] tracking-[-0.01em]"
      style={{ color: "var(--app-text)", fontFamily: "var(--garden-font-display)", fontWeight: 600 }}
    >
      {PROMISE_HEADLINE_PARTS.map((sentence, i) => (
        <span key={sentence} className="block" style={i === last ? { color: "var(--app-accent-ink)" } : undefined}>
          {i > 0 && " "}
          {sentence}
        </span>
      ))}
    </h1>
  );
}

/** The page for one site. The route reads which site from the domain. */
export function PromiseContent({ site }: { site: PromiseSite }) {
  const promises = creativePromises(site);
  return (
    <div className={`px-4 sm:px-8 pt-8 pb-16 sm:pt-16 sm:pb-24 ${PAGE_WIDTH.reading} mx-auto`}>
      <p
        className="uppercase text-xs tracking-[0.12em]"
        style={{ color: "var(--app-text-dim)", fontFamily: "var(--garden-font-mono)" }}
      >
        Our promise to creatives
      </p>
      <div className="mt-4">
        <Headline />
      </div>
      <p className="mt-5 text-[17px] sm:text-lg leading-relaxed" style={{ color: "var(--app-text-muted)" }}>
        {promiseLede(site)}
      </p>

      <ol className="mt-10 sm:mt-14 border-t" style={{ borderColor: "var(--app-hairline)" }}>
        {promises.map((p, i) => (
          <li
            key={p.id}
            className="grid grid-cols-[2.25rem_1fr] sm:grid-cols-[3.5rem_1fr] gap-x-2 py-6 sm:py-7 border-b"
            style={{ borderColor: "var(--app-hairline)" }}
          >
            <span
              aria-hidden="true"
              className="pt-[5px] text-[13px] tabular-nums"
              style={{ color: "var(--app-accent-ink)", fontFamily: "var(--garden-font-mono)" }}
            >
              {String(i + 1).padStart(2, "0")}
            </span>
            <div className="min-w-0">
              <h2
                className="text-[19px] sm:text-[22px] leading-snug"
                style={{ color: "var(--app-text)", fontFamily: "var(--garden-font-display)", fontWeight: 600 }}
              >
                {p.title}
              </h2>
              <p className="mt-2 text-base sm:text-[17px] leading-relaxed" style={{ color: "var(--app-text-muted)" }}>
                {p.body}
              </p>
            </div>
          </li>
        ))}
      </ol>

      <p className="mt-6 text-[15px] leading-relaxed" style={{ color: "var(--app-text-dim)" }}>
        {PROMISE_NEXT}
      </p>

      <div
        className="mt-10 rounded-xl px-5 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-6"
        style={{ backgroundColor: "var(--app-surface-raised)" }}
      >
        <p className="text-[15px]" style={{ color: "var(--app-text)" }}>
          {PROMISE_TERMS_NOTE}
        </p>
        <Link
          to={TERMS_PROMISES_HREF}
          className="text-[15px] font-medium whitespace-nowrap hover:underline underline-offset-4"
          style={{ color: "var(--app-accent-ink)" }}
        >
          {PROMISE_TERMS_LINK} →
        </Link>
      </div>
    </div>
  );
}

export default function PromisePage() {
  const site = shareSite(useBrand());
  return <PromiseContent site={{ name: site.name, domain: displayLink(site.origin) }} />;
}
