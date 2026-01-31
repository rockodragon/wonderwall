import { httpAction } from "./_generated/server";

const POSTHOG_HOST = "https://us.i.posthog.com";

// Proxy POST requests to PostHog (handles /capture, /batch, /decide, /e)
export const proxy = httpAction(async (ctx, request) => {
  const url = new URL(request.url);
  // Extract the PostHog path after /api/ph/
  const posthogPath = url.pathname.replace("/api/ph", "");

  // Forward to PostHog
  const posthogUrl = `${POSTHOG_HOST}${posthogPath}${url.search}`;

  try {
    const body = await request.text();

    const response = await fetch(posthogUrl, {
      method: request.method,
      headers: {
        "Content-Type":
          request.headers.get("Content-Type") || "application/json",
        // Forward user agent for proper device detection
        "User-Agent": request.headers.get("User-Agent") || "",
      },
      body: body || undefined,
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
      status: 200, // Return 200 to not break the client
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }
});

// Handle CORS preflight
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
