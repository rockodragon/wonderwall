import { useQuery } from "convex/react";
import { useMemo } from "react";
import { Link } from "react-router";
import { api } from "../../convex/_generated/api";
import { OrgLogo } from "./OrgLogo";

// The Organizations tab on People (/people?tab=orgs;
// docs/features/organizations.md). Same footprint as a person card, with a
// square logo where a person has a round photo, and the first few faces of
// its people — you see who, not just how many.

export function OrgDirectory({ query }: { query: string }) {
  const orgs = useQuery(api.organizations.list);

  const filtered = useMemo(() => {
    if (!orgs) return undefined;
    const q = query.trim().toLowerCase();
    if (!q) return orgs;
    return orgs.filter((o) =>
      [o.name, o.category, o.location, o.tagline].some((field) => field?.toLowerCase().includes(q)),
    );
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
            className="flex items-center gap-3 p-4 rounded-xl border transition-colors min-w-0 hover:border-[var(--app-accent)]"
            style={{ borderColor: "var(--app-hairline)", backgroundColor: "var(--app-surface-raised)" }}
          >
            <OrgLogo name={o.name} logoUrl={o.logoUrl} size="sm" />
            <div className="min-w-0 flex-1">
              <h3 className="font-medium text-sm leading-snug break-words" style={{ color: "var(--app-text)" }}>
                {o.name}
              </h3>
              {line && (
                <p className="text-xs truncate mt-0.5" style={{ color: "var(--app-text-dim)" }}>
                  {line}
                </p>
              )}
              {o.peopleCount > 0 && (
                <div className="mt-2 flex items-center gap-2">
                  <div className="flex -space-x-1.5">
                    {o.faces.map((f, i) => (
                      <span
                        key={i}
                        title={f.name}
                        className="w-6 h-6 rounded-full overflow-hidden flex items-center justify-center text-xs font-medium ring-2"
                        style={{
                          backgroundColor: "var(--app-hairline-raised)",
                          color: "var(--app-text-muted)",
                          // the ring matches the card so overlapping faces read as separate
                          ["--tw-ring-color" as string]: "var(--app-surface-raised)",
                        }}
                      >
                        {f.imageUrl ? (
                          <img src={f.imageUrl} alt="" className="w-full h-full object-cover" />
                        ) : (
                          f.name.trim().charAt(0).toUpperCase()
                        )}
                      </span>
                    ))}
                  </div>
                  <span className="text-xs whitespace-nowrap" style={{ color: "var(--app-text-dim)" }}>
                    {o.peopleCount} {o.peopleCount === 1 ? "person" : "people"}
                  </span>
                </div>
              )}
            </div>
          </Link>
        );
      })}
    </div>
  );
}
