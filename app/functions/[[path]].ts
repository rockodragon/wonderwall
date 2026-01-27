import { createPagesFunctionHandler } from "@react-router/cloudflare";

// @ts-expect-error - virtual module provided by React Router
// eslint-disable-next-line import/no-unresolved
import * as build from "../build/server";

export const onRequest = createPagesFunctionHandler({ build });
