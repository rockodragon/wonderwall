// The places /admin sends you, as a grid of cards: an icon, title and one
// line, the whole card is the link. Two columns from tablet width, three on
// desktop, one on a phone.

import type { Icon } from "@phosphor-icons/react";
import { Link } from "react-router";
import { admin } from "./adminStyles";

export type Destination = {
  to: string;
  title: string;
  blurb: string;
  /** What the tool is, at a glance (Rick, 2026-10-07). */
  icon: Icon;
};

export function DestinationCards({
  destinations,
}: {
  destinations: readonly Destination[];
}) {
  return (
    <nav aria-label="Admin sections">
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {destinations.map(({ icon: DestinationIcon, ...d }) => (
          <li key={d.to}>
            <Link to={d.to} className={admin.cardLink}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <span
                    aria-hidden="true"
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[color:var(--app-hairline-raised)] text-[color:var(--app-text-muted)] transition-colors group-hover:text-[color:var(--app-accent-ink)]"
                  >
                    <DestinationIcon className="h-[18px] w-[18px]" />
                  </span>
                  <h2 className={admin.h2}>{d.title}</h2>
                </div>
                <svg
                  aria-hidden="true"
                  className="mt-1 h-4 w-4 shrink-0 text-[color:var(--app-text-muted)] transition-transform group-hover:translate-x-0.5 group-hover:text-[color:var(--app-accent-ink)]"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </div>
              <p className={admin.body}>{d.blurb}</p>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
