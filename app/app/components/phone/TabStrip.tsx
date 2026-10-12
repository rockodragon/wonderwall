// Tabs that switch what a page shows (Upcoming · Saved · Past on Events; All
// · Projects · Events · People on the Shortlist): equal columns across the
// screen, the open one underlined in the accent, a count after a label where
// there is one, and a dot before it where something needs you. An item is a
// link when the tabs are places (the Shortlist's areas have URLs) and a
// button when they are views of one page (Events' ?tab=).
//
// Not components/project/Tabs.tsx: those are WAI-ARIA tabs over panels that
// stay mounted on one page, with the keyboard pattern that implies. These are
// navigation, so a link is a link and the open one is aria-current.

import { Link } from "react-router";
import { PHONE_BLEED } from "./PageTop";

export type TabStripItem = {
  key: string;
  label: string;
  count?: number;
  /** Something in here needs you. */
  dot?: boolean;
  ariaLabel?: string;
} & ({ to: string; onClick?: undefined } | { onClick: () => void; to?: undefined });

const ITEM =
  "inline-flex min-w-0 flex-1 cursor-pointer items-center justify-center border-0 border-b-2 border-solid bg-transparent py-2.5 font-medium leading-tight no-underline transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--app-accent-ink)]";
/** Three across sit at 15px; four or more a size down with tighter gaps. */
const ROOMY = "gap-1.5 px-1 text-[15px]";
const TIGHT = "gap-1 px-0.5 text-[14px]";

function itemStyle(on: boolean) {
  return {
    borderColor: on ? "var(--app-accent)" : "transparent",
    color: on ? "var(--app-text)" : "var(--app-text-dim)",
  };
}

export function TabStrip({
  items,
  active,
  label,
  className = "",
}: {
  items: readonly TabStripItem[];
  active: string;
  /** What the tabs choose between, for a screen reader: "Which events". */
  label: string;
  className?: string;
}) {
  return (
    <nav
      aria-label={label}
      className={`${PHONE_BLEED} flex ${className}`}
      // A shadow inside the row, not a border: the open tab's 2px line sits on it.
      style={{ boxShadow: "inset 0 -1px 0 var(--app-hairline)" }}
    >
      {items.map((item) => (
        <TabStripLink key={item.key} item={item} on={item.key === active} fit={items.length >= 4 ? TIGHT : ROOMY} />
      ))}
    </nav>
  );
}

function TabStripLink({ item, on, fit }: { item: TabStripItem; on: boolean; fit: string }) {
  const inside = (
    <>
      {item.dot && (
        <span aria-hidden className="h-[7px] w-[7px] shrink-0 rounded-full" style={{ background: "var(--app-accent-ink)" }} />
      )}
      <span className="truncate">{item.label}</span>
      {item.count !== undefined && (
        <span className="text-xs" style={{ fontFamily: "var(--garden-font-mono)", color: on ? "var(--app-text-muted)" : "var(--app-text-dim)" }}>
          {item.count}
        </span>
      )}
    </>
  );
  if (item.to !== undefined) {
    return (
      <Link to={item.to} aria-current={on ? "page" : undefined} aria-label={item.ariaLabel} className={`${ITEM} ${fit}`} style={itemStyle(on)}>
        {inside}
      </Link>
    );
  }
  return (
    <button type="button" onClick={item.onClick} aria-pressed={on} aria-label={item.ariaLabel} className={`${ITEM} ${fit}`} style={itemStyle(on)}>
      {inside}
    </button>
  );
}
