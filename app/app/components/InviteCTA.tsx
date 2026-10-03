import { Link } from "react-router";
import { useInviteLink } from "../lib/useInviteLink";

/** Person-with-a-plus: the invite glyph, shared by the sidebar row and
 * the People page's "Invite" button. */
export function InviteIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="9" cy="8" r="4" />
      <path d="M2 21a7 7 0 0114 0M19 8v6M16 11h6" />
    </svg>
  );
}

/** Whether one click can copy the invite link. When it can't (still
 *  generating, or no clipboard), the invite row goes to Settings → Network.
 *  Shared by this row and the palette's. No invite limit (2026-10-03). */
export function canCopyInvite(link: { loading: boolean; url: string }): boolean {
  return (
    !link.loading &&
    Boolean(link.url) &&
    typeof navigator !== "undefined" &&
    !!navigator.clipboard
  );
}

/** The invite row's label: it says so for two seconds after the copy. */
export function inviteRowLabel(copied: boolean): string {
  return copied ? "Invite link copied" : "Invite someone";
}

// Sidebar (docs/the-exchange-v1-prd.md §5 nav note): one row, one click
// copies your invite link. The full link, Share and the people you've
// invited live on Settings → Network, which the row falls back to when
// there's no link to copy (canCopyInvite).
export function InviteCTA() {
  const { loading, url, copied, copy } = useInviteLink("sidebar");
  const rowClass =
    "flex w-full items-center gap-3 px-4 py-2.5 rounded-lg text-[15px] text-left transition-colors hover:bg-[var(--app-hairline)]";

  if (!canCopyInvite({ loading, url })) {
    return (
      <Link to="/settings?tab=network" className={rowClass} style={{ color: "var(--app-text-muted)" }}>
        <InviteIcon className="w-5 h-5" />
        Invite someone
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={copy}
      title={`Copy ${url}`}
      className={rowClass}
      style={{ color: copied ? "var(--app-accent-ink)" : "var(--app-text-muted)" }}
    >
      <InviteIcon className="w-5 h-5" />
      {inviteRowLabel(copied)}
    </button>
  );
}

/** "+ Invite" for a page header (People): copies your link in one click. */
export function InviteButton() {
  const { loading, url, copied, copy } = useInviteLink("people");
  if (loading || !url) return null;
  return (
    <button
      type="button"
      onClick={copy}
      title={`Copy ${url}`}
      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border shrink-0 transition-colors hover:bg-[var(--app-hairline)]"
      style={{ borderColor: "var(--app-hairline-raised)", color: "var(--app-text)" }}
    >
      <InviteIcon className="w-4 h-4" />
      {copied ? "Link copied" : "Invite"}
    </button>
  );
}
