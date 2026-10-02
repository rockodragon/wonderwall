// The current Updates, stacked at the top of Today on a phone
// (docs/features/desk-updates.md, "Where it shows"). Each is a card in the
// page's own language: title, body, the picture when there is one, the
// button, and "Got it". "Got it" archives it for this person; so does
// pressing the button. An Update is marked opened the first time it scrolls
// into view.
//
// Hooks stay above every return. Everything here is optional: if the Updates
// can't be read (the backend not deployed yet), Today shows without them.

import { Component, useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useMutation, useQuery } from "convex/react";
import { Link } from "react-router";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { actionTarget } from "../lib/updates";

const MONO: CSSProperties = { fontFamily: "var(--garden-font-mono)" };
const DISPLAY: CSSProperties = { fontFamily: "var(--garden-font-display)" };
const CARD: CSSProperties = {
  backgroundColor: "var(--app-surface-raised)",
  borderColor: "var(--app-hairline)",
};
const BUTTON = "inline-flex items-center rounded-lg px-4 py-2.5 text-[13.5px] font-semibold transition-opacity hover:opacity-90";

/** Renders nothing if anything under it fails, so Today never goes down with it. */
class Quiet extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export function UpdatesStack() {
  return (
    <Quiet>
      <Stack />
    </Quiet>
  );
}

type Update = NonNullable<ReturnType<typeof useUpdates>>[number];

function useUpdates() {
  return useQuery(api.updates.listMine);
}

function Stack() {
  const updates = useUpdates();
  const open = useMutation(api.updates.open);
  const archive = useMutation(api.updates.archive);
  const click = useMutation(api.updates.click);
  // "Got it" hides the card at once; the list catches up a moment later.
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const seen = useRef(new Set<string>());

  const onSeen = useCallback(
    (id: string) => {
      if (seen.current.has(id)) return;
      seen.current.add(id);
      open({ updateId: id as Id<"updates"> }).catch(() => seen.current.delete(id));
    },
    [open],
  );

  const onPressed = useCallback(
    (id: string) => {
      click({ updateId: id as Id<"updates"> }).catch(() => {});
    },
    [click],
  );

  const onGotIt = useCallback(
    (id: string) => {
      setHidden((prev) => new Set(prev).add(id));
      archive({ updateId: id as Id<"updates"> }).catch(() => {
        setHidden((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      });
    },
    [archive],
  );

  const shown = (updates ?? []).filter((u) => !hidden.has(u._id));
  if (shown.length === 0) return null;

  return (
    <section aria-label="Updates" className="mb-14 space-y-4">
      {shown.map((u) => (
        <UpdateCard key={u._id} update={u} onSeen={onSeen} onPressed={onPressed} onGotIt={onGotIt} />
      ))}
    </section>
  );
}

function UpdateCard({
  update,
  onSeen,
  onPressed,
  onGotIt,
}: {
  update: Update;
  onSeen: (id: string) => void;
  onPressed: (id: string) => void;
  onGotIt: (id: string) => void;
}) {
  const ref = useRef<HTMLElement>(null);
  const id = update._id;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      onSeen(id);
      return;
    }
    const watcher = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          onSeen(id);
          watcher.disconnect();
        }
      },
      { threshold: 0.5 },
    );
    watcher.observe(el);
    return () => watcher.disconnect();
  }, [id, onSeen]);

  const target = update.actionLabel && update.actionUrl ? actionTarget(update.actionUrl) : null;
  const primaryStyle = { backgroundColor: "var(--garden-citron)", color: "var(--garden-ink)" };

  return (
    <article ref={ref} className="overflow-hidden rounded-xl border" style={CARD}>
      {update.imageUrl && <img src={update.imageUrl} alt="" loading="lazy" className="aspect-[16/9] w-full object-cover" />}
      <div className="p-5">
        <p className="text-xs uppercase tracking-[0.16em]" style={{ ...MONO, color: "var(--app-accent-ink)" }}>
          Update
        </p>
        <span aria-hidden className="mt-3 block h-0.5 w-7" style={{ backgroundColor: "var(--garden-citron)" }} />
        <h2 className="mt-3 text-2xl font-semibold leading-tight" style={{ ...DISPLAY, color: "var(--app-text)" }}>
          {update.title}
        </h2>
        <p className="mt-3 whitespace-pre-line text-[15px] leading-relaxed break-words" style={{ color: "var(--app-text)" }}>
          {update.body}
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-2">
          {target && update.actionLabel && (
            target.kind === "app" ? (
              <Link to={target.href} onClick={() => onPressed(id)} className={BUTTON} style={primaryStyle}>
                {update.actionLabel}
              </Link>
            ) : (
              <a href={target.href} target="_blank" rel="noopener noreferrer" onClick={() => onPressed(id)} className={BUTTON} style={primaryStyle}>
                {update.actionLabel}
              </a>
            )
          )}
          <button
            type="button"
            onClick={() => onGotIt(id)}
            className={`${BUTTON} border font-medium hover:bg-[var(--app-hairline)]`}
            style={{ borderColor: "var(--app-hairline-raised)", color: "var(--app-text)", backgroundColor: "transparent" }}
          >
            Got it
          </button>
        </div>
      </div>
    </article>
  );
}
