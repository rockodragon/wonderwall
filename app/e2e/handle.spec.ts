// /@handle against the real build (routes/slug.tsx renders the page inside
// AppShell). Unit tests can't see this: the production build wraps a route
// module's default export so it drops children, which left every /@handle
// blank on 2026-10-25. Reads live Convex, so it uses addresses nobody holds:
// the page must show the 404 inside the shell, never an empty page.

import { expect, test } from "@playwright/test";

test.describe("/@handle", () => {
  test("an address nobody can have shows the 404, not a blank page", async ({ page }) => {
    await page.goto("/@a..b");
    await expect(page.getByRole("heading", { name: "Page Not Found" })).toBeVisible();
  });

  test("a free address shows the 404 once the lookup answers", async ({ page }) => {
    await page.goto("/@nobody.here_e2e");
    await expect(page.getByRole("heading", { name: "Page Not Found" })).toBeVisible({ timeout: 15000 });
  });
});

// The naming policy Settings links to from the address field
// (convex/heldHandles.ts has the rules it states).
test.describe("/legal/names", () => {
  test("states the five points, with no prices", async ({ page }) => {
    await page.goto("/legal/names");
    await expect(page.getByRole("heading", { name: "Naming policy" })).toBeVisible();
    for (const point of [
      "1. Names are first come, first served",
      "2. We never take a name from a member who is using it",
      "3. Some names are held",
      "4. Names of 3 characters or fewer are premium",
      "5. Trademark and real-name owners can claim a name",
    ]) {
      await expect(page.getByRole("heading", { name: point })).toBeVisible();
    }
    await expect(page.locator("article")).not.toContainText("$");
  });
});
