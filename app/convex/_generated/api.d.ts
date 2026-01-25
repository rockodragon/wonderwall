/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auth from "../auth.js";
import type * as events from "../events.js";
import type * as favorites from "../favorites.js";
import type * as files from "../files.js";
import type * as http from "../http.js";
import type * as invites from "../invites.js";
import type * as links from "../links.js";
import type * as profiles from "../profiles.js";
import type * as seed from "../seed.js";
import type * as wonderings from "../wonderings.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  events: typeof events;
  favorites: typeof favorites;
  files: typeof files;
  http: typeof http;
  invites: typeof invites;
  links: typeof links;
  profiles: typeof profiles;
  seed: typeof seed;
  wonderings: typeof wonderings;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
