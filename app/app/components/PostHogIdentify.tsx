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
import { browserAnalyticsReady, posthog } from "../lib/posthog";

export function PostHogIdentify() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const me = useQuery(api.profiles.getMyProfile, isAuthenticated ? {} : "skip");
  const identified = useRef<string | null>(null);

  useEffect(() => {
    if (isLoading || !browserAnalyticsReady()) return;
    const storedId = posthog.get_property("$user_id");
    if (isAuthenticated && me) {
      const id = String(me.userId);
      // Account switches must not merge two members through a shared device.
      if ((identified.current && identified.current !== id) || (storedId && storedId !== id)) posthog.reset();
      posthog.identify(id, {
        name: me.name,
        ...(me.email ? { email: me.email } : {}),
        ...(me.plan ? { plan: me.plan } : {}),
        interests: me.interests,
      });
      identified.current = id;
    } else if (identified.current || storedId) {
      // Also clear an identity persisted before a reload, or while a new
      // session is waiting for its own profile to become available.
      posthog.reset();
      identified.current = null;
    }
  }, [isAuthenticated, isLoading, me]);

  return null;
}
