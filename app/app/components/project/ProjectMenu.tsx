// The ⋯ in the owner's header on a project page: the things you do to a
// project rather than to its page. Today that is Archive, which used to sit in
// a "Manage" card at the bottom beside the stage list. Same look and manners as
// the admin's ⋮ (components/AdminMenu.tsx): Escape or a press outside closes it.
//
// Renders nothing for a project that is already archived, or hidden by an
// admin (a hidden project's status is the admin's to change, moderation.ts).

import { useEffect, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { errorMessage } from "../../lib/convexError";

export function ProjectMenu({ project }: { project: { _id: Id<"projects">; title: string; status: string } }) {
  const updateProjectStatus = useMutation(api.garden.projects.updateProjectStatus);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      buttonRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (project.status === "archived" || project.status === "hidden") return null;

  async function archive() {
    setOpen(false);
    if (!window.confirm(`Archive "${project.title}"? It'll stop showing on /projects.`)) return;
    setSaving(true);
    try {
      await updateProjectStatus({ projectId: project._id, status: "archived" });
    } catch (err) {
      window.alert(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="relative shrink-0">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={saving}
        aria-label="Project options"
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
            className="absolute right-0 top-full mt-1 z-40 min-w-44 rounded-xl py-1 shadow-lg"
            style={{ backgroundColor: "var(--garden-ink-raised)", border: "1px solid var(--garden-hairline-raised)" }}
          >
            <button
              type="button"
              role="menuitem"
              autoFocus
              onClick={archive}
              className="w-full text-left px-3 py-2 text-sm hover:bg-[var(--garden-hairline)]"
              style={{ color: "var(--garden-paper)" }}
            >
              Archive project
            </button>
          </div>
        </>
      )}
    </div>
  );
}
