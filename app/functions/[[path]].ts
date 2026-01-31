import { createPagesFunctionHandler } from "@react-router/cloudflare";

// @ts-expect-error - virtual module provided by React Router
import * as serverBuild from "../build/server/index.js";

// Static asset extensions that should never be handled by React Router
const STATIC_ASSET_EXTENSIONS = [
  ".js",
  ".css",
  ".map",
  ".json",
  ".woff",
  ".woff2",
  ".ttf",
  ".eot",
  ".svg",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".ico",
  ".webmanifest",
];

const handler = createPagesFunctionHandler({
  build: serverBuild,
});

export const onRequest: PagesFunction = async (context) => {
  const url = new URL(context.request.url);

  // If request is for a static asset that doesn't exist, return 404
  // (Cloudflare already tried to serve it from /build/client but it wasn't there)
  const isStaticAsset = STATIC_ASSET_EXTENSIONS.some((ext) =>
    url.pathname.endsWith(ext),
  );

  if (isStaticAsset) {
    return new Response("Not Found", {
      status: 404,
      headers: { "Content-Type": "text/plain" },
    });
  }

  return handler(context);
};
