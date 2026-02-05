import type { Config } from "@react-router/dev/config";

export default {
  // SPA mode - all data fetching happens client-side via Convex
  ssr: false,
} satisfies Config;
