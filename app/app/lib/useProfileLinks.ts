import { useConvexAuth } from "convex/react";

/** Whether a person's name may link to their /profile: profiles are for
 *  members, so only for a signed-in viewer (not while that's still loading). */
export function useProfileLinks(): boolean {
  const { isAuthenticated, isLoading } = useConvexAuth();
  return isAuthenticated && !isLoading;
}
