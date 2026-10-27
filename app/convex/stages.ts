// Project stage — the creative-process label on a project. See
// docs/features/project-teams.md §1. The ONE copy of the list, its labels and
// the rule for which stage a project displays as. It is pure (no server
// imports) so the app and the server read it the same way: the app's
// app/lib/stage.ts re-exports it, and garden/projectTeam.ts, garden/projects.ts
// and garden/operatorCounts.ts import it.
//
// `projects.stage` is an optional field. `projects.status` is untouched and
// keeps meaning lifecycle/visibility ("active" | "archived", with the legacy
// "in_progress" | "completed" still accepted). Rows written before `stage`
// existed derive one in resolveStage, so nothing migrates and nothing that
// reads `status` breaks.

/** The stages a project can be set to, in the order the owner's menu lists
 * them. "Released" is not one of them: finished work is Completed. */
export const STAGES = [
  "planning",
  "raising",
  "forming",
  "working",
  "paused",
  "completed",
  "cancelled",
] as const;

export type Stage = (typeof STAGES)[number];

/** Stored stage words that were retired, and the stage each now reads as.
 * Rows keep the old word in the database (no migration); every read goes
 * through canonicalStage / resolveStage, and a write of one stores the new
 * word. `releasing` ("Released") was a second kind of done beside Completed;
 * 2026-10-27, the owner made Completed the one finished stage. */
const RETIRED_STAGES: ReadonlyMap<string, Stage> = new Map<string, Stage>([["releasing", "completed"]]);

/** One label per stage, same for passion and paid — "forming" used to read
 * "Hiring" on a paid post, but a project still forming its team is still
 * forming its team whether or not the work is paid; "Hiring" implied an
 * employment relationship this platform doesn't have. A stored retired word
 * that reaches here cast as a Stage still gets its new stage's label. */
export function stageLabel(stage: Stage): string {
  switch (canonicalStage(stage) ?? stage) {
    case "planning":
      return "Planning";
    case "raising":
      return "Raising";
    case "forming":
      return "Forming team";
    case "working":
      return "Working";
    case "paused":
      return "Paused";
    case "completed":
      return "Completed";
    case "cancelled":
      return "Cancelled";
  }
}

/** Whether `value` is a stage a project can be set to (STAGES). A retired
 * word such as "releasing" is not: read it with canonicalStage. */
export function isStage(value: unknown): value is Stage {
  return typeof value === "string" && (STAGES as readonly string[]).includes(value);
}

/** The stage a stored or sent stage word means: a current stage as it is,
 * a retired one as its replacement ("releasing" → "completed"), anything
 * else undefined. */
export function canonicalStage(value: unknown): Stage | undefined {
  if (isStage(value)) return value;
  return typeof value === "string" ? RETIRED_STAGES.get(value) : undefined;
}

/** The stage a project displays as. `stage` wins when set (a retired word
 * reads as its replacement: "releasing" is Completed); otherwise derive
 * from the legacy status so old rows read sensibly:
 *   in_progress → working, completed → completed,
 *   paid → forming (still building the team), everything else → planning. */
export function resolveStage(project: {
  stage?: string;
  status?: string;
  kind: string;
}): Stage {
  const stage = canonicalStage(project.stage);
  if (stage) return stage;
  if (project.status === "in_progress") return "working";
  if (project.status === "completed") return "completed";
  return project.kind === "paid" ? "forming" : "planning";
}
