// Who a project is "by". Posted as an organization, it's the organization —
// not the person who runs it (they're in the team) — otherwise its creator.

export type ProjectByline = {
  kind: "org" | "person";
  name: string;
  imageUrl: string | null;
  /** Their page: /orgs/:slug, or /profile/:id. */
  href: string;
};

type Posted = {
  organization?: { name: string; slug: string; logoUrl?: string | null } | null;
  creator?: { _id: string; name: string; imageUrl?: string | null } | null;
};

export function bylineOf(project: Posted): ProjectByline | null {
  const { organization, creator } = project;
  if (organization) {
    return {
      kind: "org",
      name: organization.name,
      imageUrl: organization.logoUrl ?? null,
      href: `/orgs/${organization.slug}`,
    };
  }
  if (creator) {
    return {
      kind: "person",
      name: creator.name,
      imageUrl: creator.imageUrl ?? null,
      href: `/profile/${creator._id}`,
    };
  }
  return null;
}
