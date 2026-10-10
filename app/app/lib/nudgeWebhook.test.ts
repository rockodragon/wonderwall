import { describe, expect, it } from "vitest";
import { NUDGE_SECRET_HEADER, convexSiteUrl, nudgeWebhookBody, nudgeWebhookUrl } from "./nudgeWebhook";

describe("convexSiteUrl", () => {
  it("swaps .convex.cloud for .convex.site", () => {
    expect(convexSiteUrl("https://courteous-rabbit-750.convex.cloud")).toBe("https://courteous-rabbit-750.convex.site");
  });

  it("ignores a trailing slash and spaces", () => {
    expect(convexSiteUrl(" https://giant-wildebeest-814.convex.cloud/ ")).toBe("https://giant-wildebeest-814.convex.site");
  });

  it("is null when there is no address or it isn't a Convex one", () => {
    expect(convexSiteUrl(undefined)).toBeNull();
    expect(convexSiteUrl("")).toBeNull();
    expect(convexSiteUrl("http://127.0.0.1:3210")).toBeNull();
  });
});

describe("nudgeWebhookUrl", () => {
  it("is the site address plus /api/nudges", () => {
    expect(nudgeWebhookUrl("https://courteous-rabbit-750.convex.cloud")).toBe(
      "https://courteous-rabbit-750.convex.site/api/nudges",
    );
    expect(nudgeWebhookUrl(undefined)).toBeNull();
  });
});

describe("nudgeWebhookBody", () => {
  it("is the exact JSON PostHog posts, with PostHog's own placeholder", () => {
    const body = nudgeWebhookBody("share_project_day1");
    expect(body).toBe('{"loop": "share_project_day1", "distinct_id": "{event.distinct_id}"}');
    expect(JSON.parse(body)).toEqual({ loop: "share_project_day1", distinct_id: "{event.distinct_id}" });
  });
});

describe("NUDGE_SECRET_HEADER", () => {
  it("is the header the webhook reads", () => {
    expect(NUDGE_SECRET_HEADER).toBe("X-Nudge-Secret");
  });
});
