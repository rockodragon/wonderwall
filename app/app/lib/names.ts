// Names the way the app addresses people.

import { hasRealName } from "../../convex/names";

/** The first word of a member's name, or null before they've named themselves. */
export function firstNameOf(name: string | undefined | null): string | null {
  if (!hasRealName(name)) return null;
  return name!.trim().split(/\s+/)[0] || null;
}

/** A first name to address someone by, or their whole name before they've set one. */
export function addressName(name: string): string {
  return firstNameOf(name) ?? name;
}
