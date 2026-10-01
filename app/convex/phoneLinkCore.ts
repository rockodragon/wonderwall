// Pure(ish) pieces of Settings → "Phone number" (convex/phoneLink.ts),
// factored out so the expiry/attempt/hashing rules are unit-testable
// without a database. No "use node" — crypto.subtle is available in
// Convex's V8 runtime (same as convex/resendWebhook.ts's HMAC check).

export const CODE_TTL_MS = 10 * 60 * 1000; // 10 minutes
export const MAX_CODE_ATTEMPTS = 5;
export const MAX_LINK_STARTS_PER_HOUR = 5;
export const LINK_START_WINDOW_MS = 60 * 60 * 1000;

/** A 6-digit code from a caller-supplied random 32-bit value, so the
 * randomness itself (crypto.getRandomValues) stays outside this pure
 * function and the digit derivation can be tested deterministically. */
export function codeFromRandomUint32(value: number): string {
  const code = value % 1_000_000;
  return code.toString().padStart(6, "0");
}

export function isCodeExpired(expiresAt: number, now: number): boolean {
  return now >= expiresAt;
}

export function hasAttemptsRemaining(attempts: number): boolean {
  return attempts < MAX_CODE_ATTEMPTS;
}

/** True once `count` prior starts already fall within the last hour of
 * `now` — i.e. one more would push past MAX_LINK_STARTS_PER_HOUR. */
export function isOverStartLimit(recentStartCount: number): boolean {
  return recentStartCount >= MAX_LINK_STARTS_PER_HOUR;
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Hashes a 6-digit code for storage — the `phoneLinkCodes.codeHash`
 * column never holds the code itself. */
export async function hashCode(code: string): Promise<string> {
  return sha256Hex(code);
}
