// The desk's header copy: the greeting ("Good morning, Rick.") on the home
// view and the count beside a view's name ("13 people") on the others. Pure,
// so the hour, the placeholder-name rule and the plurals can be tested.

import { firstNameOf } from "../lib/names";
import type { DeskView } from "./deskState";

export type GreetingWord = "morning" | "afternoon" | "evening";

/** Before noon is morning, before five is afternoon, the rest evening. */
export function greetingWord(hour: number): GreetingWord {
  return hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
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
  shortlist: ["thing", "things"],
};

/** "13 people", "1 project": the count that sits beside a view's name. Empty
 *  for the home view, which has none. */
export function countLabel(view: DeskView, count: number): string {
  const noun = COUNT_NOUN[view];
  if (!noun) return "";
  return `${count} ${count === 1 ? noun[0] : noun[1]}`;
}

/** The number beside a view's name: what's on show, each thing once. Null on
 *  the home view, and while the list (on Today, Needs you too) is arriving.
 *  Today counts its Needs you rows as well as its cards, the fund and grant
 *  notes included; a row that's also a card counts once. Other views count
 *  their own kind, so the fund note on Projects isn't a project. */
export function headerCount(
  view: DeskView,
  cards: readonly { id: string; note: boolean }[] | undefined,
  needsYouIds?: readonly string[],
): number | null {
  if (view === "all" || !cards) return null;
  if (view !== "today") return cards.filter((c) => !c.note).length;
  if (!needsYouIds) return null;
  return new Set([...cards.map((c) => c.id), ...needsYouIds]).size;
}

/** The People view's count: "30 people", or "30 people · 4 organizations" when
 *  organizations are mixed in. `orgsOnly` is the Organizations toggle, which
 *  says "0 organizations" rather than "0 people" when nothing matches. */
export function peopleCountLabel(people: number, orgs: number, orgsOnly = false): string {
  const orgsPart = `${orgs} ${orgs === 1 ? "organization" : "organizations"}`;
  if (orgsOnly) return orgsPart;
  if (orgs === 0) return countLabel("people", people);
  return people === 0 ? orgsPart : `${countLabel("people", people)} · ${orgsPart}`;
}
