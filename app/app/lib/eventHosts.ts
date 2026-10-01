// How an event's hosts read: the organization first, the person second.
// Pure, so the card, the detail page and the tests share one rule.

export type EventHost = { name: string; orgName?: string | null; profileId?: string | null };

export type HostLabel = {
  /** What to show first: the org when there is one, else the person. */
  primary: string;
  /** The person's name, only when the org led. */
  person: string | null;
  profileId: string | null;
};

/** Hosts with an org come first (their order kept), then the rest. A repeat
 * org shows once. A host with no name and no org is dropped. */
export function hostLabels(hosts: (EventHost | null | undefined)[] | null | undefined): HostLabel[] {
  const withOrg: HostLabel[] = [];
  const without: HostLabel[] = [];
  const seenOrgs = new Set<string>();
  for (const h of hosts ?? []) {
    if (!h) continue;
    const org = h.orgName?.trim();
    const name = h.name?.trim();
    if (org) {
      const key = org.toLowerCase();
      if (seenOrgs.has(key)) continue;
      seenOrgs.add(key);
      withOrg.push({ primary: org, person: name || null, profileId: h.profileId ?? null });
    } else if (name) {
      without.push({ primary: name, person: null, profileId: h.profileId ?? null });
    }
  }
  return [...withOrg, ...without];
}

/** The card line: "Abiding Practice, Rick Moy". Empty string when no hosts. */
export function hostNamesLine(hosts: (EventHost | null | undefined)[] | null | undefined): string {
  return hostLabels(hosts)
    .map((l) => l.primary)
    .join(", ");
}
