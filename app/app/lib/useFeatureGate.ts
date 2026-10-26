// The redirect half of a feature flag (lib/featureFlags.ts holds the flags
// themselves, with no imports, so the server can read them too).
//
// Hook, not just a constant, so the gate lives in one place: a route calls
// this once at the top of its component and gets a redirect-away for free
// if the flag is off, instead of every /jobs/* file reimplementing the
// same useEffect+navigate.
import { useEffect } from "react";
import { useNavigate } from "react-router";

export function useFeatureGate(enabled: boolean, redirectTo: string) {
  const navigate = useNavigate();
  useEffect(() => {
    if (!enabled) navigate(redirectTo, { replace: true });
  }, [enabled, redirectTo, navigate]);
  return enabled;
}
