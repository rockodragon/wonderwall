import { defineConfig, devices } from "@playwright/test";
import { tmpdir } from "node:os";
import { join } from "node:path";

export default defineConfig({
  testDir: "e2e",
  testMatch: "tables.browser.ts",
  outputDir: join(tmpdir(), "wonderwall-tables-browser-results"),
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:8801",
    timezoneId: "America/Los_Angeles",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command:
      "node node_modules/vite/bin/vite.js --config e2e/tables-fixture.vite.config.ts",
    url: "http://127.0.0.1:8801",
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
