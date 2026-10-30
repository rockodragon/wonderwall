import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getFunctionName } from "convex/server";
import { makeCtx, run } from "../test-support/convexContext";
import { markConversationRead, sendMessage } from "./messaging";
import {
  claimMessageText, finishMessageText, MESSAGE_TEXT_DAILY_CAP, MESSAGE_TEXTS_KEY, messageTextBody,
  resendMissedMessageAlerts, scheduleMessageAlert, sendMessageText, setMessageTexts, textFailureDetail, textSenderName,
} from "./messageAlerts";
import { ensureConversationSummaries } from "./engagement/conversations";
import { PLATFORM_NAME } from "./garden/brandHosts";
import { sendSms } from "./smsSender";
import { trackEvent } from "./posthog";

vi.mock("./posthog", () => ({ trackEvent: vi.fn(async () => {}) }));
vi.mock("./smsSender", () => ({ sendSms: vi.fn(async () => {}) }));

const NOW = 1_800_000_000_000;
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const DAVID = "users:david";
const ANA = "users:ana";
const C = "conversations:one";
const PHONE = "+16195550100";
const SECRET = "private words";
const PHONE_ONLY = { phone: PHONE, phoneVerificationTime: 1 };
const textsSwitch = (enabled: boolean) => ({
  _id: "engagementLoops:texts", key: MESSAGE_TEXTS_KEY, enabled, subject: "", body: "", updatedAt: 1,
});
const TEXTS_ON = { engagementLoops: [textsSwitch(true)] };

function world(recipient: Record<string, unknown> = PHONE_ONLY, extra: Record<string, any[]> = {}, lastMessageAt = 1) {
  const ctx = makeCtx({
    users: [{ _id: DAVID, email: "david@example.com" }, { _id: ANA, ...recipient }],
    profiles: [
      { _id: "profiles:david", userId: DAVID, name: "David Russo", isAdmin: true },
      { _id: "profiles:ana", userId: ANA, name: "Ana", isAdmin: true },
    ],
    conversations: [{ _id: C, participants: [DAVID, ANA], createdAt: 1, lastMessageAt }],
    ...TEXTS_ON,
    ...extra,
  }, DAVID);
  ctx.scheduler.runAfter = vi.fn(async () => {});
  return ctx;
}

const scheduled = (ctx: any, name: string) =>
  vi.mocked(ctx.scheduler.runAfter).mock.calls.filter(([, reference]: any[]) => getFunctionName(reference) === name);

/** Runs every scheduled text action against the same store, as Convex would. */
async function deliverTexts(ctx: any) {
  const handlers: Record<string, unknown> = {
    "messageAlerts:claimMessageText": claimMessageText,
    "messageAlerts:finishMessageText": finishMessageText,
  };
  const actionCtx = { runMutation: (reference: any, args: any) => run(handlers[getFunctionName(reference)], ctx, args) };
  for (const [, , args] of scheduled(ctx, "messageAlerts:sendMessageText")) await run(sendMessageText, actionCtx, args);
}

const texts = (ctx: any) => ctx.store.messageTexts ?? [];
/** Every analytics event's name, user and properties (not the ctx). */
const events = () => JSON.stringify(vi.mocked(trackEvent).mock.calls.map(([, ...rest]) => rest));
/** The fake creates an empty table on first read; only rows count as writes. */
const snapshot = (ctx: any) => JSON.stringify(Object.entries(ctx.store).filter(([, rows]: any) => rows.length));
const send = (ctx: any, content = `${SECRET} about the gig`) => run(sendMessage, ctx, { recipientId: ANA, content });
const as = (ctx: any, userId: string) => { ctx.auth.getUserIdentity = async () => ({ subject: `${userId}|session` }); };
const textOf = (conversationId: string, brand = PLATFORM_NAME, sender = "David Russo") =>
  `${sender} sent you a message on ${brand}: https://site.test/messages/${conversationId}\nReply STOP to opt out.`;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.clearAllMocks();
  vi.stubEnv("SITE_URL", "https://site.test");
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("a message to someone with no email", () => {
  it("texts the verified phone once: sender, link and opt-out, never the message", async () => {
    const ctx = world();
    await send(ctx);
    const messageId = ctx.store.messages[0]._id;
    expect(ctx.store.emailDeliveries ?? []).toEqual([]);
    expect(texts(ctx)).toEqual([expect.objectContaining({
      recipientUserId: ANA, phone: PHONE, conversationId: C, messageId, dedupeKey: `message:${messageId}`, status: "queued", createdAt: NOW,
    })]);
    await deliverTexts(ctx);
    expect(sendSms).toHaveBeenCalledTimes(1);
    expect(sendSms).toHaveBeenCalledWith(PHONE, textOf(C));
    expect(texts(ctx)[0]).toMatchObject({ status: "sent", sentAt: NOW, claimedAt: NOW });
    expect(JSON.stringify(vi.mocked(sendSms).mock.calls)).not.toContain(SECRET);
    expect(events()).not.toContain(SECRET);
    expect(JSON.stringify(texts(ctx))).not.toContain(SECRET);
  });

  it("goes out under the recipient's community name, as the message email would", async () => {
    const ctx = world(PHONE_ONLY, {
      hostOrgs: [
        { _id: "hostOrgs:garden", name: "The Garden", slug: "the-garden", kind: "community" },
        { _id: "hostOrgs:sd", name: "San Diego Creatives", slug: "sd", kind: "community" },
      ],
      communityMembers: [{ _id: "communityMembers:ana", hostOrgId: "hostOrgs:sd", userId: ANA, role: "member", status: "active", joinedAt: 1 }],
    });
    await send(ctx);
    await deliverTexts(ctx);
    expect(sendSms).toHaveBeenCalledWith(PHONE, textOf(C, "San Diego Creatives"));
  });

  it("texts a message sendMessage stamped 1ms ahead of the clock", async () => {
    const ctx = world(PHONE_ONLY, {}, NOW);
    await send(ctx);
    expect(ctx.store.messages[0].createdAt).toBe(NOW + 1);
    expect(texts(ctx)).toEqual([expect.objectContaining({ status: "queued" })]);
    await deliverTexts(ctx);
    expect(texts(ctx)[0]).toMatchObject({ status: "sent" });
  });

  it("sends nothing more for a second message in the same unread burst, and again for the next burst", async () => {
    const ctx = world();
    await send(ctx);
    await send(ctx, "and another thing");
    expect(texts(ctx)).toHaveLength(1);
    expect(ctx.store.emailDeliveries ?? []).toEqual([]);
    await deliverTexts(ctx);
    expect(sendSms).toHaveBeenCalledTimes(1);

    as(ctx, ANA);
    await run(markConversationRead, ctx, { conversationId: C, visibleMessageIds: ctx.store.messages.map((m: any) => m._id) });
    as(ctx, DAVID);
    vi.setSystemTime(NOW + HOUR);
    await send(ctx, "a new burst");
    expect(texts(ctx)).toHaveLength(2);
  });

  it("records a skipped text when the thread is read before the send action runs", async () => {
    const ctx = world();
    await send(ctx);
    as(ctx, ANA);
    await run(markConversationRead, ctx, { conversationId: C, visibleMessageIds: [ctx.store.messages[0]._id] });
    await deliverTexts(ctx);
    expect(sendSms).not.toHaveBeenCalled();
    expect(texts(ctx)[0]).toMatchObject({ status: "skipped", detail: "read_or_replied" });
  });

  it.each([
    ["an unverified phone", { phone: PHONE }, {}, "unverified_phone"],
    ["no phone at all", {}, {}, "unverified_phone"],
    ["Activity switched off", PHONE_ONLY, {
      emailPreferences: [{ _id: "emailPreferences:ana", userId: ANA, activity: false, digest: true, announcements: true, unsubscribeToken: "t" }],
    }, "activity_off"],
  ])("never texts %s; the row says why", async (_name, recipient, extra, reason) => {
    const ctx = world(recipient, extra);
    await send(ctx);
    expect(texts(ctx)).toEqual([expect.objectContaining({ status: "skipped", detail: reason })]);
    expect(scheduled(ctx, "messageAlerts:sendMessageText")).toHaveLength(0);
    await deliverTexts(ctx);
    expect(sendSms).not.toHaveBeenCalled();
  });

  it("rechecks a block made after queueing", async () => {
    const ctx = world();
    await send(ctx);
    ctx.store.blocks = [{ _id: "blocks:one", blockerId: ANA, blockedId: DAVID, createdAt: NOW }];
    await deliverTexts(ctx);
    expect(sendSms).not.toHaveBeenCalled();
    expect(texts(ctx)[0]).toMatchObject({ status: "skipped", detail: "blocked" });
  });

  it("rechecks for an email added after queueing", async () => {
    const ctx = world();
    await send(ctx);
    ctx.store.users[1].email = "ana@example.com";
    await deliverTexts(ctx);
    expect(sendSms).not.toHaveBeenCalled();
    expect(texts(ctx)[0]).toMatchObject({ status: "skipped", detail: "has_email" });
  });

  const earlier = (n: number, at: number, status = "sent") => ({
    _id: `messageTexts:${n}`, recipientUserId: ANA, phone: PHONE, conversationId: `conversations:x${n}`, messageId: `messages:x${n}`,
    dedupeKey: `message:messages:x${n}`, status, createdAt: at, ...(status === "sent" ? { sentAt: at } : {}),
  });

  it(`sends at most ${MESSAGE_TEXT_DAILY_CAP} texts per recipient in 24 hours`, async () => {
    const capped = world(PHONE_ONLY, { messageTexts: [earlier(1, NOW - 23 * HOUR), earlier(2, NOW - HOUR), earlier(3, NOW - 1)] });
    await send(capped);
    expect(texts(capped).at(-1)).toMatchObject({ status: "skipped", detail: "daily_cap" });
  });

  it.each([
    ["the third sent text is a day old", earlier(3, NOW - DAY)],
    ["the third text failed", earlier(3, NOW - 1, "failed")],
    ["the third text was skipped", earlier(3, NOW - 1, "skipped")],
  ])("still texts after two recent sent texts when %s", async (_name, third) => {
    const ctx = world(PHONE_ONLY, { messageTexts: [earlier(1, NOW - 23 * HOUR), earlier(2, NOW - HOUR), third] });
    await send(ctx);
    expect(texts(ctx).at(-1)).toMatchObject({ status: "queued" });
  });

  it("counts a text already handed to the sender toward the cap", async () => {
    const inFlight = (n: number) => ({
      _id: `messageTexts:${n}`, recipientUserId: ANA, phone: PHONE, conversationId: `conversations:x${n}`, messageId: `messages:x${n}`,
      dedupeKey: `message:messages:x${n}`, status: "queued", createdAt: NOW - 10, claimedAt: NOW - 10,
    });
    const ctx = world(PHONE_ONLY, { messageTexts: [inFlight(1), inFlight(2), inFlight(3)] });
    await send(ctx);
    expect(texts(ctx).at(-1)).toMatchObject({ status: "skipped", detail: "daily_cap" });
  });

  it("keeps only Telnyx's status code when a send fails, and never retries", async () => {
    const ctx = world();
    await send(ctx);
    vi.mocked(sendSms).mockRejectedValueOnce(new Error("Telnyx send failed with status 503"));
    await deliverTexts(ctx);
    expect(texts(ctx)[0]).toMatchObject({ status: "failed", detail: "telnyx_503" });
    expect(texts(ctx)[0].sentAt).toBeUndefined();
    await deliverTexts(ctx);
    expect(sendSms).toHaveBeenCalledTimes(1);
    expect(textFailureDetail(new Error(`fetch failed for ${PHONE}: ${SECRET}`))).toBe("send_error");
  });

  it("reads the status code from sendSms's own error, and nothing Telnyx said back", async () => {
    const { sendSms: realSendSms } = await vi.importActual<typeof import("./smsSender")>("./smsSender");
    vi.mocked(sendSms).mockImplementationOnce(realSendSms);
    vi.stubEnv("TELNYX_API_KEY", "test-key");
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ errors: [{ detail: `${PHONE} ${SECRET}` }] }), { status: 422 }));
    vi.stubGlobal("fetch", fetchMock);
    const ctx = world();
    await send(ctx);
    await deliverTexts(ctx);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(texts(ctx)[0]).toMatchObject({ status: "failed", detail: "telnyx_422" });
    expect(JSON.stringify(texts(ctx))).not.toContain(SECRET);
  });

  it("never texts anyone with an email on file, even one that bounced", async () => {
    const ctx = world({ ...PHONE_ONLY, email: "ana@example.com" }, {
      emailSuppressions: [{ _id: "emailSuppressions:ana", email: "ana@example.com", reason: "bounced" }],
    });
    await send(ctx);
    expect(texts(ctx)).toEqual([]);
    expect(ctx.store.emailDeliveries).toEqual([expect.objectContaining({ policy: "message", recipientUserId: ANA })]);
  });
});

describe("texts switched off", () => {
  it.each([
    ["no switch row", []],
    ["the switch turned off", [textsSwitch(false)]],
  ])("with %s: no text, no row, and the outcome says texts_off", async (_name, loops) => {
    const ctx = world(PHONE_ONLY, { engagementLoops: loops });
    await send(ctx);
    expect(texts(ctx)).toEqual([]);
    expect(ctx.store.emailDeliveries ?? []).toEqual([]);
    expect(ctx.scheduler.runAfter).not.toHaveBeenCalled();
    const alert = { recipientId: ANA as any, messageId: ctx.store.messages[0]._id, senderName: "David Russo", dedupeKey: "message:check" };
    expect(await scheduleMessageAlert(ctx, alert, { dryRun: true })).toEqual({ channel: "none", reason: "texts_off" });
    expect(await scheduleMessageAlert(ctx, alert)).toEqual({ channel: "none", reason: "texts_off" });
    expect(texts(ctx)).toEqual([]);
    expect(sendSms).not.toHaveBeenCalled();
  });

  it("a text queued before the switch went off is skipped at send time", async () => {
    const ctx = world();
    await send(ctx);
    ctx.store.engagementLoops[0].enabled = false;
    await deliverTexts(ctx);
    expect(sendSms).not.toHaveBeenCalled();
    expect(texts(ctx)[0]).toMatchObject({ status: "skipped", detail: "texts_off" });
  });

  it("setMessageTexts turns the switch on and off", async () => {
    const ctx = world(PHONE_ONLY, { engagementLoops: [] });
    await run(setMessageTexts, ctx, { enabled: true });
    expect(ctx.store.engagementLoops).toEqual([expect.objectContaining({ key: MESSAGE_TEXTS_KEY, enabled: true, subject: "", body: "" })]);
    await send(ctx);
    expect(texts(ctx)).toEqual([expect.objectContaining({ status: "queued" })]);
    await run(setMessageTexts, ctx, { enabled: false });
    expect(ctx.store.engagementLoops).toEqual([expect.objectContaining({ key: MESSAGE_TEXTS_KEY, enabled: false })]);
  });
});

describe("the text's wording", () => {
  it("builds the text from the names and site address it is given", () => {
    expect(messageTextBody({ senderName: "Ana", brand: "The Garden", conversationId: "conversations:two" }, "https://example.org"))
      .toBe("Ana sent you a message on The Garden: https://example.org/messages/conversations:two\nReply STOP to opt out.");
  });

  it.each([
    ["  Ana \n\t Maria  ", "Ana Maria"],
    ["A".repeat(60), "A".repeat(40)],
    [`${"B".repeat(39)} tail`, "B".repeat(39)],
    ["", "Someone"],
    ["   ", "Someone"],
    ["Ana https://evil.example", "Someone"],
    ["Ana hxxp://x", "Someone"],
    ["visit www.evil", "Someone"],
    ["Win at evil.com now", "Someone"],
    ["café.co", "Someone"],
    ["EVIL.COM", "Someone"],
    ["J. R. Smith", "J. R. Smith"],
    ["Mary-Jane O'Neil", "Mary-Jane O'Neil"],
  ])("names %j as %j", (name, shown) => {
    expect(textSenderName(name)).toBe(shown);
  });

  it("puts a link-like profile name in the text as Someone", async () => {
    const ctx = world();
    ctx.store.profiles[0].name = "Claim your prize at prize.win";
    await send(ctx);
    await deliverTexts(ctx);
    expect(sendSms).toHaveBeenCalledWith(PHONE, textOf(C, PLATFORM_NAME, "Someone"));
  });
});

describe("resendMissedMessageAlerts", () => {
  const CHRISTINA = "users:christina";
  const SINCE = NOW - 3 * DAY;
  const people = [
    ["users:texted", { phone: "+16195550101", phoneVerificationTime: 1 }],
    ["users:emailed", { email: "emailed@example.com" }],
    ["users:reader", { email: "reader@example.com" }],
    ["users:delivered", { email: "delivered@example.com" }],
    ["users:textsent", { phone: "+16195550103", phoneVerificationTime: 1 }],
    ["users:inflight", { email: "inflight@example.com" }],
    ["users:textqueued", { phone: "+16195550104", phoneVerificationTime: 1 }],
    ["users:suppressed", { email: "suppressed@example.com" }],
    ["users:unverified", { phone: "+16195550102" }],
    ["users:old", { email: "old@example.com" }],
  ] as const;

  async function resendWorld(textsOn = true) {
    const ctx = makeCtx({
      users: [{ _id: DAVID, email: "david@example.com" }, { _id: CHRISTINA, email: "christina@example.com" },
        ...people.map(([_id, fields]) => ({ _id, ...fields }))],
      profiles: [
        { _id: "profiles:david", userId: DAVID, name: "David Russo" },
        { _id: "profiles:christina", userId: CHRISTINA, name: "Christina Bumann" },
        ...people.map(([userId]) => ({ _id: `profiles:${userId.slice(6)}`, userId, name: `Name ${userId.slice(6)}` })),
      ],
      conversations: [],
      messages: [],
      engagementLoops: textsOn ? [textsSwitch(true)] : [],
      emailSuppressions: [{ _id: "emailSuppressions:one", email: "suppressed@example.com", reason: "bounced" }],
    }, null);
    ctx.scheduler.runAfter = vi.fn(async () => {});
    const thread = (key: string, a: string, b: string, messages: [string, number, number?][]) => {
      ctx.store.conversations.push({ _id: `conversations:${key}`, participants: [a, b], createdAt: SINCE - DAY, lastMessageAt: Math.max(...messages.map(m => m[1])) });
      messages.forEach(([senderId, createdAt, readAt], i) => ctx.store.messages.push({
        _id: `messages:${key}${i}`, conversationId: `conversations:${key}`, senderId, createdAt, content: `${SECRET} ${key}`,
        ...(readAt === undefined ? {} : { readAt }),
      }));
    };
    thread("texted", DAVID, "users:texted", [[DAVID, NOW - 2 * DAY]]);
    thread("emailed", DAVID, "users:emailed", [[DAVID, NOW - 2 * DAY], [DAVID, NOW - DAY]]);
    thread("reader", DAVID, "users:reader", [[DAVID, NOW - 2 * DAY, NOW - DAY]]);
    thread("delivered", CHRISTINA, "users:delivered", [[CHRISTINA, NOW - 2 * DAY]]);
    thread("textsent", CHRISTINA, "users:textsent", [[CHRISTINA, NOW - 2 * DAY]]);
    thread("inflight", DAVID, "users:inflight", [[DAVID, NOW - 2 * DAY], [DAVID, NOW - DAY]]);
    thread("textqueued", DAVID, "users:textqueued", [[DAVID, NOW - 2 * DAY]]);
    thread("suppressed", DAVID, "users:suppressed", [[DAVID, NOW - 2 * DAY]]);
    thread("unverified", CHRISTINA, "users:unverified", [[CHRISTINA, NOW - 2 * DAY]]);
    thread("old", DAVID, "users:old", [[DAVID, SINCE - DAY]]);
    // Both named: Christina wrote, David answered; David's answer is unread.
    thread("pair", CHRISTINA, DAVID, [[CHRISTINA, NOW - 2 * DAY, NOW - DAY], [DAVID, NOW - DAY + 1]]);
    for (const conversation of ctx.store.conversations) await ensureConversationSummaries(ctx, conversation);
    const email = (key: string, status: string, messageId = `messages:${key}0`) => ({
      _id: `emailDeliveries:${key}`, recipientUserId: `users:${key}`, to: `${key}@example.com`, status, policy: "message",
      dedupeKey: `message:${messageId}`, conversationId: `conversations:${key}`, messageId, createdAt: NOW - 2 * DAY,
    });
    ctx.store.emailDeliveries = [
      // A digest 2 hours ago: a standard email now would wait out its cooldown.
      { _id: "emailDeliveries:digest", recipientUserId: "users:emailed", to: "emailed@example.com", category: "digest", policy: "standard",
        status: "accepted", cooldownAt: NOW - 2 * HOUR, createdAt: NOW - 2 * HOUR },
      // The bug: cancelled by another email's cooldown, never retried.
      { ...email("emailed", "cancelled"), detail: "contact_cooldown" },
      email("delivered", "accepted"),
      // A later message of the burst still has its email on the way.
      email("inflight", "queued", "messages:inflight1"),
    ];
    const text = (key: string, status: string) => ({
      _id: `messageTexts:${key}`, recipientUserId: `users:${key}`, phone: "+16195550199", conversationId: `conversations:${key}`,
      messageId: `messages:${key}0`, dedupeKey: `message:messages:${key}0`, status, createdAt: NOW - 2 * DAY,
    });
    ctx.store.messageTexts = [text("textsent", "sent"), text("textqueued", "queued")];
    return ctx;
  }

  const byConversation = (rows: any[]) => Object.fromEntries(rows.map(({ conversationId, ...row }) => [conversationId.slice(14), row]));
  const ARGS = { senderNames: ["Christina Bumann", "David Russo"], since: SINCE };
  const fromDavid = { senderUserId: DAVID, sender: "David Russo" };
  const fromChristina = { senderUserId: CHRISTINA, sender: "Christina Bumann" };

  it("dry run by default: one row per conversation, and nothing sent or written", async () => {
    const ctx = await resendWorld();
    const before = snapshot(ctx);
    const result = await run(resendMissedMessageAlerts, ctx, ARGS);
    expect(result.dryRun).toBe(true);
    expect(byConversation(result.rows)).toEqual({
      texted: { ...fromDavid, recipient: "Name texted", channel: "text" },
      emailed: { ...fromDavid, recipient: "Name emailed", channel: "email" },
      reader: { ...fromDavid, recipient: "Name reader", skipped: "read_or_replied" },
      delivered: { ...fromChristina, recipient: "Name delivered", skipped: "already_delivered" },
      textsent: { ...fromChristina, recipient: "Name textsent", skipped: "already_delivered" },
      inflight: { ...fromDavid, recipient: "Name inflight", skipped: "in_flight" },
      textqueued: { ...fromDavid, recipient: "Name textqueued", skipped: "in_flight" },
      suppressed: { ...fromDavid, recipient: "Name suppressed", channel: "none", reason: "suppressed" },
      unverified: { ...fromChristina, recipient: "Name unverified", channel: "none", reason: "unverified_phone" },
      pair: { ...fromDavid, recipient: "Christina Bumann", channel: "email" },
    });
    expect(snapshot(ctx)).toBe(before);
    expect(ctx.scheduler.runAfter).not.toHaveBeenCalled();
    expect(sendSms).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain(SECRET);
  });

  it("names a sender it can't find, before doing anything", async () => {
    const ctx = await resendWorld();
    await expect(run(resendMissedMessageAlerts, ctx, { ...ARGS, senderNames: ["David Russo", "Nobody Here"] }))
      .rejects.toThrow('No profile named "Nobody Here"');
    expect(ctx.scheduler.runAfter).not.toHaveBeenCalled();
  });

  it("sends one alert per conversation for its first unread message, and a second run sends nothing", async () => {
    const ctx = await resendWorld();
    const result = await run(resendMissedMessageAlerts, ctx, { ...ARGS, dryRun: false });
    expect(result.dryRun).toBe(false);
    expect(byConversation(result.rows)).toMatchObject({
      texted: { channel: "text" }, emailed: { channel: "email" }, pair: { channel: "email" },
      reader: { skipped: "read_or_replied" }, delivered: { skipped: "already_delivered" }, textsent: { skipped: "already_delivered" },
      inflight: { skipped: "in_flight" }, textqueued: { skipped: "in_flight" },
      suppressed: { channel: "none", reason: "suppressed" },
      unverified: { channel: "none", reason: "unverified_phone" },
    });
    const resent = ctx.store.emailDeliveries.filter((row: any) => row.dedupeKey?.startsWith("message-resend:"));
    // The suppressed address is reported, not queued for the claim to cancel.
    expect(resent.map((row: any) => row.dedupeKey).sort()).toEqual(["message-resend:messages:emailed0", "message-resend:messages:pair1"]);
    expect(resent.every((row: any) => row.policy === "message" && row.status === "queued")).toBe(true);
    expect(texts(ctx)).toEqual(expect.arrayContaining([
      expect.objectContaining({ recipientUserId: "users:texted", dedupeKey: "message-resend:messages:texted0", status: "queued" }),
      expect.objectContaining({ recipientUserId: "users:unverified", dedupeKey: "message-resend:messages:unverified0", status: "skipped", detail: "unverified_phone" }),
    ]));
    expect(scheduled(ctx, "emails:sendNotificationEmail")).toHaveLength(2);
    expect(scheduled(ctx, "messageAlerts:sendMessageText")).toHaveLength(1);
    await deliverTexts(ctx);
    expect(sendSms).toHaveBeenCalledTimes(1);
    expect(sendSms).toHaveBeenCalledWith("+16195550101", textOf("conversations:texted"));
    expect(JSON.stringify(vi.mocked(sendSms).mock.calls)).not.toContain(SECRET);
    expect(events()).not.toContain(SECRET);
    expect(JSON.stringify(result)).not.toContain(SECRET);

    vi.mocked(ctx.scheduler.runAfter).mockClear();
    const counts = [ctx.store.emailDeliveries.length, texts(ctx).length];
    const again = await run(resendMissedMessageAlerts, ctx, { ...ARGS, dryRun: false });
    expect(byConversation(again.rows)).toMatchObject({
      texted: { skipped: "already_queued" }, emailed: { skipped: "already_queued" }, pair: { skipped: "already_queued" },
      unverified: { skipped: "already_queued" }, suppressed: { channel: "none", reason: "suppressed" },
    });
    expect([ctx.store.emailDeliveries.length, texts(ctx).length]).toEqual(counts);
    expect(ctx.scheduler.runAfter).not.toHaveBeenCalled();
  });

  it("resends a newer burst in a conversation whose older burst was already resent", async () => {
    const ctx = await resendWorld();
    // An earlier run resent emailed0 and it was read; emailed1 came after and is still unread.
    ctx.store.messages.find((m: any) => m._id === "messages:emailed0").readAt = NOW - DAY - HOUR;
    ctx.store.emailDeliveries.push({
      _id: "emailDeliveries:resent", recipientUserId: "users:emailed", to: "emailed@example.com", status: "accepted", policy: "message",
      dedupeKey: "message-resend:messages:emailed0", conversationId: "conversations:emailed", messageId: "messages:emailed0", createdAt: NOW - DAY - 2 * HOUR,
    });
    const result = await run(resendMissedMessageAlerts, ctx, { ...ARGS, dryRun: false });
    expect(byConversation(result.rows).emailed).toMatchObject({ channel: "email" });
    expect(ctx.store.emailDeliveries.filter((row: any) => row.dedupeKey === "message-resend:messages:emailed1"))
      .toEqual([expect.objectContaining({ messageId: "messages:emailed1", status: "queued" })]);
  });

  it("with texts off, shows texts_off for phone-only people and writes no text", async () => {
    const ctx = await resendWorld(false);
    const dry = await run(resendMissedMessageAlerts, ctx, ARGS);
    expect(byConversation(dry.rows)).toMatchObject({
      texted: { channel: "none", reason: "texts_off" }, unverified: { channel: "none", reason: "texts_off" },
    });
    const textsBefore = texts(ctx).length;
    const live = await run(resendMissedMessageAlerts, ctx, { ...ARGS, dryRun: false });
    expect(byConversation(live.rows)).toMatchObject({
      texted: { channel: "none", reason: "texts_off" }, emailed: { channel: "email" },
    });
    expect(texts(ctx)).toHaveLength(textsBefore);
    expect(scheduled(ctx, "messageAlerts:sendMessageText")).toHaveLength(0);
  });
});
