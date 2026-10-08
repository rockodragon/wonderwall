import { fileURLToPath } from "node:url";
import { configDefaults, defineConfig } from "vitest/config";

// Unit/handler tests run without the framework dev server or its file watchers.
// Browser fixtures have their own Playwright config and mocked API transport.
export default defineConfig({
  resolve: { alias: { "~": fileURLToPath(new URL("./app", import.meta.url)) } },
  test: {
    exclude: [...configDefaults.exclude, "e2e/**"],
    environment: "node",
    maxWorkers: 4,
  },
});
