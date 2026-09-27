// Short invite codes for the member invite-link system (convex/invites.ts's
// inviteSlug field). Pure — no Convex imports — so it's unit-tested
// directly (inviteCode.test.ts) and reusable from the client (home.tsx,
// signup.tsx) for an early, friendlier check before the server looks it up.
//
// Old invites already share name-based slugs like "rick-moy" — those keep
// redeeming forever via an exact-match lookup on the stored value
// (invites.ts's findInviterProfile). This module only shapes NEW codes and
// normalizes what a person types into an "Invite code" box.

// Uppercase letters and digits, minus look-alikes: 0/O, 1/I/L.
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 6;

/** Generates one candidate code, e.g. "K7M4QD". Callers that persist a code
 * (invites.ts's generateInviteSlug) are responsible for retrying on a
 * collision — this function has no knowledge of what's already taken. */
/** A uniform float in [0, 1) from the platform's secure generator. Invite
 * codes are what let someone past an invite-only door, so they shouldn't be
 * predictable the way Math.random can be. */
function secureRandom(): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] / 0x100000000;
}

export function generateInviteCode(random: () => number = secureRandom): string {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length)];
  }
  return code;
}

/** Cleans up whatever a person pastes into an "Invite code" box: a bare
 * code ("k7m4-qd", "k7m4 qd") or a full shared link
 * ("creatives.exchange/signup/K7M4QD?ref=…").
 *
 * A link is handled differently from a bare code on purpose: extracting the
 * path segment out of a pasted link preserves it byte-for-byte (trimmed of
 * surrounding whitespace, a query/hash, and trailing slashes only) so an
 * old name-based slug like "rick-moy" — which contains the dash and
 * lowercase letters this function strips from typed codes — still matches
 * the value already stored on that member's profile. A bare typed code, by
 * contrast, gets uppercased and has spaces/dashes stripped, since those are
 * just how people key in the new 6-character format. */
export function normalizeInviteCode(raw: string | undefined | null): string {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return "";

  // A link's code is extracted verbatim (see the comment above) — covers
  // both the current /signup/<code> shape and the older ?invite=<code>
  // query-param shape home.tsx used to redirect from.
  const signupMatch = trimmed.match(/\/signup\/([^/?#]+)/i);
  if (signupMatch) {
    return signupMatch[1].replace(/\/+$/, "").trim();
  }
  const inviteParamMatch = trimmed.match(/[?&]invite=([^&#]+)/i);
  if (inviteParamMatch) {
    return decodeURIComponent(inviteParamMatch[1]);
  }

  return trimmed.toUpperCase().replace(/[\s-]+/g, "");
}
