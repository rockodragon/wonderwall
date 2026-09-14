interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

/**
 * Shared free-text search box. Used by /search (People) and /events so
 * both pages have the same placeholder styling, icon, and clear-button
 * behavior instead of two near-identical hand-rolled inputs.
 */
export function SearchInput({
  value,
  onChange,
  placeholder,
  className = "",
}: SearchInputProps) {
  return (
    <div className={`relative ${className}`}>
      <div
        className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none"
        style={{ color: "var(--app-text-dim)" }}
      >
        <svg
          className="w-5 h-5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
      </div>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full pl-12 pr-10 py-3 rounded-xl border outline-none transition-shadow"
        style={{
          borderColor: "var(--app-hairline)",
          backgroundColor: "var(--app-surface-raised)",
          color: "var(--app-text)",
          boxShadow: "0 0 0 0 transparent",
        }}
        onFocus={(e) => {
          e.currentTarget.style.boxShadow = "0 0 0 2px var(--app-accent)";
        }}
        onBlur={(e) => {
          e.currentTarget.style.boxShadow = "0 0 0 0 transparent";
        }}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Clear search"
          className="absolute inset-y-0 right-0 pr-4 flex items-center transition-colors"
          style={{ color: "var(--app-text-dim)" }}
        >
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      )}
    </div>
  );
}
