import type { AppLoadContext, EntryContext } from "react-router";
import { ServerRouter } from "react-router";
import { isbot } from "isbot";
import { renderToReadableStream } from "react-dom/server";
import { StrictMode } from "react";
import { PostHogProvider } from "@posthog/react";

// Create a no-op PostHog client for SSR
const mockPostHogClient = {
  init: () => {},
  capture: () => {},
  identify: () => {},
  reset: () => {},
  opt_in_capturing: () => {},
  opt_out_capturing: () => {},
  has_opted_in_capturing: () => false,
  has_opted_out_capturing: () => false,
  clear_opt_in_out_capturing: () => {},
  debug: () => {},
  people: {
    set: () => {},
    set_once: () => {},
  },
} as any;

// Paths that should return 404 without logging errors (browser internals)
const SILENT_404_PATHS = [
  "/.well-known/appspecific/com.chrome.devtools.json",
  "/favicon.ico",
];

export default async function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  routerContext: EntryContext,
  _loadContext: AppLoadContext,
) {
  const url = new URL(request.url);

  // Silently return 404 for browser-specific paths
  if (SILENT_404_PATHS.includes(url.pathname)) {
    return new Response(null, { status: 404 });
  }

  const userAgent = request.headers.get("user-agent");
  const body = await renderToReadableStream(
    <PostHogProvider client={mockPostHogClient}>
      <StrictMode>
        <ServerRouter context={routerContext} url={request.url} />
      </StrictMode>
    </PostHogProvider>,
    {
      signal: request.signal,
      onError(error: unknown) {
        console.error(error);
        responseStatusCode = 500;
      },
    },
  );

  if (isbot(userAgent ?? "")) {
    await body.allReady;
  }

  responseHeaders.set("Content-Type", "text/html");
  return new Response(body, {
    headers: responseHeaders,
    status: responseStatusCode,
  });
}
