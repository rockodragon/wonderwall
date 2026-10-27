// Record a short spoken note: a hook over the browser's own recorder
// (getUserMedia and MediaRecorder). The sound stays in the browser until the
// page uploads the finished take (useFileUpload does that); nothing here talks
// to a server. Where either API is missing (an old browser, a page not on
// https) `supported` is false and the page leaves the control out.
//
//   const { supported, recording, seconds, blob, error, start, stop, reset } = useAudioRecorder({ onFinish });
//
// start() asks for the microphone and begins. stop() ends the take and
// resolves to its Blob (also in `blob`); a take that runs to MAX_NOTE_SECONDS
// ends by itself. `onFinish` gets every finished take, by stop() or by the
// time limit, so act there. Whatever ends a take, the microphone is let go
// (the browser's mic light goes off), and leaving the page mid-take drops it.

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

/** The longest a note can run. A take stops by itself here. */
export const MAX_NOTE_SECONDS = 120;

// What a recorder reports when the browser names no type for it.
const FALLBACK_MIME = "audio/webm";

// Tried in order. Chrome and Firefox record WebM, Safari records MP4; each
// takes the first its browser says it can write, or none to let it choose.
const PREFERRED_MIMES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];

// The few parts of the APIs used here, so a test can stand in for the browser.
export interface RecorderTrack {
  stop(): void;
}
export interface RecorderStream {
  getTracks(): RecorderTrack[];
}
export interface Recorder {
  readonly mimeType: string;
  readonly state: string;
  ondataavailable: ((event: { readonly data: Blob }) => void) | null;
  onstop: (() => void) | null;
  onerror: ((event: unknown) => void) | null;
  start(): void;
  stop(): void;
}
export interface RecorderCtor {
  new (stream: RecorderStream, options?: { mimeType?: string }): Recorder;
  isTypeSupported?(type: string): boolean;
}
export interface RecorderEnv {
  getUserMedia(constraints: { audio: true }): Promise<RecorderStream>;
  Recorder: RecorderCtor;
}

/** The browser's microphone and recorder, or null where either is missing
 *  (or there is no window). `win` is for tests. */
export function recorderEnv(win: unknown = typeof window === "undefined" ? undefined : window): RecorderEnv | null {
  const w = win as
    | { MediaRecorder?: RecorderCtor; navigator?: { mediaDevices?: { getUserMedia?: RecorderEnv["getUserMedia"] } } }
    | undefined;
  const devices = w?.navigator?.mediaDevices;
  if (!devices?.getUserMedia || !w?.MediaRecorder) return null;
  return { getUserMedia: (constraints) => devices.getUserMedia!(constraints), Recorder: w.MediaRecorder };
}

/** Whether this browser can record. False with no window. */
export function audioRecorderSupported(win?: unknown): boolean {
  return (win === undefined ? recorderEnv() : recorderEnv(win)) !== null;
}

/** Seconds as people read a clock: 7 is "0:07", 125 is "2:05". */
export function formatClock(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

/** One plain sentence for what went wrong, for the person to read. */
export function recorderErrorMessage(err: unknown): string {
  const name = (err as { name?: unknown } | null | undefined)?.name;
  if (name === "NotAllowedError" || name === "SecurityError") return "Microphone access was blocked.";
  if (name === "NotFoundError") return "No microphone was found.";
  return "Couldn't record. Try again.";
}

export type RecorderState = { recording: boolean; seconds: number; blob: Blob | null; error: string | null };
export const IDLE: RecorderState = { recording: false, seconds: 0, blob: null, error: null };

export interface RecorderSession {
  /** Asks for the microphone and begins a take. Resolves once it has begun
   *  or failed (`error` says why). */
  start(): Promise<void>;
  /** Ends the take. Resolves to what was recorded, or to null when there is
   *  no take or it failed. */
  stop(): Promise<Blob | null>;
  /** Drops any take, lets the microphone go, and forgets the last take and
   *  error. */
  reset(): void;
  /** Same as reset, with no word to the page (the page is going away). */
  abort(): void;
}

type Take = { recorder: Recorder; stream: RecorderStream; chunks: Blob[]; mime: string; stopping: boolean };

// How often the clock is read. The seconds shown come from the time that has
// passed, not from counting ticks, so a tab that was in the background still
// stops on time; the state only changes when the second does.
const TICK_MS = 250;

/** The recorder and its events, apart from React: `onChange` gets the whole
 *  new state each time it changes, and `onFinish` gets each finished take. */
export function createRecorderSession(
  env: RecorderEnv,
  handlers: { onChange: (state: RecorderState) => void; onFinish?: (blob: Blob) => void },
  maxSeconds: number = MAX_NOTE_SECONDS,
): RecorderSession {
  let state = IDLE;
  let starting = false;
  // Bumped by reset and abort, so a microphone granted after one is let go.
  let epoch = 0;
  let active: Take | null = null;
  let timer: ReturnType<typeof setInterval> | undefined;
  let waiting: Array<(blob: Blob | null) => void> = [];

  const set = (patch: Partial<RecorderState>) => {
    state = { ...state, ...patch };
    handlers.onChange(state);
  };

  const letGo = (stream: RecorderStream) => {
    for (const track of stream.getTracks()) track.stop();
  };

  const settle = (blob: Blob | null) => {
    const resolvers = waiting;
    waiting = [];
    for (const resolve of resolvers) resolve(blob);
  };

  const stopClock = () => {
    clearInterval(timer);
    timer = undefined;
  };

  // Ends the current take for good: clock off, microphone off, and nothing
  // left that hears the recorder's events. Returns the take, if there was one.
  function release(): Take | null {
    const take = active;
    active = null;
    stopClock();
    if (take) {
      take.recorder.ondataavailable = null;
      take.recorder.onstop = null;
      take.recorder.onerror = null;
      letGo(take.stream);
    }
    return take;
  }

  function fail(err: unknown) {
    release();
    settle(null);
    set({ recording: false, seconds: 0, blob: null, error: recorderErrorMessage(err) });
  }

  // The recorder has said it is done: everything it recorded has arrived.
  function finish() {
    const take = release();
    if (!take) return;
    const blob = new Blob(take.chunks, { type: take.recorder.mimeType || take.mime || FALLBACK_MIME });
    if (blob.size === 0) {
      fail(null);
      return;
    }
    set({ recording: false, blob });
    settle(blob);
    handlers.onFinish?.(blob);
  }

  // Asks the recorder to end. It answers with its last data and then onstop
  // (finish); asking twice would be refused, so once is all.
  function stopRecorder() {
    const take = active;
    if (!take || take.stopping) return;
    take.stopping = true;
    stopClock();
    try {
      take.recorder.stop();
    } catch {
      finish();
    }
  }

  function drop() {
    epoch += 1;
    const take = release();
    try {
      take?.recorder.stop();
    } catch {
      // Already stopped.
    }
    settle(null);
  }

  return {
    async start() {
      if (active || starting) return;
      starting = true;
      const mine = epoch;
      let stream: RecorderStream;
      try {
        stream = await env.getUserMedia({ audio: true });
      } catch (err) {
        starting = false;
        if (mine === epoch) set({ recording: false, seconds: 0, blob: null, error: recorderErrorMessage(err) });
        return;
      }
      starting = false;
      if (mine !== epoch) {
        // The page went away (or reset) while the browser was asking.
        letGo(stream);
        return;
      }

      const mime = PREFERRED_MIMES.find((type) => env.Recorder.isTypeSupported?.(type)) ?? "";
      try {
        const recorder = new env.Recorder(stream, mime ? { mimeType: mime } : undefined);
        const take: Take = { recorder, stream, chunks: [], mime, stopping: false };
        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) take.chunks.push(event.data);
        };
        recorder.onstop = finish;
        recorder.onerror = (event) => fail((event as { error?: unknown } | null)?.error);
        active = take;
        recorder.start();
      } catch (err) {
        // The browser refused to start: let the microphone go and say so.
        active = null;
        letGo(stream);
        set({ recording: false, seconds: 0, blob: null, error: recorderErrorMessage(err) });
        return;
      }

      const startedAt = Date.now();
      timer = setInterval(() => {
        const seconds = Math.min(maxSeconds, Math.floor((Date.now() - startedAt) / 1000));
        if (seconds !== state.seconds) set({ seconds });
        if (seconds >= maxSeconds) stopRecorder();
      }, TICK_MS);
      set({ recording: true, seconds: 0, blob: null, error: null });
    },

    stop() {
      if (!active) return Promise.resolve(null);
      return new Promise<Blob | null>((resolve) => {
        waiting.push(resolve);
        stopRecorder();
      });
    },

    reset() {
      drop();
      state = IDLE;
      handlers.onChange(state);
    },

    abort() {
      drop();
    },
  };
}

const never = () => () => {};

/** Whether this browser can record. False on the server and on the first
 *  render in the browser, so the page and its hydration agree. */
export function useAudioRecorderSupported(): boolean {
  return useSyncExternalStore(
    never,
    () => audioRecorderSupported(),
    () => false,
  );
}

export interface AudioRecorder extends RecorderState {
  supported: boolean;
  start(): Promise<void>;
  stop(): Promise<Blob | null>;
  reset(): void;
}

export function useAudioRecorder(options: { onFinish?: (blob: Blob) => void } = {}): AudioRecorder {
  const supported = useAudioRecorderSupported();
  const [state, setState] = useState<RecorderState>(IDLE);
  const session = useRef<RecorderSession | null>(null);
  // Callers can pass an inline function; a take that ends calls the latest.
  const optionsRef = useRef(options);
  optionsRef.current = options;

  // Leaving the page mid-take turns the microphone off and drops the take.
  useEffect(
    () => () => {
      session.current?.abort();
      session.current = null;
    },
    [],
  );

  const start = useCallback(async () => {
    const env = recorderEnv();
    if (!env) return;
    session.current ??= createRecorderSession(env, {
      onChange: setState,
      onFinish: (blob) => optionsRef.current.onFinish?.(blob),
    });
    await session.current.start();
  }, []);
  const stop = useCallback(() => session.current?.stop() ?? Promise.resolve(null), []);
  const reset = useCallback(() => session.current?.reset(), []);

  return { supported, ...state, start, stop, reset };
}
