// The name an account has before its owner gives one, and the one test for
// "has this person named themselves yet". Pure — no Convex imports — so the
// client uses it too (app/lib/names.ts, routes/onboarding.tsx).
//
// Every account gets a profile the moment its sign-in code checks out
// (convex/auth.ts), named PLACEHOLDER_NAME. Someone who closes the tab
// before onboarding's name field stays that way. Until they name
// themselves, other members don't see them: no profile page, no people
// lists, not in the public counts, "Someone" in a line about them (Rick,
// 2026-10-26, after two blank phone sign-ups showed up as members). /admin
// still lists them, tagged "Unfinished signup".

export const PLACEHOLDER_NAME = "New User";

/** True once the person has given a name: not blank, not the placeholder. */
export function hasRealName(name: string | null | undefined): boolean {
  const trimmed = name?.trim();
  return !!trimmed && trimmed.toLowerCase() !== PLACEHOLDER_NAME.toLowerCase();
}
