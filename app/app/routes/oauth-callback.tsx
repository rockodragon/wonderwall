import { useMutation, useQuery } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { useConvexAuth } from "convex/react";
import { usePostHog } from "@posthog/react";
import { isCheckoutSessionId } from "../../convex/garden/ticketLink";
import { api } from "../../convex/_generated/api";
import { joinWithInvite } from "../lib/joinWithInvite";

/**
 * OAuth callback handler for Google sign-up flow.
 * With an invite slug in the URL: joins the signup community with it when
 * that's invite-only, redeems the invite and goes to onboarding (or to
 * /invite if the code was refused).
 * Without one: a new account goes to onboarding — or /invite while the
 * signup community is invite-only — anyone else to /today.
 */
export default function OAuthCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const posthog = usePostHog();
  const { isAuthenticated, isLoading } = useConvexAuth();
  const redeemInvite = useMutation(api.invites.redeemBySlug);
  const generateSlug = useMutation(api.invites.generateInviteSlug);
  const joinCommunity = useMutation(api.garden.communities.joinCommunity);
  // The community a new account joins. While it's invite-only, the code
  // that opened signup is what gets them in (joinWithInvite); without one,
  // or if it's refused, they go to /invite instead of onboarding.
  const signupCommunity = useQuery(api.garden.defaultCommunity.getSignupCommunity, isAuthenticated ? {} : "skip");
  const handledInvite = useRef(false);
  const [status, setStatus] = useState<"loading" | "processing" | "error">(
    "loading",
  );
  const [error, setError] = useState<string | null>(null);

  const inviteSlug = searchParams.get("invite");

  // Only needed when there's no invite: the profile says whether this is a
  // brand-new account (no primaryRole yet) or someone coming back.
  const profile = useQuery(
    api.profiles.getMyProfile,
    isAuthenticated && !inviteSlug ? {} : "skip",
  );
  const handledNoInvite = useRef(false);

  useEffect(() => {
    if (isLoading) return;

    if (!isAuthenticated) {
      // Not authenticated yet, wait or redirect to login
      setError("Authentication failed. Please try again.");
      setStatus("error");
      return;
    }

    // Wait for the signup community: it decides whether a code is needed.
    if (signupCommunity === undefined) return;
    const inviteOnly = !!signupCommunity?.inviteOnly;

    if (!inviteSlug) {
      // undefined = still loading; null/no primaryRole = new account.
      if (profile === undefined || handledNoInvite.current) return;
      handledNoInvite.current = true;

      if (profile?.primaryRole) {
        navigate("/today", { replace: true });
        return;
      }

      (async () => {
        setStatus("processing");
        try {
          // Every new account gets its own invite link.
          await generateSlug({});
        } catch (err) {
          posthog?.capture("invite_slug_generation_failed", {
            error: err instanceof Error ? err.message : "Unknown error",
          });
        }
        navigate(inviteOnly ? "/invite" : "/onboarding", { replace: true });
      })();
      return;
    }

    if (handledInvite.current) return;
    handledInvite.current = true;

    // Process the invite for new OAuth signups
    async function processInvite() {
      setStatus("processing");

      // Join first: crediting the invite counts against its limit.
      if (inviteOnly && signupCommunity) {
        const refused = await joinWithInvite(joinCommunity, signupCommunity.id, inviteSlug!);
        if (refused) {
          posthog?.capture("oauth_invite_join_refused", { reason: refused, invite_slug: inviteSlug });
          try {
            await generateSlug({});
          } catch {
            // Their own link can wait; /invite comes first.
          }
          navigate("/invite", { replace: true });
          return;
        }
      }

      try {
        // Redeem the invite
        // A ticket's checkout session (signup.tsx) isn't an invite to redeem.
        if (!isCheckoutSessionId(inviteSlug)) await redeemInvite({ slug: inviteSlug! });
        console.log("✅ OAuth: Redeemed invite:", inviteSlug);

        // Generate user's own invite slug
        const newSlug = await generateSlug({});
        console.log("✅ OAuth: Generated invite slug:", newSlug);

        posthog?.capture("oauth_signup_completed", {
          invite_slug: inviteSlug,
        });

        // Redirect to onboarding
        navigate("/onboarding", { replace: true });
      } catch (err) {
        console.error("❌ OAuth invite processing failed:", err);
        posthog?.capture("oauth_invite_error", {
          error: err instanceof Error ? err.message : "Unknown error",
          invite_slug: inviteSlug,
        });

        // Still go to onboarding even if invite redemption fails
        // (user account was created, just invite tracking failed)
        navigate("/onboarding", { replace: true });
      }
    }

    processInvite();
  }, [
    isAuthenticated,
    isLoading,
    inviteSlug,
    profile,
    navigate,
    redeemInvite,
    generateSlug,
    joinCommunity,
    signupCommunity,
    posthog,
  ]);

  if (status === "error") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 px-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
            Something went wrong
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mb-6">{error}</p>
          <a
            href="/login"
            className="text-blue-600 hover:text-blue-500 font-medium"
          >
            Go to login
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4" />
        <p className="text-gray-600 dark:text-gray-400">
          {status === "processing"
            ? "Setting up your account..."
            : "Completing sign in..."}
        </p>
      </div>
    </div>
  );
}
