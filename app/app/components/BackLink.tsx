import { Link } from "react-router";
import { useBack } from "../lib/useBack";

/** A consistent way back that preserves browser history and has a safe fallback. */
export function BackLink({
  fallback,
  className = "",
}: {
  fallback: string;
  className?: string;
}) {
  const back = useBack(fallback);
  return (
    <Link
      {...back}
      className={`inline-flex items-center gap-1 text-sm font-medium text-[var(--app-text-muted)] underline-offset-4 hover:text-[var(--app-text)] hover:underline ${className}`}
    >
      <span aria-hidden>‹</span> Back
    </Link>
  );
}
