// Talk instead of type, in every browser with a microphone. Where the browser
// can turn speech into text itself (Chrome, Safari: useSpeech) it does, and
// the words appear as they're said. Where it can't (Brave, Firefox) the
// sound is recorded (useAudioRecorder) and sent once to
// onboardingAssist.transcribe, which sends back the text and keeps nothing.
//
//   const { supported, listening, working, transcript, error, start, stop, reset } = useSpokenInput();
//
// The same shape as useSpeech, plus `working`: true while a recording is
// being written down. A turn is over when neither `listening` nor `working`
// is true, and the words are in `transcript` by then.

import { useCallback, useRef, useState } from "react";
import { useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import { errorMessage } from "./convexError";
import { useAudioRecorder, useAudioRecorderSupported } from "./useAudioRecorder";
import { speechErrorMessage, useSpeech, useSpeechSupported, type Speech } from "./useSpeech";

/** Whether this browser can take speech at all, one way or the other. False
 *  on the server and on the first render, like the two it combines. */
export function useSpokenInputSupported(): boolean {
  const speaks = useSpeechSupported();
  const records = useAudioRecorderSupported();
  return speaks || records;
}

export interface SpokenInput extends Speech {
  /** A recording is being written down. */
  working: boolean;
}

/** useSpeech's words for a failure with no reason of its own. */
const COULDNT_HEAR = speechErrorMessage("start") ?? "Couldn't hear that. Try again.";

type Heard = { transcript: string; working: boolean; error: string | null };
const NOTHING: Heard = { transcript: "", working: false, error: null };

export function useSpokenInput(): SpokenInput {
  const speech = useSpeech();
  const records = useAudioRecorderSupported();
  const transcribe = useAction(api.onboardingAssist.transcribe);
  const [heard, setHeard] = useState<Heard>(NOTHING);
  // Bumped by start and reset, so words for a take nobody wants are dropped.
  const take = useRef(0);

  const recorder = useAudioRecorder({
    onFinish: async (blob) => {
      const mine = take.current;
      setHeard({ transcript: "", working: true, error: null });
      let next: Heard;
      try {
        const { text } = await transcribe({ audio: await blob.arrayBuffer(), mimeType: blob.type });
        next = { transcript: text, working: false, error: null };
      } catch (err) {
        next = { transcript: "", working: false, error: errorMessage(err, COULDNT_HEAR) };
      }
      if (mine === take.current) setHeard(next);
    },
  });

  const start = useCallback(() => {
    take.current += 1;
    setHeard(NOTHING);
    void recorder.start();
  }, [recorder.start]);
  const stop = useCallback(() => void recorder.stop(), [recorder.stop]);
  const reset = useCallback(() => {
    take.current += 1;
    recorder.reset();
    setHeard(NOTHING);
  }, [recorder.reset]);

  if (speech.supported) return { ...speech, working: false };
  return {
    supported: records,
    listening: recorder.recording,
    working: heard.working,
    transcript: heard.transcript,
    error: recorder.error ?? heard.error,
    start,
    stop,
    reset,
  };
}
