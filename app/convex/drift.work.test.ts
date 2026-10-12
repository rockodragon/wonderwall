// The work group of the drift cleanup (jobs, files, artifacts, wonderings,
// links, offerings): signed-out calls get the shared refusal, refusals a
// person can trigger are ConvexErrors with a code and a readable reason
// (production hides a plain Error's message), a person with two profiles no
// longer breaks a class page, and the one behavior fix (links.reorder only
// moves your own links). Run on the in-memory ctx in test-support/.

import { ConvexError } from "convex/values";
import { describe, expect, it, vi } from "vitest";
import { makeCtx, run, type Row } from "../test-support/convexContext";
import { expectSignedOutRefusal } from "../test-support/signedOut";
import * as artifacts from "./artifacts";
import * as files from "./files";
import * as jobs from "./jobs";
import * as links from "./links";
import * as offerings from "./offerings";
import * as wonderings from "./wonderings";

const ME = "users:me";
const OTHER = "users:other";
const NOBODY = "users:nobody"; // signed in, no profile

type Refusal = { code: string; reason: string };

/** Runs the call and returns the ConvexError payload it was refused with. */
async function refusal(
  fn: unknown,
  tables: Record<string, Row[]>,
  viewer: string | null,
  args: Record<string, unknown> = {},
): Promise<Refusal> {
  try {
    await run(fn, makeCtx(tables, viewer), args);
  } catch (err) {
    expect(err, "expected a ConvexError the page can read").toBeInstanceOf(ConvexError);
    return (err as ConvexError<Refusal>).data;
  }
  throw new Error("expected the call to be refused");
}

const people = (): Record<string, Row[]> => ({
  users: [
    { _id: ME, email: "me@example.com" },
    { _id: OTHER, email: "other@example.com" },
    { _id: NOBODY, email: "nobody@example.com" },
  ],
  profiles: [
    { _id: "profiles:me", userId: ME, name: "Max", interests: [], plan: "free" },
    { _id: "profiles:other", userId: OTHER, name: "Olu", interests: [], plan: "free" },
  ],
});

// ——————————————————————————————————————————————————————————————
// Signed out: the shared refusal
// ——————————————————————————————————————————————————————————————

describe("signed out", () => {
  const mutations: [string, unknown][] = [
    ["jobs.createJob", jobs.createJob],
    ["jobs.updateJob", jobs.updateJob],
    ["jobs.closeJob", jobs.closeJob],
    ["jobs.reopenJob", jobs.reopenJob],
    ["jobs.expressInterest", jobs.expressInterest],
    ["jobs.withdrawInterest", jobs.withdrawInterest],
    ["files.generateUploadUrl", files.generateUploadUrl],
    ["files.saveProfileImage", files.saveProfileImage],
    ["files.deleteProfileImage", files.deleteProfileImage],
    ["files.saveProfileImageUrl", files.saveProfileImageUrl],
    ["files.saveProjectImage", files.saveProjectImage],
    ["artifacts.toggleLike", artifacts.toggleLike],
    ["artifacts.create", artifacts.create],
    ["artifacts.reorder", artifacts.reorder],
    ["wonderings.create", wonderings.create],
    ["wonderings.submitResponse", wonderings.submitResponse],
    ["links.add", links.add],
    ["links.reorder", links.reorder],
  ];

  it.each(mutations)("%s is refused with the shared signed-out refusal", async (_name, fn) => {
    await expectSignedOutRefusal(fn, {});
  });

  // These show a signed-out visitor nothing (or less); currentUserId must
  // leave their answers exactly as they were.
  it("queries still answer a signed-out visitor with the empty shape", async () => {
    const world = {
      ...people(),
      jobs: [{ _id: "jobs:j", posterId: OTHER, title: "Mural", status: "Open", createdAt: 1 }],
      jobInterests: [{ _id: "jobInterests:i", jobId: "jobs:j", userId: OTHER, profileId: "profiles:other", workLinks: [] }],
    };
    const ask = (fn: unknown, args: Record<string, unknown> = {}) => run(fn, makeCtx(world, null), args);

    expect(await ask(jobs.getJobInterests, { jobId: "jobs:j" })).toEqual({ count: 1, interests: [] });
    expect(await ask(jobs.getUserJobInterest, { jobId: "jobs:j" })).toBeNull();
    expect((await ask(jobs.getJob, { jobId: "jobs:j" })).isPoster).toBe(false);
    expect(await ask(jobs.getJobs, { myPosts: true })).toHaveLength(1);
    expect(await ask(artifacts.getMyArtifacts)).toEqual([]);
    expect(await ask(artifacts.getAllArtifacts)).toEqual([]);
    expect(await ask(wonderings.getMyWondering)).toBeNull();
    expect(await ask(wonderings.getResponses, { wonderingId: "wonderings:w" })).toEqual([]);
    expect(await ask(links.getMyLinks)).toEqual([]);
  });
});

// ——————————————————————————————————————————————————————————————
// Jobs
// ——————————————————————————————————————————————————————————————

describe("jobs refusals", () => {
  const job = (id: string, extra: Record<string, unknown>): Row => ({
    _id: `jobs:${id}`,
    posterId: OTHER,
    profileId: "profiles:other",
    title: "Mural painter",
    description: "Paint a wall",
    location: "Remote",
    jobType: "Contract",
    status: "Open",
    visibility: "Members",
    createdAt: 1,
    updatedAt: 1,
    ...extra,
  });

  const world = (): Record<string, Row[]> => ({
    ...people(),
    jobs: [
      job("open", {}),
      job("closed", { status: "Closed" }),
      job("private", { visibility: "Private" }),
      job("mine", { posterId: ME, profileId: "profiles:me" }),
    ],
    artifacts: [
      { _id: "artifacts:mine", profileId: "profiles:me", type: "text", order: 0 },
      { _id: "artifacts:theirs", profileId: "profiles:other", type: "text", order: 0 },
    ],
    jobInterests: [],
  });

  const jobArgs = {
    title: "Mural",
    description: "Paint a wall",
    location: "Remote",
    jobType: "Contract",
    visibility: "Members",
  };

  const BAD_FIELDS: [string, Record<string, unknown>, string][] = [
    ["a blank title", { title: "  " }, "Title is required"],
    ["a title over 100 characters", { title: "x".repeat(101) }, "Title must be 100 characters or less"],
    ["a blank description", { description: " " }, "Description is required"],
    ["a description over 5000 characters", { description: "x".repeat(5001) }, "Description must be 5000 characters or less"],
    ["an on-site job with no city", { location: "On-site", country: "US" }, "City is required for non-remote jobs"],
    ["a hybrid job with no country", { location: "Hybrid", city: "Austin" }, "Country is required for non-remote jobs"],
    ["a hiring organization over 100 characters", { hiringOrg: "x".repeat(101) }, "Hiring organization must be 100 characters or less"],
    ["an external link that isn't a URL", { externalLink: "not a url" }, "External link must be a valid URL"],
  ];

  it.each(BAD_FIELDS)("createJob refuses %s", async (_what, change, reason) => {
    expect(await refusal(jobs.createJob, world(), ME, { ...jobArgs, ...change })).toEqual({
      code: "invalid_input",
      reason,
    });
  });

  it.each(BAD_FIELDS)("updateJob refuses %s", async (_what, change, reason) => {
    expect(await refusal(jobs.updateJob, world(), ME, { ...jobArgs, jobId: "jobs:mine", ...change })).toEqual({
      code: "invalid_input",
      reason,
    });
  });

  it("createJob and updateJob still accept good fields", async () => {
    const ctx = makeCtx(world(), ME);
    const jobId = await run(jobs.createJob, ctx, { ...jobArgs, title: " Mural ", externalLink: "https://example.com" });
    expect(ctx.store.jobs.find((j: Row) => j._id === jobId)).toMatchObject({ posterId: ME, title: "Mural", status: "Open" });
    await run(jobs.updateJob, ctx, { ...jobArgs, jobId, title: "Mural, revised" });
    expect(ctx.store.jobs.find((j: Row) => j._id === jobId)?.title).toBe("Mural, revised");
  });

  it("createJob asks someone with no profile to finish it first", async () => {
    expect(await refusal(jobs.createJob, world(), NOBODY, jobArgs)).toEqual({
      code: "no_profile",
      reason: "Finish your profile first.",
    });
  });

  it("updateJob, closeJob and reopenJob: a job that isn't there is not_found", async () => {
    const gone = { jobId: "jobs:gone" };
    expect(await refusal(jobs.updateJob, world(), ME, { ...jobArgs, ...gone })).toEqual({ code: "not_found", reason: "Job not found" });
    expect(await refusal(jobs.closeJob, world(), ME, gone)).toEqual({ code: "not_found", reason: "Job not found" });
    expect(await refusal(jobs.reopenJob, world(), ME, gone)).toEqual({ code: "not_found", reason: "Job not found" });
  });

  it("updateJob, closeJob and reopenJob: someone else's job is forbidden", async () => {
    const theirs = { jobId: "jobs:open" };
    expect(await refusal(jobs.updateJob, world(), ME, { ...jobArgs, ...theirs })).toEqual({
      code: "forbidden",
      reason: "Only the job poster can edit this job",
    });
    expect(await refusal(jobs.closeJob, world(), ME, theirs)).toEqual({
      code: "forbidden",
      reason: "Only the poster can close this job",
    });
    expect(await refusal(jobs.reopenJob, world(), ME, theirs)).toEqual({
      code: "forbidden",
      reason: "Only the poster can reopen this job",
    });
  });

  it("closeJob and reopenJob still work for the poster", async () => {
    const ctx = makeCtx(world(), ME);
    await run(jobs.closeJob, ctx, { jobId: "jobs:mine" });
    expect(ctx.store.jobs.find((j: Row) => j._id === "jobs:mine")?.status).toBe("Closed");
    await run(jobs.reopenJob, ctx, { jobId: "jobs:mine" });
    expect(ctx.store.jobs.find((j: Row) => j._id === "jobs:mine")?.status).toBe("Open");
  });

  const interest = { jobId: "jobs:open", note: "Hello", workLinks: [] as string[] };

  it("expressInterest refuses each way it can say no", async () => {
    const cases: [Record<string, unknown>, string | null, Refusal][] = [
      [interest, NOBODY, { code: "no_profile", reason: "Finish your profile first." }],
      [{ ...interest, jobId: "jobs:gone" }, ME, { code: "not_found", reason: "Job not found" }],
      [{ ...interest, jobId: "jobs:closed" }, ME, { code: "unavailable", reason: "This job is no longer accepting interest" }],
      [{ ...interest, jobId: "jobs:private" }, ME, { code: "unavailable", reason: "This job is not accepting interest" }],
      [{ ...interest, note: "x".repeat(501) }, ME, { code: "invalid_input", reason: "Note must be 500 characters or less" }],
      [
        { ...interest, workLinks: ["artifacts:mine", "artifacts:mine", "artifacts:mine", "artifacts:mine"] },
        ME,
        { code: "invalid_input", reason: "You can select up to 3 work samples" },
      ],
      [{ ...interest, workLinks: ["artifacts:gone"] }, ME, { code: "not_found", reason: "Work sample not found" }],
      [{ ...interest, workLinks: ["artifacts:theirs"] }, ME, { code: "forbidden", reason: "Work sample does not belong to you" }],
    ];
    for (const [args, viewer, expected] of cases) {
      expect(await refusal(jobs.expressInterest, world(), viewer, args)).toEqual(expected);
    }
  });

  it("withdrawInterest with no interest on file is not_found", async () => {
    expect(await refusal(jobs.withdrawInterest, world(), ME, { jobId: "jobs:open" })).toEqual({
      code: "not_found",
      reason: "You have not expressed interest in this job",
    });
  });

  it("expressInterest tells the poster with the same row and email as before", async () => {
    const ctx = makeCtx(world(), ME);
    const runAfter = vi.spyOn(ctx.scheduler, "runAfter");
    await run(jobs.expressInterest, ctx, { ...interest, workLinks: ["artifacts:mine"] });

    expect(ctx.store.notifications).toEqual([
      expect.objectContaining({
        userId: OTHER,
        type: "job_interest",
        title: "Max is interested in your job",
        message: "Mural painter",
        linkUrl: "/jobs/jobs:open",
        relatedUserId: ME,
      }),
    ]);
    // Stamped with the same moment as the interest it is about.
    expect(ctx.store.notifications[0].createdAt).toBe(ctx.store.jobInterests[0].createdAt);
    expect(runAfter).toHaveBeenCalledTimes(1);
    expect(runAfter.mock.calls[0][2]).toMatchObject({
      to: "other@example.com",
      subject: 'Max is interested in "Mural painter"',
      heading: "New job interest",
      ctaText: "View Applicant",
      ctaUrl: "/jobs/jobs:open",
      category: "activity",
      recipientUserId: OTHER,
    });
  });

  it("expressInterest does not notify twice when someone updates their interest", async () => {
    const ctx = makeCtx(world(), ME);
    await run(jobs.expressInterest, ctx, interest);
    await run(jobs.expressInterest, ctx, { ...interest, note: "Hello again" });
    expect(ctx.store.notifications).toHaveLength(1);
    expect(ctx.store.jobInterests).toHaveLength(1);
  });
});

// ——————————————————————————————————————————————————————————————
// Files
// ——————————————————————————————————————————————————————————————

describe("files refusals", () => {
  const world = (): Record<string, Row[]> => ({
    ...people(),
    projects: [{ _id: "projects:mine", userId: ME, title: "A mural" }],
    events: [
      { _id: "events:full", organizerId: ME, title: "Show", imageStorageIds: ["_storage:1", "_storage:2", "_storage:3"] },
      { _id: "events:room", organizerId: ME, title: "Show", imageStorageIds: ["_storage:1"] },
    ],
  });

  it("the profile image calls ask someone with no profile to finish it first", async () => {
    const expected = { code: "no_profile", reason: "Finish your profile first." };
    expect(await refusal(files.saveProfileImage, world(), NOBODY, { storageId: "_storage:a" })).toEqual(expected);
    expect(await refusal(files.deleteProfileImage, world(), NOBODY)).toEqual(expected);
    expect(await refusal(files.saveProfileImageUrl, world(), NOBODY, { imageUrl: "https://example.com/a.jpg" })).toEqual(expected);
  });

  it("the profile image calls still work with a profile", async () => {
    const ctx = makeCtx(world(), ME);
    await run(files.saveProfileImageUrl, ctx, { imageUrl: "https://example.com/a.jpg" });
    expect(ctx.store.profiles.find((p: Row) => p._id === "profiles:me")?.imageUrl).toBe("https://example.com/a.jpg");
  });

  it("saveProjectImage: a project that isn't there is not_found, someone else's is forbidden", async () => {
    const args = { storageId: "_storage:a" };
    expect(await refusal(files.saveProjectImage, world(), ME, { ...args, projectId: "projects:gone" })).toMatchObject({
      code: "not_found",
    });
    expect(await refusal(files.saveProjectImage, world(), OTHER, { ...args, projectId: "projects:mine" })).toMatchObject({
      code: "forbidden",
    });
  });

  it("saveProjectImage stays owner-only: an admin can't change someone else's project", async () => {
    const tables = world();
    tables.profiles = tables.profiles.map((p: Row) => (p.userId === OTHER ? { ...p, isAdmin: true } : p));
    expect(
      await refusal(files.saveProjectImage, tables, OTHER, { projectId: "projects:mine", storageId: "_storage:a" }),
    ).toMatchObject({ code: "forbidden" });
  });

  it("saveProjectImage still saves for the person who runs the project", async () => {
    const ctx = makeCtx(world(), ME);
    await run(files.saveProjectImage, ctx, { projectId: "projects:mine", storageId: "_storage:a" });
    expect(ctx.store.projects[0].photoStorageId).toBe("_storage:a");
  });

  it("addEventGalleryImage refuses a fourth image with too_many", async () => {
    expect(await refusal(files.addEventGalleryImage, world(), ME, { eventId: "events:full", storageId: "_storage:4" })).toEqual({
      code: "too_many",
      reason: "Maximum 3 gallery images allowed",
    });
    const ctx = makeCtx(world(), ME);
    await run(files.addEventGalleryImage, ctx, { eventId: "events:room", storageId: "_storage:2" });
    expect(ctx.store.events.find((e: Row) => e._id === "events:room")?.imageStorageIds).toEqual(["_storage:1", "_storage:2"]);
  });
});

// ——————————————————————————————————————————————————————————————
// Artifacts
// ——————————————————————————————————————————————————————————————

describe("artifacts refusals", () => {
  const world = (): Record<string, Row[]> => ({
    ...people(),
    artifacts: [
      { _id: "artifacts:nourl", profileId: "profiles:me", type: "text", order: 0 },
      { _id: "artifacts:url", profileId: "profiles:me", type: "link", mediaUrl: "https://example.com", order: 1 },
    ],
  });

  it("create asks someone with no profile to finish it first, and refuses a made-up type", async () => {
    expect(await refusal(artifacts.create, world(), NOBODY, { type: "text" })).toEqual({
      code: "no_profile",
      reason: "Finish your profile first.",
    });
    expect(await refusal(artifacts.create, world(), ME, { type: "hologram" })).toMatchObject({ code: "invalid_input" });
  });

  it("reorder asks someone with no profile to finish it first", async () => {
    expect(await refusal(artifacts.reorder, world(), NOBODY, { artifactIds: [] })).toEqual({
      code: "no_profile",
      reason: "Finish your profile first.",
    });
  });

  it("refetchOgImage refuses a piece with no link", async () => {
    expect(await refusal(artifacts.refetchOgImage, world(), ME, { artifactId: "artifacts:nourl" })).toMatchObject({
      code: "invalid_input",
    });
  });
});

// ——————————————————————————————————————————————————————————————
// Wonderings
// ——————————————————————————————————————————————————————————————

describe("wonderings refusals", () => {
  const day = 86_400_000;
  const world = (): Record<string, Row[]> => ({
    ...people(),
    wonderings: [
      { _id: "wonderings:live", profileId: "profiles:other", prompt: "?", isActive: true, createdAt: 1 },
      { _id: "wonderings:archived", profileId: "profiles:other", prompt: "?", isActive: false, createdAt: 1 },
      { _id: "wonderings:expired", profileId: "profiles:other", prompt: "?", isActive: true, expiresAt: Date.now() - day, createdAt: 1 },
      { _id: "wonderings:mine", profileId: "profiles:me", prompt: "Mine", isActive: true, createdAt: 1 },
    ],
    wonderingResponses: [],
  });

  it("create asks someone with no profile to finish it first", async () => {
    expect(await refusal(wonderings.create, world(), NOBODY, { prompt: "Why?" })).toEqual({
      code: "no_profile",
      reason: "Finish your profile first.",
    });
  });

  it("create refuses a second active wondering on the free plan, and allows it on the paid plan", async () => {
    expect(await refusal(wonderings.create, world(), ME, { prompt: "Why?" })).toEqual({
      code: "too_many",
      reason: "Free plan allows only one active wondering. Archive current one first.",
    });

    const paid = world();
    paid.profiles = paid.profiles.map((p) => (p._id === "profiles:me" ? { ...p, plan: "paid" } : p));
    const ctx = makeCtx(paid, ME);
    await run(wonderings.create, ctx, { prompt: " Why? " });
    expect(ctx.store.wonderings.filter((w: Row) => w.profileId === "profiles:me" && w.isActive)).toHaveLength(2);
  });

  it("submitResponse refuses a wondering that is gone, archived or expired", async () => {
    const reply = { mediaType: "text", content: "Because" };
    expect(await refusal(wonderings.submitResponse, world(), ME, { ...reply, wonderingId: "wonderings:gone" })).toEqual({
      code: "not_found",
      reason: "Wondering not found",
    });
    expect(await refusal(wonderings.submitResponse, world(), ME, { ...reply, wonderingId: "wonderings:archived" })).toEqual({
      code: "unavailable",
      reason: "This wondering is no longer accepting responses",
    });
    expect(await refusal(wonderings.submitResponse, world(), ME, { ...reply, wonderingId: "wonderings:expired" })).toEqual({
      code: "unavailable",
      reason: "This wondering has expired",
    });
    const ctx = makeCtx(world(), ME);
    await run(wonderings.submitResponse, ctx, { ...reply, wonderingId: "wonderings:live" });
    expect(ctx.store.wonderingResponses).toHaveLength(1);
  });

  it("toggleResponsePublic refuses a response that isn't there", async () => {
    expect(await refusal(wonderings.toggleResponsePublic, world(), ME, { responseId: "wonderingResponses:gone" })).toEqual({
      code: "not_found",
      reason: "Response not found",
    });
  });
});

// ——————————————————————————————————————————————————————————————
// Links
// ——————————————————————————————————————————————————————————————

describe("links", () => {
  const world = (): Record<string, Row[]> => ({
    ...people(),
    links: [
      { _id: "links:a", profileId: "profiles:me", label: "A", url: "https://a.example", order: 0 },
      { _id: "links:b", profileId: "profiles:me", label: "B", url: "https://b.example", order: 1 },
      { _id: "links:theirs", profileId: "profiles:other", label: "T", url: "https://t.example", order: 0 },
    ],
  });

  it("add and reorder ask someone with no profile to finish it first", async () => {
    const expected = { code: "no_profile", reason: "Finish your profile first." };
    expect(await refusal(links.add, world(), NOBODY, { label: "X", url: "https://x.example" })).toEqual(expected);
    expect(await refusal(links.reorder, world(), NOBODY, { linkIds: [] })).toEqual(expected);
  });

  it("reorder puts your own links in the order given", async () => {
    const ctx = makeCtx(world(), ME);
    await run(links.reorder, ctx, { linkIds: ["links:b", "links:a"] });
    expect(ctx.store.links.find((l: Row) => l._id === "links:b")?.order).toBe(0);
    expect(ctx.store.links.find((l: Row) => l._id === "links:a")?.order).toBe(1);
  });

  // Behavior fix: reorder used to patch whatever link ids it was handed,
  // including another person's. It now only moves links on the caller's own
  // profile, the way artifacts.reorder does.
  it("reorder leaves someone else's link alone", async () => {
    const ctx = makeCtx(world(), ME);
    await run(links.reorder, ctx, { linkIds: ["links:b", "links:theirs", "links:a"] });
    expect(ctx.store.links.find((l: Row) => l._id === "links:theirs")?.order).toBe(0);
    expect(ctx.store.links.find((l: Row) => l._id === "links:b")?.order).toBe(0);
    expect(ctx.store.links.find((l: Row) => l._id === "links:a")?.order).toBe(2);
  });
});

// ——————————————————————————————————————————————————————————————
// Offerings: a person with two profiles (.unique() threw; the one lookup
// takes the first)
// ——————————————————————————————————————————————————————————————

describe("offerings with two profiles on one person", () => {
  const TEACHER = "users:teacher";
  const STUDENT = "users:student";
  const ADMIN = "users:admin";

  /** Two profile rows for one user: the first one is the one that counts. */
  const twice = (userId: string, tag: string, name: string, extra: Record<string, unknown> = {}): Row[] => [
    { _id: `profiles:${tag}1`, userId, name, interests: [], createdAt: 0, updatedAt: 0, ...extra },
    { _id: `profiles:${tag}2`, userId, name: `${name} (second)`, interests: [], createdAt: 0, updatedAt: 0 },
  ];

  const offering = (id: string, extra: Record<string, unknown> = {}): Row => ({
    _id: `offerings:${id}`,
    userId: TEACHER,
    title: "Drawing",
    format: "class",
    status: "active",
    createdAt: 1,
    updatedAt: 0,
    ...extra,
  });

  const world = (offeringRows: Row[], extra: Record<string, Row[]> = {}): Record<string, Row[]> => ({
    profiles: [
      ...twice(TEACHER, "teacher", "Tess"),
      ...twice(STUDENT, "student", "Sam"),
      ...twice(ADMIN, "admin", "Ada", { isAdmin: true }),
    ],
    offerings: offeringRows,
    offeringSignups: [],
    offeringReports: [],
    hostOrgs: [],
    ...extra,
  });

  it("getOffering shows the class to a signed-in person and names the teacher by the first profile", async () => {
    const ctx = makeCtx(world([offering("o1")]), STUDENT);
    const shown = await run(offerings.getOffering, ctx, { offeringId: "offerings:o1" });
    expect(shown.creator.name).toBe("Tess");
    expect(shown.canReport).toBe(true);
  });

  it("listOfferings lists the classes when a paused one makes it load the viewer", async () => {
    const ctx = makeCtx(
      world([offering("o1"), offering("paused", { title: "Paused", pausedAt: 5, pausedBy: ADMIN, pausedReason: "Complaints" })]),
      STUDENT,
    );
    const listed = await run(offerings.listOfferings, ctx, {});
    expect(listed.map((o: any) => o._id)).toEqual(["offerings:o1"]);
    expect(listed[0].creator.name).toBe("Tess");
  });

  it("signUpForOffering signs the person up under the first profile's name", async () => {
    const ctx = makeCtx(world([offering("o1")]), STUDENT);
    const result = await run(offerings.signUpForOffering, ctx, { offeringId: "offerings:o1" });
    expect(result.alreadySignedUp).toBe(false);
    expect(ctx.store.offeringSignups).toEqual([expect.objectContaining({ userId: STUDENT, name: "Sam", status: "confirmed" })]);
  });

  it("startClassCheckout starts a pledge under the first profile's name", async () => {
    const ctx = makeCtx(world([offering("paid", { priceCents: 2500 })]), null);
    const started = await run(offerings.startClassCheckout, ctx, { offeringId: "offerings:paid", userId: STUDENT });
    expect(started.ok).toBe(true);
    expect(ctx.store.offeringSignups).toEqual([expect.objectContaining({ userId: STUDENT, name: "Sam", status: "pledged" })]);
  });

  // loadViewer is behind every pause / report call.
  it("pauseOffering lets an admin with two profiles pause a class", async () => {
    const ctx = makeCtx(world([offering("o1")]), ADMIN);
    const result = await run(offerings.pauseOffering, ctx, { offeringId: "offerings:o1", reason: "Complaints" });
    expect(result).toEqual({ ok: true, alreadyPaused: false });
  });

  it("restoreOffering lets an admin with two profiles restore a class", async () => {
    const ctx = makeCtx(world([offering("o1", { pausedAt: 5, pausedBy: ADMIN, pausedReason: "Complaints" })]), ADMIN);
    const result = await run(offerings.restoreOffering, ctx, { offeringId: "offerings:o1" });
    expect(result).toEqual({ ok: true, wasPaused: true });
  });

  it("reportOffering takes a report from a person with two profiles", async () => {
    const ctx = makeCtx(world([offering("o1")]), STUDENT);
    const result = await run(offerings.reportOffering, ctx, { offeringId: "offerings:o1", reason: "spam" });
    expect(result.updated).toBe(false);
    expect(ctx.store.offeringReports).toHaveLength(1);
  });

  it("listReportsForOffering and dismissReport work for an admin with two profiles", async () => {
    const report = { _id: "offeringReports:r1", offeringId: "offerings:o1", reporterId: STUDENT, reason: "spam", status: "open", createdAt: 1 };
    const ctx = makeCtx(world([offering("o1")], { offeringReports: [report] }), ADMIN);
    expect(await run(offerings.listReportsForOffering, ctx, { offeringId: "offerings:o1" })).toHaveLength(1);
    expect(await run(offerings.dismissReport, ctx, { reportId: "offeringReports:r1" })).toEqual({ ok: true });
    expect(ctx.store.offeringReports[0].status).toBe("dismissed");
  });
});
