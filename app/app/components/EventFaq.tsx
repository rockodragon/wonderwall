// "Questions people ask" on an event page: the host's own list
// (convex/eventFaq.ts), edited in the event form. An answer can carry links
// as [text](/path) or [text](https://…).

import { Fragment, type ReactNode } from "react";
import { Link } from "react-router";

const LINK = /\[([^\]]+)\]\(((?:https:\/\/|\/)[^)\s]+)\)/g;

/** An answer as text and links. Only https:// and site-relative links turn
 *  into anchors; anything else stays as the words typed. */
export function FaqAnswer({ text, linkStyle }: { text: string; linkStyle?: React.CSSProperties }) {
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(LINK)) {
    const at = m.index ?? 0;
    if (at > last) out.push(text.slice(last, at));
    const [, label, href] = m;
    out.push(
      href.startsWith("/") ? (
        <Link key={at} to={href} className="underline underline-offset-2" style={linkStyle}>
          {label}
        </Link>
      ) : (
        <a key={at} href={href} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2" style={linkStyle}>
          {label}
        </a>
      ),
    );
    last = at + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return (
    <span className="whitespace-pre-wrap">
      {out.map((node, i) => (
        <Fragment key={i}>{node}</Fragment>
      ))}
    </span>
  );
}

export function EventFaq({ items }: { items: { q: string; a: string }[] }) {
  if (items.length === 0) return null;
  return (
    <section className="mt-8" aria-labelledby="event-faq-heading">
      <h3 id="event-faq-heading" className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
        Questions people ask
      </h3>
      <div className="grid gap-2">
        {items.map((item, i) => (
          <details
            key={i}
            className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 group"
          >
            <summary className="flex cursor-pointer list-none items-baseline justify-between gap-3 px-4 py-3 text-[15px] font-medium text-gray-900 dark:text-white [&::-webkit-details-marker]:hidden">
              {item.q}
              <span aria-hidden className="text-gray-500 group-open:hidden">+</span>
              <span aria-hidden className="hidden text-gray-500 group-open:inline">–</span>
            </summary>
            <p className="px-4 pb-4 text-[15px] leading-relaxed text-gray-700 dark:text-gray-300">
              <FaqAnswer text={item.a} />
            </p>
          </details>
        ))}
      </div>
    </section>
  );
}
