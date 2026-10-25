// A one-time note under the share buttons on your own profile
// (routes/profile.tsx), so people learn the share kit and "My code" exist.
// With no address yet it asks for one first, since every link, code and
// card points at it; with one, it says what "Share your profile" holds.
// Gone for good once closed, or once they open the share kit
// (hooks/useOnceNote.ts). The address it names is the site's own
// (lib/profileShare.ts shareSite): createthegarden.com on a Garden domain.

import { X } from "@phosphor-icons/react";
import { Link } from "react-router";
import { useBrand } from "../brand/brands";
import { FOCUS_RING_CLASS } from "../desk/tokens";
import { useOnceNote } from "../hooks/useOnceNote";
import { displayLink, shareSite } from "../lib/profileShare";

export const CLAIM_HINT_KEY = "profile.claimHint";
export const SHARE_HINT_KEY = "profile.shareHint";

/** The note's state for your own profile: whether it's up, and how to close
 *  it. `ready` is false until the page knows it's yours. */
export function useShareHint(hasHandle: boolean, ready: boolean) {
  return useOnceNote(hasHandle ? SHARE_HINT_KEY : CLAIM_HINT_KEY, ready);
}

export function ShareHint({ hasHandle, onClose }: { hasHandle: boolean; onClose: () => void }) {
  const site = shareSite(useBrand());
  return (
    <aside
      aria-label={hasHandle ? "Sharing your profile" : "Your address"}
      // It sits in the profile's action column, which is as wide as its
      // widest child: capped, the words wrap instead of widening the page.
      className="flex w-full max-w-[22rem] items-start gap-3 rounded-xl border px-4 py-3 text-sm"
      style={{ backgroundColor: "var(--app-surface-raised)", borderColor: "var(--app-hairline)", color: "var(--app-text)" }}
    >
      <p className="flex-1">
        {hasHandle ? (
          <>
            New: <strong>Share your profile</strong> has your link for Instagram and Linktree, a QR code to print, a story
            picture and a card for your website. <strong>Show my code</strong> is the QR code to hold up in person.
          </>
        ) : (
          <>
            Choose your address, {displayLink(site.origin)}/@yourname, so people can find your work and share it.{" "}
            <Link to="/settings#address" className="font-medium hover:underline" style={{ color: "var(--app-accent-ink)" }}>
              Choose it in Settings
            </Link>
          </>
        )}
      </p>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className={`shrink-0 rounded-md p-1 ${FOCUS_RING_CLASS}`}
        style={{ color: "var(--app-text-muted)" }}
      >
        <X size={16} aria-hidden />
      </button>
    </aside>
  );
}
