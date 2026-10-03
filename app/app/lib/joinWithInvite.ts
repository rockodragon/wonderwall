// Joining an invite-only community with a code (2026-10-02: The Garden
// takes a member's invite code, or a paid ticket; without one, people go
// to the waitlist). Called right after a new account exists — signup.tsx
// (phone, password) and oauth-callback.tsx (Google) — and from the /invite
// page. The server checks the code (garden/communities.ts joinCommunity);
// if this fails or never runs, the app's invite gate (_app.tsx) sends the
// person to /invite, so nobody is left inside without one.

import { ConvexError } from "convex/values";
import type { Id } from "../../convex/_generated/dataModel";

type JoinArgs = { hostOrgId: Id<"hostOrgs">; agreed?: boolean; inviteCode?: string };
type Join = (args: JoinArgs) => Promise<unknown>;

const NOT_YET_SIGNED_IN = "unauthenticated";

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
      const data = err instanceof ConvexError ? (err.data as { code?: string; reason?: string }) : null;
      if (data?.code && data.code !== NOT_YET_SIGNED_IN) {
        return data.reason ?? "That code didn't work.";
      }
      await new Promise((resolve) => setTimeout(resolve, 400));
    }
  }
  return "Couldn't finish joining — try your code again.";
}
