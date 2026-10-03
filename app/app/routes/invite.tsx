// /invite — for someone signed in who isn't in the community new accounts
// join, while it's invite-only (2026-10-02): a Google sign-up that came in
// without a code, a code that was refused, a tab closed mid-signup.
// _app.tsx sends them here; InviteGate does the rest. A member (or anyone,
// once the community is open again) goes straight on to /today.

import { useConvexAuth, useQuery } from "convex/react";
import { Link, Navigate } from "react-router";
import { api } from "../../convex/_generated/api";
import { InviteGate } from "../components/InviteGate";

export function meta() {
  return [{ title: "Invite only — TheCreative.exchange" }, { name: "robots", content: "noindex" }];
}

export default function InvitePage() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const community = useQuery(api.garden.defaultCommunity.getSignupCommunity, {});

  if (isLoading || community === undefined) {
    return <div className="min-h-screen bg-gray-50 dark:bg-gray-950" />;
  }
  if (!community || !community.inviteOnly || community.viewer.isMember) {
    return <Navigate to={isAuthenticated ? "/today" : "/signup"} replace />;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 px-4 py-8">
      <div className="max-w-md w-full space-y-6">
        <div className="flex items-center justify-between mb-2">
          <Link to="/" className="text-xl font-bold text-gray-900 dark:text-white">
            TheCreative.exchange
          </Link>
        </div>
        <InviteGate community={community} signedIn={isAuthenticated} />
      </div>
    </div>
  );
}
