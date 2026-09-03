// /communities — the directory of named groups on creatives.exchange (see
// docs/features/community-groups.md §0 and §5 step 1). Each community has
// its own tables, events, and projects; joining any of them is free.
// Same three-state discipline as tables._index.tsx: loading, empty, real.

import { useQuery } from "convex/react";
import { Link, useRouteError } from "react-router";
import { api } from "../../convex/_generated/api";
import {
  GardenErrorState,
  GardenLoading,
  GardenNav,
  GardenPage,
} from "../garden/ui";
import "../garden/garden.css";

export function meta() {
  return [
    { title: "Communities — creatives.exchange" },
    { name: "robots", content: "noindex" },
  ];
}

export function ErrorBoundary() {
  useRouteError();
  return (
    <GardenPage>
      <GardenNav active="Communities" />
      <div style={{ marginTop: 28 }}>
        <GardenErrorState message="Communities isn't live yet — check back soon." />
      </div>
    </GardenPage>
  );
}

type CommunityRow = {
  _id: string;
  name: string;
  slug: string;
  tagline?: string;
  locationLabel?: string;
  memberCount: number;
  hosts: string[];
};

function CommunityCard({ community }: { community: CommunityRow }) {
  return (
    <Link
      to={`/communities/${community.slug}`}
      aria-label={community.name}
      className="g-card"
      style={{ display: "block", textDecoration: "none", color: "inherit" }}
    >
      <div className="g-h" style={{ fontSize: 17 }}>
        {community.name}
      </div>
      {community.tagline && (
        <p style={{ marginTop: 8, fontSize: 14.5, lineHeight: 1.5, color: "var(--g-body)" }}>
          {community.tagline}
        </p>
      )}
      <div
        className="g-mono"
        style={{
          marginTop: 10,
          fontSize: 12.5,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: "var(--g-dim)",
        }}
      >
        {community.locationLabel ?? "Wherever you are"}
      </div>
      <p style={{ marginTop: 8, fontSize: 14.5, color: "var(--g-muted)" }}>
        {community.memberCount} member{community.memberCount === 1 ? "" : "s"}
        {community.hosts.length > 0 ? ` · hosted by ${community.hosts.join(", ")}` : ""}
      </p>
    </Link>
  );
}

function HostCTACard() {
  return (
    <Link
      to="/communities/apply"
      aria-label="Host your community — apply"
      className="g-card"
      style={{
        display: "block",
        textDecoration: "none",
        color: "inherit",
        borderStyle: "dashed",
      }}
    >
      <span className="g-badge g-badge-line">Host a community</span>
      <div className="g-h" style={{ fontSize: 17, marginTop: 10 }}>
        Host your community — apply
      </div>
      <p style={{ marginTop: 8, fontSize: 14.5, lineHeight: 1.5, color: "var(--g-muted)" }}>
        Hosting is free. New communities open around November.
      </p>
    </Link>
  );
}

export default function CommunitiesIndex() {
  const communities = useQuery(api.garden.communities.listCommunities, {}) as
    | CommunityRow[]
    | undefined;

  if (communities === undefined) {
    return (
      <GardenPage wide>
        <GardenNav active="Communities" />
        <div style={{ marginTop: 28 }}>
          <GardenLoading />
        </div>
      </GardenPage>
    );
  }

  return (
    <GardenPage wide>
      <GardenNav active="Communities" />
      <div style={{ marginTop: 28, marginBottom: 24 }}>
        <h1 className="g-h" style={{ fontSize: "clamp(28px,5vw,40px)" }}>
          Communities
        </h1>
        <p style={{ marginTop: 10, fontSize: 15, lineHeight: 1.5, maxWidth: "58ch" }}>
          Named groups on creatives.exchange — each with its own tables,
          events, and projects. Join free.
        </p>
      </div>

      {communities.length === 0 ? (
        <div style={{ maxWidth: 460 }}>
          <p style={{ fontSize: 14.5, lineHeight: 1.6 }}>
            No communities are open yet.
          </p>
          <div style={{ marginTop: 16 }}>
            <HostCTACard />
          </div>
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))",
            gap: 14,
          }}
        >
          {communities.map((c) => (
            <CommunityCard key={c._id} community={c} />
          ))}
          <HostCTACard />
        </div>
      )}
    </GardenPage>
  );
}
