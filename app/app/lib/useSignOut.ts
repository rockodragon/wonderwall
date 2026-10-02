import { useAuthActions } from "@convex-dev/auth/react";
import { usePostHog } from "@posthog/react";
import { useNavigate } from "react-router";

/** Sign out, then land on /login. Shared by Settings and the palette so the
 *  analytics reset and the destination can't drift apart. */
export function useSignOut(): () => Promise<void> {
  const { signOut } = useAuthActions();
  const navigate = useNavigate();
  const posthog = usePostHog();
  return async function handleSignOut() {
    posthog?.capture("user_logged_out");
    posthog?.reset();
    await signOut();
    navigate("/login");
  };
}
