// The words a person agrees to when they switch message texts on. Pure, so
// Settings, the Canvas card and the server (which saves it with the consent)
// all read the same text.

export const TEXT_CONSENT_LABEL = "Text me when someone messages me";
export const TEXT_CONSENT_LINE =
  "Up to 3 texts a day. Message and data rates may apply. Reply STOP to stop, HELP for help.";
/** The Canvas card's question. It offers email first; texting is its
 * second button (components/TextsAskCard.tsx). */
export const TEXT_CONSENT_QUESTION = "How should we reach you when someone messages you?";
export const TEXT_CONSENT_CARD_BUTTON = "Text me instead";
/** What was shown, saved verbatim with the consent, per place it was asked. */
export const consentWordingFor = (from: "settings" | "card") =>
  from === "card"
    ? `${TEXT_CONSENT_QUESTION}\n${TEXT_CONSENT_CARD_BUTTON}\n${TEXT_CONSENT_LINE}`
    : `${TEXT_CONSENT_LABEL}\n${TEXT_CONSENT_LINE}`;
export const TEXT_CONSENT_WORDING = consentWordingFor("settings");

/** Under "Text me a code" wherever a number is typed for a code. The
 * toll-free review sent the sign-in number back (2026-11-07) for the
 * standard disclosures beside the field: what the texts are, how often,
 * rates, STOP, HELP, and the privacy policy (CodeTextNote links it). */
export const CODE_TEXT_LINE =
  "We'll text you a one-time sign-in code, one text each time you ask. Message and data rates may apply. Reply STOP to stop, HELP for help.";

/** The text that confirms an opt-in (in the app, or START after a STOP).
 * Word for word what the Telnyx toll-free verification registered. */
export const TEXT_WELCOME =
  "TheCreative.exchange: You'll get a text when someone messages you, up to 3 a day. Msg & data rates may apply. Reply HELP for help, STOP to stop.";
/** The reply to HELP. Word for word what the verification registered. */
export const TEXT_HELP_REPLY =
  "TheCreative.exchange message alerts. For help, email hello@thecreative.exchange. Up to 3 texts a day. Msg & data rates may apply. Reply STOP to stop.";

const STOP_WORDS = new Set(["stop", "stopall", "unsubscribe", "cancel", "end", "quit", "revoke", "optout", "opt out"]);
const START_WORDS = new Set(["start", "unstop"]);
const HELP_WORDS = new Set(["help", "info"]);

/** Lowercase, anything but letters and digits to a space, spaces collapsed. */
function normalize(text: unknown): string {
  return typeof text === "string" ? text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim() : "";
}

/** A reply that opts the sender out: any whole stop word or phrase in it
 * ("Stop.", "please opt out", "revoke"). */
export function isStopWord(text: unknown): boolean {
  const clean = normalize(text);
  if (!clean) return false;
  const padded = ` ${clean} `;
  return [...STOP_WORDS].some(word => padded.includes(` ${word} `));
}

/** A reply that opts the sender back in: exactly start or unstop. */
export function isStartWord(text: unknown): boolean {
  return START_WORDS.has(normalize(text));
}

/** A reply asking for help: exactly help or info, after the same tidying. */
export function isHelpWord(text: unknown): boolean {
  return HELP_WORDS.has(normalize(text));
}
