// Shared Telnyx send path, factored out of convex/auth.ts's Phone provider
// so convex/phoneLink.ts (Settings → "Phone number") can send the same kind
// of code text without duplicating the request or the [dev SMS] fallback.
// No "use node" — this only uses `fetch`, which (like `crypto.subtle` in
// resendWebhook.ts) is available in Convex's V8 runtime.

import { fail } from "./errors";

const TELNYX_SEND_URL = "https://api.telnyx.com/v2/messages";

/** What the sign-up, sign-in and RSVP forms show when Telnyx won't send. */
export const CODE_TEXT_FAILED =
  "We couldn't text that number just now. Try again in a few minutes, or use your email.";

/** sendSms for a sign-in code someone is waiting on. A refused send becomes
 * a line the page can show: as a plain Error, production hid it and the
 * forms said only "Couldn't send a code. Try again." (2026-11-06: no code
 * sent after 8 PM PT got anyone in). Telnyx's status goes to the log. */
export async function sendCodeText(to: string, message: string): Promise<void> {
  try {
    await sendSms(to, message);
  } catch (err) {
    console.error("[sms] sign-in code not sent:", err instanceof Error ? err.message : String(err));
    fail("text_failed", CODE_TEXT_FAILED);
  }
}

/** Sends `message` to `to` (E.164) via Telnyx, or logs it instead when no
 * Telnyx credentials are configured (local/dev backend) so sign-in and
 * phone-linking still work without them. Throws on a non-2xx Telnyx
 * response — status only, never the body, since the body can echo request
 * content back in error payloads. */
export async function sendSms(to: string, message: string, from?: string): Promise<{ id?: string }> {
  const apiKey = process.env.TELNYX_API_KEY;
  const sender = from ?? process.env.TELNYX_FROM;
  if (!apiKey) {
    console.log(`[dev SMS] to ${to}: ${message}`);
    return {};
  }

  const response = await fetch(TELNYX_SEND_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: sender, to, text: message }),
  });

  if (!response.ok) {
    throw new Error(`Telnyx send failed with status ${response.status}`);
  }
  // Telnyx's id for the message, so its delivery webhook can be matched.
  try {
    const json = (await response.json()) as { data?: { id?: unknown } };
    return typeof json?.data?.id === "string" ? { id: json.data.id } : {};
  } catch {
    return {};
  }
}
