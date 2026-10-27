// The interest list: one source, in convex/interests.ts (the backend can't
// import from app/, and the speech picker there needs the list). Every page
// keeps importing it from here.
export { INTERESTS, type Interest } from "../../convex/interests";

/** A custom interest someone typed ("other:zines") is kept for their own
 *  settings, not shown as a label to anyone else. */
const CUSTOM_PREFIX = "other:";

/** The interests to show others, in order: the custom ones left out. */
export function shownInterests(interests: readonly string[] | null | undefined): string[] {
  return (interests ?? []).filter((t) => !t.startsWith(CUSTOM_PREFIX));
}
