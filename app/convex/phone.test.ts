import { describe, expect, it } from "vitest";
import { normalizePhone, PHONE_REJECT_MESSAGE } from "./phone";

describe("normalizePhone", () => {
  it("accepts common US formats and normalizes to E.164", () => {
    const expected = "+16195550100";
    expect(normalizePhone("(619) 555-0100")).toEqual({ ok: true, value: expected });
    expect(normalizePhone("619-555-0100")).toEqual({ ok: true, value: expected });
    expect(normalizePhone("6195550100")).toEqual({ ok: true, value: expected });
    expect(normalizePhone("+16195550100")).toEqual({ ok: true, value: expected });
    expect(normalizePhone("1 619 555 0100")).toEqual({ ok: true, value: expected });
    expect(normalizePhone("  619.555.0100  ")).toEqual({ ok: true, value: expected });
  });

  it("rejects empty, missing, and too-short/long input", () => {
    expect(normalizePhone("")).toEqual({ ok: false, reason: PHONE_REJECT_MESSAGE });
    expect(normalizePhone(undefined)).toEqual({ ok: false, reason: PHONE_REJECT_MESSAGE });
    expect(normalizePhone(null)).toEqual({ ok: false, reason: PHONE_REJECT_MESSAGE });
    expect(normalizePhone("555-0100")).toEqual({ ok: false, reason: PHONE_REJECT_MESSAGE });
    expect(normalizePhone("6195550100123")).toEqual({ ok: false, reason: PHONE_REJECT_MESSAGE });
  });

  it("rejects non-US/Canada country codes", () => {
    expect(normalizePhone("+442071838750")).toEqual({ ok: false, reason: PHONE_REJECT_MESSAGE });
    expect(normalizePhone("+33612345678")).toEqual({ ok: false, reason: PHONE_REJECT_MESSAGE });
  });

  it("rejects numbers with an invalid NANP area code or exchange", () => {
    // Area code / exchange can't start with 0 or 1 in NANP.
    expect(normalizePhone("0195550100")).toEqual({ ok: false, reason: PHONE_REJECT_MESSAGE });
    expect(normalizePhone("1195550100")).toEqual({ ok: false, reason: PHONE_REJECT_MESSAGE });
  });

  it("rejects letters and other garbage", () => {
    expect(normalizePhone("not a phone number")).toEqual({ ok: false, reason: PHONE_REJECT_MESSAGE });
    expect(normalizePhone("619-CALL-NOW")).toEqual({ ok: false, reason: PHONE_REJECT_MESSAGE });
  });

  it("accepts a Canadian-shaped 10-digit number the same way (NANP covers both)", () => {
    expect(normalizePhone("4165550100")).toEqual({ ok: true, value: "+14165550100" });
  });
});
