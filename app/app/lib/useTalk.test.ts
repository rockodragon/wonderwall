import { ConvexError } from "convex/values";
import { describe, expect, it, vi } from "vitest";
import type { Recorder, RecorderCtor, RecorderEnv } from "./useAudioRecorder";
import { MAX_NOTE_SECONDS } from "./useAudioRecorder";
import {
  MAX_TALK_SECONDS,
  NOTHING_HEARD,
  TALK_IDLE,
  TRANSCRIBE_FAILED,
  createTalkSession,
  type TalkState,
  type Transcriber,
} from "./useTalk";

// The hook is a thin layer over createTalkSession (React state, the signed-in
// check and an unmount cleanup), so the session is tested here with a
// recorder that records whatever the test tells it to.
class FakeRecorder implements Recorder {
  static made: FakeRecorder[] = [];
  static data = "sound";
  mimeType = "audio/webm";
  state = "inactive";
  ondataavailable: Recorder["ondataavailable"] = null;
  onstop: Recorder["onstop"] = null;
  onerror: Recorder["onerror"] = null;
  constructor() {
    FakeRecorder.made.push(this);
  }
  start() {
    this.state = "recording";
  }
  stop() {
    this.state = "inactive";
    this.ondataavailable?.({ data: new Blob([FakeRecorder.data]) });
    this.onstop?.();
  }
}

function env(getUserMedia?: RecorderEnv["getUserMedia"]): RecorderEnv {
  return {
    getUserMedia: getUserMedia ?? (async () => ({ getTracks: () => [{ stop() {} }] })),
    Recorder: FakeRecorder as unknown as RecorderCtor,
  };
}

// Lets the microphone promise, the blob and the transcriber settle.
const settle = async () => {
  for (let i = 0; i < 4; i += 1) await new Promise((r) => setTimeout(r, 0));
};

function setup(transcribe: Transcriber, getUserMedia?: RecorderEnv["getUserMedia"]) {
  FakeRecorder.made = [];
  FakeRecorder.data = "sound";
  const seen: TalkState[] = [];
  const said: string[] = [];
  const session = createTalkSession(env(getUserMedia), transcribe, {
    onChange: (s) => seen.push(s),
    onText: (text) => said.push(text),
  });
  return { session, seen, said, last: () => seen.at(-1)! };
}

describe("a talk session", () => {
  it("records, writes the take down on stop, and hands over the words after the take has ended", async () => {
    const transcribe = vi.fn<Transcriber>(async () => " and I teach. ");
    const { session, seen, said, last } = setup(transcribe);
    session.start();
    await settle();
    expect(last()).toEqual({ recording: true, transcribing: false, error: null });
    session.stop();
    await settle();
    expect(transcribe).toHaveBeenCalledTimes(1);
    expect(transcribe.mock.calls[0][1]).toBe("audio/webm");
    expect(new TextDecoder().decode(transcribe.mock.calls[0][0])).toBe("sound");
    // Recording had ended while the words were on their way: they still
    // arrive, to the callback (the box on main lost them here).
    expect(seen.some((s) => !s.recording && s.transcribing)).toBe(true);
    expect(said).toEqual(["and I teach."]);
    expect(last()).toEqual(TALK_IDLE);
    session.abort();
  });

  it("hands over each take's words on its own", async () => {
    const transcribe = vi.fn<Transcriber>().mockResolvedValueOnce("I paint murals.").mockResolvedValueOnce("Mostly in Barrio Logan.");
    const { session, said } = setup(transcribe);
    session.start();
    await settle();
    session.stop();
    await settle();
    session.start();
    await settle();
    session.stop();
    await settle();
    expect(said).toEqual(["I paint murals.", "Mostly in Barrio Logan."]);
    session.abort();
  });

  it("says it heard nothing when the text comes back empty, and hands over nothing", async () => {
    const { session, said, last } = setup(async () => "   ");
    session.start();
    await settle();
    session.stop();
    await settle();
    expect(said).toEqual([]);
    expect(last()).toEqual({ recording: false, transcribing: false, error: NOTHING_HEARD });
    session.abort();
  });

  it("turns a failed transcription into one sentence: the server's reason, else the plain one", async () => {
    const refused = setup(async () => {
      throw new ConvexError({ code: "audio_too_long", reason: "That's too long." });
    });
    refused.session.start();
    await settle();
    refused.session.stop();
    await settle();
    expect(refused.last()).toEqual({ recording: false, transcribing: false, error: "That's too long." });
    refused.session.abort();

    const broke = setup(async () => {
      throw new Error("socket hang up");
    });
    broke.session.start();
    await settle();
    broke.session.stop();
    await settle();
    expect(broke.last()).toMatchObject({ transcribing: false, error: TRANSCRIBE_FAILED });
    broke.session.abort();
  });

  it("reports a refused microphone and never records", async () => {
    const transcribe = vi.fn<Transcriber>(async () => "never");
    const { session, last } = setup(transcribe, async () => {
      throw Object.assign(new Error("denied"), { name: "NotAllowedError" });
    });
    session.start();
    await settle();
    expect(last()).toEqual({ recording: false, transcribing: false, error: "Microphone access was blocked." });
    expect(transcribe).not.toHaveBeenCalled();
    session.abort();
  });

  it("a new take clears the last error", async () => {
    const transcribe = vi.fn<Transcriber>().mockResolvedValueOnce("").mockResolvedValueOnce("Now I said it.");
    const { session, said, last } = setup(transcribe);
    session.start();
    await settle();
    session.stop();
    await settle();
    expect(last().error).toBe(NOTHING_HEARD);
    session.start();
    await settle();
    expect(last()).toEqual({ recording: true, transcribing: false, error: null });
    session.stop();
    await settle();
    expect(said).toEqual(["Now I said it."]);
    session.abort();
  });

  it("won't start a new take while the last one is being written down", async () => {
    let answer: (text: string) => void = () => {};
    const { session } = setup(() => new Promise<string>((resolve) => (answer = resolve)));
    session.start();
    await settle();
    session.stop();
    await settle();
    session.start();
    await settle();
    expect(FakeRecorder.made).toHaveLength(1);
    answer("done");
    await settle();
    session.abort();
  });

  it("runs a take up to four minutes, then stops it and writes it down (voice notes keep two)", async () => {
    expect(MAX_TALK_SECONDS).toBe(240);
    expect(MAX_NOTE_SECONDS).toBe(120);
    vi.useFakeTimers();
    try {
      const transcribe = vi.fn<Transcriber>(async () => "A long story.");
      const { session, said, last } = setup(transcribe);
      session.start();
      await vi.advanceTimersByTimeAsync(0);
      // Past a voice note's two minutes, still recording.
      await vi.advanceTimersByTimeAsync((MAX_NOTE_SECONDS + 30) * 1000);
      expect(last().recording).toBe(true);
      await vi.advanceTimersByTimeAsync((MAX_TALK_SECONDS - MAX_NOTE_SECONDS - 31) * 1000);
      expect(transcribe).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(2000);
      expect(transcribe).toHaveBeenCalledTimes(1);
      expect(said).toEqual(["A long story."]);
      expect(last()).toEqual(TALK_IDLE);
      session.abort();
    } finally {
      vi.useRealTimers();
    }
  });

  it("leaving the page while the words are on their way drops them", async () => {
    let answer: (text: string) => void = () => {};
    const { session, said, last } = setup(() => new Promise<string>((resolve) => (answer = resolve)));
    session.start();
    await settle();
    session.stop();
    await settle();
    expect(last().transcribing).toBe(true);
    session.abort();
    answer("too late");
    await settle();
    expect(said).toEqual([]);
  });
});
