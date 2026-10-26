// Your own "Share your profile" (the share kit) and "Show my code"
// (routes/code.tsx), side by side. On your profile page, and at the top of
// Settings (MyPageLinks), which is where a phone's Profile tab lands
// (routes/_app.tsx): without it there, a phone never saw either.

import { Scan } from "@phosphor-icons/react";
import { useQuery } from "convex/react";
import { Link } from "react-router";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { profilePath } from "../../convex/handleRules";
import type { ShareKitProfile } from "./ProfileShareKit";
import { ShareProfileButton } from "./ShareProfileButton";

const PILL = "inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium transition-colors hover:border-[var(--app-accent)]";
const PILL_STYLE = {
  backgroundColor: "var(--app-surface-raised)",
  color: "var(--app-text)",
  borderColor: "var(--app-hairline)",
};

/** The two buttons, for a profile already loaded (routes/profile.tsx). The
 *  projects are the page's own query, so asking again here costs nothing. */
export function MyShareActions({
  profile,
  onOpen,
  className = "",
}: {
  profile: ShareKitProfile & { _id: Id<"profiles"> };
  /** The share kit opened (ShareHint). */
  onOpen?: () => void;
  className?: string;
}) {
  const projects = useQuery(api.garden.projectTeam.listAffiliations, { profileId: profile._id });
  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      <ShareProfileButton profile={profile} projects={projects} onOpen={onOpen} />
      <Link to="/code" className={PILL} style={PILL_STYLE}>
        <Scan size={16} aria-hidden />
        Show my code
      </Link>
    </div>
  );
}

/** Settings' top: your page, and the two buttons, once your page has loaded. */
export function MyPageLinks({ profileId, handle }: { profileId: Id<"profiles">; handle?: string | null }) {
  const page = useQuery(api.profiles.getProfile, { profileId });
  return (
    <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
      {page && <MyShareActions profile={page} />}
      <Link
        to={handle ? profilePath(handle) : `/profile/${profileId}`}
        className="text-sm font-medium hover:underline"
        style={{ color: "var(--app-accent-ink)" }}
      >
        See your page →
      </Link>
    </div>
  );
}
