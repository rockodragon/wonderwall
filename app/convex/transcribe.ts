// "Talk instead" where the browser can't listen for itself (Brave, Firefox,
// Chrome on an iPhone, in-app browsers): the page records the take (app/lib/
// useAudioRecorder.ts), sends the sound here, and OpenAI writes it down.
// One call, with the key the backend already has; nothing is stored, the
// sound lives for the length of the call. Where the browser can listen, the
// words never reach us (app/lib/useSpeech.ts).

import { v } from "convex/values";
import { action } from "./_generated/server";
import { fail } from "./errors";
import { requireUserId } from "./helpers";

/** A take runs two minutes at most (app/lib/useAudioRecorder.ts
 * MAX_NOTE_SECONDS); at the browsers' bitrates (opus well under 64 kbps,
 * Safari's AAC up to about 192) that is under 3 MB, so this is the ceiling. */
export const MAX_AUDIO_BYTES = 3_000_000;
/** The longest text that comes back (onboardingAssist's MAX_TRANSCRIPT). */
export const MAX_TEXT = 1500;
export const MODEL = "gpt-4o-mini-transcribe";

/** Said when the call can't be made or came back unusable. Never the
 * provider's own error text. */
const UNAVAILABLE = "Couldn't write that down just now. Try again, or type it.";

// OpenAI picks the decoder from the file name, so the recording's type
// (MediaRecorder's mimeType, maybe with a codec after ";") becomes one.
const EXTENSIONS: Record<string, string> = {
  "audio/webm": "webm",
  "audio/mp4": "mp4",
  "audio/ogg": "ogg",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/x-m4a": "m4a",
  "audio/aac": "aac",
};

/** The file name for a recording of this type, or null for a type OpenAI
 * can't read. */
export function fileNameFor(mime: string): string | null {
  const ext = EXTENSIONS[mime.split(";")[0].trim().toLowerCase()];
  return ext ? `take.${ext}` : null;
}

/** A multipart/form-data body built by hand (the file, then the model), so
 * it is the same bytes in every runtime: Convex's has no FormData to lean
 * on. `boundary` is a parameter so a test can read the body back. */
export function multipartBody(
  parts: { audio: ArrayBuffer; mime: string; fileName: string; model: string },
  boundary: string,
): Uint8Array {
  const text = new TextEncoder();
  const head = text.encode(
    `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="${parts.fileName}"\r\n` +
      `Content-Type: ${parts.mime.split(";")[0].trim()}\r\n\r\n`,
  );
  const tail = text.encode(
    `\r\n--${boundary}\r\n` +
      `Content-Disposition: form-data; name="model"\r\n\r\n${parts.model}\r\n` +
      `--${boundary}--\r\n`,
  );
  const audio = new Uint8Array(parts.audio);
  const body = new Uint8Array(head.length + audio.length + tail.length);
  body.set(head, 0);
  body.set(audio, head.length);
  body.set(tail, head.length + audio.length);
  return body;
}

/**
 * `{ text }` for a recording. Signed-in people only. The page puts `text`
 * in the box for the person to change, as it does with the browser's own
 * words.
 */
export const fromAudio = action({
  args: { audio: v.bytes(), mime: v.string() },
  handler: async (ctx, args): Promise<{ text: string }> => {
    await requireUserId(ctx);
    if (args.audio.byteLength === 0) fail("empty_audio", "Nothing was recorded. Try again.");
    if (args.audio.byteLength > MAX_AUDIO_BYTES) fail("audio_too_long", "That's too long. Keep it under two minutes.");
    const fileName = fileNameFor(args.mime);
    if (!fileName) fail("bad_audio", "Couldn't read that recording. Type it instead.");

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.error("transcribe: OPENAI_API_KEY is not set");
      fail("not_configured", "Talking isn't available right now. Type it instead.");
    }

    const text = await askOpenAI(apiKey, args.audio, args.mime, fileName);
    if (text === null) fail("transcribe_unavailable", UNAVAILABLE);
    return { text: text.trim().slice(0, MAX_TEXT) };
  },
});

/** The written-down text, or null when the call failed. Nothing about the
 * failure but its status is logged: a body can echo what the person said. */
async function askOpenAI(apiKey: string, audio: ArrayBuffer, mime: string, fileName: string): Promise<string | null> {
  const boundary = `----take${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
  let response: Response;
  try {
    response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
      },
      // The bytes' own buffer: multipartBody makes one exactly their size.
      body: multipartBody({ audio, mime, fileName, model: MODEL }, boundary).buffer as ArrayBuffer,
    });
  } catch {
    console.error("transcribe: couldn't reach OpenAI");
    return null;
  }
  if (!response.ok) {
    console.error(`transcribe: OpenAI answered ${response.status}`);
    return null;
  }
  try {
    const data = await response.json();
    return typeof data?.text === "string" ? data.text : null;
  } catch {
    console.error("transcribe: OpenAI's answer wasn't JSON");
    return null;
  }
}
