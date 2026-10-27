import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  IDLE,
  MAX_NOTE_SECONDS,
  audioRecorderSupported,
  createRecorderSession,
  formatClock,
  recorderEnv,
  recorderErrorMessage,
  useAudioRecorder,
  type Recorder,
  type RecorderCtor,
  type RecorderEnv,
  type RecorderState,
  type RecorderStream,
} from "./useAudioRecorder";

// The hook is a thin layer over createRecorderSession (React state and an
// unmount cleanup), so the session is tested here with a microphone and a
// recorder that do whatever the test tells them to.
class FakeRecorder implements Recorder {
  static made: FakeRecorder[] = [];
  static types: string[] = [];
  static mimeType = "audio/webm;codecs=opus";
  static data = "sound";
  // When set, a stop is answered only on flush(), as a slow browser would.
  static manual = false;
  mimeType = FakeRecorder.mimeType;
  state = "inactive";
  ondataavailable: Recorder["ondataavailable"] = null;
  onstop: Recorder["onstop"] = null;
  onerror: Recorder["onerror"] = null;
  options: { mimeType?: string } | undefined;
  stops = 0;
  constructor(
    readonly stream: RecorderStream,
    options?: { mimeType?: string },
  ) {
    this.options = options;
    FakeRecorder.made.push(this);
  }
  static isTypeSupported(type: string) {
    return FakeRecorder.types.includes(type);
  }
  start() {
    this.state = "recording";
  }
  // Like the browser: the recording arrives, then the stop.
  stop() {
    this.stops += 1;
    if (this.state === "inactive") throw new DOMException("not recording", "InvalidStateError");
    this.state = "inactive";
    if (!FakeRecorder.manual) this.flush();
  }
  flush() {
    this.ondataavailable?.({ data: new Blob([FakeRecorder.data]) });
    this.onstop?.();
  }
}

function fakeStream() {
  const tracks = [{ stop: vi.fn() }, { stop: vi.fn() }];
  const stream: RecorderStream = { getTracks: () => tracks };
  return { stream, tracks, allStopped: () => tracks.every((t) => t.stop.mock.calls.length === 1) };
}

function setup(options: { maxSeconds?: number; getUserMedia?: RecorderEnv["getUserMedia"] } = {}) {
  FakeRecorder.made = [];
  const mic = fakeStream();
  const getUserMedia = vi.fn(options.getUserMedia ?? (async () => mic.stream));
  const seen: RecorderState[] = [];
  const finished: Blob[] = [];
  const session = createRecorderSession(
    { getUserMedia, Recorder: FakeRecorder as unknown as RecorderCtor },
    { onChange: (s) => seen.push(s), onFinish: (b) => finished.push(b) },
    options.maxSeconds,
  );
  return { session, mic, getUserMedia, seen, finished, last: () => seen.at(-1)!, recorder: () => FakeRecorder.made.at(-1)! };
}

const denied = (name: string) => async () => {
  throw Object.assign(new Error(name), { name });
};

beforeEach(() => {
  FakeRecorder.types = ["audio/webm;codecs=opus", "audio/webm"];
  FakeRecorder.mimeType = "audio/webm;codecs=opus";
  FakeRecorder.data = "sound";
  FakeRecorder.manual = false;
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("audioRecorderSupported", () => {
  const mic = { getUserMedia: () => Promise.resolve({}) };
  class Rec {}

  it("is false with no window", () => {
    expect(audioRecorderSupported()).toBe(false);
    expect(audioRecorderSupported(undefined)).toBe(false);
    expect(recorderEnv(undefined)).toBeNull();
  });

  it("needs both the microphone and the recorder", () => {
    expect(audioRecorderSupported({ MediaRecorder: Rec, navigator: { mediaDevices: mic } })).toBe(true);
    expect(audioRecorderSupported({ navigator: { mediaDevices: mic } })).toBe(false);
    expect(audioRecorderSupported({ MediaRecorder: Rec, navigator: { mediaDevices: {} } })).toBe(false);
    // A page not on https has no mediaDevices at all.
    expect(audioRecorderSupported({ MediaRecorder: Rec, navigator: {} })).toBe(false);
    expect(audioRecorderSupported({ MediaRecorder: Rec })).toBe(false);
    expect(audioRecorderSupported({})).toBe(false);
  });

  it("asks the browser's own microphone for audio", async () => {
    const getUserMedia = vi.fn(async () => ({}));
    const devices = { getUserMedia };
    const env = recorderEnv({ MediaRecorder: Rec, navigator: { mediaDevices: devices } })!;
    await env.getUserMedia({ audio: true });
    expect(getUserMedia).toHaveBeenCalledWith({ audio: true });
    expect(env.Recorder).toBe(Rec);
  });
});

describe("recorderErrorMessage", () => {
  const named = (name: string) => Object.assign(new Error("x"), { name });

  it("says a blocked microphone", () => {
    expect(recorderErrorMessage(named("NotAllowedError"))).toBe("Microphone access was blocked.");
    expect(recorderErrorMessage(named("SecurityError"))).toBe("Microphone access was blocked.");
  });

  it("says no microphone", () => {
    expect(recorderErrorMessage(named("NotFoundError"))).toBe("No microphone was found.");
  });

  it("says anything else plainly", () => {
    const generic = "Couldn't record. Try again.";
    expect(recorderErrorMessage(named("NotReadableError"))).toBe(generic);
    expect(recorderErrorMessage(new Error("boom"))).toBe(generic);
    expect(recorderErrorMessage("boom")).toBe(generic);
    expect(recorderErrorMessage(null)).toBe(generic);
    expect(recorderErrorMessage(undefined)).toBe(generic);
  });
});

describe("formatClock", () => {
  it("reads like a clock", () => {
    expect(formatClock(0)).toBe("0:00");
    expect(formatClock(7)).toBe("0:07");
    expect(formatClock(59)).toBe("0:59");
    expect(formatClock(60)).toBe("1:00");
    expect(formatClock(125)).toBe("2:05");
    expect(formatClock(MAX_NOTE_SECONDS)).toBe("2:00");
    expect(formatClock(-3)).toBe("0:00");
  });
});

describe("MAX_NOTE_SECONDS", () => {
  it("is two minutes", () => {
    expect(MAX_NOTE_SECONDS).toBe(120);
  });
});

describe("createRecorderSession", () => {
  it("asks for the microphone and starts recording", async () => {
    const { session, getUserMedia, last, recorder } = setup();
    await session.start();
    expect(getUserMedia).toHaveBeenCalledWith({ audio: true });
    expect(recorder().state).toBe("recording");
    expect(last()).toEqual({ recording: true, seconds: 0, blob: null, error: null });
  });

  it("writes the first type the browser says it can, else lets it choose", async () => {
    const a = setup();
    await a.session.start();
    expect(a.recorder().options).toEqual({ mimeType: "audio/webm;codecs=opus" });

    FakeRecorder.types = ["audio/mp4"];
    const b = setup();
    await b.session.start();
    expect(b.recorder().options).toEqual({ mimeType: "audio/mp4" });

    FakeRecorder.types = [];
    const c = setup();
    await c.session.start();
    expect(c.recorder().options).toBeUndefined();
  });

  it("counts up a second at a time", async () => {
    const { session, last } = setup();
    await session.start();
    vi.advanceTimersByTime(999);
    expect(last().seconds).toBe(0);
    vi.advanceTimersByTime(1);
    expect(last().seconds).toBe(1);
    vi.advanceTimersByTime(6000);
    expect(last().seconds).toBe(7);
    expect(last().recording).toBe(true);
  });

  it("stops with a Blob typed by the recorder, and lets the microphone go", async () => {
    const { session, mic, finished, last } = setup();
    await session.start();
    vi.advanceTimersByTime(3000);
    const blob = await session.stop();
    expect(blob).toBeInstanceOf(Blob);
    expect(blob!.type).toBe("audio/webm;codecs=opus");
    expect(blob!.size).toBe("sound".length);
    expect(mic.allStopped()).toBe(true);
    expect(last().recording).toBe(false);
    expect(last().blob).toBe(blob);
    expect(finished).toEqual([blob]);
    // The clock is off: nothing more changes.
    expect(vi.getTimerCount()).toBe(0);
  });

  it("types a take 'audio/webm' when the recorder names no type", async () => {
    FakeRecorder.mimeType = "";
    FakeRecorder.types = [];
    const { session } = setup();
    await session.start();
    expect((await session.stop())!.type).toBe("audio/webm");
  });

  it("types a take by what the browser chose when the recorder is silent about it", async () => {
    FakeRecorder.mimeType = "";
    FakeRecorder.types = ["audio/mp4"];
    const { session } = setup();
    await session.start();
    expect((await session.stop())!.type).toBe("audio/mp4");
  });

  it("stops by itself at the longest length", async () => {
    const { session, mic, finished, last } = setup();
    await session.start();
    vi.advanceTimersByTime((MAX_NOTE_SECONDS - 1) * 1000);
    expect(last().recording).toBe(true);
    expect(last().seconds).toBe(MAX_NOTE_SECONDS - 1);
    vi.advanceTimersByTime(1000);
    expect(last().recording).toBe(false);
    expect(last().seconds).toBe(MAX_NOTE_SECONDS);
    expect(finished).toHaveLength(1);
    expect(finished[0].type).toBe("audio/webm;codecs=opus");
    expect(mic.allStopped()).toBe(true);
    // Asked to end once, though the clock kept ticking until it did.
    vi.advanceTimersByTime(5000);
    expect(finished).toHaveLength(1);
  });

  it("stops by itself on a short limit too", async () => {
    const { session, finished, recorder } = setup({ maxSeconds: 3 });
    await session.start();
    vi.advanceTimersByTime(3000);
    expect(finished).toHaveLength(1);
    expect(recorder().stops).toBe(1);
  });

  it("asks the recorder to end once when Stop is tapped twice", async () => {
    FakeRecorder.manual = true;
    const { session, finished, recorder } = setup();
    await session.start();
    const both = Promise.all([session.stop(), session.stop()]);
    recorder().flush();
    const [a, b] = await both;
    expect(a).toBe(b);
    expect(a).not.toBeNull();
    expect(recorder().stops).toBe(1);
    expect(finished).toHaveLength(1);
  });

  it("with no take, stop() resolves to null", async () => {
    const { session } = setup();
    expect(await session.stop()).toBeNull();
  });

  it("drops the take and lets the microphone go when the page goes away mid-take", async () => {
    FakeRecorder.manual = true;
    const { session, mic, finished, seen, recorder } = setup();
    await session.start();
    vi.advanceTimersByTime(4000);
    const before = seen.length;
    // A stop still waiting on the recorder is let go with no take, and the
    // recorder's late answer is ignored.
    const pending = session.stop();
    session.abort();
    recorder().flush();
    expect(await pending).toBeNull();
    expect(mic.allStopped()).toBe(true);
    expect(recorder().state).toBe("inactive");
    expect(finished).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
    // Nothing is said to the page after it has gone.
    vi.advanceTimersByTime(10_000);
    expect(seen.length).toBe(before);
  });

  it("aborting mid-take, with no stop pending, drops it quietly", async () => {
    const { session, mic, finished, seen, recorder } = setup();
    await session.start();
    const before = seen.length;
    session.abort();
    expect(mic.allStopped()).toBe(true);
    expect(recorder().stops).toBe(1);
    expect(finished).toEqual([]);
    expect(seen.length).toBe(before);
  });

  it("lets the microphone go if the page goes away while the browser is asking", async () => {
    let allow!: (stream: RecorderStream) => void;
    const { session, mic, finished, seen } = setup({
      getUserMedia: () => new Promise<RecorderStream>((resolve) => (allow = resolve)),
    });
    const started = session.start();
    session.abort();
    allow(mic.stream);
    await started;
    expect(mic.allStopped()).toBe(true);
    expect(FakeRecorder.made).toHaveLength(0);
    expect(finished).toEqual([]);
    expect(seen).toEqual([]);
  });

  it("asks for the microphone once when Record is tapped twice", async () => {
    let allow!: (stream: RecorderStream) => void;
    const { session, getUserMedia, mic } = setup({
      getUserMedia: () => new Promise<RecorderStream>((resolve) => (allow = resolve)),
    });
    const first = session.start();
    const second = session.start();
    allow(mic.stream);
    await Promise.all([first, second]);
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(FakeRecorder.made).toHaveLength(1);
    // And not again while it is recording.
    await session.start();
    expect(getUserMedia).toHaveBeenCalledTimes(1);
  });

  it("says a blocked microphone, and stays off", async () => {
    const { session, last } = setup({ getUserMedia: denied("NotAllowedError") });
    await session.start();
    expect(last()).toEqual({ recording: false, seconds: 0, blob: null, error: "Microphone access was blocked." });
    expect(FakeRecorder.made).toHaveLength(0);
  });

  it("says no microphone", async () => {
    const { session, last } = setup({ getUserMedia: denied("NotFoundError") });
    await session.start();
    expect(last().error).toBe("No microphone was found.");
  });

  it("says anything else plainly, and can try again", async () => {
    let fail = true;
    const mic = fakeStream();
    const { session, last } = setup({
      getUserMedia: async () => {
        if (fail) throw new Error("boom");
        return mic.stream;
      },
    });
    await session.start();
    expect(last().error).toBe("Couldn't record. Try again.");
    fail = false;
    await session.start();
    expect(last()).toEqual({ recording: true, seconds: 0, blob: null, error: null });
  });

  it("lets the microphone go when the browser won't start the recorder", async () => {
    const mic = fakeStream();
    const { session, last } = setup({ getUserMedia: async () => mic.stream });
    const start = FakeRecorder.prototype.start;
    FakeRecorder.prototype.start = () => {
      throw new Error("no");
    };
    try {
      await session.start();
    } finally {
      FakeRecorder.prototype.start = start;
    }
    expect(mic.allStopped()).toBe(true);
    expect(last()).toEqual({ recording: false, seconds: 0, blob: null, error: "Couldn't record. Try again." });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("lets the microphone go and says so when the recorder fails mid-take", async () => {
    const { session, mic, finished, last, recorder } = setup();
    await session.start();
    recorder().onerror?.({ error: Object.assign(new Error("x"), { name: "NotAllowedError" }) });
    expect(mic.allStopped()).toBe(true);
    expect(last()).toEqual({ recording: false, seconds: 0, blob: null, error: "Microphone access was blocked." });
    expect(finished).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("treats a take with nothing in it as a failure", async () => {
    FakeRecorder.data = "";
    const { session, mic, finished, last } = setup();
    await session.start();
    expect(await session.stop()).toBeNull();
    expect(mic.allStopped()).toBe(true);
    expect(finished).toEqual([]);
    expect(last().error).toBe("Couldn't record. Try again.");
    expect(last().recording).toBe(false);
  });

  it("a new take clears the last one and its error", async () => {
    const { session, last } = setup();
    await session.start();
    const first = await session.stop();
    expect(last().blob).toBe(first);
    await session.start();
    expect(last()).toEqual({ recording: true, seconds: 0, blob: null, error: null });
    expect(FakeRecorder.made).toHaveLength(2);
  });

  it("reset drops a take in progress and forgets the last", async () => {
    const { session, mic, finished, last } = setup();
    await session.start();
    session.reset();
    expect(mic.allStopped()).toBe(true);
    expect(last()).toEqual(IDLE);
    expect(finished).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("useAudioRecorder", () => {
  it("is idle and unsupported on the server, so the page and its hydration agree", () => {
    let seen: ReturnType<typeof useAudioRecorder> | undefined;
    const Probe = () => {
      seen = useAudioRecorder();
      return null;
    };
    renderToStaticMarkup(createElement(Probe));
    expect(seen).toMatchObject({ supported: false, recording: false, seconds: 0, blob: null, error: null });
    expect(typeof seen!.start).toBe("function");
    expect(typeof seen!.stop).toBe("function");
  });
});
