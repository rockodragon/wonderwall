// How an event's hosts read: the organization first, the person second.
// Pure, so the card, the detail page and the tests share one rule.

export type EventHost = {
  name: string;
  orgName?: string | null;
  orgUrl?: string | null;
  /** The organization's page (/orgs/:slug). Absent for an org typed before
   * organizations existed — then orgUrl is the only link. */
  orgSlug?: string | null;
  profileId?: string | null;
  /** Set on every entry of a list the host ordered by hand: show it exactly
   * as given (no org-first reordering, no person beside an org). */
  exact?: boolean;
};

export type HostLabel = {
  /** What to show first: the org when there is one, else the person. */
  primary: string;
  /** The person's name, only when the org led. */
  person: string | null;
  profileId: string | null;
  /** The org's website, when the org led and has one. */
  orgUrl: string | null;
  /** The org's page here, when the org led and has one. */
  orgSlug: string | null;
  /** `primary` is an organization, not a person. */
  isOrg: boolean;
};

/** Hosts with an org come first (their order kept), then the rest. A repeat
 * org shows once. A host with no name and no org is dropped. */
export function hostLabels(hosts: (EventHost | null | undefined)[] | null | undefined): HostLabel[] {
  const list = (hosts ?? []).filter((h): h is EventHost => !!h);
  if (list.some((h) => h.exact)) {
    const out: HostLabel[] = [];
    for (const h of list) {
      const primary = (h.orgName?.trim() || h.name?.trim()) ?? "";
      if (!primary) continue;
      const isOrg = !!h.orgName?.trim();
      out.push({
        primary,
        person: null,
        profileId: isOrg ? null : (h.profileId ?? null),
        orgUrl: isOrg ? h.orgUrl || null : null,
        orgSlug: isOrg ? h.orgSlug || null : null,
      });
    }
    return out;
  }
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
      withOrg.push({
        primary: org,
        person: name || null,
        profileId: h.profileId ?? null,
        orgUrl: h.orgUrl || null,
        orgSlug: h.orgSlug || null,
        isOrg: true,
      });
    } else if (name) {
      without.push({ primary: name, person: null, profileId: h.profileId ?? null, orgUrl: null, orgSlug: null, isOrg: false });
    }
  }
  return [...withOrg, ...without];
}

/** The event card's host line (Rick, 2026-10-01): organizations A→Z, then
 * hosts with no organization A→Z — "Abiding Practice, Reveal Brand, Dana
 * Lee". No "Hosted by"; empty string when no hosts. */
export function hostNamesLine(hosts: (EventHost | null | undefined)[] | null | undefined): string {
  const byName = (a: HostLabel, b: HostLabel) =>
    a.primary.localeCompare(b.primary, undefined, { sensitivity: "base" });
  const labels = hostLabels(hosts);
  const orgs = labels.filter((l) => l.isOrg).sort(byName);
  const people = labels.filter((l) => !l.isOrg).sort(byName);
  return [...orgs, ...people].map((l) => l.primary).join(", ");
}
