// Shared Telnyx send path, factored out of convex/auth.ts's Phone provider
// so convex/phoneLink.ts (Settings → "Phone number") can send the same kind
// of code text without duplicating the request or the [dev SMS] fallback.
// No "use node" — this only uses `fetch`, which (like `crypto.subtle` in
// resendWebhook.ts) is available in Convex's V8 runtime.

const TELNYX_SEND_URL = "https://api.telnyx.com/v2/messages";

/** Sends `message` to `to` (E.164) via Telnyx, or logs it instead when no
 * Telnyx credentials are configured (local/dev backend) so sign-in and
 * phone-linking still work without them. Throws on a non-2xx Telnyx
 * response — status only, never the body, since the body can echo request
 * content back in error payloads. */
export async function sendSms(to: string, message: string): Promise<void> {
  const apiKey = process.env.TELNYX_API_KEY;
  const from = process.env.TELNYX_FROM;
  if (!apiKey) {
    console.log(`[dev SMS] to ${to}: ${message}`);
    return;
  }

  const response = await fetch(TELNYX_SEND_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to, text: message }),
  });

  if (!response.ok) {
    throw new Error(`Telnyx send failed with status ${response.status}`);
  }
}
