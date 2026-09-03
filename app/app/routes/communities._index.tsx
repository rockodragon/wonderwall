// /communities — the directory of named groups on creatives.exchange (see
// docs/features/community-groups.md §0 and docs/features/community-ux.md
// §5). Rendered inside the app shell (_app.tsx), public: a signed-out
// visitor sees the exact same grid as a signed-in one — only the actions
// that require an account (Join, Apply) gate on sign-in, on the pages this
// links to. Same three-state discipline as tables._index.tsx: loading,
// empty, real — restyled to the app shell's --garden-* token system instead
// of the retired GardenNav/GardenPage shell.

import { useQuery } from "convex/react";
import { Link, useRouteError } from "react-router";
import { api } from "../../convex/_generated/api";
import { joinNames } from "../garden/ui";

export function meta() {
  return [
    { title: "Communities — creatives.exchange" },
    { name: "robots", content: "noindex" },
  ];
}

export function ErrorBoundary() {
  useRouteError();
  return (
    <div className="min-h-screen bg-[var(--garden-ink)]">
      <link rel="stylesheet" href="/tokens.css" />
      <link rel="stylesheet" href="/about/fonts/fonts.css" />
      <div className="p-4 sm:p-6 max-w-7xl mx-auto">
        <h1
          className="text-2xl sm:text-3xl font-semibold mb-2"
          style={{ color: "var(--garden-paper)", fontFamily: "var(--garden-font-display)" }}
        >
          Communities isn't live yet
        </h1>
        <p className="text-[var(--garden-body)]">Check back soon.</p>
      </div>
    </div>
  );
}

type CommunityRow = {
  _id: string;
  name: string;
  slug: string;
  tagline?: string;
  description?: string;
  locationLabel?: string;
  memberCount: number;
  hosts: string[];
  leaders: { userId: string; name: string; isOwner: boolean }[];
};

function CommunityCard({ community }: { community: CommunityRow }) {
  return (
    <Link
      to={`/communities/${community.slug}`}
      aria-label={community.name}
      className="flex flex-col rounded-2xl border p-5 h-full transition-colors hover:opacity-90"
      style={{ borderColor: "var(--garden-hairline)", backgroundColor: "var(--garden-ink-raised)" }}
    >
      <div
        className="font-semibold text-lg"
        style={{ color: "var(--garden-paper)", fontFamily: "var(--garden-font-display)" }}
      >
        {community.name}
      </div>

      {/* Location and size are facts you scan; they sit right under the name
          rather than below a paragraph nobody has read yet. */}
      <div
        className="mt-2 text-xs uppercase tracking-[0.06em]"
        style={{ color: "var(--garden-dim)", fontFamily: "var(--garden-font-mono)" }}
      >
        {community.locationLabel ?? "Wherever you are"} · {community.memberCount} member
        {community.memberCount === 1 ? "" : "s"}
      </div>

      {community.tagline && (
        <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--garden-body)" }}>
          {community.tagline}
        </p>
      )}

      {/* Clamped: a directory card says enough to choose, and the community's
          own page says the rest. Unclamped, one long description turned this
          card into a wall and left the card beside it looking empty. */}
      {community.description && (
        <p
          className="mt-2 text-sm leading-relaxed line-clamp-3"
          style={{ color: "var(--garden-muted)" }}
        >
          {community.description}
        </p>
      )}

      {community.leaders.length > 0 && (
        <p className="mt-3 text-sm" style={{ color: "var(--garden-muted)" }}>
          Hosted by {joinNames(community.leaders.map((l) => l.name))}
        </p>
      )}

      {/* mt-auto keeps every card's call to action on the same line, however
          much or little the card above it had to say. */}
      <span
        className="mt-auto pt-4 inline-block text-sm font-medium"
        style={{ color: "var(--garden-citron)" }}
      >
        See inside &amp; join — free →
      </span>
    </Link>
  );
}

function HostCTACard() {
  return (
    <Link
      to="/communities/apply"
      aria-label="Host your community — apply"
      className="flex flex-col rounded-2xl border border-dashed p-5 h-full transition-colors hover:opacity-90"
      style={{ borderColor: "var(--garden-hairline-raised)", backgroundColor: "var(--garden-ink-raised)" }}
    >
      <span
        className="inline-block self-start px-2.5 py-1 rounded-full text-xs font-medium uppercase tracking-[0.06em]"
        style={{
          fontFamily: "var(--garden-font-mono)",
          backgroundColor: "rgba(215,242,90,0.14)",
          color: "var(--garden-citron)",
        }}
      >
        Host a community
      </span>
      <div
        className="mt-3 font-semibold text-lg"
        style={{ color: "var(--garden-paper)", fontFamily: "var(--garden-font-display)" }}
      >
        Host your own community
      </div>
      <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--garden-body)" }}>
        Already gather people? Bring them here — your own page, tables, events, and classes.
      </p>
      <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--garden-muted)" }}>
        Hosting is free, and you keep 90% of anything you sell. New communities open around
        November.
      </p>
      <span
        className="mt-auto pt-4 inline-block text-sm font-medium"
        style={{ color: "var(--garden-citron)" }}
      >
        Apply to host →
      </span>
    </Link>
  );
}

export default function CommunitiesIndex() {
  const communities = useQuery(api.garden.communities.listCommunities, {}) as
    | CommunityRow[]
    | undefined;

  return (
    <div className="min-h-screen bg-[var(--garden-ink)]">
      <link rel="stylesheet" href="/tokens.css" />
      <link rel="stylesheet" href="/about/fonts/fonts.css" />
      <div className="p-4 sm:p-6 max-w-7xl mx-auto">
        <h1
          className="text-2xl sm:text-3xl font-semibold text-[var(--garden-paper)] mb-1"
          style={{ fontFamily: "var(--garden-font-display)" }}
        >
          Communities
        </h1>
        {/* Written at the people we want hosting: someone who already has a
            newsletter, a Discord, a cohort, a following. Lead with what they
            get (their own room, their own terms, they keep 90%), not with a
            definition of the word "community". */}
        <p className="text-[var(--garden-body)] mb-6 max-w-2xl">
          Every community here is someone's room — their people, their name on the door, their way
          of doing things. Joining any of them is free. If you already gather creatives, in a
          newsletter, a group chat, or a class, bring them somewhere their work gets funded in the
          open. Hosting is free and you keep 90% of anything you sell.
        </p>

        {communities === undefined ? (
          <div className="flex items-center justify-center py-24">
            <div
              className="h-8 w-8 rounded-full border-2 border-t-transparent animate-spin"
              style={{ borderColor: "var(--garden-citron)", borderTopColor: "transparent" }}
            />
          </div>
        ) : communities.length === 0 ? (
          <div className="max-w-md">
            <p className="text-sm" style={{ color: "var(--garden-dim)" }}>
              No communities are open yet.
            </p>
            <div className="mt-4">
              <HostCTACard />
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {communities.map((c) => (
              <CommunityCard key={c._id} community={c} />
            ))}
            <HostCTACard />
          </div>
        )}
      </div>
    </div>
  );
}
