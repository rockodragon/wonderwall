// Joining an invite-only community with a code (2026-10-02: The Garden
// takes a member's invite code, or a paid ticket; without one, people go
// to the waitlist). Called right after a new account exists — signup.tsx
// (phone, password) and oauth-callback.tsx (Google) — and from the /invite
// page. The server checks the code (garden/communities.ts joinCommunity);
// if this fails or never runs, the app's invite gate (_app.tsx) sends the
// person to /invite, so nobody is left inside without one.

import type { Id } from "../../convex/_generated/dataModel";
import { errorCode, errorMessage, isNotSignedIn } from "./convexError";

type JoinArgs = { hostOrgId: Id<"hostOrgs">; agreed?: boolean; inviteCode?: string };
type Join = (args: JoinArgs) => Promise<unknown>;

/** Null when they're in; otherwise the reason to show. Retries only while
 * the new session's token reaches the Convex client (signIn resolves a
 * beat early); a refused code won't change on retry. */
export async function joinWithInvite(
  join: Join,
  hostOrgId: Id<"hostOrgs">,
  inviteCode: string,
): Promise<string | null> {
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      await join({ hostOrgId, agreed: true, inviteCode });
      return null;
    } catch (err) {
      if (errorCode(err) && !isNotSignedIn(err)) {
        return errorMessage(err, "That code didn't work.");
      }
      await new Promise((resolve) => setTimeout(resolve, 400));
    }
  }
  return "Couldn't finish joining — try your code again.";
}
