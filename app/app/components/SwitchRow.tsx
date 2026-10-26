// An on/off line: the label, and a switch at the end. The whole line is
// the button, so a phone can tap anywhere on it. Settings (search engines)
// and the event form's Options step.

export function SwitchRow({
  label,
  on,
  onChange,
  className = "",
}: {
  label: string;
  on: boolean;
  onChange: (on: boolean) => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className={`w-full flex items-center justify-between gap-3 text-left ${className}`}
    >
      <span className="text-[15px]" style={{ color: "var(--app-text)" }}>
        {label}
      </span>
      <span
        aria-hidden="true"
        className="relative flex-shrink-0 w-11 h-6 rounded-full transition-colors"
        style={{ backgroundColor: on ? "var(--app-accent)" : "var(--app-hairline-raised)" }}
      >
        <span
          className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full transition-transform"
          style={{
            backgroundColor: on ? "var(--garden-ink)" : "var(--app-text)",
            transform: on ? "translateX(20px)" : "translateX(0)",
          }}
        />
      </span>
    </button>
  );
}
