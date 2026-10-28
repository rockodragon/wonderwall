// A page just made by its owner: the create flows land on it with ?new=1,
// and the page offers "Invite people" once (components/InviteToThis.tsx).

export const JUST_PUBLISHED_PARAM = "new";

/** "/events/abc" → "/events/abc?new=1". */
export function justPublished(path: string): string {
  return `${path}${path.includes("?") ? "&" : "?"}${JUST_PUBLISHED_PARAM}=1`;
}

/** Where a create flow lands after making a project: a published one with
 *  ?new=1 (its "Invite people" card), a draft on its page as is, since
 *  there is nothing to invite people to yet. */
export function createdProjectPath(projectId: string, { draft = false }: { draft?: boolean } = {}): string {
  const path = `/projects/${projectId}`;
  return draft ? path : justPublished(path);
}

/** A project with nothing to look at yet: no picture, no pasted link that
 *  plays, no attached piece. At any stage — a title and a line are enough to
 *  post from onboarding — its just-published card asks for a picture or a
 *  link before it offers invites. `thumb` is the page's hero picture, null
 *  when a link plays or pieces show instead. Passion projects only: a paid
 *  post is a job, not something to show. */
export function needsPictureOrLink(project: {
  kind: string;
  thumb: string | null | undefined;
  mediaEmbed: unknown;
  hasPieces: boolean;
}): boolean {
  return project.kind === "passion" && !project.thumb && !project.mediaEmbed && !project.hasPieces;
}
