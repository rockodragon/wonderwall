// Production Garden surfaces — structural guards.
// These pages read LIVE Convex data, so assertions are structural (the page
// wired up and rendered a real state) rather than content-exact: data grows
// over time and must not break CI. The one hard failure they catch is the
// ErrorBoundary "isn't live yet" state appearing when the backend is wired.

import { expect, test } from "@playwright/test";

test.describe("Garden production surfaces", () => {
  test("/fund/abiding-practice renders the fund, not the error state", async ({ page }) => {
    await page.goto("/fund/abiding-practice");
    // The page's name has changed more than once ("Abiding Practice Fund",
    // now "Grant Fund"), so match the shape, not the exact words.
    await expect(page.getByRole("heading", { level: 1, name: /fund/i })).toBeVisible();
    // The Sophia Fund panel's button reads "Give →" / "Give monthly →"
    // (2026-09-29); older copy read "Give to the … Fund". Match any give
    // link, and only require that it points somewhere.
    await expect(page.getByRole("link", { name: /give/i }).first()).toHaveAttribute("href", /./);
    await expect(page.getByText(/isn't live yet/i)).not.toBeVisible();
  });

  test("/tables renders browse (empty state or cards), never an error", async ({ page }) => {
    await page.goto("/tables");
    // The route stays /tables but the page's noun keeps moving (Tables, then
    // Spaces), so assert a page title rendered rather than which word it is.
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    // The Tables page's intro shows whether it's empty or full (the Tables
    // UI, 2026-10-03, replaced the "… are coming" empty state).
    await expect(page.getByText(/pull up a chair/i).first()).toBeVisible();
    await expect(page.getByText(/isn't live yet/i)).not.toBeVisible();
  });

  test("unknown fund slug shows the designed not-live state", async ({ page }) => {
    await page.goto("/fund/definitely-not-a-real-org");
    await expect(page.getByText(/isn't live yet/i)).toBeVisible();
    // /home/i alone also matches the site header's "creatives.exchange home".
    await expect(page.getByRole("link", { name: /back home/i })).toBeVisible();
  });

  test("unknown story slug shows the designed not-live state", async ({ page }) => {
    await page.goto("/story/not-a-real-story");
    await expect(page.getByText(/isn't live yet/i)).toBeVisible();
  });
});
