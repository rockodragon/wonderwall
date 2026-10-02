// Past Updates, on the Messages inbox (docs/features/desk-updates.md, "Later":
// a list so a member can find an Update they've already read). One row per
// Update: title, a line of the text, the date, and its button if it has one.
// Tapping the row opens it in place to the full text. Nothing here marks
// anything read, so looking back never changes the Update's numbers.
//
// Hooks stay above every return. The whole section is optional: it hides when
// there is nothing to show, and if the Updates can't be read (the backend not
// deployed yet) the inbox shows without it.

import { Component, useState, type ReactNode } from "react";
import { useQuery } from "convex/react";
import { Link } from "react-router";
import { api } from "../../convex/_generated/api";
import { actionTarget } from "../lib/updates";

/** Renders nothing if anything under it fails, so the inbox never goes down with it. */
class Quiet extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export function PastUpdates() {
  return (
    <Quiet>
      <Section />
    </Quiet>
  );
}

/** "Sep 28", or "Sep 28, 2025" when it isn't this year. */
function dateLabel(ms: number): string {
  const sameYear = new Date(ms).getFullYear() === new Date().getFullYear();
  return new Date(ms).toLocaleDateString(
    "en-US",
    sameYear ? { month: "short", day: "numeric" } : { month: "short", day: "numeric", year: "numeric" },
  );
}

const BUTTON =
  "inline-flex items-center rounded-lg border px-3 py-1.5 text-[13.5px] font-medium transition-colors hover:bg-[var(--app-hairline-raised)]";
const BUTTON_STYLE = { borderColor: "var(--app-hairline-raised)", color: "var(--app-text)" };

function Section() {
  const past = useQuery(api.updates.listPastMine);
  const [openId, setOpenId] = useState<string | null>(null);

  if (!past || past.length === 0) return null;

  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold mb-3" style={{ color: "var(--app-text)" }}>
        Updates
      </h2>
      <ul
        className="rounded-2xl border divide-y divide-[var(--app-hairline)] overflow-hidden"
        style={{ backgroundColor: "var(--app-surface-raised)", borderColor: "var(--app-hairline)" }}
      >
        {past.map((u) => {
          const open = openId === u._id;
          const when = u.archivedAt ?? u.endsAt;
          const target = u.actionLabel && u.actionUrl ? actionTarget(u.actionUrl) : null;
          return (
            <li key={u._id} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-start sm:gap-3">
              <button
                type="button"
                aria-expanded={open}
                onClick={() => setOpenId(open ? null : u._id)}
                className="block min-w-0 flex-1 rounded-md text-left focus-visible:outline-2 focus-visible:outline-[var(--app-accent)]"
              >
                <span className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-sm font-medium" style={{ color: "var(--app-text)" }}>
                    {u.title}
                  </span>
                  {when != null && (
                    <span className="shrink-0 text-xs" style={{ color: "var(--app-text-dim)" }}>
                      {dateLabel(when)}
                    </span>
                  )}
                </span>
                <span
                  className={`mt-0.5 block text-sm ${open ? "whitespace-pre-wrap break-words" : "truncate"}`}
                  style={{ color: "var(--app-text-muted)" }}
                >
                  {u.body}
                </span>
              </button>
              {target &&
                (target.kind === "app" ? (
                  <Link to={target.href} className={`${BUTTON} shrink-0 self-start`} style={BUTTON_STYLE}>
                    {u.actionLabel}
                  </Link>
                ) : (
                  <a
                    href={target.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`${BUTTON} shrink-0 self-start`}
                    style={BUTTON_STYLE}
                  >
                    {u.actionLabel}
                  </a>
                ))}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
