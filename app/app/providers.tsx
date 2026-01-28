"use client";

import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { ConvexReactClient, useMutation, useConvexAuth } from "convex/react";
import { useMemo, useEffect, useState, type ReactNode } from "react";
import { useNavigate, useLocation } from "react-router";
import { api } from "../convex/_generated/api";

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  const client = useMemo(() => {
    const url = import.meta.env.VITE_CONVEX_URL;
    if (!url) return null;
    return new ConvexReactClient(url);
  }, []);

  if (!client) {
    return <>{children}</>;
  }

  return (
    <ConvexAuthProvider client={client}>
      <OAuthInviteHandler>{children}</OAuthInviteHandler>
    </ConvexAuthProvider>
  );
}

/**
 * Handles post-OAuth invite redemption.
 * When a user signs up via Google OAuth with an invite link,
 * this component redeems the invite after OAuth completes.
 */
function OAuthInviteHandler({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const redeemInvite = useMutation(api.invites.redeemBySlug);
  const generateSlug = useMutation(api.invites.generateInviteSlug);
  const [processed, setProcessed] = useState(false);

  useEffect(() => {
    if (isLoading || processed) return;
    if (!isAuthenticated) return;

    // Check for pending invite from OAuth signup
    const pendingInviteSlug =
      typeof window !== "undefined"
        ? sessionStorage.getItem("pending-invite-slug")
        : null;

    if (!pendingInviteSlug) return;

    // Process the invite
    async function processInvite() {
      setProcessed(true);
      sessionStorage.removeItem("pending-invite-slug");

      try {
        // Redeem the invite
        await redeemInvite({ slug: pendingInviteSlug! });
        console.log("✅ OAuth: Redeemed invite:", pendingInviteSlug);

        // Generate user's own invite slug
        const newSlug = await generateSlug({});
        console.log("✅ OAuth: Generated invite slug:", newSlug);

        // Redirect to onboarding for new OAuth signups
        navigate("/onboarding");
      } catch (err) {
        console.error("❌ OAuth invite processing failed:", err);
        // Still redirect to onboarding even if invite fails
        navigate("/onboarding");
      }
    }

    processInvite();
  }, [
    isAuthenticated,
    isLoading,
    processed,
    redeemInvite,
    generateSlug,
    navigate,
    location,
  ]);

  return <>{children}</>;
}
