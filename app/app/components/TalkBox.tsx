// Every text box on the site: type, or tap the mic and talk. The take is
// written down (lib/useTalk.ts) and its words are added after what's in the
// box. One component, so every box takes words the same way (Rick,
// 2026-11-04: "Every place that we're doing this, make one component").
// A page gives it its own look (className, style) and any textarea
// attribute, as it would a <textarea>; onChange gets the new text.
// test-support/driftGuard.test.ts keeps a plain <textarea> from coming back.

import { useEffect, useRef, type Ref, type TextareaHTMLAttributes } from "react";
import { useTalk } from "../lib/useTalk";
import { MicButton } from "./MicButton";

/** What's said goes after what's in the box: one space between, or none
 *  when the box already ends in a space or a new line. */
export function addSaid(before: string, said: string): string {
  if (!before.trim()) return said;
  return /\s$/.test(before) ? before + said : `${before} ${said}`;
}

/** The box says it listens (Rick, 2026-10-27: "Talk or type"). */
export function talkPlaceholder(placeholder?: string): string {
  return placeholder ? `Talk or type. ${placeholder}` : "Talk or type";
}

export type TalkBoxProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "value" | "onChange"> & {
  value: string;
  onChange: (value: string) => void;
  /** After a take's words are in the box, with the box's whole new text
   *  (onboarding sorts it into the profile's fields). */
  onSaid?: (value: string) => void;
  /** False stops a take (its words still come in): for a box on a screen
   *  that stays mounted while hidden, like the project form's. */
  active?: boolean;
  /** Spacing around the box and the line under it. */
  wrapperClassName?: string;
  ref?: Ref<HTMLTextAreaElement>;
};

export function TalkBox({
  value,
  onChange,
  onSaid,
  active = true,
  wrapperClassName,
  className,
  style,
  placeholder,
  ref,
  ...rest
}: TalkBoxProps) {
  // The words come back after the take ends; the person may have typed
  // meanwhile, so they're added to the box as it is then.
  const latest = useRef(value);
  latest.current = value;
  const talk = useTalk((said) => {
    let next = addSaid(latest.current, said);
    if (typeof rest.maxLength === "number") next = next.slice(0, rest.maxLength);
    latest.current = next;
    onChange(next);
    onSaid?.(next);
  });
  const stop = talk.stop;
  useEffect(() => {
    if (!active) stop();
  }, [active, stop]);
  const mic = talk.supported && !rest.disabled && !rest.readOnly;
  const line = talk.error ?? (talk.transcribing ? "Writing it down…" : talk.recording ? "Listening… tap the mic to stop" : null);

  return (
    <div className={wrapperClassName}>
      <div className="relative">
        <textarea
          {...rest}
          ref={ref}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={mic ? talkPlaceholder(placeholder) : placeholder}
          className={["block", className].filter(Boolean).join(" ")}
          // Room for the mic, whatever padding the page's look gives.
          style={mic ? { ...style, paddingRight: 60 } : style}
        />
        {mic && (
          <MicButton
            listening={talk.recording}
            working={talk.transcribing}
            onStart={talk.start}
            onStop={talk.stop}
            className="absolute right-2 top-1/2 -translate-y-1/2"
          />
        )}
      </div>
      {mic && line && (
        <p
          role={talk.error ? "alert" : "status"}
          className="mt-1.5 text-[13.5px]"
          style={{ color: talk.error ? "var(--garden-error)" : "var(--garden-body)" }}
        >
          {line}
        </p>
      )}
    </div>
  );
}
