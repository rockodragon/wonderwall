// A tab bar and its panels, built to the WAI-ARIA tabs pattern: a tablist of
// tabs that say which panel they control, one tab in the page's tab order at
// a time, and Left / Right / Home / End to move between them. The look is the
// event page's (routes/event.tsx): a hairline under the row, a 2px line under
// the chosen tab, the row scrolling sideways on a narrow screen.
//
// The panels stay mounted and hidden when they aren't chosen, so a form
// half-written in one tab is still there when you come back to it. The
// parent holds which tab is chosen (the project page keeps it in ?tab=).

import { useRef, type KeyboardEvent, type ReactNode } from "react";

export type TabDef<Id extends string = string> = { id: Id; label: ReactNode };

export const tabButtonId = (base: string, id: string) => `${base}-tab-${id}`;
export const tabPanelId = (base: string, id: string) => `${base}-panel-${id}`;

/** The tab to land on for an arrow, Home or End key from tab `at`; null for any other key. */
export function nextTabIndex(key: string, at: number, count: number): number | null {
  if (count <= 0) return null;
  switch (key) {
    case "ArrowRight":
      return (at + 1) % count;
    case "ArrowLeft":
      return (at - 1 + count) % count;
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return null;
  }
}

export function Tabs<Id extends string>({
  tabs,
  selected,
  onSelect,
  label,
  base,
  id,
}: {
  tabs: readonly TabDef<Id>[];
  selected: Id;
  onSelect: (id: Id) => void;
  /** What the tabs are, for a screen reader: "Project sections". */
  label: string;
  /** Prefix for the ids that tie each tab to its panel; unique on the page. */
  base: string;
  /** An id for the row itself, so something can scroll to it. */
  id?: string;
}) {
  const buttons = useRef(new Map<string, HTMLButtonElement>());

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>, at: number) {
    const to = nextTabIndex(e.key, at, tabs.length);
    if (to === null) return;
    e.preventDefault();
    const next = tabs[to];
    onSelect(next.id);
    buttons.current.get(next.id)?.focus();
  }

  return (
    <div
      id={id}
      role="tablist"
      aria-label={label}
      className="flex gap-1 overflow-x-auto mb-6"
      // The hairline is a shadow inside the row, not a border around it: a tab's
      // 2px line sits on top of it, and nothing pokes past the row's edge, which
      // is what made a scrollbar appear in a row that scrolls sideways.
      style={{ boxShadow: "inset 0 -1px 0 var(--garden-hairline)" }}
    >
      {tabs.map((t, i) => {
        const on = t.id === selected;
        return (
          <button
            key={t.id}
            ref={(el) => {
              if (el) buttons.current.set(t.id, el);
              else buttons.current.delete(t.id);
            }}
            type="button"
            role="tab"
            id={tabButtonId(base, t.id)}
            aria-selected={on}
            aria-controls={tabPanelId(base, t.id)}
            tabIndex={on ? 0 : -1}
            onClick={() => onSelect(t.id)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className="shrink-0 whitespace-nowrap px-3 py-2.5 text-[15px] font-medium border-b-2 transition-colors hover:text-[var(--garden-paper)] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--garden-citron)]"
            style={{
              borderColor: on ? "var(--garden-citron)" : "transparent",
              color: on ? "var(--garden-paper)" : "var(--garden-muted)",
            }}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

export function TabPanel({
  base,
  id,
  selected,
  children,
}: {
  base: string;
  id: string;
  selected: boolean;
  children: ReactNode;
}) {
  return (
    <div role="tabpanel" id={tabPanelId(base, id)} aria-labelledby={tabButtonId(base, id)} hidden={!selected}>
      {children}
    </div>
  );
}
