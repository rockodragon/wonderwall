"use client";

import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { ConvexReactClient } from "convex/react";
import { useMemo, type ReactNode } from "react";

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  const client = useMemo(() => {
    const url = import.meta.env.VITE_CONVEX_URL;
    if (!url) return null;
    return new ConvexReactClient(url);
  }, []);

  if (!client) {
    return <>{children}</>;
  }

  return <ConvexAuthProvider client={client}>{children}</ConvexAuthProvider>;
}
