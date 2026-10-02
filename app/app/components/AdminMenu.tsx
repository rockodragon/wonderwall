// The ⋮ an admin sees in the top-right of a project or event page: Hide /
// Unhide and Delete (convex/moderation.ts). Renders nothing for anyone
// else — the mutations check admin again on the server. Hidden pages stay
// reachable here for the owner and admins, and from /admin's Hidden list.

import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { useNavigate } from "react-router";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

function reasonFor(err: unknown, fallback: string): string {
  if (err instanceof ConvexError) {
    const data = err.data as { reason?: string } | undefined;
    if (data?.reason) return data.reason;
  }
  return fallback;
}

type Target =
  | { kind: "project"; id: Id<"projects"> }
  | { kind: "event"; id: Id<"events"> };

export function AdminMenu({
  target,
  title,
  hidden,
}: {
  target: Target;
  title: string;
  hidden: boolean;
}) {
  const me = useQuery(api.profiles.getMyProfile);
  const setProjectHidden = useMutation(api.moderation.setProjectHidden);
  const setEventHidden = useMutation(api.moderation.setEventHidden);
  const deleteProject = useMutation(api.moderation.deleteProject);
  const deleteEvent = useMutation(api.moderation.deleteEvent);
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!me?.isAdmin) return null;

  const noun = target.kind;
  const children =
    target.kind === "event"
      ? "its RSVPs, applications and announcements"
      : "its team, roles, updates and attached pieces";

  async function toggleHidden() {
    setOpen(false);
    if (
      !hidden &&
      !window.confirm(
        `Hide "${title}"? It disappears for everyone but its ${noun === "event" ? "hosts" : "owner"} and admins. You can unhide it here or from /admin.`,
      )
    )
      return;
    setBusy(true);
    try {
      if (target.kind === "event") await setEventHidden({ eventId: target.id, hidden: !hidden });
      else await setProjectHidden({ projectId: target.id, hidden: !hidden });
    } catch (err) {
      window.alert(reasonFor(err, `Couldn't ${hidden ? "unhide" : "hide"} this ${noun}. Try again.`));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setOpen(false);
    if (!window.confirm(`Delete "${title}" for good? This also removes ${children}. It can't be undone.`)) return;
    setBusy(true);
    try {
      if (target.kind === "event") await deleteEvent({ eventId: target.id });
      else await deleteProject({ projectId: target.id });
      navigate(target.kind === "event" ? "/events" : "/projects", { replace: true });
    } catch (err) {
      window.alert(reasonFor(err, `Couldn't delete this ${noun}. Try again.`));
      setBusy(false);
    }
  }

  const item = "w-full text-left px-3 py-2 text-sm hover:bg-[var(--garden-hairline)] disabled:opacity-50";

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={busy}
        aria-label="Admin options"
        aria-haspopup="menu"
        aria-expanded={open}
        className="w-9 h-9 flex items-center justify-center rounded-lg transition-colors hover:bg-[var(--garden-ink-raised)] disabled:opacity-50"
        style={{ color: "var(--garden-muted)" }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <circle cx="12" cy="5" r="2" />
          <circle cx="12" cy="12" r="2" />
          <circle cx="12" cy="19" r="2" />
        </svg>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div
            role="menu"
            className="absolute right-0 top-full mt-1 z-40 min-w-48 rounded-xl py-1 shadow-lg"
            style={{
              backgroundColor: "var(--garden-ink-raised)",
              border: "1px solid var(--garden-hairline-raised)",
            }}
          >
            <div
              className="px-3 pt-1.5 pb-1 text-xs font-semibold uppercase tracking-[0.08em]"
              style={{ color: "var(--garden-dim)", fontFamily: "var(--garden-font-mono)" }}
            >
              Admin
            </div>
            <button
              type="button"
              role="menuitem"
              onClick={toggleHidden}
              className={item}
              style={{ color: "var(--garden-paper)" }}
            >
              {hidden ? `Unhide ${noun}` : `Hide ${noun}`}
            </button>
            <button type="button" role="menuitem" onClick={remove} className={`${item} text-red-400`}>
              Delete {noun}…
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/** The line a hidden page shows the few people who can still open it. */
export function HiddenNotice({ kind }: { kind: "project" | "event" }) {
  return (
    <div
      className="rounded-xl px-4 py-3 text-sm"
      style={{
        backgroundColor: "var(--garden-ink-raised)",
        border: "1px solid var(--garden-hairline-raised)",
        color: "var(--garden-paper)",
      }}
    >
      An admin hid this {kind}. Only its {kind === "event" ? "hosts" : "owner"} and admins can see it.
    </div>
  );
}
