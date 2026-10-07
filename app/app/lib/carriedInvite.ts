// An invite that rides on a shared link (Rick, 2026-10-07: invites belong
// where people want others to come). A member shares their event or project
// as /events/<id>?invite=<code>; whoever opens it gets the page, and the
// code is kept in this browser. Signing up later (/signup with no code) or
// meeting the invite-only door (/invite) uses it, so a friend from a shared
// link gets in and the member who shared it is credited. The server checks
// the code every time, as it does any other.
//
// /?invite=<code> already goes straight to /signup/<code> (home.tsx).

import { normalizeInviteCode } from "../../convex/inviteCode";

export const INVITE_PARAM = "invite";
const KEY = "carriedInvite";

/** A page's address with an invite on it: "/events/abc" → "/events/abc?invite=K7M4QD". */
export function withInvite(url: string, code: string): string {
  const [base, hash = ""] = url.split("#");
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}${INVITE_PARAM}=${encodeURIComponent(code)}${hash ? `#${hash}` : ""}`;
}

/** The code a page's query string carries, if any. */
export function inviteFromSearch(search: string): string | null {
  const raw = new URLSearchParams(search).get(INVITE_PARAM);
  const code = normalizeInviteCode(raw);
  return code || null;
}

/** Keep a code that came on a link. The newest link wins. */
export function rememberInvite(code: string): void {
  const clean = normalizeInviteCode(code);
  if (!clean) return;
  try {
    localStorage.setItem(KEY, clean);
  } catch {
    // Storage blocked: they can still type the code at the door.
  }
}

/** The code a link left here, if any. */
export function rememberedInvite(): string | null {
  try {
    return normalizeInviteCode(localStorage.getItem(KEY)) || null;
  } catch {
    return null;
  }
}
