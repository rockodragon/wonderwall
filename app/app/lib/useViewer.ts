// Who is looking, as the pages that offer Save read it (PostViewer,
// lib/projectPick.ts): whether they are signed in, and their profile, which is
// undefined until getMyProfile answers so the lead of a project never sees Save
// flash. Today, Projects and a project's own page all draw it from here; no
// query of its own (each already read getMyProfile).

import { useConvexAuth, useQuery } from "convex/react";
import { useMemo } from "react";
import { api } from "../../convex/_generated/api";

export function useViewer() {
  const { isAuthenticated } = useConvexAuth();
  const profile = useQuery(api.profiles.getMyProfile);
  return useMemo(() => ({ signedIn: isAuthenticated, profile }), [isAuthenticated, profile]);
}
