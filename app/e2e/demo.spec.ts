// Smoke suite for the /demo world — The Garden's static, prerendered demo
// build (build/client) served by wrangler pages dev. Exercises capability
// gating (app/garden/capabilities.ts) against the seeded cast
// (app/garden/demo-data.ts) across a handful of personas, plus a regression
// guard for the SPA-fallback hydration bug on /demo/app deep links.

import { test, expect } from "@playwright/test";
import { walkAs } from "./helpers";

test.describe("Garden demo — capability gating in the app shell", () => {
  test("maya (free) opens a passion project she doesn't own: Follow + patron-role nudge, no owner actions", async ({
    page,
  }) => {
    await walkAs(page, "maya");
    await page.goto("/demo/app");

    await page.getByRole("button", { name: "Psalms for the 2AM" }).click();

    await expect(page.getByRole("button", { name: "Follow" })).toBeVisible();
    await expect(page.getByText(/add the patron role, free/i)).toBeVisible();
    await expect(page.getByRole("button", { name: "Post an update" })).toHaveCount(0);
  });

  test("shua (seat, owns the project) sees owner actions instead of Follow", async ({ page }) => {
    await walkAs(page, "shua");
    await page.goto("/demo/app");

    await page.getByRole("button", { name: "Psalms for the 2AM" }).click();

    await expect(page.getByRole("button", { name: "Post an update" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Mark finished" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Follow" })).toHaveCount(0);
  });

  test("maya (free) hits the paid-work gate on a paid project", async ({ page }) => {
    await walkAs(page, "maya");
    await page.goto("/demo/app");

    await page.getByRole("button", { name: "Projects" }).click();
    await page.getByRole("button", { name: "Back-room mural" }).click();

    await expect(page.getByText("Applying to paid work requires a seat.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Take a seat — $10/mo" })).toBeVisible();
  });

  test("marcus (host, owns the table) sees Manage table", async ({ page }) => {
    await walkAs(page, "marcus");
    await page.goto("/demo/app");

    await page.getByRole("button", { name: "Tables" }).click();
    await page.getByRole("button", { name: "Third Thursday Songwriters" }).click();

    await expect(page.getByRole("button", { name: "Manage table" })).toBeVisible();
  });

  test("Tables format filter narrows the list", async ({ page }) => {
    await walkAs(page, "maya");
    await page.goto("/demo/app");

    await page.getByRole("button", { name: "Tables" }).click();
    await page.getByRole("button", { name: "Class", exact: true }).click();

    await expect(page.getByRole("button", { name: "Winter Songwriting Cohort" })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Illustrators' Critique Table" }),
    ).toHaveCount(0);
  });

  test("/demo/app deep link hydrates interactively (SPA-fallback regression guard)", async ({
    page,
  }) => {
    await page.goto("/demo/app");

    await page.getByRole("button", { name: "Projects" }).click();

    await expect(page.getByRole("button", { name: "Back-room mural" })).toBeVisible();
  });
});

test.describe("Garden demo — host gate and join flow", () => {
  test("/demo/host: warm gate for a non-host, wizard for a host", async ({ page }) => {
    await walkAs(page, "maya");
    await page.goto("/demo/host");
    await expect(page.getByText("Want to run a Table?")).toBeVisible();

    await walkAs(page, "marcus");
    await page.goto("/demo/host");
    await expect(page.getByText("Create a Table · host")).toBeVisible();
  });

  test("/demo/join: walking the 'I make things' door reaches the membership-tier step", async ({
    page,
  }) => {
    await walkAs(page, "maya");
    await page.goto("/demo/join");

    await page.getByRole("button", { name: "I make things" }).click();
    await page.getByRole("button", { name: "Continue" }).click();

    await expect(
      page.getByRole("heading", { name: "Choose your membership. Free is a real option." }),
    ).toBeVisible();
  });
});

test.describe("Garden demo — persona switcher", () => {
  test("clicking a persona chip marks it aria-pressed", async ({ page }) => {
    await page.goto("/demo/app");

    const dianeChip = page.getByRole("button", { name: "Walk as Diane Okafor" });
    await expect(dianeChip).toHaveAttribute("aria-pressed", "false");

    await dianeChip.click();

    await expect(dianeChip).toHaveAttribute("aria-pressed", "true");
  });
});
