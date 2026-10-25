// The card above a profile opened from that person's code (routes/code.tsx,
// lib/myCode.ts): the page's address has ?ref=f2f. A member gets the Follow
// button; once they follow, the card says so, and the person they followed
// gets "is following your work" with Follow back one tap away
// (docs/features/following.md). Someone with no account is told who invited
// them, with Join and Sign in; the invite is already kept from the address
// (routes/_app.tsx), and they come back here afterwards to tap Follow
// themselves. Nobody else sees the card, and it asks nothing of the server
// unless it shows.

import { usePostHog } from "@posthog/react";
import { useConvexAuth, useQuery } from "convex/react";
import { useEffect, useRef } from "react";
import { Link, useLocation } from "react-router";
import { api } from "../../convex/_generated/api";
import { GARDEN, PLATFORM_NAME, useBrand } from "../brand/brands";
import { loginHref } from "../lib/loginHref";
import { isF2fScan, scanCardState, scanReturnPath, type ScanCardState } from "../lib/myCode";
import { addressName } from "../lib/names";
import { setPendingIntent, signupHref } from "../lib/pendingIntent";
import { FavoriteButton } from "./FavoriteButton";

export function ScanCard({
  profile,
  isOwner,
}: {
  profile: { _id: string; name: string };
  /** Whether the viewer is this person; undefined while that's loading. */
  isOwner: boolean | undefined;
}) {
  const location = useLocation();
  const { isAuthenticated, isLoading } = useConvexAuth();
  const posthog = usePostHog();
  // The same subscription the Follow button holds, so it costs nothing more.
  const asksFollow = isF2fScan(location.search) && !isLoading && isAuthenticated && isOwner === false;
  const following = useQuery(
    api.favorites.isFavorited,
    asksFollow ? { targetType: "profile", targetId: profile._id } : "skip",
  );
  const state = scanCardState({
    search: location.search,
    authLoading: isLoading,
    signedIn: isAuthenticated,
    isOwner,
    following,
  });

  // One landing per page, once it's known who's looking.
  const landed = useRef<string | null>(null);
  useEffect(() => {
    if (state === "hidden" || landed.current === profile._id) return;
    landed.current = profile._id;
    posthog?.capture("f2f_scan_landed", { signedIn: state !== "invited" });
  }, [state, profile._id, posthog]);

  // A follow made here, by either Follow button on the page: not following,
  // then following. Already following on arrival doesn't count.
  const wasFollowing = useRef<boolean | undefined>(undefined);
  useEffect(() => {
    if (wasFollowing.current === false && following === true) posthog?.capture("f2f_followed");
    wasFollowing.current = following;
  }, [following, posthog]);

  if (state === "hidden") return null;
  return <ScanCardView state={state} name={profile.name} profileId={profile._id} returnTo={scanReturnPath(location.pathname)} />;
}

/** The card's words and buttons for one state. */
function ScanCardView({
  state,
  name,
  profileId,
  returnTo,
}: {
  state: Exclude<ScanCardState, "hidden">;
  name: string;
  profileId: string;
  /** This page, still marked as a scan. */
  returnTo: string;
}) {
  const brand = useBrand();
  const first = addressName(name);
  const place = brand === "garden" ? GARDEN.name : PLATFORM_NAME;

  return (
    <section
      aria-label={`${first}'s code`}
      className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-3"
      style={{ backgroundColor: "var(--app-surface-raised)", borderColor: "var(--app-hairline)" }}
    >
      <p aria-live="polite" className="min-w-0 text-sm font-medium" style={{ color: "var(--app-text)" }}>
        {state === "invited"
          ? `${first} invited you to ${place}.`
          : state === "following"
            ? `You're following ${first}.`
            : `You scanned ${first}'s code.`}
      </p>
      {state === "invited" ? (
        <div className="flex flex-wrap items-center gap-2">
          {/* Back here afterwards, still a scan, to tap Follow. Signup and
              login carry ?redirect= too; this covers a detour on the way. */}
          <Link
            to={signupHref(returnTo)}
            onClick={() => setPendingIntent(returnTo)}
            className="rounded-full px-4 py-1.5 text-sm font-semibold transition-opacity hover:opacity-90"
            style={{ backgroundColor: "var(--app-accent)", color: "var(--garden-ink)" }}
          >
            Join
          </Link>
          <Link
            to={loginHref(returnTo)}
            onClick={() => setPendingIntent(returnTo)}
            className="rounded-full border px-4 py-1.5 text-sm font-medium transition-colors hover:border-[var(--app-accent)]"
            style={{ color: "var(--app-text-muted)", borderColor: "var(--app-hairline)" }}
          >
            Sign in
          </Link>
        </div>
      ) : (
        <FavoriteButton targetType="profile" targetId={profileId} />
      )}
    </section>
  );
}
