// A page just made by its owner: the create flows land on it with ?new=1,
// and the page offers "Invite people" once (components/InviteToThis.tsx).

export const JUST_PUBLISHED_PARAM = "new";

/** "/events/abc" → "/events/abc?new=1". */
export function justPublished(path: string): string {
  return `${path}${path.includes("?") ? "&" : "?"}${JUST_PUBLISHED_PARAM}=1`;
}
