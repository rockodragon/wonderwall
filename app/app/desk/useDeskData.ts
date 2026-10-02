// The desk's data: the same queries the Today page, Events, Favorites and the
// fund page use, mapped to the DeskInput the cards are built from
// (deskInput.ts). Hooks only; the mapping is pure and lives beside it.

import { useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { formatMoney } from "../garden/ui";
import { SOPHIA_FUND_SLUG } from "../lib/namedFunds";
import type { DeskInput } from "./deskCards";
import { toDeskInput } from "./deskInput";

export function useDeskData() {
  const events = useQuery(api.events.list, { upcoming: true });
  const projects = useQuery(api.garden.projects.listProjects);
  const fundPage = useQuery(api.garden.allocations.getFundPage, { hostOrgSlug: SOPHIA_FUND_SLUG });
  const favorites = useQuery(api.favorites.getMyFavorites, {});
  // Read defensively: before the backend deploy this query doesn't exist.
  const giving = useQuery(api.garden.giving.getMyGiving);
  const profile = useQuery(api.profiles.getMyProfile);

  const input: DeskInput = useMemo(
    () => toDeskInput({ events, projects, fundPage, favorites, giving }, Date.now(), formatMoney),
    [events, projects, fundPage, favorites, giving],
  );

  const loaded =
    events !== undefined &&
    projects !== undefined &&
    fundPage !== undefined &&
    favorites !== undefined &&
    giving !== undefined &&
    profile !== undefined;

  return { input, loaded, profile };
}
