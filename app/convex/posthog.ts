import { v } from "convex/values";
import { action, httpAction } from "./_generated/server";

const POSTHOG_HOST = "https://us.i.posthog.com";
const POSTHOG_API_KEY = process.env.POSTHOG_API_KEY;

// Transform property keys: _ prefix -> $ prefix (Convex doesn't allow $ in keys)
function transformProperties(
  props: Record<string, unknown> | undefined,
): Record<string, unknown> {
  if (!props) return {};
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(props)) {
    const newKey = key.startsWith("_") ? `$${key.slice(1)}` : key;
    result[newKey] = value;
  }
  return result;
}

// Server-side event capture - frontend calls this action directly
export const capture = action({
  args: {
    event: v.string(),
    distinctId: v.string(),
    properties: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    if (!POSTHOG_API_KEY) {
      console.warn("[PostHog] No API key configured");
      return { status: "no_api_key" };
    }

    try {
      const response = await fetch(`${POSTHOG_HOST}/capture/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: POSTHOG_API_KEY,
          event: args.event,
          distinct_id: args.distinctId,
          properties: transformProperties(
            args.properties as Record<string, unknown>,
          ),
          timestamp: new Date().toISOString(),
        }),
      });

      if (!response.ok) {
        console.error(`[PostHog] Capture failed: ${response.status}`);
        return { status: "error", code: response.status };
      }

      return { status: "ok" };
    } catch (error) {
      console.error("[PostHog] Capture error:", error);
      return { status: "error" };
    }
  },
});

// Server-side identify - links anonymous user to identified user
export const identify = action({
  args: {
    distinctId: v.string(),
    properties: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    if (!POSTHOG_API_KEY) {
      console.warn("[PostHog] No API key configured");
      return { status: "no_api_key" };
    }

    try {
      const response = await fetch(`${POSTHOG_HOST}/capture/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: POSTHOG_API_KEY,
          event: "$identify",
          distinct_id: args.distinctId,
          properties: {
            $set: args.properties || {},
          },
          timestamp: new Date().toISOString(),
        }),
      });

      if (!response.ok) {
        console.error(`[PostHog] Identify failed: ${response.status}`);
        return { status: "error", code: response.status };
      }

      return { status: "ok" };
    } catch (error) {
      console.error("[PostHog] Identify error:", error);
      return { status: "error" };
    }
  },
});

// Batch capture multiple events at once
export const batch = action({
  args: {
    events: v.array(
      v.object({
        event: v.string(),
        distinctId: v.string(),
        properties: v.optional(v.any()),
        timestamp: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    if (!POSTHOG_API_KEY) {
      console.warn("[PostHog] No API key configured");
      return { status: "no_api_key" };
    }

    try {
      const batch = args.events.map((e) => ({
        event: e.event,
        distinct_id: e.distinctId,
        properties: transformProperties(
          e.properties as Record<string, unknown>,
        ),
        timestamp: e.timestamp || new Date().toISOString(),
      }));

      const response = await fetch(`${POSTHOG_HOST}/batch/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: POSTHOG_API_KEY,
          batch,
        }),
      });

      if (!response.ok) {
        console.error(`[PostHog] Batch failed: ${response.status}`);
        return { status: "error", code: response.status };
      }

      return { status: "ok" };
    } catch (error) {
      console.error("[PostHog] Batch error:", error);
      return { status: "error" };
    }
  },
});

// HTTP proxy for PostHog SDK (fallback for features that need client SDK)
export const proxy = httpAction(async (ctx, request) => {
  const url = new URL(request.url);
  const posthogPath = url.pathname.replace("/api/ph", "");
  const posthogUrl = `${POSTHOG_HOST}${posthogPath}${url.search}`;

  try {
    const isPost = request.method === "POST";
    const body = isPost ? await request.text() : undefined;

    const headers: Record<string, string> = {
      "User-Agent": request.headers.get("User-Agent") || "",
    };
    if (isPost) {
      headers["Content-Type"] =
        request.headers.get("Content-Type") || "application/json";
    }

    const response = await fetch(posthogUrl, {
      method: request.method,
      headers,
      body,
    });

    const responseBody = await response.text();

    return new Response(responseBody, {
      status: response.status,
      headers: {
        "Content-Type":
          response.headers.get("Content-Type") || "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  } catch (error) {
    console.error("PostHog proxy error:", error);
    return new Response(JSON.stringify({ status: 0 }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }
});

export const proxyPreflight = httpAction(async () => {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
    },
  });
});
