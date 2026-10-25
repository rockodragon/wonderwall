// No analytics in the preview. What a screen would send is kept on the page
// instead, in window.__previewEvents, so a check can read it; nothing leaves
// the page. Identify and reset do nothing.
import type { ReactNode } from "react";

type Recorded = [event: string, properties?: Record<string, unknown>];

const recorder = {
  capture(event: string, properties?: Record<string, unknown>) {
    const w = window as unknown as { __previewEvents?: Recorded[] };
    (w.__previewEvents ??= []).push([event, properties]);
  },
  identify() {},
  reset() {},
};

export function usePostHog() {
  return recorder;
}

export function PostHogProvider({ children }: { children: ReactNode }) {
  return children;
}
