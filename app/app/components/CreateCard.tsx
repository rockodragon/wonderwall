// The "make one" tile that sits first in a card grid — Projects ("Start a
// project", "Hire someone") and Events ("Host an event"). It is the same size
// and radius as the cards beside it (h-full stretches it to the row), drawn as
// a dashed outline so it reads as an empty slot rather than another item.
//
// Both pages are permanently dark and render on the fixed --garden-* tokens
// (events.tsx pins its --app-* aliases to them), so this needs no per-page
// colour prop. Text stays on --garden-body (≥9:1 on ink), never dimmer, and
// never with opacity; the dashed outline is a shape, not text, so it can sit
// at the hairline weight the neighbouring cards use.
export function CreateCard({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group h-full w-full min-h-[140px] sm:min-h-[220px] rounded-2xl border-2 border-dashed border-[color:var(--garden-hairline-raised)] hover:border-[color:var(--garden-citron)] focus-visible:border-[color:var(--garden-citron)] outline-none flex flex-col items-center justify-center gap-3 p-4 transition-colors"
    >
      <span
        className="w-14 h-14 rounded-full border-2 border-[color:var(--garden-dim)] text-[color:var(--garden-body)] group-hover:border-[color:var(--garden-citron)] group-hover:text-[color:var(--garden-citron)] group-focus-visible:border-[color:var(--garden-citron)] group-focus-visible:text-[color:var(--garden-citron)] flex items-center justify-center transition-colors"
        aria-hidden="true"
      >
        <svg
          className="w-7 h-7"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
        >
          <path d="M12 5v14M5 12h14" />
        </svg>
      </span>
      <span
        className="text-[15px] font-semibold text-center text-[color:var(--garden-body)] group-hover:text-[color:var(--garden-paper)] group-focus-visible:text-[color:var(--garden-paper)] transition-colors"
        style={{ fontFamily: "var(--garden-font-body)" }}
      >
        {label}
      </span>
    </button>
  );
}
