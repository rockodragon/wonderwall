// The two overlays /showcase opens: the application form and the ticket ask.
// They live here rather than inside routes/showcase.tsx because that route is
// already the longest file in the Garden and because a modal is the one thing
// on the page with real behaviour — focus, scroll lock, step state — worth
// reading on its own.
//
// WHY THE APPLICATION IS STEPPED. The first version of this form rendered
// every question at once: name, city, Instagram, a link, a textarea, all 26
// canonical interest chips and 6 participation checkboxes, stacked in one
// scrolling dialog. On a phone that is a wall with no visible bottom. The
// founder's note on it was the whole brief: "having an entire thing like that,
// you can't even see where it ends, it's overwhelming — that's against our
// principle." The fix is not a shorter form, because the jury needs those
// answers; the fix is progressive disclosure. Four steps, each one small
// enough to read without scrolling, and a counter at the top that says how
// much is left. Someone deciding whether to start a form is estimating cost,
// and "Step 1 of 4" is a cheap, honest estimate. An undifferentiated wall is
// an infinite one.
//
// So the step indicator is not decoration — it is the feature. If a future
// edit drops it, or lets a step grow until it scrolls, the overwhelm is back
// and the steps have bought nothing.
//
// WHY THE CHIP GRID SCROLLS INSIDE ITSELF. Step 2 is 26 chips and would be
// twice the height of the other three steps on its own, so the modal would
// change size step to step and blow past the viewport on the one step that
// matters most. The chip area gets its own bounded, scrollable box (~40vh)
// so the DIALOG stays one comprehensible size from step 1 to step 4. The
// modal is a fixed frame; only its contents move.
//
// WHY NOTHING IS REQUIRED. Every field is optional and Next is never blocked.
// A jury would rather read a name and a link than have a half-finished
// application abandoned at a validation error, and the email that identifies
// the applicant was already banked by the page before this ever opened — see
// the two-step note in routes/showcase.tsx. "Skip the rest and send" exists
// for the same reason: someone who only wants to give a name must not be
// trapped four screens deep in a form they no longer want to fill.
//
// WHY CLOSING MUST NOT RESET STATE. Escape, the scrim and the × all dismiss
// without a confirm — the applicant is never at risk of losing work, so a
// "are you sure?" would be a lie AND an obstacle. That promise only holds if
// the answers survive the close. All the form state lives in this component
// and the PARENT owns `open`; these components return null when closed rather
// than unmounting themselves, so reopening lands on the same step with the
// same text still typed. Never move this state up behind a conditional mount,
// never clear it in a close handler, and never render these from inside an
// `{open && ...}` in the parent — any of the three silently turns a dismissal
// into data loss.
//
// These render inside <GardenPage> (i.e. under .garden-root) so the g-* design
// system classes apply; the fixed overlay is positioned against the viewport
// regardless of where in that tree it sits.

import { useEffect, useId, useRef, useState } from "react";
import type { CSSProperties, ReactElement, ReactNode } from "react";
import { INTERESTS } from "../constants/interests";
import { SectionLabel } from "./ui";

// ————— Public shapes —————
//
// The route builds the answers object it sends to convex/showcase.ts's
// `answerApplication` straight out of ApplyAnswers, so every field is optional
// here for the same reason it is optional there: an empty answer is absence,
// not an error. Blank strings are normalised away before onSubmit fires, so
// the caller never has to decide whether "" means anything.

export type ApplyAnswers = {
  name?: string;
  city?: string;
  instagram?: string;
  interests?: string[];
  portfolioUrl?: string;
  workDescription?: string;
  participation?: string[];
};

/** One row of step 4. The route owns this list (PARTICIPATION in
    routes/showcase.tsx) because the same five ways to take part are rendered
    as cards further up the page and the two must not drift. */
export type ParticipationOption = {
  value: string;
  label: string;
  note: string;
};

/** How many canonical interests one applicant may claim. Mirrors
    MAX_INTERESTS in convex/showcase.ts and in the route — the server is the
    real limit, this only stops someone hitting it by surprise. */
const MAX_INTERESTS = 8;

/** The four steps, shortest first. Order is deliberate: the questions get
    harder as they go, so the cheapest one (your name) is the one that earns
    the commitment to keep going, and the open-ended one (what would you
    bring) lands after two screens of momentum. */
const STEPS = [
  { key: "you", label: "You", heading: "Start with who you are." },
  { key: "make", label: "What you make", heading: "What do you make?" },
  { key: "work", label: "Your work", heading: "Show us something." },
  { key: "night", label: "The night", heading: "How would you take part?" },
] as const;

const STEP_COUNT = STEPS.length;

// ————— Local CSS —————
//
// Only the things inline styles genuinely cannot express: hover and focus
// pseudo-selectors. Scoped `sc-` like the route's own page-local block, and
// deliberately NOT promoted into garden.css — nothing else in the system has
// a modal yet. Promote it the second a second surface needs one.
const MODAL_CSS = `
.sc-x:hover { color: var(--g-paper); }
.sc-chip:hover:not(:disabled) { border-color: var(--g-citron); }
.sc-skip { background: none; border: none; padding: 0; cursor: pointer;
  font-family: "JetBrains Mono", monospace; font-size: 12.5px;
  letter-spacing: 0.06em; color: var(--g-dim); text-decoration: underline;
  text-underline-offset: 3px; }
.sc-skip:hover { color: var(--g-citron); }
.sc-dot { background: none; border: none; padding: 4px 0; cursor: pointer; }
.sc-dot:disabled { cursor: default; }
`;

// ————— The shared shell —————

/** What counts as a tab stop inside the dialog. */
const FOCUSABLE =
  "input, textarea, select, button, a[href], [tabindex]:not([tabindex='-1'])";


/** Interest chips reuse the participation-checkbox affordance rather than a
    <select>: a multi-select native control is unusable on a phone, and the
    canonical list is 26 items long. Lifted verbatim from the route's inline
    version — it was the one part of that modal worth keeping. */
function chipStyle(on: boolean, locked: boolean): CSSProperties {
  return {
    fontFamily: '"JetBrains Mono", monospace',
    fontSize: 12.5,
    letterSpacing: "0.06em",
    padding: "7px 11px",
    borderRadius: 3,
    border: `1px solid ${on ? "var(--g-citron)" : "var(--g-hairline)"}`,
    background: on ? "var(--g-citron)" : "transparent",
    color: on ? "var(--g-ink)" : "var(--g-body)",
    cursor: locked ? "default" : "pointer",
    opacity: locked ? 0.35 : 1,
  };
}

/** The overlay both modals are built from: scrim, dialog box, close button,
    Escape, scroll lock and focus handling. Written once so the two can't
    disagree about how a modal behaves — the first version of this page had
    exactly one modal and it was already 60 lines of inline chrome.

    Renders only while it is mounted; the callers mount it conditionally and
    keep their own state above it, which is what makes closing lossless. */
function ModalShell({
  labelledBy,
  onClose,
  children,
  maxWidth = 560,
}: {
  labelledBy: string;
  onClose: () => void;
  children: ReactNode;
  maxWidth?: number;
}) {
  const dialogRef = useRef<HTMLDivElement | null>(null);

  // Escape closes. Nothing here is ever unsaved-and-unrecoverable — the email
  // is banked before this opens and the answers outlive the close — so there
  // is nothing to confirm.
  //
  // Tab wraps inside the dialog in the same handler. aria-modal tells a screen
  // reader the page behind is inert; it does nothing for a sighted keyboard
  // user, who would otherwise tab straight out of an open dialog into the
  // blurred page underneath and lose track of the form.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const node = dialogRef.current;
      if (!node) return;
      const focusable = Array.from(
        node.querySelectorAll<HTMLElement>(FOCUSABLE),
      ).filter((el) => !el.hasAttribute("disabled"));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === node)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Lock the page behind the overlay. Restoring the PREVIOUS value rather
  // than clearing it matters because the showcase page renders more than one
  // of these and either can own the lock; clearing would hand the second one
  // a scrollable page behind an open dialog.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  // Move focus in on open, put it back on the trigger on close. Without this
  // a keyboard user who opens the dialog is still tabbing through the page
  // underneath it, and on close is dropped at the top of the document with
  // no idea where the button they pressed went.
  //
  // The dialog BOX takes focus rather than its first control: in DOM order
  // that first control is the × button, and auto-focusing "close" is a strange
  // way to greet someone who just opened a form. Focusing the labelled
  // container gets the dialog's heading announced and leaves the next Tab to
  // enter the content normally.
  useEffect(() => {
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogRef.current?.focus({ preventScroll: true });
    return () => previouslyFocused?.focus({ preventScroll: true });
  }, []);

  return (
    <div
      // mousedown rather than click, and only when the press STARTED on the
      // scrim: selecting text inside the dialog and releasing outside it
      // would otherwise dismiss the form mid-sentence.
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        background: "rgba(8,8,8,0.72)",
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <style>{MODAL_CSS}</style>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        className="g-card"
        style={{
          background: "var(--g-ink)",
          width: "100%",
          maxWidth,
          // The steps are sized to fit inside this without scrolling; the cap
          // is a backstop for a phone in landscape (~340px of height), not the
          // layout strategy. If a step ever needs this to scroll, the step is
          // too big and should be split.
          maxHeight: "90vh",
          overflow: "auto",
          position: "relative",
          paddingTop: 22,
        }}
      >
        <button
          type="button"
          className="sc-x"
          aria-label="Close"
          onClick={onClose}
          style={{
            position: "absolute",
            top: 10,
            right: 12,
            background: "transparent",
            border: "none",
            color: "var(--g-dim)",
            fontSize: 22,
            lineHeight: 1,
            cursor: "pointer",
            padding: 6,
          }}
        >
          ×
        </button>
        {children}
      </div>
    </div>
  );
}

/** "Step 2 of 4" plus four bars. The entire point of the rewrite: a person
    must be able to see how much is left before they decide to start, and
    again at every step so the end stays in view. The bars are buttons so a
    step you have already seen is one tap away — going back to fix your city
    shouldn't cost three presses of Back. */
function StepBar({
  step,
  onGo,
}: {
  step: number;
  onGo: (next: number) => void;
}) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <span className="g-label">
          Step {step + 1} of {STEP_COUNT}
        </span>
        <span className="g-label" style={{ color: "var(--g-citron)" }}>
          {STEPS[step].label}
        </span>
      </div>
      <div
        role="group"
        aria-label={`Step ${step + 1} of ${STEP_COUNT}`}
        style={{ display: "flex", gap: 6, marginTop: 8 }}
      >
        {STEPS.map((s, i) => (
          <button
            key={s.key}
            type="button"
            className="sc-dot"
            // Forward jumps are allowed too — every field is optional, so
            // there is no state a later step depends on.
            onClick={() => onGo(i)}
            disabled={i === step}
            aria-label={`Step ${i + 1}: ${s.label}`}
            aria-current={i === step ? "step" : undefined}
            style={{ flex: 1 }}
          >
            <span
              style={{
                display: "block",
                height: 3,
                borderRadius: 2,
                background:
                  i === step
                    ? "var(--g-citron)"
                    : i < step
                      ? "var(--g-muted)"
                      : "var(--g-hairline)",
              }}
            />
          </button>
        ))}
      </div>
    </div>
  );
}

function ErrorLine({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p style={{ color: "var(--g-citron)", fontSize: 14, marginTop: 10 }}>
      {error}
    </p>
  );
}

// ————— The application —————

/** The four-step application. `open`, `submitting`, `error` and `done` are all
    owned by the route (it holds the Convex mutation); everything the applicant
    typed is owned here, so a close never costs them a word of it. */
export function ApplyModal({
  open,
  email,
  returning,
  participationOptions,
  submitting,
  error,
  done,
  onSubmit,
  onClose,
}: {
  open: boolean;
  email: string;
  /** true when they already completed an application before */
  returning: boolean;
  participationOptions: readonly ParticipationOption[];
  submitting: boolean;
  error: string | null;
  /** render the success state instead of the form */
  done: boolean;
  onSubmit: (answers: ApplyAnswers) => void;
  onClose: () => void;
}): ReactElement | null {
  const headingId = useId();

  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [instagram, setInstagram] = useState("");
  const [interests, setInterests] = useState<string[]>([]);
  const [portfolioUrl, setPortfolioUrl] = useState("");
  const [workDescription, setWorkDescription] = useState("");
  const [participation, setParticipation] = useState<string[]>([]);

  // Every hook above runs whether or not the dialog is showing — that is the
  // point. `open` is the parent's business; the answers are ours and they
  // outlive it.
  if (!open) return null;

  function trimmed(value: string): string | undefined {
    const v = value.trim();
    return v.length ? v : undefined;
  }

  function answers(): ApplyAnswers {
    return {
      name: trimmed(name),
      city: trimmed(city),
      instagram: trimmed(instagram),
      interests: interests.length ? interests : undefined,
      portfolioUrl: trimmed(portfolioUrl),
      workDescription: trimmed(workDescription),
      participation: participation.length ? participation : undefined,
    };
  }

  function send() {
    onSubmit(answers());
  }

  function toggleInterest(value: string) {
    setInterests((prev) =>
      prev.includes(value)
        ? prev.filter((i) => i !== value)
        : prev.length >= MAX_INTERESTS
          ? prev
          : [...prev, value],
    );
  }

  function toggleParticipation(value: string) {
    setParticipation((prev) =>
      prev.includes(value)
        ? prev.filter((p) => p !== value)
        : [...prev, value],
    );
  }

  const atCap = interests.length >= MAX_INTERESTS;
  const last = step === STEP_COUNT - 1;

  if (done) {
    return (
      <ModalShell labelledBy={headingId} onClose={onClose}>
        <div className="g-label" style={{ color: "var(--g-citron)" }}>
          You're in
        </div>
        <p className="g-h" id={headingId} style={{ fontSize: 22, marginTop: 10 }}>
          Application received.
        </p>
        <p style={{ fontSize: 15.5, lineHeight: 1.6, marginTop: 10 }}>
          We read every one as it comes in, and you'll hear by email either
          way. Want to change what you sent? Open this again and resubmit.
        </p>
        <button
          className="g-btn g-btn-citron"
          type="button"
          onClick={onClose}
          style={{ marginTop: 18 }}
        >
          Done
        </button>
      </ModalShell>
    );
  }

  // One step's worth of questions. Each of these is sized to sit inside the
  // dialog without scrolling — if you add a field here, take one out or add a
  // fifth step.
  let body: ReactNode = null;
  if (step === 0) {
    body = (
      <div style={{ display: "grid", gap: 12 }}>
        <input
          className="g-input"
          placeholder="Your name"
          autoComplete="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          className="g-input"
          placeholder="City"
          autoComplete="address-level2"
          value={city}
          onChange={(e) => setCity(e.target.value)}
        />
        <input
          className="g-input"
          placeholder="Instagram handle"
          value={instagram}
          onChange={(e) => setInstagram(e.target.value)}
        />
      </div>
    );
  } else if (step === 1) {
    body = (
      <div>
        <p className="g-hint" style={{ marginBottom: 10 }}>
          Pick up to {MAX_INTERESTS}.{" "}
          <span className="g-mono" style={{ color: "var(--g-citron)" }}>
            {interests.length}/{MAX_INTERESTS}
          </span>{" "}
          chosen.
        </p>
        {/* The bounded box that keeps the dialog one size. 26 chips is the
            biggest thing in this form by a factor of three; it scrolls HERE
            rather than making the modal itself a tall page. */}
        <div
          role="group"
          aria-label="What do you make?"
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
            maxHeight: "40vh",
            overflow: "auto",
            padding: 12,
            border: "1px solid var(--g-hairline)",
            borderRadius: 6,
          }}
        >
          {INTERESTS.map((interest) => {
            const on = interests.includes(interest);
            return (
              <button
                key={interest}
                type="button"
                className="sc-chip"
                aria-pressed={on}
                disabled={!on && atCap}
                onClick={() => toggleInterest(interest)}
                style={chipStyle(on, !on && atCap)}
              >
                {interest}
              </button>
            );
          })}
        </div>
      </div>
    );
  } else if (step === 2) {
    body = (
      <div style={{ display: "grid", gap: 12 }}>
        <input
          className="g-input"
          placeholder="Link to your work (site, IG, Bandcamp, Drive folder…)"
          inputMode="url"
          value={portfolioUrl}
          onChange={(e) => setPortfolioUrl(e.target.value)}
        />
        <textarea
          className="g-input"
          rows={5}
          placeholder="What would you bring, and why this piece?"
          value={workDescription}
          onChange={(e) => setWorkDescription(e.target.value)}
        />
      </div>
    );
  } else {
    body = (
      <div>
        <p className="g-hint" style={{ marginBottom: 10 }}>
          Pick any that fit. Most people pick one.
        </p>
        <div style={{ display: "grid", gap: 8, maxHeight: "40vh", overflow: "auto" }}>
          {participationOptions.map((p) => (
            <label
              key={p.value}
              style={{
                display: "flex",
                gap: 10,
                alignItems: "flex-start",
                cursor: "pointer",
                fontSize: 15,
              }}
            >
              <input
                type="checkbox"
                checked={participation.includes(p.value)}
                onChange={() => toggleParticipation(p.value)}
                style={{ marginTop: 5, accentColor: "var(--g-citron)" }}
              />
              <span>
                <span style={{ color: "var(--g-paper)" }}>{p.label}</span>
                <span className="g-hint" style={{ display: "block", fontSize: 14 }}>
                  {p.note}
                </span>
              </span>
            </label>
          ))}
        </div>
      </div>
    );
  }

  return (
    <ModalShell labelledBy={headingId} onClose={onClose}>
      <StepBar step={step} onGo={setStep} />

      <p className="g-h" id={headingId} style={{ fontSize: 22, lineHeight: 1.2 }}>
        {STEPS[step].heading}
      </p>
      <p className="g-hint" style={{ marginTop: 8, marginBottom: 16 }}>
        {returning
          ? `We already have an application for ${email}. Filling this in again replaces it.`
          : `Saved as ${email}. Everything here is optional — skip anything you'd rather not answer.`}
      </p>

      {/* A floor under the step body so the dialog doesn't jump between a
          three-field step and a two-field one. */}
      <div style={{ minHeight: 190 }}>{body}</div>

      <div
        style={{
          display: "flex",
          gap: 10,
          alignItems: "center",
          flexWrap: "wrap",
          marginTop: 20,
        }}
      >
        <button
          className="g-btn g-btn-ghost"
          type="button"
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0 || submitting}
          style={{ opacity: step === 0 || submitting ? 0.4 : 1 }}
        >
          Back
        </button>
        <button
          className="g-btn g-btn-citron"
          type="button"
          // Never blocked. There is no validation here on purpose: a half
          // answer that arrives beats a whole one that doesn't.
          onClick={() => (last ? send() : setStep((s) => Math.min(STEP_COUNT - 1, s + 1)))}
          disabled={submitting}
          style={{ opacity: submitting ? 0.6 : 1 }}
        >
          {submitting ? "Sending…" : last ? "Send application" : "Next"}
        </button>
      </div>

      {/* The escape hatch. Someone who came to give a name and a link should
          never have to walk three more screens to get out of the form. */}
      {!last && (
        <div style={{ marginTop: 14 }}>
          <button
            type="button"
            className="sc-skip"
            onClick={send}
            disabled={submitting}
          >
            Skip the rest and send
          </button>
        </div>
      )}

      <ErrorLine error={error} />
    </ModalShell>
  );
}

// ————— The ticket —————

/** Opened by tapping a price badge. Deliberately tiny: this is a 15-second
    interaction for someone who has already decided, and the fastest way to
    lose them is to answer a tap on "$75" with a form.

    "Get your ticket" is the founder's framing and it is the heading whether
    or not there is anything to buy yet — the person tapped a price, so the
    page owes them the ticket conversation, not an apology. With no checkout
    live (see TICKET_URL in routes/showcase.tsx), the one thing worth taking
    is an email, because a patron who lands on a dead button is gone and one
    who lands on the list gets the link the day it exists. */
export function TicketModal({
  open,
  tier,
  ticketUrl,
  submitting,
  error,
  done,
  onNotify,
  onClose,
}: {
  open: boolean;
  tier: { label: string; price: string; note: string } | null;
  /** null while tickets are not on sale yet */
  ticketUrl: string | null;
  submitting: boolean;
  error: string | null;
  done: boolean;
  /** capture an email to notify when tickets open */
  onNotify: (email: string) => void;
  onClose: () => void;
}): ReactElement | null {
  const headingId = useId();
  // Same rule as the application: a typed address survives a mistaken tap on
  // the scrim, because the parent owns `open` and this state doesn't.
  const [email, setEmail] = useState("");

  if (!open) return null;

  return (
    <ModalShell labelledBy={headingId} onClose={onClose} maxWidth={440}>
      <SectionLabel>November 6</SectionLabel>
      <p className="g-h" id={headingId} style={{ fontSize: 24, marginTop: 8 }}>
        Get your ticket
      </p>

      {tier && (
        <div
          style={{
            display: "flex",
            gap: 14,
            alignItems: "baseline",
            marginTop: 16,
            paddingTop: 14,
            borderTop: "1px solid var(--g-hairline)",
          }}
        >
          <span
            className="g-h"
            style={{ fontSize: 26, color: "var(--g-citron)", flexShrink: 0 }}
          >
            {tier.price}
          </span>
          <span>
            <span style={{ color: "var(--g-paper)", display: "block" }}>
              {tier.label}
            </span>
            <span className="g-hint" style={{ display: "block", marginTop: 4 }}>
              {tier.note}
            </span>
          </span>
        </div>
      )}

      {done ? (
        <p style={{ fontSize: 15.5, lineHeight: 1.6, marginTop: 18 }}>
          You're on the list. You'll get the link before it's public.
        </p>
      ) : ticketUrl ? (
        <>
          <a
            className="g-btn g-btn-citron"
            href={ticketUrl}
            style={{ marginTop: 20 }}
          >
            Buy {tier ? tier.label.toLowerCase() : ""} ticket
          </a>
          <p className="g-hint" style={{ marginTop: 12 }}>
            The room is small. If it sells out, being selected won't get you in.
          </p>
        </>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onNotify(email.trim());
          }}
        >
          <p style={{ fontSize: 15.5, lineHeight: 1.6, marginTop: 16 }}>
            Tickets aren't on sale yet. Leave your email and you'll get the
            link before it's public.
          </p>
          <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
            <input
              className="g-input"
              style={{ flex: "1 1 200px" }}
              type="email"
              required
              autoComplete="email"
              placeholder="you@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <button
              className="g-btn g-btn-citron"
              type="submit"
              disabled={submitting}
              style={{ opacity: submitting ? 0.6 : 1 }}
            >
              {submitting ? "Saving…" : "Notify me"}
            </button>
          </div>
        </form>
      )}

      <ErrorLine error={error} />
    </ModalShell>
  );
}
