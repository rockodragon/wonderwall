import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeCtx, run } from "../test-support/convexContext";
import { dismissTextsAsk, getMyTextSettings, isStartWord, isStopWord, setMyTexts, TEXT_CONSENT_CARD_BUTTON, TEXT_CONSENT_LABEL, TEXT_CONSENT_LINE, TEXT_CONSENT_QUESTION, TEXT_CONSENT_WORDING } from "./textConsent";
import { MESSAGE_TEXT_DAILY_CAP } from "./messageAlerts";
import { fillMissingBasics } from "./profiles";
import { get as getEmailPreferences } from "./emailPreferences";

const ANA = "users:ana";
const PHONE = "+16195550100";
const NOW = 1_800_000_000_000;

function world(user: Record<string, unknown>, extra: Record<string, any[]> = {}) {
  return makeCtx({ users: [{ _id: ANA, ...user }], profiles: [{ _id: "profiles:ana", userId: ANA, name: "Ana" }], ...extra }, ANA);
}
const PHONE_ONLY = { phone: PHONE, phoneVerificationTime: 1 };

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(NOW); vi.stubEnv("TELNYX_UPDATES_FROM", "+18005550199"); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

describe("stop and start words", () => {
  it("reads a stop word or phrase anywhere in a reply, ignoring case and punctuation", () => {
    for (const w of ["stop", " STOP ", "Stop.", "stop it please", "please opt out", "Opt-out!", "revoke", "UNSUBSCRIBE", "cancel", "stopall"]) {
      expect(isStopWord(w), w).toBe(true);
    }
    for (const w of ["", undefined, "stopping", "hello", "start", "a"]) expect(isStopWord(w), String(w)).toBe(false);
  });
  it("reads start and unstop exactly, after the same tidying", () => {
    for (const w of ["start", "UNSTOP", " Start. "]) expect(isStartWord(w), w).toBe(true);
    for (const w of ["stop", "go", "start now", undefined]) expect(isStartWord(w), String(w)).toBe(false);
  });
});

describe("the daily cap in the words", () => {
  it("is the cap the code enforces", () => {
    expect(MESSAGE_TEXT_DAILY_CAP).toBe(3);
    expect(TEXT_CONSENT_LINE).toContain(`Up to ${MESSAGE_TEXT_DAILY_CAP} texts a day`);
  });
});

describe("getMyTextSettings", () => {
  it("is available only with a verified phone and no email", async () => {
    expect(await run(getMyTextSettings, world(PHONE_ONLY), {})).toMatchObject({ available: true, on: false, decided: false, optedOut: false, updatesNumber: "+18005550199" });
    expect((await run(getMyTextSettings, world({ ...PHONE_ONLY, email: "a@b.co" }), {}))?.available).toBe(false);
    expect((await run(getMyTextSettings, world({ phone: PHONE }), {}))?.available).toBe(false);
  });

  it("shows STOP for the phone and clears on a new number", async () => {
    const ctx = world(PHONE_ONLY, { smsOptOuts: [{ _id: "smsOptOuts:a", phone: PHONE, optedOutAt: 1 }] });
    expect((await run(getMyTextSettings, ctx, {}))?.optedOut).toBe(true);
    ctx.store.smsOptOuts[0].optedInAt = 1;
    expect((await run(getMyTextSettings, ctx, {}))?.optedOut).toBe(true); // a tie is STOP
    ctx.store.smsOptOuts[0].optedInAt = 2;
    expect((await run(getMyTextSettings, ctx, {}))?.optedOut).toBe(false);
  });
});

describe("setMyTexts and the card", () => {
  it("turning on saves the number, the time and the wording; the card is decided", async () => {
    const ctx = world(PHONE_ONLY);
    await run(setMyTexts, ctx, { on: true });
    expect(ctx.store.textConsents).toEqual([expect.objectContaining({ userId: ANA, phone: PHONE, agreedAt: NOW, wording: TEXT_CONSENT_WORDING })]);
    expect(await run(getMyTextSettings, ctx, {})).toMatchObject({ on: true, decided: true });
  });

  it("turning off keeps the row, stamps revokedAt, and turning on again clears it", async () => {
    const ctx = world(PHONE_ONLY);
    await run(setMyTexts, ctx, { on: true });
    await run(setMyTexts, ctx, { on: false });
    expect(ctx.store.textConsents).toHaveLength(1);
    expect(await run(getMyTextSettings, ctx, {})).toMatchObject({ on: false, decided: true });
    await run(setMyTexts, ctx, { on: true });
    expect((await run(getMyTextSettings, ctx, {}))?.on).toBe(true);
  });

  it("a changed number is off until they say yes again", async () => {
    const ctx = world(PHONE_ONLY);
    await run(setMyTexts, ctx, { on: true });
    ctx.store.users[0].phone = "+16195550777";
    expect(await run(getMyTextSettings, ctx, {})).toMatchObject({ on: false, decided: true });
  });

  it("saves the words of the place it was asked: the card's question or Settings' label", async () => {
    const card = world(PHONE_ONLY);
    await run(setMyTexts, card, { on: true, from: "card" });
    expect(card.store.textConsents[0].wording).toBe(`${TEXT_CONSENT_QUESTION}\n${TEXT_CONSENT_CARD_BUTTON}\n${TEXT_CONSENT_LINE}`);
    const settings = world(PHONE_ONLY);
    await run(setMyTexts, settings, { on: true, from: "settings" });
    expect(settings.store.textConsents[0].wording).toBe(`${TEXT_CONSENT_LABEL}\n${TEXT_CONSENT_LINE}`);
  });

  it("turning off always works, even after an email was added; a revived number needs a new yes", async () => {
    const ctx = world(PHONE_ONLY);
    await run(setMyTexts, ctx, { on: true });
    ctx.store.users[0].email = "a@b.co";
    await run(setMyTexts, ctx, { on: false });
    expect(ctx.store.textConsents[0].revokedAt).toBe(NOW);
    const bare = world({ email: "a@b.co" });
    await run(setMyTexts, bare, { on: false });
    expect(bare.store.textConsents).toEqual([expect.objectContaining({ userId: ANA, revokedAt: NOW })]);
  });

  it("refuses an account with an email or no verified phone, with a reason", async () => {
    for (const user of [{ ...PHONE_ONLY, email: "a@b.co" }, { phone: PHONE }, {}]) {
      const ctx = world(user);
      await expect(run(setMyTexts, ctx, { on: true })).rejects.toMatchObject({ data: { code: "texts_unavailable" } });
      expect(ctx.store.textConsents ?? []).toEqual([]);
    }
  });

  it("Not now closes the card for good and gives no consent", async () => {
    const ctx = world(PHONE_ONLY);
    await run(dismissTextsAsk, ctx, {});
    expect(ctx.store.textConsents).toEqual([expect.objectContaining({ dismissedAt: NOW })]);
    expect(await run(getMyTextSettings, ctx, {})).toMatchObject({ available: true, on: false, decided: true });
  });
});

describe("an email added from the card or Settings", () => {
  it("saves the address, closes the card and shows the email switches", async () => {
    const ctx = world(PHONE_ONLY);
    expect(await run(getEmailPreferences, ctx, {})).toMatchObject({ hasEmail: false });
    await run(fillMissingBasics, ctx, { email: " Ana@Example.com " });
    expect(ctx.store.users[0].email).toBe("ana@example.com");
    expect(await run(getEmailPreferences, ctx, {})).toMatchObject({ hasEmail: true });
    expect((await run(getMyTextSettings, ctx, {}))?.available).toBe(false);
  });

  it("refuses a typo with a line the page can show", async () => {
    const ctx = world(PHONE_ONLY);
    const err = await run(fillMissingBasics, ctx, { email: "ana@example" }).catch(e => e);
    expect(err.data).toEqual({ code: "invalid_email", reason: "That doesn't look like a valid email." });
    expect(ctx.store.users[0].email).toBeUndefined();
  });
});
