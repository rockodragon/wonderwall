import { useQuery } from "convex/react";
import { Link } from "react-router";
import { api } from "../../convex/_generated/api";
import { EventCard } from "../components/EventCard";
import { FavoriteButton } from "../components/FavoriteButton";

// The Events section below renders components/EventCard — the same component
// /events renders. This file used to carry a verbatim copy of the pre-garden
// card (a five-colour gradient array picked by list index), so the identical
// event wore a different face on each page. The People sections above it are
// a different card family and are deliberately left alone.

type FavoriteProfileItem = {
  favoriteId: string;
  favoritedAt: number;
  profile: {
    _id: string;
    name: string;
    imageUrl?: string | null;
    interests: string[];
  };
  wondering: {
    _id: string;
    prompt: string;
    imageUrl?: string | null;
  } | null;
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
    | FavoritesData
    | undefined;

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

  const profilesWithWonderings = profiles.filter(
    (
      p,
    ): p is FavoriteProfileItem & {
      wondering: NonNullable<FavoriteProfileItem["wondering"]>;
    } => Boolean(p.wondering),
  );
  const profilesWithoutWonderings = profiles.filter((p) => !p.wondering);

  const hasProfiles = profiles.length > 0;
  const hasEvents = events.length > 0;
  const isEmpty = !hasProfiles && !hasEvents;

  return (
    <PageShell>
      {isEmpty ? (
        <div className="text-center py-16">
          <svg
            className="w-16 h-16 mx-auto mb-4"
            style={{ color: "var(--garden-hairline-raised)" }}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
            />
          </svg>
          <p
            className="text-lg font-medium mb-1"
            style={{ color: "var(--garden-body)" }}
          >
            No favorites yet
          </p>
          <p className="text-sm" style={{ color: "var(--garden-muted)" }}>
            Tap the heart on profiles and events to save them here
          </p>
        </div>
      ) : (
        <div className="space-y-12">
          {hasProfiles && (
            <section>
              <SectionHeading>People ({profiles.length})</SectionHeading>

              {profilesWithWonderings.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-6">
                  {profilesWithWonderings.map((item) => (
                    <FavoriteWonderCard key={item.favoriteId} item={item} />
                  ))}
                </div>
              )}

              {profilesWithoutWonderings.length > 0 && (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {profilesWithoutWonderings.map((item) => (
                    <FavoriteProfileCard key={item.favoriteId} item={item} />
                  ))}
                </div>
              )}
            </section>
          )}

          {hasEvents && (
            <section>
              <SectionHeading>Events ({events.length})</SectionHeading>
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
      )}
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
          Favorites
        </h1>
        <p className="text-[var(--garden-body)] mb-6">
          People and events you've saved.
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

// Get text size class based on prompt length for optimal readability
function getWonderTextStyle(prompt: string): {
  sizeClass: string;
  fontClass: string;
} {
  const len = prompt.length;

  // Size based on length - aim for 40-75% of card space
  let sizeClass: string;
  if (len < 40) {
    sizeClass = "text-2xl md:text-3xl";
  } else if (len < 80) {
    sizeClass = "text-xl md:text-2xl";
  } else if (len < 150) {
    sizeClass = "text-lg md:text-xl";
  } else {
    sizeClass = "text-base md:text-lg";
  }

  // Alternate font styles based on prompt characteristics
  const isQuestion = prompt.includes("?");
  const fontClass = isQuestion ? "font-serif italic" : "font-medium";

  return { sizeClass, fontClass };
}

function FavoriteWonderCard({
  item,
}: {
  item: FavoriteProfileItem & {
    wondering: NonNullable<FavoriteProfileItem["wondering"]>;
  };
}) {
  const { sizeClass, fontClass } = getWonderTextStyle(item.wondering.prompt);
  const hasWonderingImage = !!item.wondering.imageUrl;
  const hasProfileImage = !!item.profile.imageUrl;

  return (
    <Link
      to={`/profile/${item.profile._id}`}
      className="group relative block overflow-hidden rounded-2xl aspect-[4/5] bg-gray-100 dark:bg-gray-800"
    >
      {hasWonderingImage ? (
        <img
          src={item.wondering.imageUrl as string}
          alt=""
          className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500" />
      )}

      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-black/20" />

      <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity z-10">
        <FavoriteButton
          targetType="profile"
          targetId={item.profile._id}
          size="sm"
        />
      </div>

      <div className="absolute inset-0 flex flex-col justify-between p-5">
        <div className="flex-1 flex items-center justify-center">
          <p
            className={`text-white ${sizeClass} ${fontClass} text-center leading-relaxed px-2`}
          >
            "{item.wondering.prompt}"
          </p>
        </div>

        <div className="flex items-center gap-2">
          {hasProfileImage ? (
            <img
              src={item.profile.imageUrl as string}
              alt={item.profile.name}
              className="w-8 h-8 rounded-full object-cover border border-white/30"
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-white text-sm font-medium">
              {item.profile.name.charAt(0).toUpperCase()}
            </div>
          )}
          <span className="text-white/90 text-sm font-medium">
            {item.profile.name}
          </span>
        </div>
      </div>
    </Link>
  );
}

function FavoriteProfileCard({ item }: { item: FavoriteProfileItem }) {
  const hasImage = !!item.profile.imageUrl;

  return (
    <Link
      to={`/profile/${item.profile._id}`}
      className="group flex items-center gap-3 p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-blue-500 dark:hover:border-blue-500 transition-colors"
    >
      {hasImage ? (
        <img
          src={item.profile.imageUrl as string}
          alt={item.profile.name}
          className="w-12 h-12 rounded-full object-cover shrink-0"
        />
      ) : (
        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-gray-400 to-gray-500 dark:from-gray-600 dark:to-gray-700 flex items-center justify-center text-white font-bold shrink-0">
          {item.profile.name.charAt(0).toUpperCase()}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <h3 className="font-medium text-gray-900 dark:text-white truncate text-sm">
          {item.profile.name}
        </h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
          {item.profile.interests.slice(0, 2).join(" • ")}
        </p>
      </div>
      <div className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        <FavoriteButton
          targetType="profile"
          targetId={item.profile._id}
          size="sm"
        />
      </div>
    </Link>
  );
}
