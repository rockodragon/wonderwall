// Phone number normalization for the "text me a code" sign-in
// (convex/auth.ts Phone provider). Pure — no Convex imports — so it's
// unit-tested directly (phone.test.ts) and reusable from the client for an
// early, friendlier check before the server (the authority) rejects it.
//
// US/Canada only, on purpose: this is also the SMS-pumping guard. Accepting
// arbitrary international numbers here would let a script rack up premium
// international SMS charges on Telnyx by requesting codes to numbers no
// real member has. Every accepted number normalizes to E.164 (+1 plus 10
// digits).

export const PHONE_REJECT_MESSAGE = "Enter a US or Canadian mobile number.";

export type NormalizePhoneResult =
  | { ok: true; value: string }
  | { ok: false; reason: string };

/** Accepts "(619) 555-0100", "619-555-0100", "6195550100", "+16195550100",
 * "1 619 555 0100", with or without surrounding whitespace. Rejects
 * anything that isn't a 10-digit US/Canada number (optionally with a
 * leading country code of 1). Returns E.164: "+1" + 10 digits. */
export function normalizePhone(raw: string | undefined | null): NormalizePhoneResult {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return { ok: false, reason: PHONE_REJECT_MESSAGE };

  // Only digits and a single leading "+" are meaningful; anything else in
  // the input ("(", ")", "-", ".", " ") is just how people format a number.
  if (!/^\+?[0-9()\-. ]+$/.test(trimmed)) {
    return { ok: false, reason: PHONE_REJECT_MESSAGE };
  }

  const digits = trimmed.replace(/[^0-9]/g, "");

  let tenDigits: string;
  if (digits.length === 10) {
    tenDigits = digits;
  } else if (digits.length === 11 && digits.startsWith("1")) {
    tenDigits = digits.slice(1);
  } else {
    return { ok: false, reason: PHONE_REJECT_MESSAGE };
  }

  // NANP: area code and exchange can't start with 0 or 1.
  if (!/^[2-9][0-9]{9}$/.test(tenDigits)) {
    return { ok: false, reason: PHONE_REJECT_MESSAGE };
  }

  return { ok: true, value: `+1${tenDigits}` };
}
