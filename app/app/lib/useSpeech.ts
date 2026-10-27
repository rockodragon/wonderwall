// Talk instead of type: a hook over the browser's own speech-to-text (the Web
// Speech API). The audio goes from the microphone to the browser's speech
// service and never through us; what we get back is text. Where the API is
// missing (Firefox, some in-app browsers) `supported` is false and the page
// leaves the button out.
//
//   const { supported, listening, transcript, error, start, stop, reset } = useSpeech();
//
// `listening` turns false when the browser has finished (after stop(), after
// a silence, or on an error), and the last words are in `transcript` by
// then, so act on that change. stop() keeps the transcript; start() again
// adds to it; reset() clears it.

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

// The few parts of the API used here. It isn't in TypeScript's DOM types.
type RecognitionResult = { readonly isFinal: boolean; readonly 0?: { readonly transcript: string } };
type RecognitionEvent = { readonly results: ArrayLike<RecognitionResult> };
export interface Recognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: { readonly error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
export type RecognitionCtor = new () => Recognition;

/** The browser's recognizer, or null where there is none (or no window). */
export function recognitionCtor(win: unknown = typeof window === "undefined" ? undefined : window): RecognitionCtor | null {
  const w = win as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor } | undefined;
  return w?.SpeechRecognition ?? w?.webkitSpeechRecognition ?? null;
}

/** One plain sentence for a recognizer error code, or null for the codes
 * that aren't the person's to hear about ("aborted": we stopped it). */
export function speechErrorMessage(code: string): string | null {
  switch (code) {
    case "aborted":
      return null;
    case "not-allowed":
    case "service-not-allowed":
      return "Microphone access was blocked.";
    case "no-speech":
      return "Didn't catch that. Try again.";
    case "audio-capture":
      return "No microphone was found.";
    case "network":
      return "Speech needs an internet connection. Try again.";
    default:
      return "Couldn't hear that. Try again.";
  }
}

/** What has been said: the earlier text, the finished results, then the
 * words still being worked out, with one space between and none at the ends. */
export function joinTranscript(before: string, results: ArrayLike<RecognitionResult>): string {
  const finals: string[] = [];
  const interim: string[] = [];
  for (let i = 0; i < results.length; i += 1) {
    const text = results[i][0]?.transcript ?? "";
    (results[i].isFinal ? finals : interim).push(text);
  }
  return [before, ...finals, ...interim]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" ");
}

export type SpeechState = { listening: boolean; transcript: string; error: string | null };
export const IDLE: SpeechState = { listening: false, transcript: "", error: null };

export interface SpeechSession {
  start(): void;
  stop(): void;
  /** Ends listening and clears the transcript. */
  reset(): void;
  /** Ends listening without a word to the page (the page is going away). */
  abort(): void;
}

/** The recognizer and its events, apart from React: `onChange` gets the
 * whole new state each time it changes. */
export function createSpeechSession(
  Ctor: RecognitionCtor,
  lang: string,
  onChange: (state: SpeechState) => void,
): SpeechSession {
  let state = IDLE;
  let active: Recognition | null = null;
  const set = (patch: Partial<SpeechState>) => {
    state = { ...state, ...patch };
    onChange(state);
  };

  function drop(): Recognition | null {
    const was = active;
    active = null;
    return was;
  }

  return {
    start() {
      if (active) return;
      const recognition = new Ctor();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = lang;
      // Each recognition starts its results over, so what was said before
      // this start is kept apart and put in front.
      const before = state.transcript;
      // Events from a recognizer that has been let go (reset, unmount) are ignored.
      recognition.onresult = (event) => {
        if (active === recognition) set({ transcript: joinTranscript(before, event.results) });
      };
      recognition.onerror = (event) => {
        if (active !== recognition) return;
        // Let go at once, so the next tap can start again without waiting
        // for the browser's end.
        active = null;
        set({ error: speechErrorMessage(event.error), listening: false });
      };
      recognition.onend = () => {
        if (active === recognition) {
          active = null;
          set({ listening: false });
        }
      };
      active = recognition;
      try {
        recognition.start();
      } catch {
        // Already running in this tab, or the browser refused the start.
        active = null;
        set({ error: speechErrorMessage("start"), listening: false });
        return;
      }
      set({ listening: true, error: null });
    },
    stop() {
      // Not dropped yet: the last words arrive before the browser's end.
      active?.stop();
    },
    reset() {
      drop()?.abort();
      state = IDLE;
      onChange(state);
    },
    abort() {
      drop()?.abort();
    },
  };
}

const never = () => () => {};

/** Whether this browser can listen. False on the server and on the first
 * render in the browser, so the page and its hydration agree. */
export function useSpeechSupported(): boolean {
  return useSyncExternalStore(
    never,
    () => recognitionCtor() !== null,
    () => false,
  );
}

export interface Speech extends SpeechState {
  supported: boolean;
  start(): void;
  stop(): void;
  reset(): void;
}

export function useSpeech(): Speech {
  const supported = useSpeechSupported();
  const [state, setState] = useState<SpeechState>(IDLE);
  const session = useRef<SpeechSession | null>(null);

  // Leaving the page turns the microphone off.
  useEffect(
    () => () => {
      session.current?.abort();
      session.current = null;
    },
    [],
  );

  const start = useCallback(() => {
    const Ctor = recognitionCtor();
    if (!Ctor) return;
    session.current ??= createSpeechSession(Ctor, navigator.language || "en-US", setState);
    session.current.start();
  }, []);
  const stop = useCallback(() => session.current?.stop(), []);
  const reset = useCallback(() => session.current?.reset(), []);

  return { supported, ...state, start, stop, reset };
}
