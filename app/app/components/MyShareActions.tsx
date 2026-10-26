// Your own "Share your profile" (the share kit), "Show my code"
// (routes/code.tsx) and Shortlist, as one set of buttons in one row.
// At the top of Settings (MyProfileTiles) they're tiles, since that's where
// a phone's Profile tab lands (routes/_app.tsx): without them there, a phone
// never saw either. On your profile page (MyShareActions) they're tiles on a
// phone and the pills from `sm` up.

import { Scan } from "@phosphor-icons/react";
import { useQuery } from "convex/react";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { OwnPageFace } from "./OwnPageFace";
import { OWN_PAGE_BUTTON_STYLE, OWN_PAGE_LABELS, OWN_PAGE_LOOK, OWN_PAGE_ROW, type OwnPageLook } from "./ownPageButton";
import type { ShareKitProfile } from "./ProfileShareKit";
import { ShareProfileButton } from "./ShareProfileButton";
import { ShortlistLink } from "./shortlist/ShortlistLink";
import type { ProjectRow } from "../lib/profileShare";

function MyCodeLink({ look }: { look: OwnPageLook }) {
  return (
    <Link to="/code" className={OWN_PAGE_LOOK[look]} style={OWN_PAGE_BUTTON_STYLE}>
      <OwnPageFace look={look} icon={Scan} label={OWN_PAGE_LABELS.code} />
    </Link>
  );
}

/** The three buttons, for a page already loaded (the share kit is built
 *  from it). `phoneTile` is the profile page's, with its page's own projects
 *  and `children` (the one-time note, ShareHint) under the row on a phone and
 *  between Share and Shortlist from `sm` up. */
export function MyShareActions({
  profile,
  projects,
  look,
  onOpen,
  className = "",
  children,
}: {
  profile: ShareKitProfile;
  projects: readonly ProjectRow[] | undefined;
  look: "tile" | "phoneTile";
  /** The share kit opened (ShareHint). */
  onOpen?: () => void;
  className?: string;
  children?: ReactNode;
}) {
  const place = OWN_PAGE_ROW[look];
  return (
    <div className={`${place.row} ${className}`}>
      <div className={place.pair}>
        <ShareProfileButton profile={profile} projects={projects} look={look} onOpen={onOpen} />
        <MyCodeLink look={look} />
      </div>
      {children && <div className={place.note}>{children}</div>}
      <ShortlistLink look={look} className={place.shortlist} />
    </div>
  );
}

/** Settings' top: the three as tiles, once your page has loaded. */
export function MyProfileTiles({ profileId }: { profileId: Id<"profiles"> }) {
  const page = useQuery(api.profiles.getProfile, { profileId });
  const projects = useQuery(api.garden.projectTeam.listAffiliations, { profileId });
  // Hold the row's height so the sections below don't jump when it lands.
  if (!page) return <div className="mt-5 h-[68px]" />;
  return <MyShareActions profile={page} projects={projects} look="tile" className="mt-5 max-w-md" />;
}
