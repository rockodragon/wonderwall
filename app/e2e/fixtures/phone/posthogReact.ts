// No analytics in the preview. The shell checks for a client before using it.
import type { ReactNode } from "react";

export function usePostHog() {
  return undefined;
}

export function PostHogProvider({ children }: { children: ReactNode }) {
  return children;
}
