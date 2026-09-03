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
import type * as adminEmails from "../adminEmails.js";
import type * as analytics from "../analytics.js";
import type * as announcements from "../announcements.js";
import type * as artifacts from "../artifacts.js";
import type * as auth from "../auth.js";
import type * as crawler from "../crawler.js";
import type * as crawlerClassifier from "../crawlerClassifier.js";
import type * as crawlerExport from "../crawlerExport.js";
import type * as crawlerModelTest from "../crawlerModelTest.js";
import type * as crawlerScheduler from "../crawlerScheduler.js";
import type * as crawlerSeeds from "../crawlerSeeds.js";
import type * as crons from "../crons.js";
import type * as emailHelpers from "../emailHelpers.js";
import type * as emails from "../emails.js";
import type * as embeddings from "../embeddings.js";
import type * as eventAccess from "../eventAccess.js";
import type * as eventVideo from "../eventVideo.js";
import type * as events from "../events.js";
import type * as favorites from "../favorites.js";
import type * as files from "../files.js";
import type * as garden_allocations from "../garden/allocations.js";
import type * as garden_artifactsMigration from "../garden/artifactsMigration.js";
import type * as garden_capabilities from "../garden/capabilities.js";
import type * as garden_coverage from "../garden/coverage.js";
import type * as garden_devSeed from "../garden/devSeed.js";
import type * as garden_entitlements from "../garden/entitlements.js";
import type * as garden_eventRsvps from "../garden/eventRsvps.js";
import type * as garden_interestsMigration from "../garden/interestsMigration.js";
import type * as garden_jobsMigration from "../garden/jobsMigration.js";
import type * as garden_memberships from "../garden/memberships.js";
import type * as garden_operator from "../garden/operator.js";
import type * as garden_profileInterestsFieldMigration from "../garden/profileInterestsFieldMigration.js";
import type * as garden_projectOriginMigration from "../garden/projectOriginMigration.js";
import type * as garden_projects from "../garden/projects.js";
import type * as garden_projectsPublic from "../garden/projectsPublic.js";
import type * as garden_stories from "../garden/stories.js";
import type * as garden_stripe from "../garden/stripe.js";
import type * as garden_stripeHandlers from "../garden/stripeHandlers.js";
import type * as garden_support from "../garden/support.js";
import type * as garden_tables from "../garden/tables.js";
import type * as helpers from "../helpers.js";
import type * as http from "../http.js";
import type * as invites from "../invites.js";
import type * as jobScraper from "../jobScraper.js";
import type * as jobs from "../jobs.js";
import type * as likesDigest from "../likesDigest.js";
import type * as links from "../links.js";
import type * as location from "../location.js";
import type * as messaging from "../messaging.js";
import type * as notifications from "../notifications.js";
import type * as offerings from "../offerings.js";
import type * as posthog from "../posthog.js";
import type * as profiles from "../profiles.js";
import type * as public_ from "../public.js";
import type * as scraperService from "../scraperService.js";
import type * as seed from "../seed.js";
import type * as sourceParsers from "../sourceParsers.js";
import type * as waitlist from "../waitlist.js";
import type * as wonderings from "../wonderings.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  admin: typeof admin;
  adminEmails: typeof adminEmails;
  analytics: typeof analytics;
  announcements: typeof announcements;
  artifacts: typeof artifacts;
  auth: typeof auth;
  crawler: typeof crawler;
  crawlerClassifier: typeof crawlerClassifier;
  crawlerExport: typeof crawlerExport;
  crawlerModelTest: typeof crawlerModelTest;
  crawlerScheduler: typeof crawlerScheduler;
  crawlerSeeds: typeof crawlerSeeds;
  crons: typeof crons;
  emailHelpers: typeof emailHelpers;
  emails: typeof emails;
  embeddings: typeof embeddings;
  eventAccess: typeof eventAccess;
  eventVideo: typeof eventVideo;
  events: typeof events;
  favorites: typeof favorites;
  files: typeof files;
  "garden/allocations": typeof garden_allocations;
  "garden/artifactsMigration": typeof garden_artifactsMigration;
  "garden/capabilities": typeof garden_capabilities;
  "garden/coverage": typeof garden_coverage;
  "garden/devSeed": typeof garden_devSeed;
  "garden/entitlements": typeof garden_entitlements;
  "garden/eventRsvps": typeof garden_eventRsvps;
  "garden/interestsMigration": typeof garden_interestsMigration;
  "garden/jobsMigration": typeof garden_jobsMigration;
  "garden/memberships": typeof garden_memberships;
  "garden/operator": typeof garden_operator;
  "garden/profileInterestsFieldMigration": typeof garden_profileInterestsFieldMigration;
  "garden/projectOriginMigration": typeof garden_projectOriginMigration;
  "garden/projects": typeof garden_projects;
  "garden/projectsPublic": typeof garden_projectsPublic;
  "garden/stories": typeof garden_stories;
  "garden/stripe": typeof garden_stripe;
  "garden/stripeHandlers": typeof garden_stripeHandlers;
  "garden/support": typeof garden_support;
  "garden/tables": typeof garden_tables;
  helpers: typeof helpers;
  http: typeof http;
  invites: typeof invites;
  jobScraper: typeof jobScraper;
  jobs: typeof jobs;
  likesDigest: typeof likesDigest;
  links: typeof links;
  location: typeof location;
  messaging: typeof messaging;
  notifications: typeof notifications;
  offerings: typeof offerings;
  posthog: typeof posthog;
  profiles: typeof profiles;
  public: typeof public_;
  scraperService: typeof scraperService;
  seed: typeof seed;
  sourceParsers: typeof sourceParsers;
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
