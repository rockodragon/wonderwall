// The words a person agrees to when they switch message texts on. Pure, so
// Settings, the Canvas card and the server (which saves it with the consent)
// all read the same text.

export const TEXT_CONSENT_LABEL = "Text me when someone messages me";
export const TEXT_CONSENT_LINE =
  "Up to 3 texts a day. Message and data rates may apply. Reply STOP to stop, HELP for help.";
/** The Canvas card's question: what the card showed in place of the label. */
export const TEXT_CONSENT_QUESTION = "Get a text when someone messages you?";
/** What was shown, saved verbatim with the consent, per place it was asked. */
export const consentWordingFor = (from: "settings" | "card") =>
  `${from === "card" ? TEXT_CONSENT_QUESTION : TEXT_CONSENT_LABEL}\n${TEXT_CONSENT_LINE}`;
export const TEXT_CONSENT_WORDING = consentWordingFor("settings");

const STOP_WORDS = new Set(["stop", "stopall", "unsubscribe", "cancel", "end", "quit", "revoke", "optout", "opt out"]);
const START_WORDS = new Set(["start", "unstop"]);

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
