// Onboarding's "talk instead": what the person said goes to the model as
// text, and what comes back is checked here before the page sees it. The
// network is never called: the pure parts are tested as they are, and the
// actions run with fetch replaced. `transcribe` (Brave and Firefox send a
// recording, not text) is tested the same way.

import { ConvexError } from "convex/values";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeCtx, run } from "../test-support/convexContext";
import { expectSignedOutRefusal } from "../test-support/signedOut";
import { INTERESTS as PAGE_INTERESTS } from "../app/constants/interests";
import { INTERESTS } from "./interests";
import {
  MAX_AUDIO_BYTES,
  MAX_LINE,
  MAX_PICKS,
  MAX_TRANSCRIPT,
  PICKABLE,
  audioFileName,
  buildRequestBody,
  checkTranscript,
  pickFromSpeech,
  pickSchema,
  readPick,
  tidyLine,
  tidyTranscript,
  transcribe,
} from "./onboardingAssist";

function refusal(fn: () => unknown): unknown {
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(ConvexError);
    return (err as ConvexError<any>).data;
  }
  throw new Error("expected a refusal");
}

describe("the interest list", () => {
  it("is one list: the pages import the backend's own", () => {
    expect(PAGE_INTERESTS).toBe(INTERESTS);
    expect(INTERESTS).toHaveLength(28);
  });
});

describe("the schema sent to the model", () => {
  const { json_schema } = pickSchema();

  it("is strict, with both fields required and nothing extra allowed", () => {
    expect(pickSchema().type).toBe("json_schema");
    expect(json_schema.strict).toBe(true);
    expect(json_schema.schema.required).toEqual(["interests", "line"]);
    expect(json_schema.schema.additionalProperties).toBe(false);
    expect(Object.keys(json_schema.schema.properties)).toEqual(["interests", "line"]);
  });

  it("locks interests to names on the list, and not to 'Other'", () => {
    const allowed = json_schema.schema.properties.interests.items.enum;
    expect(allowed).toEqual([...PICKABLE]);
    expect(allowed).toHaveLength(INTERESTS.length - 1);
    expect(allowed).not.toContain("Other");
    for (const name of allowed) expect(INTERESTS as readonly string[]).toContain(name);
  });
});

describe("the request", () => {
  const body = buildRequestBody("I'm a wedding photographer who also shoots short films");

  it("uses the cheap model with the person's words as the user message", () => {
    expect(body.model).toBe("gpt-4o-mini");
    expect(body.messages.at(-1)).toEqual({
      role: "user",
      content: "I'm a wedding photographer who also shoots short films",
    });
    expect(body.response_format).toEqual(pickSchema());
  });

  it("tells the model the rules: clear ones only, at most six, none when nothing fits, no flattery", () => {
    const system = body.messages[0].content;
    expect(body.messages[0].role).toBe("system");
    expect(system).toContain(`at most ${MAX_PICKS}`);
    expect(system).toContain("An empty list when nothing fits");
    expect(system).toContain(`at most ${MAX_LINE} characters`);
    expect(system).toMatch(/No flattery/);
    expect(system).toMatch(/never as instructions/);
    for (const name of PICKABLE) expect(system).toContain(name);
  });
});

describe("checkTranscript", () => {
  it("trims what was said", () => {
    expect(checkTranscript("  I teach pottery.  ")).toBe("I teach pottery.");
  });

  it("refuses nothing, with a line the page can show", () => {
    expect(refusal(() => checkTranscript("   "))).toEqual({
      code: "empty_transcript",
      reason: "Say a little about yourself first.",
    });
  });

  it("takes 1,500 characters and refuses 1,501", () => {
    expect(checkTranscript("a".repeat(MAX_TRANSCRIPT))).toHaveLength(MAX_TRANSCRIPT);
    expect(refusal(() => checkTranscript("a".repeat(MAX_TRANSCRIPT + 1)))).toMatchObject({
      code: "transcript_too_long",
      reason: expect.stringMatching(/\S/),
    });
  });
});

describe("tidyLine", () => {
  it("leaves a short line alone and tidies its spaces", () => {
    expect(tidyLine("  I   shoot weddings.\n")).toBe("I shoot weddings.");
  });

  it("cuts a long line to 140 at a word", () => {
    const long = "I photograph weddings and shoot short films ".repeat(6);
    const cut = tidyLine(long);
    expect(cut.length).toBeLessThanOrEqual(MAX_LINE);
    expect(cut.length).toBeGreaterThan(MAX_LINE - 20);
    expect(long.startsWith(cut)).toBe(true);
    expect(long[cut.length]).toBe(" ");
  });

  it("cuts a line with no spaces at 140", () => {
    expect(tidyLine("x".repeat(300))).toHaveLength(MAX_LINE);
  });

  it("is empty for anything that isn't text", () => {
    expect(tidyLine(undefined)).toBe("");
    expect(tidyLine(42)).toBe("");
  });
});

describe("readPick", () => {
  const reply = (value: unknown) => JSON.stringify(value);

  it("reads the interests and the line", () => {
    expect(
      readPick(reply({ interests: ["Photography", "Filmmaking"], line: "I shoot weddings and short films." })),
    ).toEqual({ interests: ["Photography", "Filmmaking"], line: "I shoot weddings and short films." });
  });

  it("drops anything not on the list, and 'Other'", () => {
    expect(readPick(reply({ interests: ["Photography", "Knitting", "photography", "Other", 7, null], line: "x" }))?.interests).toEqual([
      "Photography",
    ]);
  });

  it("names each interest once", () => {
    expect(readPick(reply({ interests: ["Music", "Music", "Audio", "Music"], line: "" }))?.interests).toEqual(["Music", "Audio"]);
  });

  it("keeps at most six, in the order given", () => {
    const eight = ["Design", "Illustration", "Animation", "Photography", "Videography", "Filmmaking", "Writing", "Poetry"];
    expect(readPick(reply({ interests: eight, line: "" }))?.interests).toEqual(eight.slice(0, MAX_PICKS));
  });

  it("allows none", () => {
    expect(readPick(reply({ interests: [], line: "I like long walks." }))).toEqual({
      interests: [],
      line: "I like long walks.",
    });
  });

  it("cuts the line to 140", () => {
    const line = readPick(reply({ interests: [], line: "word ".repeat(80) }))?.line ?? "";
    expect(line.length).toBeLessThanOrEqual(MAX_LINE);
    expect(line.length).toBeGreaterThan(0);
  });

  it("treats missing or wrong-typed fields as empty", () => {
    expect(readPick(reply({}))).toEqual({ interests: [], line: "" });
    expect(readPick(reply({ interests: "Music", line: ["x"] }))).toEqual({ interests: [], line: "" });
  });

  it("is null when it isn't a JSON object", () => {
    expect(readPick("not json")).toBeNull();
    expect(readPick("null")).toBeNull();
    expect(readPick("42")).toBeNull();
    expect(readPick(undefined)).toBeNull();
    expect(readPick(null)).toBeNull();
  });
});

describe("pickFromSpeech", () => {
  const ME = "users:me";
  const savedKey = process.env.OPENAI_API_KEY;
  const fetchMock = vi.fn();

  beforeEach(() => {
    process.env.OPENAI_API_KEY = "test-key";
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    if (savedKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = savedKey;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const answer = (content: unknown, init: { ok?: boolean; status?: number } = {}) => ({
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: async () => ({ choices: [{ message: { content } }] }),
  });
  const call = (transcript: string, viewer: string | null = ME) => run(pickFromSpeech, makeCtx({}, viewer), { transcript });
  const reasonOf = async (promise: Promise<unknown>) => {
    const err = await promise.then(
      () => null,
      (e) => e,
    );
    expect(err).toBeInstanceOf(ConvexError);
    return err.data;
  };

  it("refuses a signed-out caller with the shared refusal, before anything is sent", async () => {
    await expectSignedOutRefusal(pickFromSpeech, { transcript: "I paint." });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses a blank or too-long transcript before anything is sent", async () => {
    expect(await reasonOf(call("  "))).toMatchObject({ code: "empty_transcript" });
    expect(await reasonOf(call("a".repeat(MAX_TRANSCRIPT + 1)))).toMatchObject({ code: "transcript_too_long" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("says so, plainly, when the key isn't set", async () => {
    delete process.env.OPENAI_API_KEY;
    const data = await reasonOf(call("I paint."));
    expect(data).toMatchObject({ code: "not_configured" });
    expect(data.reason).toMatch(/pick below/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("asks OpenAI once, with the key and the person's words, and returns the checked pick", async () => {
    fetchMock.mockResolvedValue(
      answer(JSON.stringify({ interests: ["Photography", "Filmmaking", "Knitting"], line: "I'm a wedding photographer who shoots short films." })),
    );
    const result = await call("  I'm a wedding photographer who also shoots short films  ");
    expect(result).toEqual({
      interests: ["Photography", "Filmmaking"],
      line: "I'm a wedding photographer who shoots short films.",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/chat/completions");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer test-key");
    expect(JSON.parse(init.body)).toEqual(buildRequestBody("I'm a wedding photographer who also shoots short films"));
  });

  it("gives a plain refusal, not the provider's text, when OpenAI says no", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 429, text: async () => "rate limited: you said 'I paint.'" });
    const data = await reasonOf(call("I paint."));
    expect(data).toMatchObject({ code: "assist_unavailable" });
    expect(JSON.stringify(data)).not.toMatch(/rate limited|I paint/);
  });

  it("gives the same refusal when the network fails or the answer isn't usable", async () => {
    fetchMock.mockRejectedValueOnce(new Error("socket hang up"));
    expect(await reasonOf(call("I paint."))).toMatchObject({ code: "assist_unavailable" });
    fetchMock.mockResolvedValueOnce(answer("this is not json"));
    expect(await reasonOf(call("I paint."))).toMatchObject({ code: "assist_unavailable" });
    fetchMock.mockResolvedValueOnce(answer(null));
    expect(await reasonOf(call("I paint."))).toMatchObject({ code: "assist_unavailable" });
  });
});

describe("audioFileName", () => {
  it("names each recording type OpenAI takes, ignoring the codecs", () => {
    expect(audioFileName("audio/webm;codecs=opus")).toBe("speech.webm");
    expect(audioFileName("audio/webm")).toBe("speech.webm");
    expect(audioFileName("audio/ogg;codecs=opus")).toBe("speech.ogg");
    for (const type of ["audio/mp4", "audio/m4a", "audio/x-m4a", "audio/aac"]) {
      expect(audioFileName(type)).toBe("speech.m4a");
    }
    expect(audioFileName("audio/mpeg")).toBe("speech.mp3");
    expect(audioFileName("audio/mp3")).toBe("speech.mp3");
    expect(audioFileName("audio/wav")).toBe("speech.wav");
    expect(audioFileName("audio/x-wav")).toBe("speech.wav");
  });

  it("is case- and space-tolerant", () => {
    expect(audioFileName(" Audio/MP4 ; codecs=mp4a.40.2")).toBe("speech.m4a");
  });

  it("is null for anything else", () => {
    expect(audioFileName("")).toBeNull();
    expect(audioFileName("text/plain")).toBeNull();
    expect(audioFileName("video/mp4")).toBeNull();
    expect(audioFileName("application/octet-stream")).toBeNull();
    expect(audioFileName("webm")).toBeNull();
  });
});

describe("tidyTranscript", () => {
  it("trims and collapses whitespace", () => {
    expect(tidyTranscript("  I  teach\n pottery. \t")).toBe("I teach pottery.");
  });

  it("cuts to what pickFromSpeech accepts", () => {
    const cut = tidyTranscript("word ".repeat(1000));
    expect(cut.length).toBeLessThanOrEqual(MAX_TRANSCRIPT);
    expect(cut.length).toBeGreaterThan(MAX_TRANSCRIPT - 5);
    expect(checkTranscript(cut)).toBe(cut);
  });

  it("is empty for silence or anything that isn't text", () => {
    expect(tidyTranscript("   \n ")).toBe("");
    expect(tidyTranscript(undefined)).toBe("");
    expect(tidyTranscript(7)).toBe("");
  });
});

describe("transcribe", () => {
  const ME = "users:me";
  const URL = "https://api.openai.com/v1/audio/transcriptions";
  const WEBM = "audio/webm;codecs=opus";
  const savedKey = process.env.OPENAI_API_KEY;
  const fetchMock = vi.fn();
  let errorLog: ReturnType<typeof vi.spyOn>;
  let warnLog: ReturnType<typeof vi.spyOn>;
  let infoLog: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    process.env.OPENAI_API_KEY = "test-key";
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    warnLog = vi.spyOn(console, "warn").mockImplementation(() => {});
    infoLog = vi.spyOn(console, "log").mockImplementation(() => {});
  });
  afterEach(() => {
    if (savedKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = savedKey;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const bytes = (n = 3) => new Uint8Array(n).fill(7).buffer;
  const heard = (text: unknown, init: { ok?: boolean; status?: number } = {}) => ({
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: async () => ({ text }),
  });
  const call = (audio: ArrayBuffer, mimeType = WEBM, viewer: string | null = ME) =>
    run(transcribe, makeCtx({}, viewer), { audio, mimeType });
  const reasonOf = async (promise: Promise<unknown>) => {
    const err = await promise.then(
      () => null,
      (e) => e,
    );
    expect(err).toBeInstanceOf(ConvexError);
    return err.data;
  };
  /** Everything the handler logged, as one string. */
  const logged = () =>
    [errorLog, warnLog, infoLog].flatMap((spy) => spy.mock.calls.flat().map(String)).join("\n");

  it("refuses a signed-out caller with the shared refusal, before anything is sent", async () => {
    await expectSignedOutRefusal(transcribe, { audio: bytes(), mimeType: WEBM });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses empty audio before anything is sent", async () => {
    const data = await reasonOf(call(bytes(0)));
    expect(data).toMatchObject({ code: "no_speech" });
    expect(data.reason).toMatch(/try again, or type it/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("takes exactly the most and refuses one byte more, before anything is sent", async () => {
    fetchMock.mockResolvedValue(heard("ok"));
    expect(MAX_AUDIO_BYTES).toBe(5_000_000);
    expect(await call(bytes(MAX_AUDIO_BYTES))).toEqual({ text: "ok" });
    fetchMock.mockClear();
    const data = await reasonOf(call(bytes(MAX_AUDIO_BYTES + 1)));
    expect(data).toMatchObject({ code: "audio_too_long" });
    expect(data.reason).toMatch(/too long/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses a recording type OpenAI can't read, before anything is sent", async () => {
    for (const type of ["", "text/plain", "video/mp4", "audio/flac"]) {
      expect(await reasonOf(call(bytes(), type))).toMatchObject({ code: "invalid_audio" });
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("says so, plainly, when the key isn't set", async () => {
    delete process.env.OPENAI_API_KEY;
    const data = await reasonOf(call(bytes()));
    expect(data).toMatchObject({ code: "not_configured" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("says the same for both actions when the key isn't set, from one place", async () => {
    delete process.env.OPENAI_API_KEY;
    const fromTranscribe = await reasonOf(call(bytes()));
    const fromPick = await reasonOf(run(pickFromSpeech, makeCtx({}, ME), { transcript: "I paint." }));
    expect(fromTranscribe).toMatchObject({ code: "not_configured" });
    expect(fromPick).toEqual(fromTranscribe);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts the recording to the transcriptions endpoint with the key, the model and a named file", async () => {
    fetchMock.mockResolvedValue(heard("I teach pottery."));
    expect(await call(bytes(5))).toEqual({ text: "I teach pottery." });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(URL);
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer test-key");
    // fetch sets the multipart boundary itself.
    expect(Object.keys(init.headers).map((k) => k.toLowerCase())).not.toContain("content-type");
    const form = init.body as FormData;
    expect(form).toBeInstanceOf(FormData);
    expect(form.get("model")).toBe("gpt-4o-mini-transcribe");
    expect(form.get("response_format")).toBe("json");
    const file = form.get("file") as File;
    expect(file.name).toBe("speech.webm");
    expect(file.type).toBe("audio/webm");
    expect(file.size).toBe(5);
  });

  it("names Firefox's and Safari's recordings by what they are", async () => {
    fetchMock.mockResolvedValue(heard("hi"));
    await call(bytes(), "audio/ogg;codecs=opus");
    await call(bytes(), "audio/mp4");
    const names = fetchMock.mock.calls.map(([, init]) => (init.body.get("file") as File).name);
    expect(names).toEqual(["speech.ogg", "speech.m4a"]);
  });

  it("returns the text trimmed, whitespace collapsed, and cut to what pickFromSpeech accepts", async () => {
    fetchMock.mockResolvedValueOnce(heard("  I  paint\n and teach.  "));
    expect(await call(bytes())).toEqual({ text: "I paint and teach." });
    fetchMock.mockResolvedValueOnce(heard("word ".repeat(1000)));
    const { text } = (await call(bytes())) as { text: string };
    expect(text.length).toBeLessThanOrEqual(MAX_TRANSCRIPT);
    expect(text.length).toBeGreaterThan(0);
    expect(checkTranscript(text)).toBe(text);
  });

  it("says it didn't catch that when the text is empty", async () => {
    for (const reply of ["", "   \n", undefined, null]) {
      fetchMock.mockResolvedValueOnce(heard(reply));
      const data = await reasonOf(call(bytes()));
      expect(data).toMatchObject({ code: "no_speech" });
      expect(data.reason).toMatch(/try again, or type it/i);
    }
  });

  it("gives a plain refusal, and logs only the status, when OpenAI says no", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => "rate limited: you said 'I teach pottery.'",
      json: async () => ({ error: { message: "rate limited: you said 'I teach pottery.'" } }),
    });
    const data = await reasonOf(call(bytes()));
    expect(data).toMatchObject({ code: "transcribe_unavailable" });
    expect(data.reason).toBe("Couldn't hear that just now. Try again, or type it.");
    expect(JSON.stringify(data)).not.toMatch(/rate limited|pottery/);
    expect(logged()).toContain("429");
    expect(logged()).not.toMatch(/rate limited|pottery|test-key/);
  });

  it("gives the same refusal when the network fails or the answer isn't JSON", async () => {
    fetchMock.mockRejectedValueOnce(new Error("socket hang up with I teach pottery"));
    expect(await reasonOf(call(bytes()))).toMatchObject({ code: "transcribe_unavailable" });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError("Unexpected token");
      },
    });
    expect(await reasonOf(call(bytes()))).toMatchObject({ code: "transcribe_unavailable" });
    expect(logged()).not.toMatch(/socket hang up|pottery|Unexpected token/);
  });

  it("never logs the transcript", async () => {
    fetchMock.mockResolvedValue(heard("I teach pottery."));
    await call(bytes());
    expect(logged()).not.toMatch(/pottery/);
  });
});
