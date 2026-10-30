// Talk instead of type: a hook over the browser's own speech-to-text (the Web
// Speech API). The audio goes from the microphone to the browser's speech
// service and never through us; what we get back is text.
//
// Where that API is missing or useless (Firefox, Brave, Chrome on an iPhone,
// in-app browsers) but the browser can record, the take is recorded instead
// (useAudioRecorder) and, on stop, sent to `transcribe` (lib/useTalk.ts:
// convex/transcribe.ts writes it down). The words then arrive all at once,
// and `transcribing` is true while they're on their way. Only with neither
// is `supported` false and the mic left out (Rick, 2026-10-30: the mic was
// missing on the browsers he tried).
//
//   const { supported, listening, transcribing, transcript, error, start, stop, reset } = useSpeech({ transcribe });
//
// `listening` turns false when the words are complete (after stop(), after
// a silence, or on an error; with the recorder, once the text is back), and
// the last words are in `transcript` by then, so act on that change. stop()
// keeps the transcript; start() again adds to it; reset() clears it.

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { errorMessage } from "./convexError";
import { audioRecorderSupported, createRecorderSession, recorderEnv, type RecorderEnv } from "./useAudioRecorder";

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
  const w = win as
    | { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor; navigator?: { brave?: unknown } }
    | undefined;
  // Brave has the recognizer but not the speech service behind it, so it
  // stops at once and hears nothing (Rick, 2026-10-27): no mic there.
  if (w?.navigator?.brave) return null;
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
      return "Didn't catch that. Try again, or type it.";
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
          // Ended with nothing heard and no error from the browser: say so,
          // rather than the mic just going quiet.
          set(state.transcript.trim() ? { listening: false } : { listening: false, error: speechErrorMessage("no-speech") });
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

/** Writes a recording down: the sound and its type in, the text out. */
export type Transcriber = (audio: ArrayBuffer, mime: string) => Promise<string>;

export type TalkState = SpeechState & { transcribing: boolean };
export const TALK_IDLE: TalkState = { ...IDLE, transcribing: false };

/** One plain sentence for a failed transcription: the server's own reason
 * when it wrote one, else this. */
export const TRANSCRIBE_FAILED = "Couldn't write that down. Try again, or type it.";

/** The recorder as a speech session: start records, stop sends the take to
 * `transcribe` and puts the text in the transcript. `listening` stays true
 * until the text is back (with `transcribing` true meanwhile), so a page
 * that acts when listening ends finds the words complete, as with the
 * browser's own recognizer. A take that ends with nothing recorded, a
 * refused microphone, or a failed transcription ends listening with one
 * sentence in `error`. */
export function createRecordingSession(
  env: RecorderEnv,
  transcribe: Transcriber,
  onChange: (state: TalkState) => void,
  maxSeconds?: number,
): SpeechSession {
  let state = TALK_IDLE;
  // What was said in earlier takes, put in front of the next one's text.
  let before = "";
  // Bumped by reset and abort, so a take still being written down when
  // either happens is dropped.
  let epoch = 0;
  const set = (patch: Partial<TalkState>) => {
    state = { ...state, ...patch };
    onChange(state);
  };

  const recorder = createRecorderSession(
    env,
    {
      onChange: (r) => {
        if (r.error) set({ listening: false, transcribing: false, error: r.error });
        else if (r.recording && !state.listening) set({ listening: true, error: null });
      },
      onFinish: (blob) => void writeDown(blob),
    },
    maxSeconds,
  );

  async function writeDown(blob: Blob) {
    const mine = epoch;
    set({ transcribing: true });
    try {
      const text = await transcribe(await blob.arrayBuffer(), blob.type);
      if (mine !== epoch) return;
      const transcript = [before, text].map((part) => part.trim()).filter(Boolean).join(" ");
      set(
        transcript
          ? { listening: false, transcribing: false, transcript }
          : { listening: false, transcribing: false, error: speechErrorMessage("no-speech") },
      );
    } catch (err) {
      if (mine !== epoch) return;
      set({ listening: false, transcribing: false, error: errorMessage(err, TRANSCRIBE_FAILED) });
    }
  }

  return {
    start() {
      if (state.listening) return;
      before = state.transcript;
      void recorder.start();
    },
    stop() {
      void recorder.stop();
    },
    reset() {
      epoch += 1;
      recorder.reset();
      before = "";
      state = TALK_IDLE;
      onChange(state);
    },
    abort() {
      epoch += 1;
      recorder.abort();
    },
  };
}

const never = () => () => {};

/** Whether this browser can take words by voice: its own recognizer, or a
 * recorder for the fallback. False on the server and on the first render in
 * the browser, so the page and its hydration agree. */
export function useSpeechSupported(): boolean {
  return useSyncExternalStore(
    never,
    () => recognitionCtor() !== null || audioRecorderSupported(),
    () => false,
  );
}

export interface Speech extends TalkState {
  supported: boolean;
  start(): void;
  stop(): void;
  reset(): void;
}

/** `transcribe` is for the recorder fallback; without it, a browser with no
 * recognizer has a mic that does nothing on start, so pages use lib/useTalk.ts,
 * which always passes one. */
export function useSpeech(options: { transcribe?: Transcriber } = {}): Speech {
  const supported = useSpeechSupported();
  const [state, setState] = useState<TalkState>(TALK_IDLE);
  const session = useRef<SpeechSession | null>(null);
  // Callers can pass an inline function; a take that ends calls the latest.
  const transcribeRef = useRef(options.transcribe);
  transcribeRef.current = options.transcribe;

  // Leaving the page turns the microphone off.
  useEffect(
    () => () => {
      session.current?.abort();
      session.current = null;
    },
    [],
  );

  const start = useCallback(() => {
    if (!session.current) {
      const Ctor = recognitionCtor();
      const env = Ctor ? null : recorderEnv();
      if (Ctor) {
        session.current = createSpeechSession(Ctor, navigator.language || "en-US", (s) => setState({ ...s, transcribing: false }));
      } else if (env && transcribeRef.current) {
        session.current = createRecordingSession(env, (audio, mime) => transcribeRef.current!(audio, mime), setState);
      } else {
        return;
      }
    }
    session.current.start();
  }, []);
  const stop = useCallback(() => session.current?.stop(), []);
  const reset = useCallback(() => session.current?.reset(), []);

  return { supported, ...state, start, stop, reset };
}
