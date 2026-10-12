// Preview-only stand-in for @convex-dev/auth/react: signed in, and signing
// out does nothing.
import type { ReactNode } from "react";

export function useAuthActions() {
  return { signIn: async () => ({ signingIn: false }), signOut: async () => undefined };
}

export function ConvexAuthProvider({ children }: { children: ReactNode }) {
  return children;
}
