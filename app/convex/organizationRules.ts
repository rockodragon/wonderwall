// Pure rules for organizations and positions (docs/features/organizations.md).
// No Convex here, so the tests, organizations.ts and the forms share one rule.

export const ORG_CATEGORIES = [
  "Studio",
  "Venue",
  "Gallery",
  "Nonprofit",
  "Church",
  "School",
  "Company",
  "Collective",
  "Label",
  "Agency",
  "Other",
] as const;

export const ORG_LIMITS = {
  name: 80,
  tagline: 120,
  mission: 2000,
  title: 60,
} as const;

/** Dedupe key: "  Abiding   Practice " and "abiding practice" are one org. */
export function orgNameKey(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

/** "Abiding Practice" → "abiding-practice". Never empty. */
export function slugifyOrgName(name: string): string {
  const slug = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  return slug || "org";
}

type Normalized = { ok: true; value: string | null } | { ok: false; reason: string };

/** A pasted website → "https://host/path" or null. Accepts "abidingpractice.com",
 * "www.x.org/give", or a full URL; rejects anything that isn't http(s). */
export function normalizeOrgUrl(raw: string | undefined | null): Normalized {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return { ok: true, value: null };
  if (trimmed.length > 200) return { ok: false, reason: "Keep the website under 200 characters." };
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return { ok: false, reason: "That doesn't look like a website." };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return { ok: false, reason: "That doesn't look like a website." };
  }
  if (!url.hostname.includes(".")) return { ok: false, reason: "That doesn't look like a website." };
  const path = url.pathname === "/" ? "" : url.pathname.replace(/\/$/, "");
  return { ok: true, value: `${url.protocol}//${url.hostname}${path}${url.search}` };
}

export type SocialKind = "instagram" | "x" | "linkedin";

const SOCIAL_HOSTS: Record<SocialKind, string[]> = {
  instagram: ["instagram.com"],
  x: ["x.com", "twitter.com"],
  linkedin: ["linkedin.com"],
};

const SOCIAL_NAMES: Record<SocialKind, string> = {
  instagram: "Instagram",
  x: "X",
  linkedin: "LinkedIn",
};

/** Strip a pasted profile URL down to the path after the host, or null when
 * the text isn't a URL on that network at all. */
function pathOnHost(kind: SocialKind, raw: string): string | null {
  const looksLikeUrl = /^(https?:\/\/)?(www\.|m\.)?[a-z0-9.-]+\.[a-z]{2,}\//i.test(raw);
  if (!looksLikeUrl) return null;
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^(www\.|m\.)/, "").toLowerCase();
  if (!SOCIAL_HOSTS[kind].includes(host)) return "";
  return url.pathname.replace(/^\/+|\/+$/g, "");
}

/**
 * "@abidingpractice", "abidingpractice" or a pasted profile link → what we
 * store: the bare handle for Instagram and X, the path ("company/name",
 * "in/name") for LinkedIn. Empty clears it.
 */
export function normalizeSocial(kind: SocialKind, raw: string | undefined | null): Normalized {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return { ok: true, value: null };
  const bad = { ok: false as const, reason: `That doesn't look like a ${SOCIAL_NAMES[kind]} handle or link.` };
  const path = pathOnHost(kind, trimmed);
  if (path === "") return bad; // a link, but to some other site

  if (kind === "linkedin") {
    const p = (path ?? trimmed.replace(/^@/, "")).replace(/\/+$/, "");
    const m = /^(company|in|school|showcase)\/([A-Za-z0-9\-_.%]{1,100})$/.exec(p);
    if (m) return { ok: true, value: `${m[1]}/${m[2]}` };
    // A bare name is a company page — the common case for an organization.
    if (path === null && /^[A-Za-z0-9\-_.%]{1,100}$/.test(p)) return { ok: true, value: `company/${p}` };
    return bad;
  }

  const handle = (path ?? trimmed).replace(/^@/, "").split("/")[0];
  const pattern = kind === "instagram" ? /^[A-Za-z0-9._]{1,30}$/ : /^[A-Za-z0-9_]{1,15}$/;
  return pattern.test(handle) ? { ok: true, value: handle } : bad;
}

export function socialUrl(kind: SocialKind, value: string): string {
  if (kind === "instagram") return `https://instagram.com/${value}`;
  if (kind === "x") return `https://x.com/${value}`;
  return `https://www.linkedin.com/${value}`;
}

/** A start or end year: 1900 through next year, or absent. */
export function checkYear(year: number | null | undefined, now = new Date()): string | null {
  if (year === null || year === undefined) return null;
  if (!Number.isInteger(year) || year < 1900 || year > now.getFullYear() + 1) {
    return "Use a four-digit year.";
  }
  return null;
}

export function checkYears(
  startYear: number | null | undefined,
  endYear: number | null | undefined,
  now = new Date(),
): string | null {
  const bad = checkYear(startYear, now) ?? checkYear(endYear, now);
  if (bad) return bad;
  if (endYear != null && endYear > now.getFullYear()) return "An end year can't be in the future.";
  if (startYear != null && endYear != null && endYear < startYear) {
    return "The end year comes after the start year.";
  }
  return null;
}

/** "2019 – now", "2016 – 2021", "Since 2019", "Until 2021", or "". */
export function yearsLabel(startYear?: number | null, endYear?: number | null): string {
  if (startYear && endYear) return startYear === endYear ? String(startYear) : `${startYear} – ${endYear}`;
  if (startYear) return `Since ${startYear}`;
  if (endYear) return `Until ${endYear}`;
  return "";
}

export type PositionLike = { order: number; endYear?: number | null; createdAt: number };

export const isCurrent = (p: { endYear?: number | null }) => p.endYear == null;

/** The position whose organization shows with a person's name: the lowest
 * order among current positions. */
export function primaryPosition<T extends PositionLike>(positions: T[]): T | null {
  let best: T | null = null;
  for (const p of positions) {
    if (!isCurrent(p)) continue;
    if (!best || p.order < best.order || (p.order === best.order && p.createdAt < best.createdAt)) best = p;
  }
  return best;
}

/** A person's positions as their profile lists them: current ones in their
 * own order, then former ones, most recently ended first. */
export function sortPositions<T extends PositionLike>(positions: T[]): T[] {
  const current = positions.filter(isCurrent).sort((a, b) => a.order - b.order || a.createdAt - b.createdAt);
  const former = positions
    .filter((p) => !isCurrent(p))
    .sort((a, b) => (b.endYear ?? 0) - (a.endYear ?? 0) || a.order - b.order);
  return [...current, ...former];
}
