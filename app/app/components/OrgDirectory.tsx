import { useQuery } from "convex/react";
import { useMemo } from "react";
import { Link } from "react-router";
import { api } from "../../convex/_generated/api";
import { filterOrgs } from "../lib/browse/orgFilter";
import { OrgLogo } from "./OrgLogo";
import { PeopleFaces } from "./PeopleFaces";

// The Organizations tab on People (/people?tab=orgs;
// docs/features/organizations.md). Same footprint as a person card, with a
// square logo where a person has a round photo, and the first few faces of
// its people — you see who, not just how many.

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
            className={`flex ${ORG_CARD_MIN_H} items-start gap-3 p-4 rounded-xl border transition-colors min-w-0 hover:border-[var(--app-accent)]`}
            style={{ borderColor: "var(--app-hairline)", backgroundColor: "var(--app-surface-raised)" }}
          >
            {/* Top-aligned with the name: a card taller than its words (the
                grid gives every card in a row the row's height) used to leave
                the logo floating halfway down. */}
            <OrgLogo name={o.name} logoUrl={o.logoUrl} size="sm" />
            <div className="min-w-0 flex-1">
              <h3 className="font-medium text-sm leading-snug break-words line-clamp-2" title={o.name} style={{ color: "var(--app-text)" }}>
                {o.name}
              </h3>
              {line && (
                <p className="text-xs truncate mt-0.5" style={{ color: "var(--app-text-dim)" }}>
                  {line}
                </p>
              )}
              <div className={FACES_IN_A_CARD}>
                <PeopleFaces faces={o.faces} count={o.peopleCount} />
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

/** As short as a person card (routes/search.tsx), so a row of organizations
 * with nobody listed yet still reads as cards. */
const ORG_CARD_MIN_H = "min-h-[5.625rem]";

/** PeopleFaces in a narrow card. It is shared with the desk's opened card,
 * where its faces and "N people" flow along one wide line; here the faces
 * take the full width, so the count always starts a line of its own instead
 * of sitting beside a name, and a face can be no wider than the card, so a
 * long name ends in an ellipsis inside it. */
const FACES_IN_A_CARD = "[&_ul]:w-full [&_li]:max-w-full";
