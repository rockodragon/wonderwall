// What the phone's Shortlist is built from, and what Today shares with it: a
// heading, a list of rows, and Needs you (docs/handoff/favorites-redesign/
// README.md, "Needs you on Today": "Phones: the same rows stack above the
// Updates"). Drawn on the app shell's --app-* tokens, so it follows light and
// dark, and every row is a link to the item's page. No overlay.

import { useState, type ReactNode } from "react";
import { Link } from "react-router";
import { cardIdOf, NEEDS_SHOWN, type ShortlistItem } from "./items";
import { itemHref } from "./href";
import { rowModel } from "./rowModel";
import { ShortlistRow } from "./ShortlistRow";
import type { NeedsYouItem } from "../../lib/shortlist/needsYou";
import { favoritesHref } from "../../lib/shortlist/url";

/** Mono, small, spaced: a section's heading. Needs you's is in the accent. */
export function Kicker({ hot = false, children }: { hot?: boolean; children: ReactNode }) {
  return (
    <h2
      className="mb-2 text-xs font-normal uppercase tracking-[0.16em]"
      style={{ fontFamily: "var(--garden-font-mono)", color: hot ? "var(--app-accent-ink)" : "var(--app-text-dim)" }}
    >
      {children}
    </h2>
  );
}

/** The ghost-text button or link under a list: "2 more →". */
export const MORE_CLASS = "inline-block min-h-11 py-3 text-sm font-medium hover:underline";
export const MORE_STYLE = { color: "var(--app-accent-ink)" } as const;

/** A list of rows, a hairline above the first and under each. `hot` is
 *  every row's, or the card ids of the ones that are (the overview's short
 *  list marks only those in Needs you). */
export function PhoneRows({
  items,
  hot = false,
  past = false,
  withArea = false,
  money,
}: {
  items: readonly ShortlistItem[];
  hot?: boolean | ReadonlySet<string>;
  /** In a folded group (Closed, Past). */
  past?: boolean;
  /** A list that mixes areas names each row's. */
  withArea?: boolean;
  money: (cents: number) => string;
}) {
  return (
    <ul data-shortlist-rows className="m-0 list-none border-t p-0" style={{ borderColor: "var(--app-hairline)" }}>
      {items.map((item) => {
        const id = cardIdOf(item);
        const row = rowModel(item, { hot: typeof hot === "boolean" ? hot : hot.has(id), withArea, past, money });
        return (
          <li key={id} className="border-b" style={{ borderColor: "var(--app-hairline)" }}>
            <ShortlistRow variant="phone" row={row} href={itemHref(item)} />
          </li>
        );
      })}
    </ul>
  );
}

/** Needs you's rows, NEEDS_SHOWN of them, then the rest: behind "N more →"
 *  here ("expand"), or on the Shortlist ("link", Today's). */
export function PhoneNeedsYou({
  needs,
  money,
  more,
}: {
  needs: readonly NeedsYouItem[];
  money: (cents: number) => string;
  more: "expand" | "link";
}) {
  const [all, setAll] = useState(false);
  if (needs.length === 0) return null;
  const rest = needs.length - NEEDS_SHOWN;
  const shown = more === "expand" && all ? needs : needs.slice(0, NEEDS_SHOWN);
  return (
    <section aria-label="Needs you">
      <Kicker hot>Needs you · {needs.length}</Kicker>
      <PhoneRows items={shown} hot withArea money={money} />
      {rest > 0 &&
        (more === "link" ? (
          <Link to={favoritesHref()} className={MORE_CLASS} style={MORE_STYLE}>
            {`${rest} more on your Shortlist →`}
          </Link>
        ) : (
          <button type="button" aria-expanded={all} onClick={() => setAll((v) => !v)} className={`${MORE_CLASS} border-0 bg-transparent px-0`} style={MORE_STYLE}>
            {all ? "Show fewer" : `${rest} more →`}
          </button>
        ))}
    </section>
  );
}
