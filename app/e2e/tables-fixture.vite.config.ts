import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

// No React Router framework plugin, Convex connection, or production bundle.
// This serves the real client components with a narrow mocked API boundary.
export default defineConfig({
  root: fileURLToPath(new URL("./fixtures/tables", import.meta.url)),
  resolve: {
    alias: [
      {
        find: /^convex\/react$/,
        replacement: fileURLToPath(
          new URL("./fixtures/tables/convexReact.ts", import.meta.url),
        ),
      },
    ],
  },
  esbuild: { jsx: "automatic" },
  server: {
    host: "127.0.0.1",
    port: 8801,
    strictPort: true,
    fs: { allow: [fileURLToPath(new URL("..", import.meta.url))] },
  },
});
