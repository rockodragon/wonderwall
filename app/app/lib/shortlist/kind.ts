// Paid or Passion, decided per row by what the work pays, not by the
// project's kind: a role that states its pay is Paid even on a passion
// project, while a passion project you lead, back or saved, and a volunteer
// role, are Passion. It's the test browse's Jobs and gigs uses
// (lib/projectKind rolePay): pay has to be declared, and volunteer never
// counts. `pay` is the role's, else a paid project's (convex/shortlist payFor).

import { budgetKindLabel, type BudgetDeclaration } from "../budgetLabel";
import type { ProjectKind } from "./types";

export function workKind(item: { pay: BudgetDeclaration | null }): ProjectKind {
  return item.pay && budgetKindLabel(item.pay) === "Paid" ? "paid" : "passion";
}
