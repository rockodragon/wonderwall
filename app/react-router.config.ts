import type { Config } from "@react-router/dev/config";

export default {
  // SPA mode - Convex WebSocket client incompatible with Workers SSR
  ssr: false,
} satisfies Config;
