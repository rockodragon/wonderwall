// Where a fund's Give buttons go. Giving to the fund needs an account (Rick,
// 2026-11-06): signed out, Give is sign up and come back; signed in, the
// fund's own Stripe Payment Links name the giver (buildFundDonorLink), so the
// AP webhook (convex/garden/apGifts.ts) puts the gift on their account. The
// one place the fund page (fund.$slug.tsx) and the grant program page
// (grant-program.tsx) get their Give links.

import { useConvexAuth } from "convex/react";
import { useMemo } from "react";
import { buildFundDonorLink } from "../../convex/garden/givingLink";
import { isStripePaymentLink } from "../../convex/garden/ticketLink";
import { signupHref } from "./pendingIntent";
import { useViewer } from "./useViewer";

/** The line under a signed-out visitor's Give button, on every fund page. */
export const FUND_ACCOUNT_FIRST = "You'll make a free account first.";

export type FundOrgLinks = {
  paymentLinkUrl?: string | null;
  monthlyPaymentLinkUrl?: string | null;
  givingUrl?: string | null;
};

export type FundGiveLinks =
  /** Still finding out who is looking. */
  | { state: "loading" }
  /** The fund has no giving link yet. */
  | { state: "none" }
  /** No account to credit yet: Give goes to `href` (sign up, or finish
   *  onboarding when signed in with no profile), then back to `returnTo`.
   *  The page stashes `returnTo` as the pending intent on the click. */
  | { state: "needsAccount"; href: string; returnTo: string }
  /** Signed in: the links, naming the giver when they are Stripe links. */
  | { state: "ready"; oneTime: string | null; monthly: string | null };

type Viewer = { authLoading?: boolean; signedIn: boolean; profile: { userId: string; email?: string | null } | null | undefined };

/** Pure, so it can be tested without React. */
export function fundGiveLinks(org: FundOrgLinks | null | undefined, viewer: Viewer, returnTo: string): FundGiveLinks {
  if (org === undefined) return { state: "loading" };
  const oneTime = org?.paymentLinkUrl ?? org?.givingUrl ?? null;
  const monthly = org?.monthlyPaymentLinkUrl ?? null;
  if (!oneTime && !monthly) return { state: "none" };
  if (viewer.authLoading) return { state: "loading" };
  if (!viewer.signedIn) return { state: "needsAccount", href: signupHref(returnTo), returnTo };
  if (viewer.profile === undefined) return { state: "loading" };
  // Signed in but no profile yet (a Google sign-in that left onboarding):
  // no id to credit, and /signup would sign them out. Onboarding first;
  // it ends on /today, which replays the pending intent back here.
  if (viewer.profile === null) return { state: "needsAccount", href: "/onboarding", returnTo };

  const userId = String(viewer.profile.userId);
  const email = viewer.profile.email ?? undefined;
  const tag = (url: string | null) =>
    url && isStripePaymentLink(url) ? buildFundDonorLink(url, userId, { email }) : url;
  return { state: "ready", oneTime: tag(oneTime), monthly: tag(monthly) };
}

export function useFundGiveLinks(org: FundOrgLinks | null | undefined, returnTo: string): FundGiveLinks {
  const { isLoading } = useConvexAuth();
  const viewer = useViewer();
  return useMemo(
    () => fundGiveLinks(org, { ...viewer, authLoading: isLoading }, returnTo),
    [org, viewer, isLoading, returnTo],
  );
}
