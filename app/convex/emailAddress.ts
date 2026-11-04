// Whether a typed email looks like one. Pure — no Convex imports — so the
// sign-up page can check before it texts a code, the same way it uses
// phone.ts. The server still decides (fillMissingBasics, RSVPs, team invites).

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const INVALID_EMAIL = "That doesn't look like a valid email.";

export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email.trim());
}
