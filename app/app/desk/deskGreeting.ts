// The desk's greeting: "Good morning, Rick." Pure, so the hour and the
// placeholder-name rule can be tested.

export type GreetingWord = "morning" | "afternoon" | "evening";

/** Before noon is morning, before five is afternoon, the rest evening. */
export function greetingWord(hour: number): GreetingWord {
  return hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
}

/** The first word of the member's name, or null before they've named themselves. */
export function firstNameOf(name: string | undefined | null): string | null {
  const full = name?.trim();
  // "New User" is the placeholder an account has before its owner names it.
  if (!full || /^new user$/i.test(full)) return null;
  return full.split(/\s+/)[0] || null;
}

/** "Good evening, Rick." — or "Good evening." with no name to use. */
export function greetingFor(hour: number, name: string | undefined | null): string {
  const first = firstNameOf(name);
  return `Good ${greetingWord(hour)}${first ? `, ${first}` : ""}.`;
}
