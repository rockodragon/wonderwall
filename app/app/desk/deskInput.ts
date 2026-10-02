// What the desk's queries return, turned into the DeskInput deskCards.ts
// builds cards from. Pure: useDeskData.ts runs the queries and hands the
// results here, so the mapping can be tested without Convex.

import { NAMED_FUNDS, availableCents } from "../lib/namedFunds";
import type { DeskEventInput, DeskFundInput, DeskInput, DeskPersonInput, DeskProjectInput } from "./deskCards";

/** The fields of api.garden.allocations.getFundPage the desk reads. */
export type FundPageLike = { org: { slug: string; name: string }; balanceCents: number };

/** The fields of api.favorites.getMyFavorites the desk reads. */
export type FavoritesLike = {
  events: readonly ({ event: { _id: string } } | null)[];
  profiles: readonly ({ profile: { _id: string; name: string; imageUrl?: string | null; interests?: readonly string[] | null } } | null)[];
};

/** The fields of api.garden.giving.getMyGiving the desk reads. */
export type GivingLike = { open?: readonly { amountCents: number }[] };

/** Each query's result as the hook has it: undefined while loading, null when
 *  there is nothing (signed out, or an unknown fund). */
export type DeskRaw = {
  events: readonly DeskEventInput[] | undefined;
  projects: readonly DeskProjectInput[] | undefined;
  fundPage: FundPageLike | null | undefined;
  favorites: FavoritesLike | null | undefined;
  giving: GivingLike | null | undefined;
};

/** The Sophia Fund's available amount, the way the fund page computes it: the
 * seed it holds outside the ledger plus the ledger's balance. */
export function fundFrom(page: FundPageLike | null | undefined): DeskFundInput | null {
  if (!page) return null;
  const named = NAMED_FUNDS[page.org.slug];
  if (!named) return null;
  return {
    slug: page.org.slug,
    name: named.name,
    orgName: page.org.name,
    availableCents: availableCents(page.org.slug, page.balanceCents),
    openCall: named.openCall ?? null,
  };
}

/** The first open monthly grant, if there is one. */
function grantFrom(giving: GivingLike | null | undefined): DeskInput["grant"] {
  const open = giving?.open?.[0];
  return open ? { amountCents: open.amountCents } : null;
}

export function toDeskInput(raw: DeskRaw, now: number, formatMoney: (cents: number) => string): DeskInput {
  const { favorites } = raw;
  const people: DeskPersonInput[] = (favorites?.profiles ?? []).flatMap((f) =>
    f ? [{ _id: String(f.profile._id), name: f.profile.name, imageUrl: f.profile.imageUrl, interests: f.profile.interests }] : [],
  );
  return {
    now,
    events: raw.events ?? [],
    favoriteEventIds: (favorites?.events ?? []).flatMap((f) => (f ? [String(f.event._id)] : [])),
    people,
    projects: raw.projects ?? [],
    fund: fundFrom(raw.fundPage),
    grant: grantFrom(raw.giving),
    formatMoney,
  };
}
