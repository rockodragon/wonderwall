import { useConvexAuth, useQuery } from "convex/react";
import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { api } from "../../convex/_generated/api";
import { INTERESTS } from "../constants/interests";
import { EventCard } from "../components/EventCard";
import { SearchInput } from "../components/SearchInput";
import { TagFilterPills } from "../components/TagFilterPills";
import { FilterButton, FilterPanel, filterButtonLabel } from "../components/FilterMenu";
import { useFilterState } from "../lib/useFilterState";
import { CommunityContextLine, useCommunityContext } from "../components/CommunityFilter";
import { haversineDistance, NEAR_ME_RADIUS_OPTIONS, useNearMe } from "../lib/useNearMe";
import { LocationIcon } from "../components/icons";
import { InviteButton } from "../components/InviteCTA";
import { OrgDirectory } from "../components/OrgDirectory";

// Derived directly from the canonical INTERESTS list so this can never
// drift from it again (it previously did — see git history). Label and
// value are the same singular string, matching how Projects' `#Tag` pills
// already render these values.
const FILTERS = INTERESTS.map((fn) => ({ label: fn, value: fn }));

type ProfileResult = {
  _id: string;
  name: string;
  orgName?: string;
  imageUrl?: string;
  interests: string[];
  location?: string;
  coordinates?: { lat: number; lng: number };
  wondering: { prompt: string; _id: string; imageUrl: string | null } | null;
};

// People has two tabs (docs/features/organizations.md): people, and the
// organizations they belong to. Same ?tab= pattern as Events; People is the
// default and carries no param.
type PeopleTab = "people" | "orgs";

export default function Search() {
  const { isAuthenticated } = useConvexAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab: PeopleTab = searchParams.get("tab") === "orgs" ? "orgs" : "people";
  const orgsTab = tab === "orgs";
  function setTab(next: PeopleTab) {
    setSearchParams((prev) => {
      const params = new URLSearchParams(prev);
      if (next === "people") params.delete("tab");
      else params.set("tab", next);
      return params;
    });
  }
  const [filterExpanded, setFilterExpanded] = useState(false);
  const {
    nearMe,
    userPos,
    geoError,
    geoLoading,
    radius,
    setRadius,
    toggleNearMe,
  } = useNearMe();

  const {
    query,
    debouncedQuery,
    setQuery,
    tags: activeFilters,
    toggleTag,
    clearTags,
  } = useFilterState({ tagsParam: "interests" });

  // Get filter label for button
  const filterLabel = filterButtonLabel(FILTERS, activeFilters);

  // Text-based search for profiles (includes name, bio, interests).
  // No interest is passed server-side — at friend-group scale the whole
  // multi-select filter runs client-side below, same as Events/Projects.
  // Community context (community-ux.md §2): People is segmented like every
  // other browse page — the switcher's community scopes who shows up here.
  const community = useCommunityContext();
  const communitySlug = community.selected === "all" ? undefined : community.selected;

  const profiles = useQuery(
    api.profiles.search,
    orgsTab ? "skip" : { query: debouncedQuery || undefined, communitySlug },
  ) as ProfileResult[] | undefined;

  const filteredProfiles = useMemo(() => {
    if (!profiles) return profiles;
    let result = profiles;
    if (activeFilters.length > 0) {
      result = result.filter((profile) =>
        activeFilters.some((filter) => profile.interests.includes(filter)),
      );
    }
    if (nearMe && userPos) {
      result = result
        .map((p) => ({
          ...p,
          _distance: p.coordinates
            ? haversineDistance(userPos.lat, userPos.lng, p.coordinates.lat, p.coordinates.lng)
            : Infinity,
        }))
        .filter((p) => p._distance <= radius)
        .sort((a, b) => a._distance - b._distance);
    }
    return result;
  }, [profiles, activeFilters, nearMe, userPos, radius]);

  // Search events when there's a query
  const events = useQuery(
    api.events.search,
    debouncedQuery && !orgsTab ? { query: debouncedQuery, communitySlug } : "skip",
  );

  const loading = profiles === undefined;

  return (
    <div className="max-w-6xl mx-auto p-6">
      {/* The two tabs are the title. */}
      <div
        className="flex items-end justify-between gap-3 mb-5 border-b"
        style={{ borderColor: "var(--app-hairline)" }}
      >
        <div role="tablist" className="flex gap-5 sm:gap-7">
          {(
            [
              ["people", "People"],
              ["orgs", "Organizations"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className="-mb-px pb-2 border-b-2 text-xl sm:text-2xl font-bold transition-colors"
              style={{
                borderColor: tab === key ? "var(--app-accent)" : "transparent",
                color: tab === key ? "var(--app-text)" : "var(--app-text-dim)",
              }}
            >
              {label}
            </button>
          ))}
        </div>
        {isAuthenticated && (
          <div className="pb-2">
            {orgsTab ? (
              <Link
                to="/settings"
                className="text-sm font-medium hover:underline"
                style={{ color: "var(--app-accent-ink)" }}
              >
                Add yours
              </Link>
            ) : (
              <InviteButton />
            )}
          </div>
        )}
      </div>
      {!orgsTab && (
        <CommunityContextLine
          selected={community.selected}
          setSelected={community.setSelected}
          communities={community.communities}
          variant="app"
        />
      )}

      {/* Search input + Near Me + Filter on same line */}
      <div className="flex gap-3 mb-6">
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder={orgsTab ? "Search organizations" : "Search by name, role, or event..."}
          className="flex-1"
        />
        {!orgsTab && (
          <>
            <button
              onClick={toggleNearMe}
              disabled={geoLoading}
              className="flex items-center gap-2 px-4 py-3 rounded-xl border transition-colors shrink-0"
              style={
                nearMe
                  ? { borderColor: "var(--app-accent)", backgroundColor: "var(--app-accent-wash)", color: "var(--app-accent-ink)" }
                  : { borderColor: "var(--app-hairline)", backgroundColor: "var(--app-surface-raised)", color: "var(--app-text)" }
              }
            >
              <LocationIcon className="w-4 h-4" />
              <span className="font-medium hidden sm:inline">{geoLoading ? "Locating..." : "Near me"}</span>
            </button>
            <FilterButton
              open={filterExpanded}
              onClick={() => setFilterExpanded(!filterExpanded)}
              label={filterLabel}
              active={activeFilters.length > 0}
            />
          </>
        )}
      </div>

      {orgsTab ? (
        <OrgDirectory query={debouncedQuery} />
      ) : (
        <>
          {/* Near me radius selector */}
          {nearMe && (
            <div className="mb-6 flex items-center gap-3 flex-wrap">
              <span className="text-sm" style={{ color: "var(--app-text-dim)" }}>Within:</span>
              {NEAR_ME_RADIUS_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setRadius(opt.value)}
                  className="px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
                  style={
                    radius === opt.value
                      ? { backgroundColor: "var(--app-accent)", color: "var(--garden-ink)" }
                      : { backgroundColor: "var(--app-hairline)", color: "var(--app-text-muted)" }
                  }
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}

          {geoError && (
            <p className="text-sm text-red-500 mb-4">{geoError}</p>
          )}

          {/* Filter panel content */}
          {filterExpanded && (
            <FilterPanel>
              <TagFilterPills
                options={FILTERS}
                active={activeFilters}
                onToggle={toggleTag}
                onClear={clearTags}
              />
            </FilterPanel>
          )}

          {/* Results */}
          {loading ? (
            <div className="text-center py-12">
              <div
                className="animate-spin rounded-full h-8 w-8 border-b-2 mx-auto"
                style={{ borderColor: "var(--app-accent)" }}
              />
            </div>
          ) : filteredProfiles?.length === 0 && (!events || events.length === 0) ? (
            <div className="text-center py-12" style={{ color: "var(--app-text-dim)" }}>
              <p>{nearMe ? "No nearby profiles found — most people haven't set a precise location yet. Try a wider radius or turn off Near me." : query ? "No results found" : "No creatives to show yet"}</p>
            </div>
          ) : (
            <div className="space-y-12">
              {/* Events section - show when searching */}
              {events && events.length > 0 && (
                <section>
                  <h2 className="text-lg font-semibold mb-4" style={{ color: "var(--app-text)" }}>
                    Events
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {events.map((event: any) => (
                      <EventCard key={event._id} event={event} />
                    ))}
                  </div>
                </section>
              )}

              {/* People */}
              {filteredProfiles && filteredProfiles.length > 0 && (
                <section>
                  <h2 className="text-lg font-semibold mb-4" style={{ color: "var(--app-text)" }}>
                    {query ? "People" : "Creatives"}
                  </h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {filteredProfiles.map((profile) => (
                      <ProfileCard key={profile._id} profile={profile} />
                    ))}
                  </div>
                </section>
              )}

            </div>
          )}
        </>
      )}
    </div>
  );
}

function ProfileCard({ profile }: { profile: ProfileResult & { _distance?: number } }) {
  const hasImage = !!profile.imageUrl;
  const distLabel = profile._distance != null && isFinite(profile._distance)
    ? profile._distance < 1 ? "< 1 mi" : `${Math.round(profile._distance)} mi`
    : null;

  return (
    <Link
      to={`/profile/${profile._id}`}
      className="group flex items-center gap-3 p-4 rounded-xl border transition-colors hover:border-[var(--app-accent)]"
      style={{ borderColor: "var(--app-hairline)", backgroundColor: "var(--app-surface-raised)" }}
    >
      {hasImage ? (
        <img
          src={profile.imageUrl}
          alt={profile.name}
          className="w-12 h-12 rounded-full object-cover shrink-0"
        />
      ) : (
        <div
          className="w-12 h-12 rounded-full flex items-center justify-center font-bold shrink-0"
          style={{ backgroundColor: "var(--app-hairline-raised)", color: "var(--app-text)" }}
        >
          {profile.name.charAt(0).toUpperCase()}
        </div>
      )}
      {/* Name never truncates — Follow moved to the profile page itself
          (profile.tsx), which freed the width this used to fight for. */}
      <div className="min-w-0 flex-1">
        <h3 className="font-medium text-sm leading-snug" style={{ color: "var(--app-text)" }}>
          {profile.name}
        </h3>
        {profile.orgName && (
          <p className="text-xs truncate mt-0.5" style={{ color: "var(--app-text-muted)" }}>
            {profile.orgName}
          </p>
        )}
        <p className="text-xs truncate mt-0.5" style={{ color: "var(--app-text-dim)" }}>
          {distLabel && <span style={{ color: "var(--app-accent-ink)" }}>{distLabel} · </span>}
          {profile.interests.slice(0, 2).join(" · ")}
        </p>
      </div>
    </Link>
  );
}

