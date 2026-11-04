import { generateKeyPairSync, sign } from "node:crypto";
import { describe, expect, it } from "vitest";
import { checkTelnyxSignature } from "./telnyxSignature";

const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const PUBLIC = Buffer.from(publicKey.export({ format: "jwk" }).x as string, "base64url").toString("base64");
const NOW = 1_800_000_000_000;
const BODY = JSON.stringify({ data: { event_type: "message.received" } });
const signed = (timestamp: string, body = BODY) => sign(null, Buffer.from(`${timestamp}|${body}`), privateKey).toString("base64");
const ts = String(NOW / 1000);

describe("checkTelnyxSignature", () => {
  it("accepts a good signature", () => {
    expect(checkTelnyxSignature({ body: BODY, signature: signed(ts), timestamp: ts, publicKey: PUBLIC, now: NOW })).toBe(true);
  });
  it("rejects a changed body, a wrong key, a missing header and garbage", () => {
    const ok = { body: BODY, signature: signed(ts), timestamp: ts, publicKey: PUBLIC, now: NOW };
    expect(checkTelnyxSignature({ ...ok, body: BODY + " " })).toBe(false);
    const other = generateKeyPairSync("ed25519").publicKey.export({ format: "jwk" }).x as string;
    expect(checkTelnyxSignature({ ...ok, publicKey: Buffer.from(other, "base64url").toString("base64") })).toBe(false);
    expect(checkTelnyxSignature({ ...ok, signature: null })).toBe(false);
    expect(checkTelnyxSignature({ ...ok, timestamp: undefined })).toBe(false);
    expect(checkTelnyxSignature({ ...ok, signature: "not base64!!" })).toBe(false);
    expect(checkTelnyxSignature({ ...ok, publicKey: "short" })).toBe(false);
  });
  it("rejects a timestamp older than five minutes, even if signed", () => {
    const old = String(NOW / 1000 - 301);
    expect(checkTelnyxSignature({ body: BODY, signature: signed(old), timestamp: old, publicKey: PUBLIC, now: NOW })).toBe(false);
    const fresh = String(NOW / 1000 - 299);
    expect(checkTelnyxSignature({ body: BODY, signature: signed(fresh), timestamp: fresh, publicKey: PUBLIC, now: NOW })).toBe(true);
  });
});
