import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config";

// Vitest's default include glob (**/*.{test,spec}.*) also matches the
// Playwright specs under e2e/, and Playwright's test.describe() throws when
// invoked outside the Playwright runner. Keep vitest scoped to unit tests by
// excluding e2e/, while reusing the app's existing Vite config unchanged.
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      exclude: ["**/node_modules/**", "**/dist/**", "e2e/**"],
    },
  }),
);
