// Talk instead of type, for every box that offers it (onboarding, the
// profile's bio, a project's description): one hook, so each page gets the
// same words back the same way. The browser's own speech-to-text where it
// has one (useSpeech); elsewhere the take is recorded and convex/transcribe.ts
// writes it down (Rick, 2026-10-30: the mic was missing on Brave, Firefox and
// in-app browsers). Pages never import useSpeech themselves.

import { useAction } from "convex/react";
import { useCallback } from "react";
import { api } from "../../convex/_generated/api";
import { useSpeech, type Speech } from "./useSpeech";

export function useTalk(): Speech {
  const fromAudio = useAction(api.transcribe.fromAudio);
  const transcribe = useCallback(
    async (audio: ArrayBuffer, mime: string) => (await fromAudio({ audio, mime })).text,
    [fromAudio],
  );
  return useSpeech({ transcribe });
}
