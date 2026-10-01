// "Hire someone" is one entry with two shapes (docs/features/project-ia.md):
// a single job, or work on set dates (a gig series). To the poster the only
// difference is WHEN the work happens, so the two forms share this toggle at
// the top and hand the title/description across when it flips — nothing
// typed so far is lost by picking the other shape.

export type HireWhen = "job" | "dates";
export type HireDraft = { title: string; blurb: string };

const OPTIONS: { value: HireWhen; label: string }[] = [
  { value: "job", label: "One job" },
  { value: "dates", label: "On set dates" },
];

export function HireWhenToggle({
  value,
  onChange,
}: {
  value: HireWhen;
  onChange: (next: HireWhen) => void;
}) {
  return (
    <div className="mb-5">
      <div
        className="block text-xs uppercase tracking-[0.06em] mb-1.5"
        style={{ color: "var(--garden-dim)" }}
      >
        When is the work
      </div>
      <div role="radiogroup" aria-label="When is the work" className="flex flex-wrap gap-1.5">
        {OPTIONS.map((opt) => {
          const active = value === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => !active && onChange(opt.value)}
              className="px-3 py-1.5 rounded-full text-[13px] font-medium transition-colors"
              style={{
                fontFamily: "var(--garden-font-body)",
                backgroundColor: active ? "var(--garden-citron)" : "var(--garden-ink)",
                color: active ? "var(--garden-ink)" : "var(--garden-muted)",
                border: `1px solid ${active ? "var(--garden-citron)" : "var(--garden-hairline-raised)"}`,
              }}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
      <p className="text-xs mt-1.5" style={{ color: "var(--garden-dim)" }}>
        {value === "job"
          ? "One piece of work — you pick one person and they deliver it."
          : "The same slot on a schedule — every Friday, say. People mark the dates they can do; you pick who takes each one."}
      </p>
    </div>
  );
}
