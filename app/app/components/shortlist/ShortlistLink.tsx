// "Your shortlist →": the way to the Shortlist from your own profile and
// from the settings page's Profile tab, the two places the bottom bar's
// Profile tab leads. One button, so the two can't drift.

import { Link } from "react-router";
import { BookmarkSimple } from "@phosphor-icons/react";
import { favoritesHref } from "../../lib/shortlist/url";
import { OwnPageFace } from "../OwnPageFace";
import { OWN_PAGE_BUTTON_STYLE, OWN_PAGE_LABELS, OWN_PAGE_LOOK, type OwnPageLook } from "../ownPageButton";

export function ShortlistLink({ className = "", look = "pill" }: { className?: string; look?: OwnPageLook }) {
  return (
    <Link
      to={favoritesHref()}
      title={look === "icon" ? OWN_PAGE_LABELS.shortlist.plain : undefined}
      className={`${OWN_PAGE_LOOK[look]} ${className}`}
      style={OWN_PAGE_BUTTON_STYLE}
    >
      <OwnPageFace look={look} icon={BookmarkSimple} label={OWN_PAGE_LABELS.shortlist} />
    </Link>
  );
}
