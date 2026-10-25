// /code, "My code", against the real build. It's for members: a visitor goes
// to sign in and comes back (routes/_app.tsx). And "code" is the site's own
// word, so nobody can hold @code (convex/handleRules.ts): that address is the
// 404 without a lookup.

import { expect, test } from "@playwright/test";

test.describe("/code", () => {
  test("sends a visitor to sign in, and back to /code after", async ({ page }) => {
    await page.goto("/code");
    await expect(page).toHaveURL(/\/login\?redirect=%2Fcode$/, { timeout: 15000 });
  });

  test("@code is nobody's address", async ({ page }) => {
    await page.goto("/@code?ref=f2f");
    await expect(page.getByRole("heading", { name: "Page Not Found" })).toBeVisible();
  });
});
