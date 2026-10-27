import { ConvexError } from "convex/values";
import { beforeEach, describe, expect, it, vi } from "vitest";

// useSpokenInput picks one of two ways to hear someone: the browser's own
// speech-to-text where it has it, else a recording written down by the
// server (Brave, Firefox). The two hooks it picks between and the action are
// stubbed; React's hooks are test-support/fakeHooks.ts, so the hook runs
// again whenever its state changes.
const mock = vi.hoisted(() => ({
  speaks: false,
  records: true,
  recording: false,
  recorderError: null as string | null,
  onFinish: null as null | ((blob: Blob) => Promise<void> | void),
  started: 0,
  resets: 0,
  sent: [] as { audio: ArrayBuffer; mimeType: string }[],
  transcribe: (_args: { audio: ArrayBuffer; mimeType: string }): Promise<{ text: string }> =>
    Promise.resolve({ text: "I paint murals" }),
}));

vi.mock("react", async () => (await import("../../test-support/fakeHooks")).fakeReact);
vi.mock("convex/react", () => ({
  useAction: () => (args: { audio: ArrayBuffer; mimeType: string }) => {
    mock.sent.push(args);
    return mock.transcribe(args);
  },
}));
vi.mock("./useSpeech", async (original) => ({
  ...(await original<typeof import("./useSpeech")>()),
  useSpeechSupported: () => mock.speaks,
  useSpeech: () => ({
    supported: mock.speaks,
    listening: true,
    transcript: "said in Chrome",
    error: null,
    start: () => {},
    stop: () => {},
    reset: () => {},
  }),
}));
vi.mock("./useAudioRecorder", () => ({
  useAudioRecorderSupported: () => mock.records,
  useAudioRecorder: (options: { onFinish?: (blob: Blob) => Promise<void> | void }) => {
    mock.onFinish = options.onFinish ?? null;
    return {
      supported: mock.records,
      recording: mock.recording,
      seconds: 0,
      blob: null,
      error: mock.recorderError,
      start: async () => {
        mock.started += 1;
      },
      stop: async () => null,
      reset: () => {
        mock.resets += 1;
      },
    };
  },
}));

import { renderHook } from "../../test-support/fakeHooks";
import { useSpokenInput, useSpokenInputSupported } from "./useSpokenInput";

const take = () => new Blob(["sound"], { type: "audio/webm;codecs=opus" });
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  Object.assign(mock, { speaks: false, records: true, recording: false, recorderError: null, onFinish: null, started: 0, resets: 0, sent: [] });
  mock.transcribe = () => Promise.resolve({ text: "I paint murals" });
});

describe("useSpokenInputSupported", () => {
  it.each([
    [true, false, true],
    [false, true, true],
    [false, false, false],
  ])("speech %s, recorder %s: %s", (speaks, records, expected) => {
    Object.assign(mock, { speaks, records });
    expect(renderHook(useSpokenInputSupported, undefined).result).toBe(expected);
  });
});

describe("useSpokenInput where the browser listens itself (Chrome, Safari)", () => {
  it("is the browser's own speech, never working", () => {
    mock.speaks = true;
    const { result } = renderHook(useSpokenInput, undefined);
    expect(result).toMatchObject({ supported: true, listening: true, transcript: "said in Chrome", working: false });
  });
});

describe("useSpokenInput where it can't (Brave, Firefox)", () => {
  it("records, then sends the take once and gives back its words", async () => {
    const hook = renderHook(useSpokenInput, undefined);
    expect(hook.result.supported).toBe(true);
    hook.result.start();
    expect(mock.started).toBe(1);

    const done = mock.onFinish!(take());
    expect(hook.result.working).toBe(true);
    await done;
    expect(mock.sent).toHaveLength(1);
    expect(mock.sent[0].mimeType).toBe("audio/webm;codecs=opus");
    expect(new TextDecoder().decode(mock.sent[0].audio)).toBe("sound");
    expect(hook.result).toMatchObject({ working: false, transcript: "I paint murals", error: null });
  });

  it("says the server's reason when the words don't come back", async () => {
    mock.transcribe = () => Promise.reject(new ConvexError({ code: "no_speech", reason: "Didn't catch that. Try again, or type it." }));
    const hook = renderHook(useSpokenInput, undefined);
    hook.result.start();
    await mock.onFinish!(take());
    expect(hook.result).toMatchObject({ working: false, transcript: "", error: "Didn't catch that. Try again, or type it." });
  });

  it("drops the words of a take that was reset while it was written down", async () => {
    let answer!: (value: { text: string }) => void;
    mock.transcribe = () => new Promise((resolve) => (answer = resolve));
    const hook = renderHook(useSpokenInput, undefined);
    hook.result.start();
    const done = mock.onFinish!(take());
    await settle();
    hook.result.reset();
    expect(mock.resets).toBe(1);
    answer({ text: "too late" });
    await done;
    expect(hook.result).toMatchObject({ working: false, transcript: "" });
  });

  it("shows the recorder's own error first (mic blocked)", () => {
    mock.recorderError = "Microphone access was blocked.";
    expect(renderHook(useSpokenInput, undefined).result.error).toBe("Microphone access was blocked.");
  });

  it("is listening while the recorder records", () => {
    mock.recording = true;
    expect(renderHook(useSpokenInput, undefined).result.listening).toBe(true);
  });
});
