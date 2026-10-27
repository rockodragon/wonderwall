import { describe, expect, it } from "vitest";
import {
  IDLE,
  createSpeechSession,
  joinTranscript,
  recognitionCtor,
  speechErrorMessage,
  type Recognition,
  type RecognitionCtor,
  type SpeechState,
} from "./useSpeech";

// The hook is a thin layer over createSpeechSession (React state and an
// unmount cleanup), so the session is tested here with a recognizer that
// says whatever the test tells it to.
class FakeRecognition implements Recognition {
  static made: FakeRecognition[] = [];
  continuous = false;
  interimResults = false;
  lang = "";
  onresult: Recognition["onresult"] = null;
  onerror: Recognition["onerror"] = null;
  onend: Recognition["onend"] = null;
  started = 0;
  stopped = 0;
  aborted = 0;
  constructor() {
    FakeRecognition.made.push(this);
  }
  start() {
    this.started += 1;
  }
  stop() {
    this.stopped += 1;
  }
  abort() {
    this.aborted += 1;
  }
  say(...results: Array<[text: string, final: boolean]>) {
    this.onresult?.({ results: results.map(([transcript, isFinal]) => ({ isFinal, 0: { transcript } })) });
  }
  fail(error: string) {
    this.onerror?.({ error });
  }
  end() {
    this.onend?.();
  }
}

function setup(lang = "en-US", Ctor: RecognitionCtor = FakeRecognition) {
  FakeRecognition.made = [];
  const seen: SpeechState[] = [];
  const session = createSpeechSession(Ctor, lang, (s) => seen.push(s));
  return { session, seen, last: () => seen.at(-1)!, recognizer: () => FakeRecognition.made.at(-1)! };
}

describe("recognitionCtor", () => {
  it("is the standard recognizer, else the prefixed one, else none", () => {
    class Standard {}
    class Prefixed {}
    expect(recognitionCtor({ SpeechRecognition: Standard, webkitSpeechRecognition: Prefixed })).toBe(Standard);
    expect(recognitionCtor({ webkitSpeechRecognition: Prefixed })).toBe(Prefixed);
    expect(recognitionCtor({})).toBeNull();
    expect(recognitionCtor(undefined)).toBeNull();
  });

  it("is none on the server, where there is no window", () => {
    expect(recognitionCtor()).toBeNull();
  });
});

describe("speechErrorMessage", () => {
  it("says one plain sentence for each code", () => {
    expect(speechErrorMessage("not-allowed")).toBe("Microphone access was blocked.");
    expect(speechErrorMessage("service-not-allowed")).toBe("Microphone access was blocked.");
    expect(speechErrorMessage("no-speech")).toBe("Didn't catch that. Try again.");
    expect(speechErrorMessage("audio-capture")).toBe("No microphone was found.");
    expect(speechErrorMessage("network")).toBe("Speech needs an internet connection. Try again.");
    expect(speechErrorMessage("language-not-supported")).toBe("Couldn't hear that. Try again.");
  });

  it("says nothing when we stopped it ourselves", () => {
    expect(speechErrorMessage("aborted")).toBeNull();
  });
});

describe("joinTranscript", () => {
  it("is the finished results, then the words still being worked out", () => {
    expect(
      joinTranscript("", [
        { isFinal: true, 0: { transcript: "I'm a wedding photographer" } },
        { isFinal: true, 0: { transcript: " who also shoots" } },
        { isFinal: false, 0: { transcript: " short films" } },
      ]),
    ).toBe("I'm a wedding photographer who also shoots short films");
  });

  it("puts earlier text in front, with one space, and drops empty pieces", () => {
    expect(joinTranscript("I paint. ", [{ isFinal: true, 0: { transcript: " " } }, { isFinal: true, 0: { transcript: "I teach." } }])).toBe(
      "I paint. I teach.",
    );
    expect(joinTranscript("", [])).toBe("");
  });
});

describe("a speech session", () => {
  it("listens continuously, with interim results, in the person's language", () => {
    const { session, last, recognizer } = setup("es-MX");
    session.start();
    expect(recognizer()).toMatchObject({ continuous: true, interimResults: true, lang: "es-MX", started: 1 });
    expect(last()).toEqual({ listening: true, transcript: "", error: null });
  });

  it("builds the transcript from what it hears, interim words included", () => {
    const { session, last, recognizer } = setup();
    session.start();
    recognizer().say(["I'm a wedding", false]);
    expect(last().transcript).toBe("I'm a wedding");
    recognizer().say(["I'm a wedding photographer", true], [" who also shoots", false]);
    expect(last().transcript).toBe("I'm a wedding photographer who also shoots");
    recognizer().say(["I'm a wedding photographer", true], [" who also shoots short films", true]);
    expect(last().transcript).toBe("I'm a wedding photographer who also shoots short films");
  });

  it("keeps listening until the browser ends, then keeps the transcript", () => {
    const { session, last, recognizer } = setup();
    session.start();
    recognizer().say(["I teach pottery", true]);
    session.stop();
    expect(recognizer().stopped).toBe(1);
    expect(last().listening).toBe(true);
    // The last words arrive after stop() and before the end.
    recognizer().say(["I teach pottery", true], [" on Sundays", true]);
    recognizer().end();
    expect(last()).toEqual({ listening: false, transcript: "I teach pottery on Sundays", error: null });
  });

  it("ends by itself on a silence, with the transcript kept", () => {
    const { session, last, recognizer } = setup();
    session.start();
    recognizer().say(["I write poems", true]);
    recognizer().end();
    expect(last()).toEqual({ listening: false, transcript: "I write poems", error: null });
  });

  it("does not start a second recognizer while one is listening", () => {
    const { session } = setup();
    session.start();
    session.start();
    expect(FakeRecognition.made).toHaveLength(1);
  });

  it("adds to the earlier transcript when started again", () => {
    const { session, last, recognizer } = setup();
    session.start();
    recognizer().say(["I paint", true]);
    recognizer().end();
    session.start();
    expect(FakeRecognition.made).toHaveLength(2);
    expect(last().transcript).toBe("I paint");
    recognizer().say(["and I teach", true]);
    expect(last().transcript).toBe("I paint and I teach");
  });

  it("turns an error into one sentence and stops listening", () => {
    const { session, last, recognizer } = setup();
    session.start();
    recognizer().fail("not-allowed");
    expect(last()).toEqual({ listening: false, transcript: "", error: "Microphone access was blocked." });
    recognizer().end();
    expect(last().error).toBe("Microphone access was blocked.");
  });

  it("can start again right after an error, and clears the error", () => {
    const { session, last, recognizer } = setup();
    session.start();
    recognizer().fail("no-speech");
    expect(last().error).toBe("Didn't catch that. Try again.");
    session.start();
    expect(FakeRecognition.made).toHaveLength(2);
    expect(last()).toEqual({ listening: true, transcript: "", error: null });
  });

  it("keeps what was heard before an error", () => {
    const { session, last, recognizer } = setup();
    session.start();
    recognizer().say(["I dance", true]);
    recognizer().fail("network");
    expect(last().transcript).toBe("I dance");
  });

  it("reports a refused start instead of throwing", () => {
    class Refusing extends FakeRecognition {
      start(): void {
        throw new Error("InvalidStateError");
      }
    }
    const { session, last } = setup("en-US", Refusing);
    session.start();
    expect(last()).toEqual({ listening: false, transcript: "", error: "Couldn't hear that. Try again." });
    // Nothing is left holding the session: it can be tried again.
    session.start();
    expect(FakeRecognition.made).toHaveLength(2);
  });

  it("reset ends listening and clears everything, and later events are ignored", () => {
    const { session, last, recognizer } = setup();
    session.start();
    const first = recognizer();
    first.say(["I sing", true]);
    session.reset();
    expect(first.aborted).toBe(1);
    expect(last()).toEqual(IDLE);
    first.say(["I sing loudly", true]);
    first.end();
    expect(last()).toEqual(IDLE);
  });

  it("abort turns the microphone off without a word to the page", () => {
    const { session, seen, recognizer } = setup();
    session.start();
    const before = seen.length;
    session.abort();
    expect(recognizer().aborted).toBe(1);
    recognizer().say(["too late", true]);
    recognizer().end();
    expect(seen).toHaveLength(before);
  });

  it("stop and abort with nothing listening do nothing", () => {
    const { session, seen } = setup();
    session.stop();
    session.abort();
    expect(FakeRecognition.made).toHaveLength(0);
    expect(seen).toEqual([]);
  });
});
