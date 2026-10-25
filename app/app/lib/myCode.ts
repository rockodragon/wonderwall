// "My code" (routes/code.tsx): the QR code a creative holds up across a
// table, like WhatsApp's or LinkedIn's. The other person scans it with their
// phone's camera and lands on the creative's public page, which says what
// to do next (components/ScanCard.tsx): Follow if they're a member, join
// with the creative's invite if they aren't.
//
// The code carries both: the invite rides along as ?invite= (routes/_app.tsx
// remembers it for signup, lib/carriedInvite.ts), and ?ref=f2f tells the
// page, and PostHog's page views, that this visit came from a scan face to
// face. Pure, so it's tested without a browser.

import { withInvite } from "./carriedInvite";
import { SITE_ORIGIN } from "./eventCalendar";
import { publicProfileUrl } from "./profileHead";

const REF_PARAM = "ref";
/** ?ref= on a scan of someone's code, face to face. */
export const F2F_REF = "f2f";

/** The page the code opens: the person's public address, carrying their
 *  invite and ref=f2f. Without an address yet, their /profile/<id> page,
 *  with the same two. Always the main site, whichever host it's shown on. */
export function myCodeUrl(person: { handle?: string | null; profileId: string }, inviteSlug: string): string {
  const page = person.handle
    ? publicProfileUrl(person.handle)
    : `${SITE_ORIGIN}/profile/${encodeURIComponent(person.profileId)}`;
  const url = new URL(withInvite(page, inviteSlug));
  url.searchParams.set(REF_PARAM, F2F_REF);
  return url.toString();
}

/** Whether a page's query string says it was opened from someone's code. */
export function isF2fScan(search: string): boolean {
  return new URLSearchParams(search).get(REF_PARAM) === F2F_REF;
}

/** Where a scanner who signs up or in first comes back to: the same page,
 *  still marked as a scan, so it offers Follow. The invite isn't needed
 *  again; the first visit kept it. */
export function scanReturnPath(pathname: string): string {
  return `${pathname}?${REF_PARAM}=${F2F_REF}`;
}

/**
 * What the card above a scanned profile says.
 *   hidden     not a scan, the owner, or still finding out who's looking
 *   invited    signed out: "Ana invited you to …", Join or Sign in
 *   scanned    signed in, not following yet: "You scanned Ana's code." Follow
 *   following  signed in and following: "You're following Ana."
 */
export type ScanCardState = "hidden" | "invited" | "scanned" | "following";

export function scanCardState(v: {
  /** The page's query string. */
  search: string;
  authLoading: boolean;
  signedIn: boolean;
  /** Whether the viewer is the person on the page; undefined while their
   *  own profile loads. */
  isOwner: boolean | undefined;
  /** Whether the viewer follows them; undefined while it loads. */
  following: boolean | undefined;
}): ScanCardState {
  if (!isF2fScan(v.search) || v.authLoading) return "hidden";
  if (!v.signedIn) return "invited";
  if (v.isOwner !== false || v.following === undefined) return "hidden";
  return v.following ? "following" : "scanned";
}
