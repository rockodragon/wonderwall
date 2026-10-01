import type { ReactNode } from "react";
import { ChevronDownIcon, FilterIcon } from "./icons";
import type { TagFilterOption } from "./TagFilterPills";

/**
 * "All" / "<the one active label>" / "<n> filters" — the count-on-button
 * wording /search (People) established for its filter button. Projects and
 * Events reuse the exact same wording so all three read the same way.
 */
export function filterButtonLabel(options: TagFilterOption[], active: string[]): string {
  if (active.length === 0) return "All";
  if (active.length === 1) {
    return options.find((o) => o.value === active[0])?.label || "1 filter";
  }
  return `${active.length} filters`;
}

interface FilterButtonProps {
  open: boolean;
  onClick: () => void;
  label: string;
  active: boolean;
  className?: string;
}

/**
 * The one button that opens a filter panel on demand — /search (People)
 * originated this affordance to keep a long tag/interest list from
 * cluttering the page; /projects and /events now share it instead of each
 * showing their own full pill row inline. Shows a count/label only, never
 * the underlying options — those live in the FilterPanel this opens.
 */
export function FilterButton({ open, onClick, label, active, className = "" }: FilterButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-3 rounded-xl border transition-colors shrink-0 ${className}`}
      style={
        active
          ? {
              borderColor: "var(--app-accent)",
              backgroundColor: "var(--app-accent-wash)",
              color: "var(--app-accent-ink)",
            }
          : {
              borderColor: "var(--app-hairline)",
              backgroundColor: "var(--app-surface-raised)",
              color: "var(--app-text)",
            }
      }
    >
      <FilterIcon className="w-4 h-4" />
      <span className="text-[13.5px] font-medium hidden sm:inline">{label}</span>
      <ChevronDownIcon className={`w-4 h-4 transition-transform ${open ? "rotate-180" : ""}`} />
    </button>
  );
}

/**
 * The panel a FilterButton opens — a bordered box the caller places
 * wherever it belongs relative to other filter rows on the page. Usually
 * wraps a TagFilterPills, but takes any children so a page can put more
 * than one filter group behind the same button.
 */
export function FilterPanel({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`mb-6 p-4 border rounded-xl ${className}`}
      style={{ backgroundColor: "var(--app-surface-raised)", borderColor: "var(--app-hairline)" }}
    >
      {children}
    </div>
  );
}
