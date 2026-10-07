// The cards a browse view puts on the desk: the list pages' own filtering
// (lib/browse/) applied to what the server returned, then mapped to cards with
// deskCards' builders. Pure; deskBrowse.tsx runs the queries and hands the
// rows here.

import { filterEvents, onlyFavorites, parseEventsTab } from "../lib/browse/eventsFilter";
import { distanceLabel, type LatLng, type NearMe } from "../lib/browse/nearMe";
import { filterOrgs } from "../lib/browse/orgFilter";
import { filterProfiles, matchesPersonQuery } from "../lib/browse/peopleFilter";
import { filterProjects, type ProjectsLens } from "../lib/browse/projectsFilter";
import {
  dateKicker,
  eventCard,
  fundCard,
  inCommunity,
  orgCard,
  personCard,
  projectCard,
  type DeskCard,
  type DeskEventInput,
  type DeskFundInput,
  type DeskOrgInput,
  type DeskProjectInput,
} from "./deskCards";
import type { DeskCommunity } from "./deskState";

// ——————————————————————————————————————————————————————————————
// People
// ——————————————————————————————————————————————————————————————

/** A person as api.profiles.search and api.favorites.getMyFavorites return
 * them. Only the search carries coordinates. */
export type ProfileRow = {
  _id: string;
  name: string;
  imageUrl?: string | null;
  interests: string[];
  coordinates?: LatLng | null;
};

/** A person card for the directory. personCard says FOLLOWING, which is only
 * true of people the member follows; everyone else carries no label (the
 * view already says People), and the opened card leads with their discipline. */
export function directoryCard(p: ProfileRow & { _distance?: number }, followed: boolean): DeskCard {
  const card = personCard({ _id: String(p._id), name: p.name, imageUrl: p.imageUrl ?? null, interests: p.interests });
  const kicker = followed ? card.face.kicker : "";
  const meta = followed ? card.face.kicker : (p.interests[0] ?? "").toUpperCase();
  const away = distanceLabel(p._distance);
  return {
    ...card,
    // Browse cards belong to the browse view only; Favorites is built elsewhere.
    sections: ["people"],
    face: { ...card.face, kicker, foot: [away, card.face.foot].filter(Boolean).join(" · ") || null },
    detail: { ...card.detail, meta },
  };
}

/**
 * Everyone: the server's search result (already scoped to the community and
 * the text), then the Discipline filter and Near me, as /people does.
 * Following: the people the member follows, searched by name and interest,
 * then the Discipline filter. (Following carries no coordinates, so no Near me.)
 */
export function peopleCards(opts: {
  rows: readonly ProfileRow[];
  followedIds: ReadonlySet<string>;
  following: boolean;
  query: string;
  interests: readonly string[];
  near: NearMe | null;
}): DeskCard[] {
  const base = opts.following ? opts.rows.filter((p) => matchesPersonQuery(p, opts.query)) : opts.rows;
  return filterProfiles(base, { interests: opts.interests, near: opts.following ? null : opts.near }).map((p) =>
    directoryCard(p, opts.following || opts.followedIds.has(String(p._id))),
  );
}

// ——————————————————————————————————————————————————————————————
// Organizations, mixed in with people
// ——————————————————————————————————————————————————————————————

/** The organizations that match the search, as cards, in the list's own order
 * (most people first, then by name: api.organizations.list). */
export function orgsCards(rows: readonly DeskOrgInput[], query: string): DeskCard[] {
  return filterOrgs(rows, query).map((o) => orgCard(o));
}

/**
 * `extra` spread evenly through `main`, each keeping its own order: with 30 in
 * `main` and 4 in `extra`, one comes after every sixth. A fixed rule with no
 * sort key shared by both kinds (people come most-recent-first, organizations
 * most-members-first), so neither bunches at an end. `main` leads.
 */
export function spreadEvenly<T>(main: readonly T[], extra: readonly T[]): T[] {
  const out: T[] = [];
  let at = 0;
  extra.forEach((item, k) => {
    const upTo = Math.ceil(((k + 1) * main.length) / (extra.length + 1));
    while (at < upTo) out.push(main[at++]);
    out.push(item);
  });
  while (at < main.length) out.push(main[at++]);
  return out;
}

/**
 * Everyone: the people cards with the organizations that match the search
 * spread through them. Discipline and Near me are about people, an
 * organization carries neither, so with either on (`peopleOnly`) the
 * organizations step aside.
 */
export function everyoneCards(people: DeskCard[], orgs: readonly DeskOrgInput[], opts: { query: string; peopleOnly: boolean }): DeskCard[] {
  return opts.peopleOnly ? people : spreadEvenly(people, orgsCards(orgs, opts.query));
}

/** What an empty People view calls its things: "No people or organizations
 * match." `tab` is the view's toggle ("" Everyone, "following", "orgs"). */
export function peopleNoun(tab: string, peopleOnly: boolean): string {
  if (tab === "orgs") return "organizations";
  return tab === "" && !peopleOnly ? "people or organizations" : "people";
}

// ——————————————————————————————————————————————————————————————
// Projects
// ——————————————————————————————————————————————————————————————

/**
 * The /projects list for the chosen chip and stage, in the desk's community,
 * searched by title and description. On Projects with nothing narrowing it,
 * the fund's note comes first. Under Jobs and gigs a project with a paid role
 * leads with that role (deskCards.projectCard).
 */
export function projectsCards(opts: {
  rows: readonly DeskProjectInput[];
  lens: ProjectsLens;
  /** The Stage menu's choice; "" is any. */
  stage: string;
  query: string;
  community: DeskCommunity;
  /** The Sophia Fund, for The Garden. */
  fund: DeskFundInput | null;
  money: (cents: number) => string;
}): DeskCard[] {
  const list = filterProjects(opts.rows, {
    lens: opts.lens,
    stage: opts.stage,
    inCommunity: (p) => inCommunity(p, opts.community),
    query: opts.query,
  });
  const onJobsAndGigs = opts.lens === "work";
  const cards = list.map((p) => projectCard(p, ["projects"], opts.money, { onJobsAndGigs }));
  const narrowed = opts.lens !== "projects" || !!opts.stage || !!opts.query.trim();
  if (opts.community === "garden" && opts.fund && !narrowed) cards.unshift(fundCard(opts.fund, opts.money));
  return cards;
}

// ——————————————————————————————————————————————————————————————
// Events
// ——————————————————————————————————————————————————————————————

/** An archive card: the date carries its year when it isn't this one, and
 * there is nothing left to RSVP to. */
export function pastEventCard(e: DeskEventInput, now: number): DeskCard {
  const card = eventCard(e, ["events"]);
  const date = dateKicker(e.datetime);
  const dated = new Date(e.datetime).getFullYear() === new Date(now).getFullYear() ? date : `${date} · ${new Date(e.datetime).getFullYear()}`;
  const went = e.attendeeCount ?? 0;
  return {
    ...card,
    face: { ...card.face, kicker: dated },
    detail: {
      ...card.detail,
      meta: card.detail.meta.replace(date, dated),
      aside: went > 0 ? `${went} went` : null,
      action: { kind: "link", label: "See event", href: card.href },
    },
  };
}

/**
 * The /events list for the chosen tab: searched, in the desk's community, near
 * me when on, and (Saved) only the events the member has hearted. `rows` is
 * the upcoming list, or the archive for Past.
 */
export function eventsCards(opts: {
  rows: readonly (DeskEventInput & { tags?: readonly string[] | null; coordinates?: LatLng | null })[];
  /** The ?tab= value: "favorites" is Saved, "past" is the archive, else upcoming. */
  tab: string | null;
  query: string;
  community: DeskCommunity;
  near: NearMe | null;
  favoriteIds: ReadonlySet<string>;
  now: number;
}): DeskCard[] {
  const tab = parseEventsTab(opts.tab);
  const found = filterEvents(opts.rows, {
    query: opts.query,
    tags: [],
    inCommunity: (e) => inCommunity(e, opts.community),
    near: opts.near,
  });
  const shown = tab === "favorites" ? onlyFavorites(found, opts.favoriteIds) : found;
  return shown.map((e) => (tab === "past" ? pastEventCard(e, opts.now) : eventCard(e, ["events"], opts.now)));
}
