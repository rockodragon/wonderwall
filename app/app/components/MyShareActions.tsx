// Your own "Share your profile" (the share kit), "Show my code"
// (routes/code.tsx) and Shortlist, as one set of buttons in one row.
// In the Settings header (MyProfileIcons) they're round icons beside Edit,
// since that's where a phone's Profile tab lands (routes/_app.tsx): without
// them there, a phone never saw either. On your profile page they're tiles
// on a phone and the pills from `sm` up.

import { QrCode } from "@phosphor-icons/react";
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
    <Link
      to="/code"
      title={look === "icon" ? OWN_PAGE_LABELS.code.plain : undefined}
      className={OWN_PAGE_LOOK[look]}
      style={OWN_PAGE_BUTTON_STYLE}
    >
      <OwnPageFace look={look} icon={QrCode} label={OWN_PAGE_LABELS.code} />
    </Link>
  );
}

/** The three buttons, for a page already loaded (the share kit is built
 *  from it). `phoneTile` is the profile page's, with its page's own projects
 *  and `children` (the one-time note, ShareHint) under the row on a phone and
 *  between Share and Shortlist from `sm` up. The note is rendered at both
 *  places, shown at one width each, so keyboard and screen-reader order
 *  matches what's on screen (ownPageButton.ts OWN_PAGE_ROW). */
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
  look: "icon" | "phoneTile";
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
      <ShortlistLink look={look} />
      {children && <div className={place.phoneNote}>{children}</div>}
    </div>
  );
}

/** Settings' header: the three as round icons beside Edit, once your page
 *  has loaded (the share kit is built from it). */
export function MyProfileIcons({ profileId }: { profileId: Id<"profiles"> }) {
  const page = useQuery(api.profiles.getProfile, { profileId });
  const projects = useQuery(api.garden.projectTeam.listAffiliations, { profileId });
  // Hold the row's width so Edit doesn't jump when the three land.
  if (!page) return <div className="h-11 w-[140px]" />;
  return <MyShareActions profile={page} projects={projects} look="icon" />;
}
