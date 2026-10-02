// A project's stage as a chip under its title. To everyone but the owner it is
// a label. To the owner it is the same chip with a caret ("Planning ▾") that
// opens the stage list and saves the choice as soon as it is made (the
// setStage mutation); there is no Save. Any stage can move to any other.
//
// The chip is drawn, and a real <select> sits invisibly over it, so the list
// is the browser's own, it works with a keyboard and a screen reader, and the
// chip is only as wide as the stage it shows.

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { errorMessage } from "../../lib/convexError";
import { STAGES, resolveStage, stageLabel, type Stage } from "../../lib/stage";

const CHIP_CLASS = "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium uppercase tracking-[0.06em]";
const CHIP_STYLE = { fontFamily: "var(--garden-font-mono)", backgroundColor: "rgba(198,198,190,0.1)", color: "var(--garden-muted)" } as const;

export function StageChip({
  project,
  isOwner,
}: {
  project: { _id: Id<"projects">; kind: string; stage?: string; status?: string };
  isOwner: boolean;
}) {
  const setStage = useMutation(api.garden.projects.setStage);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const stage = resolveStage(project);

  if (!isOwner) {
    return (
      <span className={CHIP_CLASS} style={CHIP_STYLE}>
        {stageLabel(stage)}
      </span>
    );
  }

  async function onChange(next: Stage) {
    if (next === stage) return;
    setSaving(true);
    setError("");
    try {
      await setStage({ projectId: project._id, stage: next });
    } catch (err) {
      // The select is controlled by the project, so it is back on the old
      // stage already; say why.
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <span
        className={`${CHIP_CLASS} relative focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--garden-citron)]`}
        style={{ ...CHIP_STYLE, opacity: saving ? 0.6 : 1 }}
      >
        {stageLabel(stage)}
        <svg aria-hidden width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2.5 4.5 6 8l3.5-3.5" />
        </svg>
        <select
          aria-label="Project stage"
          value={stage}
          disabled={saving}
          onChange={(e) => void onChange(e.target.value as Stage)}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        >
          {STAGES.map((s) => (
            <option key={s} value={s}>
              {stageLabel(s)}
            </option>
          ))}
        </select>
      </span>
      {error && (
        <span role="alert" className="text-sm text-red-400">
          {error}
        </span>
      )}
    </>
  );
}
