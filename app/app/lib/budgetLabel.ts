// The money badge on a paid project — one helper, so every surface says the
// same thing about the same row.
//
// Paid postings used to require a number: `createPaidProject` rejected
// anything else with "Paid projects need a declared budget — a number, not a
// range." The intent (plan §2.3) was that a creative always knows what
// they're walking into, and it worked on the case it was aimed at — the
// unfunded "exposure" gig. But it also turned away honest posts: a church
// with a small budget, a poster who genuinely doesn't know the number yet, a
// real volunteer ask.
//
// So the requirement moved from a number to a STATE. Every paid posting
// declares one of four, and a required state carries the original intent
// better than the required number did: an unpaid ask can no longer pass
// itself off as paid work, because it has to label itself "Volunteer", and a
// poster with a small or unknown budget is no longer blocked from posting at
// all. Nothing is ambiguous; nothing is shamed.
//
// Server-side twin: convex/garden/projectsPublic.ts's resolveMoneyLine, which
// writes the longer money line on the same cards. It can't import this file —
// Convex functions don't import from app/ — so the two are kept aligned by
// hand and by their tests.

/** The four honest money states a paid posting can declare. */
export type BudgetType = "amount" | "range" | "proposals" | "volunteer";

/** The budget fields as they come off a `projects` row (all optional on the
 * schema, so legacy rows read cleanly). */
export interface BudgetDeclaration {
  budgetType?: string;
  budget?: number;
  budgetMax?: number;
}

function isRealAmount(n: number | undefined): n is number {
  return typeof n === "number" && Number.isFinite(n) && n > 0;
}

function formatDollars(amount: number): string {
  return `$${amount.toLocaleString("en-US")}`;
}

/**
 * The state a row actually displays as. `budgetType` is a bare string on the
 * schema and is absent on every row written before this field existed, so
 * this is where the legacy and defensive cases are decided — once, not at
 * each call site:
 *
 * - a legacy row with a budget and no `budgetType` reads as "amount";
 * - a legacy row with neither reads as "proposals" (the honest thing to say
 *   about a post whose money was never stated is that it wasn't stated);
 * - an unknown `budgetType` string falls through to those same legacy rules
 *   rather than rendering a broken badge;
 * - a "range" missing a usable high end degrades to "amount" (or "proposals"
 *   with no low end either) instead of printing a dash with nothing after it.
 *
 * The mutation rejects all of those shapes at write time. This is only for
 * rows that are already in the table.
 */
export function resolveBudgetType(declaration: BudgetDeclaration): BudgetType {
  const { budgetType, budget, budgetMax } = declaration;

  if (budgetType === "volunteer" || budgetType === "proposals") return budgetType;

  if (budgetType === "range" && isRealAmount(budget) && isRealAmount(budgetMax)) {
    return "range";
  }

  return isRealAmount(budget) ? "amount" : "proposals";
}

/**
 * The kind word: what this posting is, in one word. "Volunteer" is never
 * "Paid" — calling unpaid work paid is the exact dishonesty the four states
 * exist to prevent.
 */
export function budgetKindLabel(declaration: BudgetDeclaration): "Paid" | "Volunteer" {
  return resolveBudgetType(declaration) === "volunteer" ? "Volunteer" : "Paid";
}

/**
 * The money half of the badge, on its own — for surfaces that already show
 * the kind word somewhere else and would otherwise print "Paid" twice.
 * Returns null for volunteer: there is no amount to state, and the kind word
 * has already said everything true about the money.
 */
export function budgetAmountLabel(declaration: BudgetDeclaration): string | null {
  const { budget, budgetMax } = declaration;
  switch (resolveBudgetType(declaration)) {
    case "amount":
      return formatDollars(budget!);
    case "range":
      // En dash, and no second "$" — "$300–600" reads as one span of money,
      // "$300–$600" reads as two separate numbers.
      return `${formatDollars(budget!)}–${budgetMax!.toLocaleString("en-US")}`;
    case "proposals":
      return "Open to proposals";
    case "volunteer":
      return null;
  }
}

/**
 * The full badge string: "Paid · $400", "Paid · $300–600", "Paid · Open to
 * proposals", or "Volunteer".
 */
export function budgetLabel(declaration: BudgetDeclaration): string {
  const kind = budgetKindLabel(declaration);
  const amount = budgetAmountLabel(declaration);
  return amount ? `${kind} · ${amount}` : kind;
}
