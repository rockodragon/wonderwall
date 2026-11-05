// Talk instead of type, in every text box (components/TalkBox.tsx). The mic
// records; on stop the take goes to convex/transcribe.ts, and the text comes
// back whole and goes to `onText`. One path, the way UpSight's mic works
// (Rick, 2026-11-04: "This should be very basic. Don't overcomplicate it").
//
// Before, the browser's own speech recognition came first and recording was
// the fallback. In the fallback (Brave, Firefox, in-app browsers) the words
// were lost: a box took words only while it was still listening, and the
// written-down text arrived just as listening ended. Now the words go to a
// callback, never through a change of state a page has to catch.
//
// convex/transcribe.ts writes down for signed-in people only, so the mic
// shows only to them (`supported`).

import { useAction, useConvexAuth } from "convex/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../convex/_generated/api";
import { errorMessage } from "./convexError";
import { createRecorderSession, recorderEnv, useAudioRecorderSupported, type RecorderEnv } from "./useAudioRecorder";

/** Writes a recording down: the sound and its type in, the text out. */
export type Transcriber = (audio: ArrayBuffer, mime: string) => Promise<string>;

export type TalkState = { recording: boolean; transcribing: boolean; error: string | null };
export const TALK_IDLE: TalkState = { recording: false, transcribing: false, error: null };

/** When the server wrote no reason of its own. */
export const TRANSCRIBE_FAILED = "Couldn't write that down. Try again, or type it.";
export const NOTHING_HEARD = "Didn't catch that. Try again, or type it.";

export interface TalkSession {
  /** Asks for the microphone and records. Ignored mid-take. */
  start(): void;
  /** Ends the take; its text goes to `onText` once it is written down. */
  stop(): void;
  /** Lets the microphone go and drops a take still being written down. */
  abort(): void;
}

/** The recorder and the transcriber, apart from React. */
export function createTalkSession(
  env: RecorderEnv,
  transcribe: Transcriber,
  handlers: { onChange: (state: TalkState) => void; onText: (text: string) => void },
): TalkSession {
  let state = TALK_IDLE;
  // Bumped by abort, so words that come back after it are dropped.
  let epoch = 0;
  const set = (patch: Partial<TalkState>) => {
    state = { ...state, ...patch };
    handlers.onChange(state);
  };

  const recorder = createRecorderSession(env, {
    onChange: (r) => {
      if (r.error) set({ recording: false, transcribing: false, error: r.error });
      else if (r.recording !== state.recording) set(r.recording ? { recording: true, error: null } : { recording: false });
    },
    onFinish: (blob) => void writeDown(blob),
  });

  async function writeDown(blob: Blob) {
    const mine = epoch;
    set({ recording: false, transcribing: true });
    try {
      const text = (await transcribe(await blob.arrayBuffer(), blob.type)).trim();
      if (mine !== epoch) return;
      set({ transcribing: false, error: text ? null : NOTHING_HEARD });
      if (text) handlers.onText(text);
    } catch (err) {
      if (mine !== epoch) return;
      set({ transcribing: false, error: errorMessage(err, TRANSCRIBE_FAILED) });
    }
  }

  return {
    start() {
      if (state.recording || state.transcribing) return;
      set({ error: null });
      void recorder.start();
    },
    stop() {
      void recorder.stop();
    },
    abort() {
      epoch += 1;
      recorder.abort();
    },
  };
}

export interface Talk extends TalkState {
  /** The browser can record and the person is signed in. */
  supported: boolean;
  start(): void;
  stop(): void;
}

/** A mic for one box: `onText` gets each take's words once they're written down. */
export function useTalk(onText: (text: string) => void): Talk {
  const { isAuthenticated } = useConvexAuth();
  const canRecord = useAudioRecorderSupported();
  const fromAudio = useAction(api.transcribe.fromAudio);
  const [state, setState] = useState<TalkState>(TALK_IDLE);
  const session = useRef<TalkSession | null>(null);
  // The page passes inline functions; a take that ends calls the latest.
  const latest = useRef({ onText, fromAudio });
  latest.current = { onText, fromAudio };

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
      const env = recorderEnv();
      if (!env) return;
      session.current = createTalkSession(env, async (audio, mime) => (await latest.current.fromAudio({ audio, mime })).text, {
        onChange: setState,
        onText: (text) => latest.current.onText(text),
      });
    }
    session.current.start();
  }, []);
  const stop = useCallback(() => session.current?.stop(), []);

  return { supported: canRecord && isAuthenticated, ...state, start, stop };
}
