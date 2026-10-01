// Resend delivery-event webhook — THE CORE, PURE (same split as
// garden/stripeHandlers.ts: no Convex import, no network, no Node-only API
// other than Web Crypto's `crypto.subtle`, which is available in both the
// V8 httpAction runtime and Node/vitest). Takes a locally-typed Resend event
// + a minimal Db interface and returns/awaits state changes only through
// that interface, so this file is unit-testable without a deployment (see
// resendWebhook.test.ts) and swappable onto the real adapter
// (emailDeliveries.ts, called from http.ts's /resend/webhook route).
//
// Every handler is IDEMPOTENT the same way the Stripe webhook is: replaying
// the same event converges to the same end state (applyEvent patches the
// existing row; a status set is unconditional except "sent", which never
// overwrites a later status a replay might race against).

// ——— Locally-typed Resend payload shapes ———

export interface ResendBounceLike {
  type?: string; // e.g. "Permanent" | "Transient"
  subType?: string;
  message?: string;
}

export interface ResendEventDataLike {
  email_id?: string;
  to?: string[];
  subject?: string;
  bounce?: ResendBounceLike;
}

export interface ResendWebhookEvent {
  type: string;
  created_at?: string;
  data: ResendEventDataLike;
}

// ——— The Db interface the pure handler depends on ———

export interface DeliveryStatusRow {
  providerId: string;
  status: "sent" | "delivered" | "delayed" | "bounced" | "complained";
}

export interface ResendWebhookDb {
  getDelivery(providerId: string): Promise<DeliveryStatusRow | null>;
  updateDelivery(
    providerId: string,
    patch: {
      status: "sent" | "delivered" | "delayed" | "bounced" | "complained";
      lastEventAt: number;
      detail?: string;
    },
  ): Promise<{ unknown: boolean }>;
  addSuppression(row: {
    email: string;
    reason: "bounced" | "complained";
    providerId?: string;
  }): Promise<void>;
}

export type HandleResendEventResult =
  | { ignored: true }
  | { unknown: true }
  | { ok: true; status: DeliveryStatusRow["status"] };

/** Every address on the event's `to` list, normalized lowercase. Resend's
 * `to` is an array (rarely more than one address) — a bounce/complaint
 * suppresses every address it names, not just the first. */
function normalizedRecipients(data: ResendEventDataLike): string[] {
  return (data.to ?? []).map((addr) => addr.trim().toLowerCase()).filter(Boolean);
}

/** Maps a Resend event to a delivery status, applies it (respecting the
 * "sent" never overwrites a later status rule), and adds a suppression on a
 * hard bounce or a complaint. Ignores opened/clicked and any type it doesn't
 * recognize. An unknown `email_id` (a send from before this landed, or a
 * dashboard test event) returns `{ unknown: true }` rather than throwing. */
export async function handleResendEvent(
  event: ResendWebhookEvent,
  db: ResendWebhookDb,
  now: number,
): Promise<HandleResendEventResult> {
  const providerId = event.data.email_id;

  switch (event.type) {
    case "email.sent":
    case "email.delivered":
    case "email.delivery_delayed":
    case "email.bounced":
    case "email.complained":
      break;
    default:
      return { ignored: true };
  }

  if (!providerId) return { ignored: true };

  const existing = await db.getDelivery(providerId);
  if (!existing) return { unknown: true };

  if (event.type === "email.sent") {
    // Never regress a later status back to "sent" — a delayed replay of the
    // sent event after a bounce/delivered has already landed is a no-op.
    if (existing.status !== "sent") return { ok: true, status: existing.status };
    await db.updateDelivery(providerId, { status: "sent", lastEventAt: now });
    return { ok: true, status: "sent" };
  }

  if (event.type === "email.delivered") {
    await db.updateDelivery(providerId, { status: "delivered", lastEventAt: now });
    return { ok: true, status: "delivered" };
  }

  if (event.type === "email.delivery_delayed") {
    await db.updateDelivery(providerId, { status: "delayed", lastEventAt: now });
    return { ok: true, status: "delayed" };
  }

  if (event.type === "email.bounced") {
    const bounce = event.data.bounce;
    const detail = bounce?.message ?? bounce?.subType ?? bounce?.type;
    await db.updateDelivery(providerId, {
      status: "bounced",
      lastEventAt: now,
      ...(detail ? { detail } : {}),
    });
    // Only a permanent (hard) bounce suppresses the address — a transient
    // one (mailbox full, greylisted) may well deliver on retry, so it's
    // recorded as "bounced" but not blocked going forward.
    if (bounce?.type === "Permanent") {
      for (const email of normalizedRecipients(event.data)) {
        await db.addSuppression({ email, reason: "bounced", providerId });
      }
    }
    return { ok: true, status: "bounced" };
  }

  // email.complained
  {
    await db.updateDelivery(providerId, { status: "complained", lastEventAt: now });
    for (const email of normalizedRecipients(event.data)) {
      await db.addSuppression({ email, reason: "complained", providerId });
    }
    return { ok: true, status: "complained" };
  }
}

// ——— Svix signature verification (Resend signs webhooks the Svix way) ———
//
// Headers: svix-id, svix-timestamp, svix-signature (space-separated
// "v1,<base64>" entries — Svix supports key rotation by listing more than
// one). Secret is `whsec_<base64>`; signed content is
// `${svixId}.${svixTimestamp}.${rawBody}`, HMAC-SHA256, base64-encoded,
// compared in constant time against every listed v1 value. A timestamp more
// than 5 minutes off (either direction) is rejected — bounds a replayed
// request's usable window.

const MAX_TIMESTAMP_SKEW_SECONDS = 5 * 60;

export interface SvixHeaders {
  svixId: string | null;
  svixTimestamp: string | null;
  svixSignature: string | null;
}

function base64Decode(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** Constant-time string comparison (guards against timing attacks on the
 * signature compare). Both inputs are expected to be base64 signatures of
 * fixed, equal length in the honest case; a length mismatch is an immediate,
 * safe reject (no data is timed against attacker-controlled length). */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

async function hmacSha256Base64(secretBytes: Uint8Array, message: string): Promise<string> {
  const keyData = new Uint8Array(secretBytes).buffer as ArrayBuffer;
  const key = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const messageData = new TextEncoder().encode(message).buffer as ArrayBuffer;
  const signature = await crypto.subtle.sign("HMAC", key, messageData);
  return bytesToBase64(new Uint8Array(signature));
}

/**
 * Verifies a Svix-style webhook signature. `secret` is the raw
 * `RESEND_WEBHOOK_SECRET` value including its `whsec_` prefix; this strips
 * the prefix and base64-decodes the rest. Returns false (never throws) on
 * any malformed input — missing headers, a stale timestamp, or no matching
 * signature.
 */
export async function verifySvixSignature(
  secret: string,
  headers: SvixHeaders,
  rawBody: string,
  now: number,
): Promise<boolean> {
  const { svixId, svixTimestamp, svixSignature } = headers;
  if (!svixId || !svixTimestamp || !svixSignature) return false;

  const timestampSeconds = Number(svixTimestamp);
  if (!Number.isFinite(timestampSeconds)) return false;
  const nowSeconds = Math.floor(now / 1000);
  if (Math.abs(nowSeconds - timestampSeconds) > MAX_TIMESTAMP_SKEW_SECONDS) return false;

  const secretWithoutPrefix = secret.startsWith("whsec_") ? secret.slice("whsec_".length) : secret;
  let secretBytes: Uint8Array;
  try {
    secretBytes = base64Decode(secretWithoutPrefix);
  } catch {
    return false;
  }

  const signedContent = `${svixId}.${svixTimestamp}.${rawBody}`;
  const expected = await hmacSha256Base64(secretBytes, signedContent);

  const candidates = svixSignature
    .split(" ")
    .map((entry) => entry.trim())
    .filter(Boolean);

  for (const candidate of candidates) {
    const [version, value] = candidate.split(",");
    if (version !== "v1" || !value) continue;
    if (constantTimeEqual(value, expected)) return true;
  }
  return false;
}
