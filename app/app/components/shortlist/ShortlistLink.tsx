// "Your shortlist →": the way to the Shortlist from your own profile and
// from the settings page's Profile tab, the two places the bottom bar's
// Profile tab leads. One button, so the two can't drift.

import { Link } from "react-router";
import { BookmarkSimple } from "@phosphor-icons/react";
import { favoritesHref } from "../../lib/shortlist/url";

export function ShortlistLink({ className = "" }: { className?: string }) {
  return (
    <Link
      to={favoritesHref()}
      className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium no-underline transition-colors hover:border-[var(--app-accent)] ${className}`}
      style={{
        backgroundColor: "var(--app-surface-raised)",
        color: "var(--app-text)",
        borderColor: "var(--app-hairline)",
      }}
    >
      <BookmarkSimple size={16} aria-hidden />
      Your shortlist →
    </Link>
  );
}
