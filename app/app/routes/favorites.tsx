import { useQuery } from "convex/react";
import { Link } from "react-router";
import { api } from "../../convex/_generated/api";
import { EventCard } from "../components/EventCard";
import { FavoriteButton } from "../components/FavoriteButton";
import { groupFollows } from "../lib/groupFollows";

// /favorites is the Following page (docs/features/following.md §1 row 4). A
// profile favorite is a follow; the rows above are people you follow, the
// Events section below is the events you saved. The Events section renders
// components/EventCard — the same component /events renders — so the
// identical event wears the same face on both pages.

type FavoriteProfileItem = {
  favoriteId: string;
  favoritedAt: number;
  profile: {
    _id: string;
    name: string;
    imageUrl?: string | null;
    interests: string[];
  };
};

type FavoriteEventItem = {
  favoriteId: string;
  favoritedAt: number;
  event: {
    _id: string;
    title: string;
    datetime: number;
    location?: string | null;
    tags: string[];
    status: string;
    requiresApproval: boolean;
    coverImageUrl?: string | null;
    attendeeCount?: number;
  };
};

type FavoritesData = {
  profiles: (FavoriteProfileItem | null)[];
  events: (FavoriteEventItem | null)[];
};

export default function Favorites() {
  const favorites = useQuery(api.favorites.getMyFavorites, {}) as
    FavoritesData | undefined;

  if (favorites === undefined) {
    return (
      <PageShell>
        <div className="flex items-center justify-center py-24">
          <div
            className="h-8 w-8 rounded-full border-2 border-t-transparent animate-spin"
            style={{
              borderColor: "var(--garden-citron)",
              borderTopColor: "transparent",
            }}
          />
        </div>
      </PageShell>
    );
  }

  // Filter out null values and get typed arrays
  const profiles = favorites.profiles.filter(
    (p): p is NonNullable<typeof p> => p !== null,
  );
  const events = favorites.events.filter(
    (e): e is NonNullable<typeof e> => e !== null,
  );

  const { grouped, groups } = groupFollows(profiles);
  const hasProfiles = profiles.length > 0;
  const hasEvents = events.length > 0;

  return (
    <PageShell>
      <div className="space-y-12">
        <section>
          {hasProfiles ? (
            grouped ? (
              <div className="space-y-8">
                {groups.map((group) => (
                  <div key={group.label}>
                    <SectionHeading>{group.label}</SectionHeading>
                    <FollowList items={group.items} />
                  </div>
                ))}
              </div>
            ) : (
              <FollowList items={groups[0].items} />
            )
          ) : (
            <p
              className="text-sm py-8"
              style={{ color: "var(--garden-muted)" }}
            >
              You aren't following anyone yet. Tap Follow on a profile.
            </p>
          )}
        </section>

        {hasEvents && (
          <section>
            <SectionHeading>Events you saved</SectionHeading>
            {/* Same grid breakpoints as /events, so a card is the same
                width at the same viewport and the two pages really do
                match rather than merely sharing a component. */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {events.map((item) => (
                <EventCard
                  key={item.favoriteId}
                  event={item.event}
                  // /events lists only upcoming published events, so this
                  // knock-back is genuinely favorites-only: a saved event
                  // can drift into the past or be cancelled out from under
                  // you, and `status` only exists on this query.
                  dimmed={
                    item.event.datetime < Date.now() ||
                    item.event.status === "cancelled"
                  }
                />
              ))}
            </div>
          </section>
        )}
      </div>
    </PageShell>
  );
}

// Page chrome, shared by the loading and loaded states. Ink ground + garden
// type to match /events — without it the card would be a dark tile dropped on
// the old gray page, and the old `text-gray-900 dark:text-white` headings
// would vanish against the ink for anyone on a light OS theme.
function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[var(--garden-ink)]">
      <link rel="stylesheet" href="/tokens.css" />
      <link rel="stylesheet" href="/about/fonts/fonts.css" />
      <div className="p-4 sm:p-6 max-w-7xl mx-auto">
        <h1
          className="text-2xl sm:text-3xl font-semibold text-[var(--garden-paper)] mb-1"
          style={{ fontFamily: "var(--garden-font-display)" }}
        >
          Following
        </h1>
        <p className="text-[var(--garden-body)] mb-6">
          People you follow and events you saved.
        </p>
        {children}
      </div>
    </div>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2
      className="text-lg font-semibold mb-4"
      style={{
        color: "var(--garden-paper)",
        fontFamily: "var(--garden-font-display)",
      }}
    >
      {children}
    </h2>
  );
}

// One line per person, no card chrome: this is a shortlist, not a gallery.
function FollowList({ items }: { items: FavoriteProfileItem[] }) {
  return (
    <ul className="divide-y divide-[var(--garden-hairline)]">
      {items.map((item) => (
        <FollowRow key={item.favoriteId} item={item} />
      ))}
    </ul>
  );
}

function FollowRow({ item }: { item: FavoriteProfileItem }) {
  const hasImage = !!item.profile.imageUrl;

  return (
    <li className="flex items-center gap-3 py-3">
      {hasImage ? (
        <img
          src={item.profile.imageUrl as string}
          alt={item.profile.name}
          className="w-10 h-10 rounded-full object-cover shrink-0"
        />
      ) : (
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
          style={{
            backgroundColor: "var(--garden-hairline-raised)",
            color: "var(--garden-paper)",
          }}
        >
          {item.profile.name.charAt(0).toUpperCase()}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <Link
          to={`/profile/${item.profile._id}`}
          className="block font-medium text-sm truncate hover:underline"
          style={{ color: "var(--garden-paper)" }}
        >
          {item.profile.name}
        </Link>
        {item.profile.interests.length > 0 && (
          <p
            className="text-xs truncate"
            style={{ color: "var(--garden-dim)" }}
          >
            {item.profile.interests.join(" • ")}
          </p>
        )}
      </div>
      <div className="shrink-0">
        <FavoriteButton
          targetType="profile"
          targetId={item.profile._id}
          size="sm"
        />
      </div>
    </li>
  );
}
