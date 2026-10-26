import { useQuery } from "convex/react";
import { useMemo } from "react";
import { Link } from "react-router";
import { api } from "../../convex/_generated/api";
import { filterOrgs } from "../lib/browse/orgFilter";
import { DIRECTORY_CARD, DIRECTORY_CARD_PICTURE, DIRECTORY_CARD_WORDS } from "./directoryCard";
import { OrgLogo } from "./OrgLogo";

// The Organizations tab on People (/people?tab=orgs;
// docs/features/organizations.md). The same card as a person's
// (directoryCard.ts), the logo where their photo is, and one quiet line of
// who's there: how
// many people, and how many of them you follow (Rick, 2026-10-27: the faces
// made the cards busy).

export function OrgDirectory({ query }: { query: string }) {
  const orgs = useQuery(api.organizations.list);

  const filtered = useMemo(() => {
    if (!orgs) return undefined;
    return filterOrgs(orgs, query);
  }, [orgs, query]);

  if (filtered === undefined) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 animate-pulse">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 rounded-xl" style={{ backgroundColor: "var(--app-hairline-raised)" }} />
        ))}
      </div>
    );
  }

  if (filtered.length === 0) {
    return (
      <p className="py-12 text-center" style={{ color: "var(--app-text-dim)" }}>
        {orgs && orgs.length > 0 ? "No results found" : "No organizations yet."}
      </p>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
      {filtered.map((o) => {
        const line = [o.category, o.location].filter(Boolean).join(" · ");
        return (
          <Link
            key={o._id}
            to={`/orgs/${o.slug}`}
            className={DIRECTORY_CARD}
            style={{ borderColor: "var(--app-hairline)", backgroundColor: "var(--app-surface-raised)" }}
          >
            <div className={DIRECTORY_CARD_PICTURE}>
              <OrgLogo name={o.name} logoUrl={o.logoUrl} size="fill" />
            </div>
            <div className={DIRECTORY_CARD_WORDS}>
              <h3 className="font-medium text-sm leading-snug break-words line-clamp-2" title={o.name} style={{ color: "var(--app-text)" }}>
                {o.name}
              </h3>
              {line && (
                <p className="text-xs truncate mt-0.5" style={{ color: "var(--app-text-dim)" }}>
                  {line}
                </p>
              )}
              {o.peopleCount > 0 && (
                <p className="text-xs truncate mt-1.5" style={{ color: "var(--app-text-muted)" }}>
                  {peopleLine(o.peopleCount, o.followingCount ?? 0)}
                </p>
              )}
            </div>
          </Link>
        );
      })}
    </div>
  );
}

/** "2 you follow · 4 people", or "4 people" when you follow none of them. */
function peopleLine(count: number, following: number): string {
  const people = `${count} ${count === 1 ? "person" : "people"}`;
  return following > 0 ? `${following} you follow · ${people}` : people;
}
