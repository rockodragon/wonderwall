// Which people and organizations look like the same one entered twice, for
// /admin/duplicates (admin/duplicates.ts). Pure — no Convex — so the rules
// are tested on their own.
//
// People: the same name once case, spacing, accents and punctuation are
// ignored ("Sarah  Shreves." and "sarah shreves"), or the part before a "/"
// ("Ezekiel Pugal / ezthetics" and "Ezekiel Pugal"); or the same email or
// phone on two accounts. A name still on the sign-up placeholder (names.ts)
// matches nothing by name.
//
// Organizations: the same name the same way; one name the start of the
// other ("The Grove Center for" and "The Grove Center for the Arts &
// Media"); or every telling word of one in the other ("BetLynArt
// Publishing (SESAC)" in "BetLynArt and Shreves Publishing SESAC").
//
// Matches make groups, not just pairs: A like B and B like C is one group of
// three. A pair an admin said isn't a duplicate (duplicateDismissals) is
// left out before grouping, so it never comes back on its own — a new
// look-alike joining it still shows.

import { hasRealName } from "./names";

export type MatchReason =
  | "same_name"
  | "same_name_before_slash"
  | "same_email"
  | "same_phone"
  | "starts_the_same"
  | "most_words";

/** What the page says about why a group is there. */
export const REASON_LABEL: Record<MatchReason, string> = {
  same_name: "Same name",
  same_name_before_slash: "Same name before the “/”",
  same_email: "Same email",
  same_phone: "Same phone",
  starts_the_same: "One name starts the other",
  most_words: "One name’s words all in the other",
};

/** "  Sarah   SHREVES." → "sarah shreves": accents, case, punctuation and
 * extra spaces don't count; "&" reads as "and". Letters of any script. */
export function normalizeName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/&|\+/g, " and ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** The keys a person's name matches others on. The part before a "/"
 * counts only when it's at least two words (a first and a last name), so
 * "AC/DC" doesn't match everyone called "AC". */
export function personNameKeys(name: string): { key: string; reason: MatchReason }[] {
  if (!hasRealName(name)) return [];
  const full = normalizeName(name);
  const keys: { key: string; reason: MatchReason }[] = full ? [{ key: full, reason: "same_name" }] : [];
  const slash = name.indexOf("/");
  if (slash > 0) {
    const before = normalizeName(name.slice(0, slash));
    if (before && before !== full && before.split(" ").length >= 2) {
      keys.push({ key: before, reason: "same_name_before_slash" });
    }
  }
  return keys;
}

export type Edge = { a: string; b: string; reason: MatchReason };

/** One key for a pair, whichever way round: the ids sorted, joined by "+". */
export function pairKey(a: string, b: string): string {
  return [a, b].sort().join("+");
}

/** Every pair inside a group, as pairKeys (what "Not duplicates" stores). */
export function pairKeysOf(ids: readonly string[]): string[] {
  const unique = [...new Set(ids)];
  const out: string[] = [];
  for (let i = 0; i < unique.length; i++) {
    for (let j = i + 1; j < unique.length; j++) out.push(pairKey(unique[i], unique[j]));
  }
  return out;
}

/** Edges between every pair of ids that share a key; the weaker reason
 * when they share it differently (a full name against a "Name / x"). */
function edgesFromKeys(entries: { id: string; key: string; reason: MatchReason }[]): Edge[] {
  const byKey = new Map<string, { id: string; reason: MatchReason }[]>();
  for (const e of entries) {
    const list = byKey.get(e.key) ?? [];
    if (!list.some((x) => x.id === e.id)) list.push({ id: e.id, reason: e.reason });
    byKey.set(e.key, list);
  }
  const edges: Edge[] = [];
  for (const list of byKey.values()) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const reason = list[i].reason === list[j].reason ? list[i].reason : "same_name_before_slash";
        edges.push({ a: list[i].id, b: list[j].id, reason });
      }
    }
  }
  return edges;
}

/** Pairs of people who look like one person twice. */
export function personEdges(
  people: readonly { id: string; name: string; email?: string | null; phone?: string | null }[],
): Edge[] {
  const entries: { id: string; key: string; reason: MatchReason }[] = [];
  for (const p of people) {
    for (const k of personNameKeys(p.name)) entries.push({ id: p.id, key: `name:${k.key}`, reason: k.reason });
    const email = p.email?.trim().toLowerCase();
    if (email) entries.push({ id: p.id, key: `email:${email}`, reason: "same_email" });
    const phone = p.phone?.replace(/[^\d+]/g, "");
    if (phone) entries.push({ id: p.id, key: `phone:${phone}`, reason: "same_phone" });
  }
  return edgesFromKeys(entries);
}

// Words that say nothing about which organization it is.
const STOP_WORDS = new Set(["the", "a", "an", "of", "for", "and", "at", "in", "on", "inc", "llc", "co", "ltd", "org"]);

/** An organization's words that tell it apart: no stop words or single
 * letters, and a plural or possessive "s" dropped ("Shreve's", "Shreves"). */
export function significantWords(name: string): Set<string> {
  const out = new Set<string>();
  for (const word of normalizeName(name).split(" ")) {
    if (word.length < 2 || STOP_WORDS.has(word)) continue;
    out.add(word.length > 3 && word.endsWith("s") ? word.slice(0, -1) : word);
  }
  return out;
}

/** Why two organization names look like one organization, or null. */
export function orgsLookAlike(a: string, b: string): MatchReason | null {
  const wa = normalizeName(a).split(" ").filter(Boolean);
  const wb = normalizeName(b).split(" ").filter(Boolean);
  if (wa.length === 0 || wb.length === 0) return null;
  if (wa.join(" ") === wb.join(" ")) return "same_name";

  // One is the start of the other, word by word; its last word may be cut
  // short ("…Center fo"). At least two words, one of them meaningful.
  const [short, long] = wa.length <= wb.length ? [wa, wb] : [wb, wa];
  const startsLong =
    short.every((w, i) => (i < short.length - 1 ? w === long[i] : long[i].startsWith(w))) &&
    short.length >= 2 &&
    significantWords(short.join(" ")).size >= 1;
  if (startsLong) return "starts_the_same";

  // Every telling word of the shorter name is in the longer one, at least
  // two of them: "BetLynArt Publishing (SESAC)" inside "BetLynArt and
  // Shreves Publishing SESAC". Three of four isn't enough: "First Baptist
  // Church of Carlsbad" and "… of Vista" are two churches.
  const sa = significantWords(a);
  const sb = significantWords(b);
  let shared = 0;
  for (const w of sa) if (sb.has(w)) shared++;
  const smaller = Math.min(sa.size, sb.size);
  if (shared >= 2 && shared === smaller) return "most_words";
  return null;
}

/** Pairs of organizations that look like one organization twice. */
export function orgEdges(orgs: readonly { id: string; name: string }[]): Edge[] {
  const edges: Edge[] = [];
  for (let i = 0; i < orgs.length; i++) {
    for (let j = i + 1; j < orgs.length; j++) {
      const reason = orgsLookAlike(orgs[i].name, orgs[j].name);
      if (reason) edges.push({ a: orgs[i].id, b: orgs[j].id, reason });
    }
  }
  return edges;
}

/** The groups the edges make (each two or more ids, sorted), leaving out
 * pairs in `dismissed` (pairKeys). Reasons in the order REASON_LABEL lists
 * them. */
export function groupEdges(
  edges: readonly Edge[],
  dismissed: ReadonlySet<string> = new Set(),
): { ids: string[]; reasons: MatchReason[] }[] {
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    let root = x;
    while (parent.get(root) !== root) root = parent.get(root)!;
    parent.set(x, root);
    return root;
  };
  const kept = edges.filter((e) => e.a !== e.b && !dismissed.has(pairKey(e.a, e.b)));
  for (const e of kept) {
    for (const id of [e.a, e.b]) if (!parent.has(id)) parent.set(id, id);
    const ra = find(e.a);
    const rb = find(e.b);
    if (ra !== rb) parent.set(ra, rb);
  }
  const groups = new Map<string, { ids: Set<string>; reasons: Set<MatchReason> }>();
  for (const e of kept) {
    const root = find(e.a);
    const g = groups.get(root) ?? { ids: new Set<string>(), reasons: new Set<MatchReason>() };
    g.ids.add(e.a);
    g.ids.add(e.b);
    g.reasons.add(e.reason);
    groups.set(root, g);
  }
  const order = Object.keys(REASON_LABEL) as MatchReason[];
  return [...groups.values()].map((g) => ({
    ids: [...g.ids].sort(),
    reasons: order.filter((r) => g.reasons.has(r)),
  }));
}

/** The copies a merge into `keepId` takes on /admin/duplicates: the ticked
 * ones, the kept one aside, in the group's order. */
export function copiesToMerge(ids: readonly string[], keepId: string, ticked: ReadonlySet<string>): string[] {
  return ids.filter((id) => id !== keepId && ticked.has(id));
}

/** "a", "a and b", "a, b and c". */
export function listPhrase(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** "1 project", "3 projects". */
export function countPhrase(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}
