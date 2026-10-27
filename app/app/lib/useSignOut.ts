import { useAuthActions } from "@convex-dev/auth/react";
import { usePostHog } from "@posthog/react";
import { useNavigate } from "react-router";

/** Sign out, then land on /login. The root auth observer owns analytics reset. */
export function useSignOut(): () => Promise<void> {
  const { signOut } = useAuthActions();
  const navigate = useNavigate();
  const posthog = usePostHog();
  return async function handleSignOut() {
    posthog?.capture("user_logged_out");
    await signOut();
    navigate("/login");
  };
}
