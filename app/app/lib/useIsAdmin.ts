// Whether the viewer is an operator: profile.isAdmin, the app's one signal
// for it. Undefined while the profile loads, so a page can say "Checking
// access…" first and AdminAccessDenied after (components/admin/AdminUi.tsx).
// The server still checks on every operator call; this only decides what
// the page shows.

import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

export function useIsAdmin(): boolean | undefined {
  const profile = useQuery(api.profiles.getMyProfile);
  if (profile === undefined) return undefined;
  return profile?.isAdmin === true;
}
