// /code — "My code": a QR code to hold up across a table, like WhatsApp's or
// LinkedIn's. The other person scans it with their phone's camera and lands
// on your public page with your invite (lib/myCode.ts). A member is offered
// Follow; someone new is invited in and comes back to Follow
// (components/ScanCard.tsx).
//
// Signed in only: it's not a public path (routes/_app.tsx), so a visitor goes
// to sign in and back. Reached from your own profile ("Show my code"), the
// share kit's QR code ("Open full screen") and the palette's Profile tool.
// The route's own chunk carries the QR library (lib/qrCode.ts), so no other
// page loads it.

import { usePostHog } from "@posthog/react";
import { useQuery } from "convex/react";
import { useEffect, useMemo, useRef } from "react";
import { Link } from "react-router";
import { api } from "../../convex/_generated/api";
import { profilePath } from "../../convex/handleRules";
import { BackLink } from "../components/BackLink";
import { PersonAvatar } from "../components/PersonAvatar";
import { useBrand } from "../brand/brands";
import { myCodeUrl } from "../lib/myCode";
import { displayLink, profileLink, shareSite } from "../lib/profileShare";
import { QR_DARK, qrMatrix, qrSvg } from "../lib/qrCode";
import { useInviteLink } from "../lib/useInviteLink";

export function meta() {
  return [{ title: "My code — TheCreative.exchange" }];
}

export default function MyCode() {
  return <MyCodePage />;
}

/** Words on the white card: the QR code's own ink, and a softer one. */
const INK = QR_DARK;
const INK_SOFT = "#55554f";
/** Light squares drawn around the code. The white card's own margin makes up
 *  the rest of the standard four, so the squares themselves can be bigger. */
const QUIET = 2;

export function MyCodePage() {
  const posthog = usePostHog();
  const me = useQuery(api.profiles.getMyProfile);
  // Makes the invite slug if the account has none yet.
  const { inviteLink } = useInviteLink("code");
  const slug = inviteLink?.slug ?? null;
  // From a Garden domain the code opens createthegarden.com (shareSite).
  const site = shareSite(useBrand());
  const url = me && slug ? myCodeUrl({ handle: me.handle, profileId: me._id }, slug, site) : null;
  const qr = useMemo(
    () => (url ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(qrSvg(qrMatrix(url), QUIET))}` : null),
    [url],
  );
  useScreenAwake();

  const opened = useRef(false);
  useEffect(() => {
    if (!me || opened.current) return;
    opened.current = true;
    posthog?.capture("my_code_opened", { hasHandle: !!me.handle });
  }, [me, posthog]);

  return (
    <div className="px-4 pb-8 pt-4 sm:pt-8" style={{ backgroundColor: "var(--app-surface)" }}>
      <div className="mx-auto w-full max-w-sm">
        <BackLink fallback={me ? (me.handle ? profilePath(me.handle) : `/profile/${me._id}`) : "/today"} className="mb-4" />
        {me === null ? (
          <p className="text-sm" style={{ color: "var(--app-text-muted)" }}>
            Your profile isn't ready yet.{" "}
            <Link to="/onboarding" className="font-medium hover:underline" style={{ color: "var(--app-accent-ink)" }}>
              Set it up
            </Link>
            .
          </p>
        ) : (
          <div className="rounded-3xl bg-white p-4 shadow-sm sm:p-5" style={{ color: INK }}>
            <div className="flex min-h-14 items-center gap-3">
              {me && <PersonAvatar name={me.name} imageUrl={me.imageUrl} size="lg" tone="gray" />}
              <div className="min-w-0">
                <h1 className="break-words text-lg font-semibold leading-tight">{me?.name ?? "My code"}</h1>
                {me?.handle && (
                  <p className="break-words text-sm" style={{ color: INK_SOFT }}>
                    @{me.handle}
                  </p>
                )}
              </div>
            </div>
            {qr ? (
              <img
                src={qr}
                alt="QR code for your profile, with your invite"
                className="mt-4 block aspect-square w-full"
              />
            ) : (
              <div
                role="status"
                className="mt-4 flex aspect-square w-full items-center justify-center rounded-xl text-sm motion-safe:animate-pulse"
                style={{ backgroundColor: "#f1f1ee", color: INK_SOFT }}
              >
                Getting your code ready…
              </div>
            )}
            <p className="mt-3 text-center text-xl font-semibold">Scan to follow me</p>
            <p className="mt-1 text-center text-sm" style={{ color: INK_SOFT }}>
              New here? It brings you in with my invite.
            </p>
            {me?.handle && (
              <p className="mt-3 break-all text-center text-xs" style={{ color: INK_SOFT }}>
                {displayLink(profileLink(me.handle, undefined, site))}
              </p>
            )}
          </div>
        )}
        {me && !me.handle && (
          <p className="mt-4 text-sm" style={{ color: "var(--app-text-muted)" }}>
            Your code works now. For an address of your own, {displayLink(site.origin)}/@you,{" "}
            <Link to="/settings#address" className="font-medium hover:underline" style={{ color: "var(--app-accent-ink)" }}>
              choose one in Settings
            </Link>
            .
          </p>
        )}
      </div>
    </div>
  );
}

/** Keeps the screen on while the code is showing: a phone held out across a
 *  table otherwise dims and locks while the other camera finds the code.
 *  The browser lets go when the tab is hidden, so ask again on return.
 *  Where there's no wake lock, nothing happens. */
function useScreenAwake() {
  useEffect(() => {
    let lock: WakeLockSentinel | null = null;
    let done = false;
    const ask = () => {
      if (done || document.visibilityState !== "visible" || !("wakeLock" in navigator)) return;
      navigator.wakeLock
        .request("screen")
        .then((l) => {
          if (done) void l.release();
          else lock = l;
        })
        .catch(() => {
          // Refused (low battery, a policy): the screen dims as usual.
        });
    };
    ask();
    document.addEventListener("visibilitychange", ask);
    return () => {
      done = true;
      document.removeEventListener("visibilitychange", ask);
      lock?.release().catch(() => {});
    };
  }, []);
}
