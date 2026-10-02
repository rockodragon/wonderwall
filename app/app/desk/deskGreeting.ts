// The desk's header copy: the greeting ("Good morning, Rick.") on the home
// view and the count beside a view's name ("13 people") on the others. Pure,
// so the hour, the placeholder-name rule and the plurals can be tested.

import type { DeskView } from "./deskState";

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

const COUNT_NOUN: Record<DeskView, readonly [string, string] | null> = {
  all: null,
  today: ["thing", "things"],
  people: ["person", "people"],
  projects: ["project", "projects"],
  events: ["event", "events"],
  fav: ["favorite", "favorites"],
};

/** "13 people", "1 project": the count that sits beside a view's name. Empty
 *  for the home view, which has none. */
export function countLabel(view: DeskView, count: number): string {
  const noun = COUNT_NOUN[view];
  if (!noun) return "";
  return `${count} ${count === 1 ? noun[0] : noun[1]}`;
}
