// Tells PostHog who's signed in, so a person's events join up across visits
// and devices (person profiles are for signed-in people only, lib/posthog.ts).
// The user id is the one identity, here and in every server event (convex
// posthog.ts trackEvent); name and email are only properties on that person,
// for troubleshooting (Rick, 2026-10-10). Never identify by email, and no
// phone. Signing out resets, so the next person on a shared device starts
// anonymous.

import { useConvexAuth, useQuery } from "convex/react";
import { useEffect, useRef } from "react";
import { api } from "../../convex/_generated/api";
import { posthog } from "../lib/posthog";

export function PostHogIdentify() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const me = useQuery(api.profiles.getMyProfile, isAuthenticated ? {} : "skip");
  const identified = useRef<string | null>(null);

  useEffect(() => {
    if (isLoading || !posthog.__loaded) return;
    if (isAuthenticated && me) {
      const id = String(me.userId);
      if (identified.current === id) return;
      posthog.identify(id, { name: me.name, ...(me.email ? { email: me.email } : {}) });
      identified.current = id;
    } else if (!isAuthenticated && identified.current) {
      posthog.reset();
      identified.current = null;
    }
  }, [isAuthenticated, isLoading, me]);

  return null;
}
