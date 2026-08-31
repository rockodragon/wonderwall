export interface TagFilterOption {
  label: string;
  value: string;
}

interface TagFilterPillsProps {
  options: TagFilterOption[];
  active: string[];
  onToggle: (value: string) => void;
  onClear: () => void;
  className?: string;
}

/**
 * Shared multi-select tag-pill row. Used by /search (People, job-function
 * tags) and /events (dynamic tags derived from event data) so both pages
 * share one visual style and one toggle/clear interaction instead of
 * copy-pasted pill markup.
 */
export function TagFilterPills({
  options,
  active,
  onToggle,
  onClear,
  className = "",
}: TagFilterPillsProps) {
  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      {options.map((option) => {
        const isActive = active.includes(option.value);
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={isActive}
            onClick={() => onToggle(option.value)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              isActive
                ? "bg-blue-600 text-white"
                : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
            }`}
          >
            {option.label}
          </button>
        );
      })}
      {active.length > 0 && (
        <button
          type="button"
          onClick={onClear}
          className="text-sm underline text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
        >
          Clear
        </button>
      )}
    </div>
  );
}
