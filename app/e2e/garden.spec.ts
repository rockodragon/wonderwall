// Production Garden surfaces — structural guards.
// These pages read LIVE Convex data, so assertions are structural (the page
// wired up and rendered a real state) rather than content-exact: data grows
// over time and must not break CI. The one hard failure they catch is the
// ErrorBoundary "isn't live yet" state appearing when the backend is wired.

import { expect, test } from "@playwright/test";

test.describe("Garden production surfaces", () => {
  test("/fund/abiding-practice renders the fund, not the error state", async ({ page }) => {
    await page.goto("/fund/abiding-practice");
    await expect(page.getByRole("heading", { name: "Abiding Practice Fund" })).toBeVisible();
    await expect(
      page.getByRole("link", { name: /give to the abiding practice fund/i }),
    ).toHaveAttribute("href", /./);
    await expect(page.getByText(/isn't live yet/i)).not.toBeVisible();
  });

  test("/tables renders browse (empty state or cards), never an error", async ({ page }) => {
    await page.goto("/tables");
    await expect(page.getByRole("heading", { name: "Tables" })).toBeVisible();
    // Empty state ("Tables are coming") or populated (descriptor + cards) — both valid.
    await expect(
      page.getByText(/Tables are coming|Groups you join and keep coming back to/i).first(),
    ).toBeVisible();
    await expect(page.getByText(/isn't live yet/i)).not.toBeVisible();
  });

  test("unknown fund slug shows the designed not-live state", async ({ page }) => {
    await page.goto("/fund/definitely-not-a-real-org");
    await expect(page.getByText(/isn't live yet/i)).toBeVisible();
    await expect(page.getByRole("link", { name: /home/i })).toBeVisible();
  });

  test("unknown story slug shows the designed not-live state", async ({ page }) => {
    await page.goto("/story/not-a-real-story");
    await expect(page.getByText(/isn't live yet/i)).toBeVisible();
  });
});
