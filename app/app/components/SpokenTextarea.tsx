import { useEffect, useRef, type CSSProperties } from "react";
import { useSpeechSupported, type Speech } from "../lib/useSpeech";
import { MicButton } from "./MicButton";

// Talk instead of type, for any text box that takes a few sentences:
// onboarding's "A line about you" and "What is it", the profile's Bio in
// Settings, and the project form's "What is it" (Rick, 2026-10-30: the mic
// that onboarding has belongs on the other two as well). The pieces
// here are the whole of it, so no page grows its own copy:
//   useSpoken      gets the words from useTalk() into the box (they replace
//                  what was there: onboarding's boxes start empty)
//   useSpokenInto  the same for a box that may already hold words (the bio,
//                  a project's description): they are added after them
//   SpokenTextarea the box, with the mic inside it
//   SpokenNote     under the box: what went wrong, or that words are sorted
// Each page passes its own look (class names and style) for the box and the
// note; where the mic sits, and what the placeholder says, are here.

/** The most of a transcript the pick takes: onboardingAssist's
 *  MAX_TRANSCRIPT, kept here because that module is the server's. */
export const SPOKEN_MAX = 1500;

/** Talk instead. While the browser listens, the words go into the field as
 *  they're said (`onWords`); once it stops (a tap on Stop, or silence), the
 *  whole of what was said goes to `onSaid`, which may tidy or sort it. A new
 *  start begins a fresh transcript. */
export function useSpoken(
  speech: Speech,
  onWords: (said: string) => void,
  onSaid?: (said: string) => void | Promise<void>,
) {
  const was = useRef(false);
  useEffect(() => {
    if (speech.listening) onWords(speech.transcript);
    // onWords is an inline setter; the words are what matter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speech.listening, speech.transcript]);
  useEffect(() => {
    const said = speech.transcript.trim().slice(0, SPOKEN_MAX);
    if (was.current && !speech.listening && said && onSaid) void onSaid(said);
    was.current = speech.listening;
    // Runs on the edge of listening only; the transcript is complete by then.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speech.listening]);
  return {
    start: () => {
      speech.reset();
      speech.start();
    },
  };
}

/** Talk into a box that may already hold words, such as a saved bio: what's
 *  said is added after what was there, so a tap on the mic can't wipe it
 *  (`useSpoken` alone would replace it with the first word heard). */
export function useSpokenInto(speech: Speech, value: string, setValue: (value: string) => void) {
  const before = useRef("");
  const heard = useSpoken(speech, (said) => setValue([before.current, said].filter(Boolean).join(" ")));
  return {
    start: () => {
      before.current = value.trim();
      heard.start();
    },
  };
}

/** A text box that also listens: the mic sits inside it, at the right, and
 *  the placeholder says so ("Talk or type") where the browser can listen
 *  (Rick, 2026-10-27). Elsewhere it is a plain box and draws no mic.
 *  `className` and `style` are the box's look (its border, padding, size and
 *  colors; the box is 16px or more on a phone so iOS doesn't zoom into it);
 *  `wrapperClassName` is the spacing around it. */
export function SpokenTextarea({
  id,
  value,
  onChange,
  placeholder,
  listening,
  transcribing = false,
  onStart,
  onStop,
  rows = 2,
  className,
  style,
  wrapperClassName,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  listening: boolean;
  /** The take is on its way to be written down (useSpeech's recorder
   *  fallback): the words arrive all at once, so the box says so. */
  transcribing?: boolean;
  onStart: () => void;
  onStop: () => void;
  rows?: number;
  className?: string;
  style?: CSSProperties;
  wrapperClassName?: string;
}) {
  const canListen = useSpeechSupported();
  const hint = !canListen
    ? placeholder
    : transcribing
      ? "Writing it down…"
      : listening
        ? "Listening… tap the mic to stop"
        : `Talk or type. ${placeholder}`;
  return (
    <div className={["relative", wrapperClassName].filter(Boolean).join(" ")}>
      <textarea
        id={id}
        rows={rows}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={hint}
        className={["resize-none", className, canListen ? "pr-16" : ""].filter(Boolean).join(" ")}
        style={style}
      />
      <MicButton
        listening={listening}
        working={transcribing}
        onStart={onStart}
        onStop={onStop}
        className="absolute right-2 top-1/2 -translate-y-1/2"
      />
    </div>
  );
}

/** Under a field with a mic: what went wrong, or that the words are being
 *  sorted. Listening itself is said in the box (SpokenTextarea). It is
 *  drawn for the Garden's dark pages; a page on the app's own colors passes
 *  `color` and `errorColor` (and `className` for the size and spacing). */
export function SpokenNote({
  working,
  error,
  className = "mt-2 text-[15px]",
  color = "var(--garden-body)",
  errorColor = "#fca5a5",
}: {
  working: boolean;
  error: string | null;
  className?: string;
  color?: string;
  errorColor?: string;
}) {
  const text = error || (working ? "Sorting that out…" : null);
  if (!text) return null;
  return (
    <p role={error ? "alert" : "status"} className={className} style={{ color: error ? errorColor : color }}>
      {text}
    </p>
  );
}
