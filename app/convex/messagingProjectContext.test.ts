import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeCtx, run } from "../test-support/convexContext";
import { getConversation, getMessages, getOrCreateConversation, sendMessage } from "./messaging";

vi.mock("./posthog", () => ({ trackEvent: vi.fn(async () => {}) }));

const LEAD = "users:lead";
const APPLICANT = "users:applicant";
const STRANGER = "users:stranger";
const FIRST = "projectMembers:first";
const SECOND = "projectMembers:second";

function world(viewer = LEAD) {
  return makeCtx({
    users: [LEAD, APPLICANT, STRANGER].map(_id => ({ _id })),
    profiles: [
      { _id: "profiles:lead", userId: LEAD, name: "Producer", interests: [] },
      { _id: "profiles:applicant", userId: APPLICANT, name: "Creative", interests: [] },
      { _id: "profiles:stranger", userId: STRANGER, name: "Stranger", interests: [] },
    ],
    projects: [
      { _id: "projects:first", userId: LEAD, title: "First film", kind: "passion", status: "active" },
      { _id: "projects:second", userId: LEAD, title: "Second film", kind: "passion", status: "active" },
    ],
    projectMembers: [
      { _id: FIRST, projectId: "projects:first", userId: APPLICANT, role: "Editor", status: "pending", message: "private application note", availability: "private availability", rateProposal: { amount: 500 }, createdAt: 1 },
      { _id: SECOND, projectId: "projects:second", userId: APPLICANT, role: "Colorist", status: "pending", createdAt: 1 },
    ],
    conversations: [],
    messages: [],
    notifications: [],
  }, viewer);
}

beforeEach(() => vi.clearAllMocks());

describe("project context in the existing pair conversation", () => {
  it("opens one thread for the pair and remembers both films without duplicate contexts", async () => {
    const ctx = world();
    const first = await run(getOrCreateConversation, ctx, { otherUserId: APPLICANT, projectMemberId: FIRST });
    const second = await run(getOrCreateConversation, ctx, { otherUserId: APPLICANT, projectMemberId: SECOND });
    const reopened = await run(getOrCreateConversation, ctx, { otherUserId: APPLICANT, projectMemberId: FIRST });
    expect(first._id).toBe(second._id);
    expect(first._id).toBe(reopened._id);
    expect(ctx.store.conversations).toHaveLength(1);
    expect(reopened.projectMemberIds).toEqual([SECOND, FIRST]);
    expect(ctx.store.messages).toHaveLength(0);
    const thread = await run(getConversation, ctx, { conversationId: first._id });
    expect(thread.projectContexts).toEqual([
      { projectMemberId: SECOND, projectId: "projects:second", projectTitle: "Second film", role: "Colorist" },
      { projectMemberId: FIRST, projectId: "projects:first", projectTitle: "First film", role: "Editor" },
    ]);
    expect(JSON.stringify(thread)).not.toContain("private");
  });

  it("attributes each message to its film for both participants and survives a plain-thread reload", async () => {
    const ctx = world();
    const conversationId = await run(sendMessage, ctx, { recipientId: APPLICANT, content: "About the edit", projectMemberId: FIRST });
    ctx.auth.getUserIdentity = async () => ({ subject: `${APPLICANT}|session` });
    await run(sendMessage, ctx, { recipientId: LEAD, content: "About the grade", projectMemberId: SECOND });
    const messages = await run(getMessages, ctx, { conversationId });
    expect(messages.messages.map((message: any) => [message.content, message.projectContext.projectTitle, message.projectContext.role])).toEqual([
      ["About the edit", "First film", "Editor"],
      ["About the grade", "Second film", "Colorist"],
    ]);
    const thread = await run(getConversation, ctx, { conversationId });
    expect(thread.projectContexts.map((context: any) => context.projectMemberId)).toEqual([FIRST, SECOND]);
    expect(JSON.stringify(messages)).not.toContain("private application note");
    expect(JSON.stringify(messages)).not.toContain("rateProposal");
    expect(JSON.stringify(messages)).not.toContain("private availability");
  });

  it("preserves a sent role when the membership row is edited or reused for a different role", async () => {
    const ctx = world();
    const conversationId = await run(sendMessage, ctx, { recipientId: APPLICANT, content: "Editing discussion", projectMemberId: FIRST });
    ctx.store.projectMembers[0].role = "Colorist";
    ctx.store.projectMembers[0].createdAt = Date.now();
    await run(sendMessage, ctx, { recipientId: APPLICANT, content: "Color discussion", projectMemberId: FIRST });
    expect(ctx.store.messages.map((message: any) => message.projectRole)).toEqual(["Editor", "Colorist"]);
    const messages = await run(getMessages, ctx, { conversationId });
    expect(messages.messages.map((message: any) => message.projectContext.role)).toEqual(["Editor", "Colorist"]);
    expect((await run(getConversation, ctx, { conversationId })).projectContexts[0].role).toBe("Colorist");
    // Existing rows from before role snapshots remain readable.
    delete ctx.store.messages[0].projectRole;
    expect((await run(getMessages, ctx, { conversationId })).messages[0].projectContext.role).toBe("Colorist");
  });

  it("rejects another applicant's context before a conversation or message is written", async () => {
    const ctx = world(STRANGER);
    await expect(run(getOrCreateConversation, ctx, { otherUserId: APPLICANT, projectMemberId: FIRST })).rejects.toThrow("isn't available");
    await expect(run(sendMessage, ctx, { recipientId: APPLICANT, content: "Spoof", projectMemberId: FIRST })).rejects.toThrow("isn't available");
    expect(ctx.store.conversations).toHaveLength(0);
    expect(ctx.store.messages).toHaveLength(0);
    expect(ctx.store.notifications).toHaveLength(0);
  });

  it("requires an account-linked member and a context visible to both parties", async () => {
    const ctx = world();
    delete ctx.store.projectMembers[0].userId;
    await expect(run(getOrCreateConversation, ctx, { otherUserId: APPLICANT, projectMemberId: FIRST })).rejects.toThrow();
    ctx.store.projectMembers[0].userId = APPLICANT;
    ctx.store.projects[0].status = "hidden";
    await expect(run(getOrCreateConversation, ctx, { otherUserId: APPLICANT, projectMemberId: FIRST })).rejects.toThrow();
    ctx.store.projects[0].status = "active";
    ctx.store.projects[0].hostOrgId = "hostOrgs:hidden";
    ctx.store.hostOrgs = [{ _id: "hostOrgs:hidden", name: "_Hidden", slug: "hidden" }];
    await expect(run(getOrCreateConversation, ctx, { otherUserId: APPLICANT, projectMemberId: FIRST })).rejects.toThrow();
  });

  it("hides a context after visibility is revoked while retaining the pair's ordinary message history", async () => {
    const ctx = world();
    const conversationId = await run(sendMessage, ctx, { recipientId: APPLICANT, content: "Our message", projectMemberId: FIRST });
    ctx.store.projects[0].status = "hidden";
    const thread = await run(getConversation, ctx, { conversationId });
    const messages = await run(getMessages, ctx, { conversationId });
    expect(thread.projectContexts).toEqual([]);
    expect(messages.messages[0]).toMatchObject({ content: "Our message" });
    expect(messages.messages[0]).not.toHaveProperty("projectContext");
    expect(messages.messages[0]).not.toHaveProperty("projectMemberId");
    expect(messages.messages[0]).not.toHaveProperty("projectRole");
    expect(JSON.stringify({ thread, messages })).not.toContain("First film");
  });

  it("rejects blocked and unauthenticated users without exposing context", async () => {
    const ctx = world();
    const thread = await run(getOrCreateConversation, ctx, { otherUserId: APPLICANT, projectMemberId: FIRST });
    ctx.store.blocks = [{ _id: "blocks:one", blockerId: APPLICANT, blockedId: LEAD }];
    await expect(run(getOrCreateConversation, ctx, { otherUserId: APPLICANT, projectMemberId: FIRST })).rejects.toThrow();
    expect(await run(getConversation, ctx, { conversationId: thread._id })).toBeNull();
    expect(await run(getMessages, ctx, { conversationId: thread._id })).toEqual({ messages: [], nextCursor: null });
    ctx.auth.getUserIdentity = async () => null;
    expect(await run(getConversation, ctx, { conversationId: thread._id })).toBeNull();
    await expect(run(sendMessage, ctx, { recipientId: APPLICANT, content: "No", projectMemberId: FIRST })).rejects.toThrow();
  });

  it("does not let a third person read the pair thread or its project metadata", async () => {
    const ctx = world();
    const thread = await run(getOrCreateConversation, ctx, { otherUserId: APPLICANT, projectMemberId: FIRST });
    ctx.auth.getUserIdentity = async () => ({ subject: `${STRANGER}|session` });
    expect(await run(getConversation, ctx, { conversationId: thread._id })).toBeNull();
    expect(await run(getMessages, ctx, { conversationId: thread._id })).toEqual({ messages: [], nextCursor: null });
  });

  it("preserves ordinary messages without inventing a project association", async () => {
    const ctx = world();
    const conversationId = await run(sendMessage, ctx, { recipientId: APPLICANT, content: "Hello" });
    expect(ctx.store.messages[0]).not.toHaveProperty("projectMemberId");
    expect((await run(getConversation, ctx, { conversationId })).projectContexts).toEqual([]);
    expect((await run(getMessages, ctx, { conversationId })).messages[0]).not.toHaveProperty("projectContext");
  });
});
