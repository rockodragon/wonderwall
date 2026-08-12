import type { Page } from "@playwright/test";

/** Persona ids seeded in app/garden/demo-data.ts. */
export type PersonaId = "maya" | "shua" | "tessa" | "marcus" | "diane" | "foldednote";

const STORAGE_KEY = "garden-demo-persona";

/**
 * Sets the demo persona in localStorage before the page's own scripts run,
 * so DemoProvider picks it up on first render instead of defaulting to maya.
 */
export async function walkAs(page: Page, personaId: PersonaId): Promise<void> {
  await page.addInitScript(
    ([key, value]) => {
      window.localStorage.setItem(key, value);
    },
    [STORAGE_KEY, personaId] as const,
  );
}
