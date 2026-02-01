/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as admin from "../admin.js";
import type * as analytics from "../analytics.js";
import type * as artifacts from "../artifacts.js";
import type * as auth from "../auth.js";
import type * as crawler from "../crawler.js";
import type * as crawlerClassifier from "../crawlerClassifier.js";
import type * as crawlerExport from "../crawlerExport.js";
import type * as crawlerModelTest from "../crawlerModelTest.js";
import type * as crawlerSeeds from "../crawlerSeeds.js";
import type * as embeddings from "../embeddings.js";
import type * as events from "../events.js";
import type * as favorites from "../favorites.js";
import type * as files from "../files.js";
import type * as helpers from "../helpers.js";
import type * as http from "../http.js";
import type * as invites from "../invites.js";
import type * as jobScraper from "../jobScraper.js";
import type * as jobs from "../jobs.js";
import type * as links from "../links.js";
import type * as location from "../location.js";
import type * as messaging from "../messaging.js";
import type * as notifications from "../notifications.js";
import type * as posthog from "../posthog.js";
import type * as profiles from "../profiles.js";
import type * as public_ from "../public.js";
import type * as seed from "../seed.js";
import type * as waitlist from "../waitlist.js";
import type * as wonderings from "../wonderings.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  admin: typeof admin;
  analytics: typeof analytics;
  artifacts: typeof artifacts;
  auth: typeof auth;
  crawler: typeof crawler;
  crawlerClassifier: typeof crawlerClassifier;
  crawlerExport: typeof crawlerExport;
  crawlerModelTest: typeof crawlerModelTest;
  crawlerSeeds: typeof crawlerSeeds;
  embeddings: typeof embeddings;
  events: typeof events;
  favorites: typeof favorites;
  files: typeof files;
  helpers: typeof helpers;
  http: typeof http;
  invites: typeof invites;
  jobScraper: typeof jobScraper;
  jobs: typeof jobs;
  links: typeof links;
  location: typeof location;
  messaging: typeof messaging;
  notifications: typeof notifications;
  posthog: typeof posthog;
  profiles: typeof profiles;
  public: typeof public_;
  seed: typeof seed;
  waitlist: typeof waitlist;
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
