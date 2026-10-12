// The top corner of Today on a phone (Rick, 2026-10-12): the Shortlist and
// Messages, the two things that left the bottom bar when it went to five
// places, where a feed app keeps its inbox. The Shortlist's bookmark gets
// the accent dot while something needs you, the same dot the sidebar's row
// has; the envelope gets the red count of unread messages and
// notifications, the same chip the sidebar's row has.
//
// Today already holds the Shortlist (its Needs you rows read it), so the
// count comes in; the two unread counts are the shell's own subscriptions,
// shared with it.

import { useId } from "react";
import { Link } from "react-router";
import { useQuery } from "convex/react";
import { BookmarkSimple, EnvelopeSimple } from "@phosphor-icons/react";
import { api } from "../../../convex/_generated/api";
import { favoritesHref } from "../../lib/shortlist/url";
import { NeedsYouDot } from "../shortlist/NeedsYouDot";
import { CountBadge } from "./CountBadge";

const ICON_LINK =
  "relative inline-flex h-10 w-10 items-center justify-center rounded-full no-underline transition-colors active:bg-[var(--app-hairline)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--app-accent-ink)]";

export function TodayActions({ needsYou }: { needsYou: number }) {
  const unread = useQuery(api.messaging.getUnreadCount) ?? 0;
  const notifications = useQuery(api.notifications.getUnreadCount) ?? 0;
  const dotId = useId();
  return (
    // A phone's corner only: from md up the sidebar (palette off) or the
    // palette has both already.
    <div className="-mr-2 flex items-center md:hidden">
      <Link
        to={favoritesHref()}
        aria-label="Shortlist"
        aria-describedby={needsYou > 0 ? dotId : undefined}
        className={ICON_LINK}
        style={{ color: "var(--app-text)" }}
      >
        <span className="relative">
          <BookmarkSimple size={24} aria-hidden />
          {needsYou > 0 && <NeedsYouDot id={dotId} count={needsYou} />}
        </span>
      </Link>
      <Link to="/messages" aria-label="Messages" className={ICON_LINK} style={{ color: "var(--app-text)" }}>
        <span className="relative">
          <EnvelopeSimple size={24} aria-hidden />
          <CountBadge count={unread + notifications} />
        </span>
      </Link>
    </div>
  );
}
