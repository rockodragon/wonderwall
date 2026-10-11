import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

// The phone preview (e2e/fixtures/phone/README.md): the real app shell and
// its phone screens, served with sample data in place of Convex. Tailwind is
// on, unlike the Tables fixture, because this one exists to be looked at.
export default defineConfig({
  root: fileURLToPath(new URL("./fixtures/phone", import.meta.url)),
  publicDir: fileURLToPath(new URL("../public", import.meta.url)),
  plugins: [tailwindcss()],
  resolve: {
    alias: [
      { find: /^convex\/react$/, replacement: fileURLToPath(new URL("./fixtures/phone/convexReact.ts", import.meta.url)) },
      { find: /^@posthog\/react$/, replacement: fileURLToPath(new URL("./fixtures/phone/posthogReact.ts", import.meta.url)) },
      { find: /^@convex-dev\/auth\/react$/, replacement: fileURLToPath(new URL("./fixtures/phone/convexAuthReact.ts", import.meta.url)) },
    ],
  },
  esbuild: { jsx: "automatic" },
  server: {
    host: "127.0.0.1",
    port: 8802,
    strictPort: true,
    fs: { allow: [fileURLToPath(new URL("..", import.meta.url))] },
  },
});
