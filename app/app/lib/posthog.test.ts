import { describe, expect, it } from "vitest";
import { isTestHost } from "./posthog";

describe("isTestHost", () => {
  it("keeps local dev and Pages previews out of PostHog", () => {
    for (const h of ["localhost", "127.0.0.1", "abc123.wonderwall.pages.dev", "wonderwall.pages.dev"]) expect(isTestHost(h)).toBe(true);
  });
  it("reports from the live addresses", () => {
    for (const h of ["thecreative.exchange", "www.thecreative.exchange", "createthegarden.com", "garden.thecreative.exchange"]) expect(isTestHost(h)).toBe(false);
  });
});
