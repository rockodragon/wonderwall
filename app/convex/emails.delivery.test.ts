import { beforeEach, describe, expect, it, vi } from "vitest";
import { getFunctionName } from "convex/server";
import { run } from "../test-support/convexContext";
import { sendNotificationEmail } from "./emails";
import { createResendProvider } from "./email/resendProvider";

const mocks = vi.hoisted(() => ({
  send: vi.fn(), providerName: "resend", resendSend: vi.fn(),
}));
vi.mock("./email/index", () => ({ getEmailProvider: () => ({ name: mocks.providerName, send: mocks.send }) }));
vi.mock("resend", () => ({ Resend: class { emails = { send: mocks.resendSend }; } }));

const args = {
  to: "old@example.com", subject: "A message", previewText: "Preview", heading: "Heading", body: "Body",
  category: "activity", sender: "platform", recipientUserId: "users:one", contactId: "emailDeliveries:one",
};

function actionContext(options: { claimed?: boolean; retryAt?: number | null } = {}) {
  const runMutation = vi.fn(async (reference, _input) => {
    const name = getFunctionName(reference);
    if (name === "emailDeliveries:claimForDispatch") return options.claimed === false
      ? { claimed: false } : { claimed: true, attempts: 2, to: "current@example.com", unsubscribeToken: "current-token" };
    if (name === "emailDeliveries:finishDispatch") return { retryAt: options.retryAt ?? null };
    return "emailDeliveries:legacy";
  });
  return { runMutation, runQuery: vi.fn(), scheduler: { runAfter: vi.fn(), runAt: vi.fn() } };
}

beforeEach(() => { vi.clearAllMocks(); mocks.providerName = "resend"; });

describe("shared email dispatch action", () => {
  it("uses the claimed current address and stable contact idempotency key", async () => {
    mocks.send.mockResolvedValue({ ok: true, id: "provider-one" });
    const ctx = actionContext();
    await run(sendNotificationEmail, ctx, args);
    expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({
      to: "current@example.com", idempotencyKey: "contact/emailDeliveries:one",
    }));
    expect(ctx.runMutation.mock.calls.find(([reference]) => getFunctionName(reference) === "emailDeliveries:finishDispatch")?.[1])
      .toMatchObject({ contactId: args.contactId, attempt: 2, provider: "resend", providerId: "provider-one" });
    expect(ctx.scheduler.runAfter).toHaveBeenCalledTimes(1);
  });

  it("does not send when the final claim rejects current eligibility", async () => {
    const ctx = actionContext({ claimed: false });
    await run(sendNotificationEmail, ctx, args);
    expect(mocks.send).not.toHaveBeenCalled();
    expect(ctx.scheduler.runAfter).not.toHaveBeenCalled();
  });

  it("records missing provider configuration as failure instead of a successful console delivery", async () => {
    mocks.providerName = "console";
    const ctx = actionContext();
    await run(sendNotificationEmail, ctx, args);
    expect(mocks.send).not.toHaveBeenCalled();
    expect(ctx.runMutation.mock.calls.at(-1)?.[1]).toMatchObject({ error: "email_provider_not_configured", retryable: false });
  });

  it("reschedules a transient rejection only at the ledger's bounded retry time", async () => {
    mocks.send.mockResolvedValue({ ok: false, error: "Rate limit", retryable: true });
    const ctx = actionContext({ retryAt: 12345 });
    await run(sendNotificationEmail, ctx, args);
    expect(ctx.scheduler.runAt).toHaveBeenCalledWith(12345, expect.anything(), args);
    expect(ctx.runMutation.mock.calls.at(-1)?.[1]).toMatchObject({ error: "Rate limit", retryable: true });
  });

  it("turns a network exception into a retryable ledger result without persisting the exception payload", async () => {
    mocks.send.mockRejectedValue(new Error("request containing private provider data"));
    const ctx = actionContext();
    await run(sendNotificationEmail, ctx, args);
    expect(ctx.runMutation.mock.calls.at(-1)?.[1]).toMatchObject({ error: "email_provider_request_failed", retryable: true });
  });

  it("supports old scheduled arguments by queueing a correlated action before any send", async () => {
    const ctx = actionContext();
    const { contactId: _contactId, ...legacyArgs } = args;
    await run(sendNotificationEmail, ctx, legacyArgs);
    expect(getFunctionName(ctx.runMutation.mock.calls[0][0])).toBe("emailDeliveries:queueLegacySend");
    expect(mocks.send).not.toHaveBeenCalled();
  });
});

describe("Resend idempotency adapter", () => {
  it("passes the stable idempotency key through the SDK request options", async () => {
    mocks.resendSend.mockResolvedValue({ data: { id: "provider-key" }, error: null });
    const provider = createResendProvider("test-key");
    await expect(provider.send({ to: "person@example.com", subject: "Subject", html: "Body", text: "Body", idempotencyKey: "contact/one" }))
      .resolves.toEqual({ ok: true, id: "provider-key" });
    expect(mocks.resendSend).toHaveBeenCalledWith(expect.objectContaining({ to: ["person@example.com"] }), { idempotencyKey: "contact/one" });
  });
});
