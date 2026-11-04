"use node";
// Telnyx signs each webhook with Ed25519 over `{telnyx-timestamp}|{raw body}`
// (headers telnyx-signature-ed25519 and telnyx-timestamp, base64 signature).
// TELNYX_PUBLIC_KEY is the account's base64 public key (32 raw bytes).

import { createPublicKey, verify } from "node:crypto";
import { v } from "convex/values";
import { internalAction } from "./_generated/server";

export const MAX_TIMESTAMP_AGE_MS = 5 * 60 * 1000;

function base64Url(bytes: Buffer): string {
  return bytes.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** True only for a valid signature on a timestamp no more than five minutes
 * old (or ahead). Never throws. */
export function checkTelnyxSignature(args: {
  body: string;
  signature: string | null | undefined;
  timestamp: string | null | undefined;
  publicKey: string;
  now?: number;
}): boolean {
  try {
    const { body, signature, timestamp, publicKey } = args;
    if (!signature || !timestamp) return false;
    const seconds = Number(timestamp);
    if (!Number.isFinite(seconds)) return false;
    if (Math.abs((args.now ?? Date.now()) - seconds * 1000) > MAX_TIMESTAMP_AGE_MS) return false;
    const raw = Buffer.from(publicKey, "base64");
    if (raw.length !== 32) return false;
    const key = createPublicKey({ key: { kty: "OKP", crv: "Ed25519", x: base64Url(raw) }, format: "jwk" });
    const sig = Buffer.from(signature, "base64");
    return verify(null, Buffer.from(`${timestamp}|${body}`), key, sig);
  } catch {
    return false;
  }
}

export const verifyTelnyxSignature = internalAction({
  args: { body: v.string(), signature: v.optional(v.string()), timestamp: v.optional(v.string()) },
  handler: async (_ctx, { body, signature, timestamp }): Promise<boolean> => {
    const publicKey = process.env.TELNYX_PUBLIC_KEY;
    if (!publicKey) return false;
    return checkTelnyxSignature({ body, signature, timestamp, publicKey });
  },
});
