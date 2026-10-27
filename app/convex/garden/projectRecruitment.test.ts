import { describe, expect, it, vi } from "vitest";
import { makeCtx, run } from "../../test-support/convexContext";
import { getTeam, inviteMember, requestToJoin, setReviewStage } from "./projectTeam";
import { rateProposalLabel, validateAvailability, validateRateProposal } from "./recruitment";
import { portfolioSamples, validatePortfolioSampleIds } from "../portfolioSamples";
import { getMine } from "../shortlist";

const LEAD = "users:lead";
const APPLICANT = "users:applicant";
const STRANGER = "users:stranger";
const ADMIN = "users:admin";
const PROJECT = "projects:film";
const ROLE = "projectRoles:editor";
const MEMBER = "projectMembers:application";
const SAMPLE = "artifacts:reel";
const RATE = { amount: 500, currency: "USD", unit: "day" };

function world(viewer: string | null = APPLICANT, pending = false) {
  return makeCtx({
    users: [LEAD, APPLICANT, STRANGER, ADMIN].map(_id => ({ _id })),
    profiles: [
      { _id: "profiles:lead", userId: LEAD, name: "Lena", interests: [] },
      { _id: "profiles:applicant", userId: APPLICANT, name: "Ash", interests: ["Film"] },
      { _id: "profiles:stranger", userId: STRANGER, name: "Sam", interests: [] },
      { _id: "profiles:admin", userId: ADMIN, name: "Ada", interests: [], isAdmin: true },
    ],
    projects: [{ _id: PROJECT, userId: LEAD, kind: "passion", status: "active", title: "The Film", createdAt: 1 }],
    projectRoles: [{ _id: ROLE, projectId: PROJECT, title: "Editor", status: "open", createdAt: 1 }],
    artifacts: [
      { _id: SAMPLE, profileId: "profiles:applicant", type: "video", title: "Reel", mediaUrl: "https://vimeo.com/123", order: 0 },
      { _id: "artifacts:other", profileId: "profiles:stranger", type: "text", content: "Someone else's work", order: 0 },
    ],
    projectMembers: pending ? [{
      _id: MEMBER, projectId: PROJECT, userId: APPLICANT, name: "Ash", role: "Editor", roleId: ROLE,
      status: "pending", message: "My application note", workSampleIds: [SAMPLE], availability: "Nov 12–14, evenings",
      rateProposal: RATE, reviewStage: "considering", createdAt: 1,
    }] : [],
  }, viewer);
}

describe("project application evidence", () => {
  it("stores owned samples, normalized availability and a proposed rate without accepting membership", async () => {
    const ctx = world();
    const result = await run(requestToJoin, ctx, {
      projectId: PROJECT, role: "wrong free-text title", roleId: ROLE, message: "I'd love to edit",
      workSampleIds: [SAMPLE, SAMPLE], availability: "  Nov 12–14, evenings  ",
      rateProposal: { ...RATE, currency: " usd " },
    });
    const application = ctx.store.projectMembers.find((row: any) => row._id === result.memberId);
    expect(application).toMatchObject({
      status: "pending", role: "Editor", roleId: ROLE, workSampleIds: [SAMPLE],
      availability: "Nov 12–14, evenings", rateProposal: RATE,
    });
    expect(ctx.store.projectRoles[0].status).toBe("open");
  });

  it.each(["artifacts:other", "artifacts:missing"])("rejects non-owned or missing sample %s before creating an application", async sample => {
    const ctx = world();
    await expect(run(requestToJoin, ctx, { projectId: PROJECT, role: "Editor", workSampleIds: [sample] })).rejects.toThrow("own portfolio");
    expect(ctx.store.projectMembers).toEqual([]);
  });

  it("keeps new evidence optional for existing clients and generic join requests", async () => {
    const ctx = world();
    const result = await run(requestToJoin, ctx, { projectId: PROJECT, role: "Extra hands" });
    expect(result.status).toBe("pending");
    expect(ctx.store.projectMembers[0]).toMatchObject({ role: "Extra hands" });
  });

  it("does not change the one-active-request policy or overwrite an existing application", async () => {
    const ctx = world(APPLICANT, true);
    const result = await run(requestToJoin, ctx, { projectId: PROJECT, role: "Colorist", availability: "changed" });
    expect(result.changed).toBe(false);
    expect(ctx.store.projectMembers).toHaveLength(1);
    expect(ctx.store.projectMembers[0]).toMatchObject({ role: "Editor", availability: "Nov 12–14, evenings" });
  });

  it("clears previous evidence and private review when a withdrawn row is reused", async () => {
    const ctx = world(APPLICANT, true);
    ctx.store.projectMembers[0].status = "withdrawn";
    ctx.store.projectMembers[0].reviewUpdatedAt = 10;
    await run(requestToJoin, ctx, { projectId: PROJECT, role: "Colorist" });
    expect(ctx.store.projectMembers).toHaveLength(1);
    const row = ctx.store.projectMembers[0];
    for (const field of ["workSampleIds", "availability", "rateProposal", "reviewStage", "reviewUpdatedAt"])
      expect(row[field]).toBeUndefined();
  });

  it("starts a reused application after an old message's logical clock, without reviving its reply action", async () => {
    const ctx = world(APPLICANT, true);
    ctx.store.projectMembers[0].status = "withdrawn";
    ctx.store.projectMembers[0].createdAt = 10_000;
    ctx.store.messages = [{
      _id: "messages:previous", projectMemberId: MEMBER, conversationId: "conversations:previous",
      senderId: LEAD, content: "Earlier application", createdAt: 10_020,
    }];
    const clock = vi.spyOn(Date, "now").mockReturnValue(10_000);
    try {
      await run(requestToJoin, ctx, { projectId: PROJECT, role: "Colorist" });
      expect(ctx.store.projectMembers[0].createdAt).toBe(10_021);
      const shortlist = await run(getMine, ctx);
      const application = shortlist.projects.find((row: any) => row.relation === "waiting");
      expect(application.nextAction).toMatchObject({ kind: "waiting", since: 10_021 });
      expect(application.nextAction.href).not.toContain("conversations:previous");
    } finally {
      clock.mockRestore();
    }
  });

  it("clears application-only fields when the same person is later invited", async () => {
    const ctx = world(LEAD, true);
    ctx.store.projectMembers[0].status = "withdrawn";
    await run(inviteMember, ctx, { projectId: PROJECT, userId: APPLICANT, role: "Editor" });
    expect(ctx.store.projectMembers[0].status).toBe("invited");
    for (const field of ["workSampleIds", "availability", "rateProposal", "reviewStage"])
      expect(ctx.store.projectMembers[0][field]).toBeUndefined();
  });
});

describe("application privacy and private review", () => {
  it.each([null, STRANGER])("does not expose evidence, rates or review stage to viewer %s", async viewer => {
    const team = await run(getTeam, world(viewer, true), { projectId: PROJECT });
    expect(team.pending).toBeUndefined();
    expect(JSON.stringify(team)).not.toContain("Nov 12");
    expect(JSON.stringify(team)).not.toContain("considering");
    expect(JSON.stringify(team)).not.toContain(SAMPLE);
  });

  it("lets the applicant see their submitted evidence, but never the lead's private stage", async () => {
    const team = await run(getTeam, world(APPLICANT, true), { projectId: PROJECT });
    expect(team.mine).toMatchObject({ availability: "Nov 12–14, evenings", rateProposal: RATE });
    expect(team.mine.workSamples).toMatchObject([{ artifactId: SAMPLE, title: "Reel" }]);
    expect(team.mine.reviewStage).toBeUndefined();
    expect(JSON.stringify(team)).not.toContain("considering");
  });

  it.each([LEAD, ADMIN])("lets authorized reviewer %s inspect evidence and privately consider a request", async viewer => {
    const ctx = world(viewer, true);
    const team = await run(getTeam, ctx, { projectId: PROJECT });
    expect(team.pending[0]).toMatchObject({ roleId: ROLE, availability: "Nov 12–14, evenings", reviewStage: "considering", rateProposal: RATE });
    expect(team.pending[0].workSamples[0]).toMatchObject({ artifactId: SAMPLE, mediaUrl: "https://vimeo.com/123" });
    await run(setReviewStage, ctx, { memberId: MEMBER, stage: "discussing" });
    expect(ctx.store.projectMembers[0]).toMatchObject({ status: "pending", reviewStage: "discussing" });
    expect(ctx.store.projectMembers[0].reviewUpdatedAt).toBeGreaterThan(0);
    expect(ctx.store.notifications).toBeUndefined();
  });

  it.each([null, APPLICANT, STRANGER])("refuses private review by viewer %s", async viewer => {
    const ctx = world(viewer, true);
    await expect(run(setReviewStage, ctx, { memberId: MEMBER, stage: "discussing" })).rejects.toThrow();
    expect(ctx.store.projectMembers[0].reviewStage).toBe("considering");
  });

  it("does not mutate a decided request or reveal blocked candidate evidence", async () => {
    const ctx = world(LEAD, true);
    ctx.store.projectMembers[0].status = "accepted";
    await expect(run(setReviewStage, ctx, { memberId: MEMBER, stage: "new" })).rejects.toThrow("pending");
    ctx.store.projectMembers[0].status = "pending";
    ctx.store.blocks = [{ _id: "blocks:one", blockerId: APPLICANT, blockedId: LEAD }];
    await expect(run(setReviewStage, ctx, { memberId: MEMBER, stage: "new" })).rejects.toThrow();
    expect((await run(getTeam, ctx, { projectId: PROJECT })).pending).toEqual([]);
  });
});

describe("shared sample and proposal rules", () => {
  it("enforces one shared three-sample cap and safely skips deleted work at read time", async () => {
    const ctx = world();
    await expect(validatePortfolioSampleIds(ctx, "profiles:applicant" as never, [SAMPLE, "artifacts:2", "artifacts:3", "artifacts:4"] as never)).rejects.toThrow("up to 3");
    expect(await portfolioSamples(ctx, ["artifacts:missing" as never])).toEqual([]);
  });

  it("rejects invalid rate values and limits applicant availability", () => {
    for (const amount of [0, -1, Infinity, NaN, 1_000_000_001])
      expect(() => validateRateProposal({ ...RATE, amount } as never)).toThrow("amount");
    expect(() => validateRateProposal({ ...RATE, currency: "dollars" } as never)).toThrow("currency");
    expect(() => validateRateProposal({ ...RATE, unit: "week" } as never)).toThrow("hourly");
    expect(() => validateAvailability("x".repeat(501))).toThrow("500");
    expect(validateAvailability("   ")).toBeUndefined();
    expect(validateRateProposal(undefined)).toBeUndefined();
    expect(rateProposalLabel(RATE as never)).toBe("USD $500/day");
  });
});
