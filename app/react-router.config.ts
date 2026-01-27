import type { Config } from "@react-router/dev/config";

export default {
  // Enable SSR for SEO - works with Cloudflare Workers
  ssr: true,
  future: {
    v8_viteEnvironmentApi: true,
  },
} satisfies Config;
