// Names the way the app addresses people.

/** The first word of a member's name, or null before they've named themselves. */
export function firstNameOf(name: string | undefined | null): string | null {
  const full = name?.trim();
  // "New User" is the placeholder an account has before its owner names it.
  if (!full || /^new user$/i.test(full)) return null;
  return full.split(/\s+/)[0] || null;
}
