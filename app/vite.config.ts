import { cloudflare } from "@cloudflare/vite-plugin";
import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [
    cloudflare({ viteEnvironment: { name: "ssr" } }),
    tailwindcss(),
    reactRouter(),
    tsconfigPaths(),
  ],
  ssr: {
    // Bundle these into SSR (they have browser-specific code that needs transformation)
    noExternal: ["posthog-js", "@posthog/react"],
    // Don't bundle these - they use Node.js APIs not available in Workers
    external: ["ws", "bufferutil", "utf-8-validate"],
  },
});
