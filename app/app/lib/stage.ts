// Project stage — the creative-process label on a project. See
// docs/features/project-teams.md §1.
//
// `projects.stage` is a NEW optional field. `projects.status` is untouched
// and keeps meaning lifecycle/visibility ("active" | "archived", with the
// legacy "in_progress" | "completed" still accepted). Rows written before
// `stage` existed derive one here, so nothing migrates and nothing that
// reads `status` breaks.

export const STAGES = [
  "planning",
  "raising",
  "forming",
  "working",
  "releasing",
  "completed",
] as const;

export type Stage = (typeof STAGES)[number];

/** Labels per kind. "forming" reads as Hiring on a paid post, because a paid
 * post is a hiring post — otherwise every open gig on /opportunities would
 * have said "Planning". `kind` is the raw schema string; anything but "paid"
 * reads as passion. */
export function stageLabel(stage: Stage, kind: string): string {
  switch (stage) {
    case "planning":
      return "Planning";
    case "raising":
      return "Raising";
    case "forming":
      return kind === "paid" ? "Hiring" : "Forming team";
    case "working":
      return "Working";
    case "releasing":
      return "Releasing";
    case "completed":
      return "Completed";
  }
}

export function isStage(value: unknown): value is Stage {
  return typeof value === "string" && (STAGES as readonly string[]).includes(value);
}

/** The stage a project displays as. `stage` wins when set; otherwise derive
 * from the legacy status so old rows read sensibly:
 *   in_progress → working, completed → completed,
 *   paid → forming (hiring), everything else → planning. */
export function resolveStage(project: {
  stage?: string;
  status?: string;
  kind: string;
}): Stage {
  if (isStage(project.stage)) return project.stage;
  if (project.status === "in_progress") return "working";
  if (project.status === "completed") return "completed";
  return project.kind === "paid" ? "forming" : "planning";
}
