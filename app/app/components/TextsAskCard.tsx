// "Get a text when someone messages you?", on the Canvas (a desktop, under the
// greeting) and in a phone's Today, for an account that can switch message
// texts on (a verified phone, no email) and hasn't decided. Either button
// closes it for good: Turn on saves the consent, Not now saves the dismissal
// (convex/textConsent.ts). The consent line is Settings' own.

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { Link } from "react-router";
import { api } from "../../convex/_generated/api";
import { TEXT_CONSENT_LINE, TEXT_CONSENT_QUESTION } from "../../convex/textConsentWording";
import { FOCUS_RING_CLASS } from "../desk/tokens";
import { errorMessage } from "../lib/convexError";
import { CARD_TONE, type CardTone } from "./cardTone";

const BUTTON = `inline-flex items-center justify-center rounded-lg border px-4 py-2 text-[13.5px] font-medium whitespace-nowrap transition-colors disabled:opacity-50 ${FOCUS_RING_CLASS}`;

/** Whether the card is up: nothing while the settings load, and nothing after a STOP. */
export function useTextsAskShown(): boolean {
  const settings = useQuery(api.textConsent.getMyTextSettings);
  return !!settings && settings.available && !settings.decided && !settings.optedOut;
}

export function TextsAskCard({ tone, className }: { tone: CardTone; className?: string }) {
  const shown = useTextsAskShown();
  const setMyTexts = useMutation(api.textConsent.setMyTexts);
  const dismiss = useMutation(api.textConsent.dismissTextsAsk);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  if (!shown) return null;
  const c = CARD_TONE[tone];

  async function run(action: () => Promise<unknown>) {
    setPending(true);
    setError("");
    try {
      await action();
    } catch (err) {
      setError(errorMessage(err));
      setPending(false);
    }
  }

  return (
    <section
      aria-label="Message texts"
      className={`rounded-xl border px-5 py-4 ${className ?? ""}`}
      style={{ borderColor: c.line, background: c.bg, maxWidth: 600 }}
    >
      <p className="text-[15px] font-semibold" style={{ color: c.text }}>
        {TEXT_CONSENT_QUESTION}
      </p>
      <p className="mt-1 text-[13.5px]" style={{ color: c.soft }}>
        {TEXT_CONSENT_LINE}{" "}
        <Link to="/legal/privacy" className="underline">
          Privacy Policy
        </Link>
      </p>
      {error && <p className="mt-2 text-[13.5px] text-red-400">{error}</p>}
      <div className="mt-3 flex flex-wrap gap-3">
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => setMyTexts({ on: true, from: "card" }))}
          className={BUTTON}
          style={{ borderColor: c.accent, color: c.accent }}
        >
          Turn on
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => dismiss())}
          className={BUTTON}
          style={{ borderColor: c.line, color: c.text }}
        >
          Not now
        </button>
      </div>
    </section>
  );
}
