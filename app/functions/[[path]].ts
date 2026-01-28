import { createPagesFunctionHandler } from "@react-router/cloudflare";

// @ts-expect-error - virtual module provided by React Router
import * as serverBuild from "../build/server/index.js";

export const onRequest = createPagesFunctionHandler({
  build: serverBuild,
});
