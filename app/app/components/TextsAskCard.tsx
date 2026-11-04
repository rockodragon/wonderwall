// "How should we reach you when someone messages you?", on the Canvas (a
// desktop, under the greeting) and in a phone's Today, for an account with a
// verified phone and no email that hasn't decided. Email comes first: it
// reaches people today and covers more than messages. "Text me instead" is
// the text opt-in, with the consent line under it. Any answer closes the
// card for good: an email saved means the account can't have texts any more,
// Text me instead saves the consent, Not now saves the dismissal
// (convex/textConsent.ts).

import { useMutation, useQuery } from "convex/react";
import { useState, type CSSProperties } from "react";
import { Link } from "react-router";
import { api } from "../../convex/_generated/api";
import { TEXT_CONSENT_CARD_BUTTON, TEXT_CONSENT_LINE, TEXT_CONSENT_QUESTION } from "../../convex/textConsentWording";
import { FOCUS_RING_CLASS } from "../desk/tokens";
import { errorMessage } from "../lib/convexError";
import { useAddMyEmail } from "../lib/useAddMyEmail";
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
  const addEmail = useAddMyEmail();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  if (!shown) return null;
  const c = CARD_TONE[tone];
  const busy = pending || addEmail.pending;
  const shownError = addEmail.error || error;

  async function run(action: () => Promise<unknown>) {
    setPending(true);
    setError("");
    addEmail.clearError();
    try {
      await action();
    } catch (err) {
      setError(errorMessage(err));
      setPending(false);
    }
  }

  return (
    <section
      aria-label="How we reach you"
      className={`rounded-xl border px-5 py-4 ${className ?? ""}`}
      style={{ borderColor: c.line, background: c.bg, maxWidth: 600 }}
    >
      <p className="text-[15px] font-semibold" style={{ color: c.text }}>
        {TEXT_CONSENT_QUESTION}
      </p>
      <form
        noValidate
        className="mt-3 flex flex-wrap gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          setError("");
          void addEmail.save();
        }}
      >
        <input
          type="email"
          inputMode="email"
          autoComplete="email"
          aria-label="Email"
          placeholder="you@example.com"
          value={addEmail.email}
          onChange={(e) => addEmail.setEmail(e.target.value)}
          className={`min-w-0 flex-1 basis-40 rounded-lg border bg-transparent px-3 py-2 text-[16px] outline-none placeholder:text-[var(--card-placeholder)] ${FOCUS_RING_CLASS}`}
          style={{ borderColor: c.line, color: c.text, "--card-placeholder": c.soft } as CSSProperties}
        />
        <button
          type="submit"
          disabled={busy || !addEmail.email.trim()}
          className={BUTTON}
          style={{ borderColor: c.accent, color: c.accent }}
        >
          Email me
        </button>
      </form>
      {shownError && <p role="alert" className="mt-2 text-[13.5px] text-red-400">{shownError}</p>}
      <div className="mt-3 flex flex-wrap gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={() => run(() => setMyTexts({ on: true, from: "card" }))}
          className={BUTTON}
          style={{ borderColor: c.line, color: c.text }}
        >
          {TEXT_CONSENT_CARD_BUTTON}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => run(() => dismiss())}
          className={BUTTON}
          style={{ borderColor: c.line, color: c.text }}
        >
          Not now
        </button>
      </div>
      <p className="mt-2 text-[13.5px]" style={{ color: c.soft }}>
        {TEXT_CONSENT_LINE}{" "}
        <Link to="/legal/privacy" className="underline">
          Privacy Policy
        </Link>
      </p>
    </section>
  );
}
