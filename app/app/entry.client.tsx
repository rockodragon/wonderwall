import { startTransition, StrictMode } from "react";
import { hydrateRoot } from "react-dom/client";
import { HydratedRouter } from "react-router/dom";
import { startPostHog } from "./lib/posthog";

// PostHog in the browser (lib/posthog.ts): live hosts only. Server-side
// events still go through Convex (hooks/useAnalytics.ts, convex/posthog.ts).
startPostHog();

startTransition(() => {
  hydrateRoot(
    document,
    <StrictMode>
      <HydratedRouter />
    </StrictMode>,
  );
});
