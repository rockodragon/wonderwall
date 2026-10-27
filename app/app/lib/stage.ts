// Project stage — the creative-process label on a project. See
// docs/features/project-teams.md §1.
//
// The list, the labels and the rule for which stage a project displays as live
// in ONE pure module the server shares, convex/stages.ts. This file re-exports
// it so the app's imports stay as they are. A stored `releasing` reads as
// Completed (Released is gone); see canonicalStage there.

export { STAGES, canonicalStage, isStage, resolveStage, stageLabel } from "../../convex/stages";
export type { Stage } from "../../convex/stages";
