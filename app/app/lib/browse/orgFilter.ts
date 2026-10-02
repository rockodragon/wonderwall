// What the Organizations tab on /people (components/OrgDirectory.tsx) and the
// desk's People view do to the organizations the server returns
// (api.organizations.list sends them all): a text match on name, category,
// place and tagline. Organizations carry no interests or coordinates in that
// list, so the Discipline and Near me filters are people-only.

type Searchable = {
  name: string;
  category?: string | null;
  location?: string | null;
  tagline?: string | null;
};

/** The name, category, place or tagline contains `query` (no text: everything). */
export function matchesOrgQuery(o: Searchable, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [o.name, o.category, o.location, o.tagline].some((field) => field?.toLowerCase().includes(q));
}

/** The organizations that match `query`, in the list's own order. */
export function filterOrgs<T extends Searchable>(orgs: readonly T[], query: string): T[] {
  return orgs.filter((o) => matchesOrgQuery(o, query));
}
