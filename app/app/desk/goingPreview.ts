// Who's going, as an opened event card says it: a few faces and names
// instead of a bare count (Rick, 2026-10-05: "list some... show people that
// we're connected with"). People you follow come first, then people with a
// photo. You're left out: the button already says "You're going". Pure rules.

export type GoingPerson = {
  key: string;
  userId: string | null;
  profileId: string | null;
  name: string;
  imageUrl: string | null;
  joinedAt: number;
  /** Tickets beyond their own. */
  extraTickets: number;
};

export type GoingPreview = {
  /** The faces, in order. */
  faces: GoingPerson[];
  /** "Ana, Ben and 4 others are going", or null when nobody else is going. */
  line: string | null;
};

/** How many faces and how many first names the line shows. */
export const GOING_FACES = 4;
export const GOING_NAMES = 2;

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? "";
}

/** A name worth showing: the attendee query says "Anonymous" for a member
 *  with no profile name. */
function named(p: GoingPerson): boolean {
  return firstName(p.name) !== "" && p.name !== "Anonymous";
}

export function goingPreview(
  attendees: readonly GoingPerson[],
  viewerUserId: string | null,
  followedProfileIds: ReadonlySet<string>,
): GoingPreview {
  const isViewer = (p: GoingPerson) => viewerUserId !== null && p.userId === viewerUserId;
  const others = attendees.filter((p) => !isViewer(p));
  // Everyone going, tickets included, less the viewer's own.
  const total = others.reduce((n, p) => n + 1 + p.extraTickets, 0);

  const rank = (p: GoingPerson) =>
    (p.profileId && followedProfileIds.has(p.profileId) ? 0 : 3) + (p.imageUrl ? 0 : 1) + (named(p) ? 0 : 1);
  const ordered = [...others].sort((a, b) => rank(a) - rank(b) || a.joinedAt - b.joinedAt);

  const faces = ordered.slice(0, GOING_FACES);
  const names = ordered.filter(named).slice(0, GOING_NAMES).map((p) => firstName(p.name));
  if (names.length === 0) return { faces, line: total > 0 ? `${total} going` : null };

  const rest = total - names.length;
  const list =
    rest > 0
      ? `${names.join(", ")} and ${rest} ${rest === 1 ? "other" : "others"}`
      : names.length === 2
        ? `${names[0]} and ${names[1]}`
        : names[0];
  const plural = names.length > 1 || rest > 0;
  return { faces, line: `${list} ${plural ? "are" : "is"} going` };
}
