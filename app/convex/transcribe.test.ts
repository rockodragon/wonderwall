// "Talk instead" where the browser can't listen: the recorded take goes to
// OpenAI as a file and the text comes back. The network is never called:
// the pure parts are tested as they are, and the action runs with fetch
// replaced.

import { ConvexError } from "convex/values";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeCtx, run } from "../test-support/convexContext";
import { expectSignedOutRefusal } from "../test-support/signedOut";
import { MAX_AUDIO_BYTES, MAX_TEXT, MODEL, fileNameFor, fromAudio, multipartBody } from "./transcribe";

/** Exactly these bytes, in their own buffer. */
function bytes(text: string): ArrayBuffer {
  const u = new TextEncoder().encode(text);
  return u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength);
}

describe("fileNameFor", () => {
  it("names the file for the recording's type, codec or not", () => {
    expect(fileNameFor("audio/webm;codecs=opus")).toBe("take.webm");
    expect(fileNameFor("audio/webm")).toBe("take.webm");
    expect(fileNameFor("audio/mp4")).toBe("take.mp4");
    expect(fileNameFor("AUDIO/OGG; codecs=opus")).toBe("take.ogg");
  });
  it("has no name for a type OpenAI can't read", () => {
    expect(fileNameFor("text/plain")).toBeNull();
    expect(fileNameFor("")).toBeNull();
  });
});

describe("multipartBody", () => {
  it("is the file part, then the model part, between the boundary lines", () => {
    const body = multipartBody({ audio: bytes("sound"), mime: "audio/webm;codecs=opus", fileName: "take.webm", model: "m" }, "B");
    expect(new TextDecoder().decode(body)).toBe(
      "--B\r\n" +
        'Content-Disposition: form-data; name="file"; filename="take.webm"\r\n' +
        "Content-Type: audio/webm\r\n\r\n" +
        "sound\r\n" +
        "--B\r\n" +
        'Content-Disposition: form-data; name="model"\r\n\r\n' +
        "m\r\n" +
        "--B--\r\n",
    );
  });
  it("keeps the sound's bytes as they are", () => {
    const audio = new Uint8Array([0, 255, 13, 10, 45, 45]).buffer;
    const body = multipartBody({ audio, mime: "audio/webm", fileName: "take.webm", model: "m" }, "B");
    const text = new TextDecoder().decode(body);
    const at = text.indexOf("\r\n\r\n") + 4;
    expect([...body.slice(at, at + 6)]).toEqual([0, 255, 13, 10, 45, 45]);
  });
});

describe("fromAudio", () => {
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

  const answer = (text: unknown) => ({ ok: true, status: 200, json: async () => ({ text }) });
  const call = (audio: ArrayBuffer, mime = "audio/webm;codecs=opus", viewer: string | null = ME) =>
    run(fromAudio, makeCtx({}, viewer), { audio, mime });
  const reasonOf = async (promise: Promise<unknown>) => {
    const err = await promise.then(
      () => null,
      (e) => e,
    );
    expect(err).toBeInstanceOf(ConvexError);
    return err.data;
  };

  it("refuses a signed-out caller with the shared refusal, before anything is sent", async () => {
    await expectSignedOutRefusal(fromAudio, { audio: bytes("sound"), mime: "audio/webm" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses an empty, too-long or unreadable recording before anything is sent", async () => {
    expect(await reasonOf(call(new ArrayBuffer(0)))).toMatchObject({ code: "empty_audio" });
    expect(await reasonOf(call(new ArrayBuffer(MAX_AUDIO_BYTES + 1)))).toMatchObject({ code: "audio_too_long" });
    expect(await reasonOf(call(bytes("sound"), "text/plain"))).toMatchObject({ code: "bad_audio" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("says so, plainly, when the key isn't set", async () => {
    delete process.env.OPENAI_API_KEY;
    const data = await reasonOf(call(bytes("sound")));
    expect(data).toMatchObject({ code: "not_configured" });
    expect(data.reason).toMatch(/type it/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends the take to OpenAI once, as a file with the model, and returns the text", async () => {
    fetchMock.mockResolvedValue(answer("  I paint murals in Barrio Logan.  "));
    expect(await call(bytes("sound"))).toEqual({ text: "I paint murals in Barrio Logan." });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/audio/transcriptions");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer test-key");
    const boundary = init.headers["Content-Type"].match(/^multipart\/form-data; boundary=(.+)$/)?.[1];
    expect(boundary).toBeTruthy();
    const body = new TextDecoder().decode(init.body);
    expect(body).toBe(
      new TextDecoder().decode(
        multipartBody({ audio: bytes("sound"), mime: "audio/webm;codecs=opus", fileName: "take.webm", model: MODEL }, boundary!),
      ),
    );
  });

  it("cuts the text at MAX_TEXT", async () => {
    fetchMock.mockResolvedValue(answer("a".repeat(MAX_TEXT + 50)));
    expect((await call(bytes("sound"))).text).toHaveLength(MAX_TEXT);
  });

  it("gives a plain refusal, not the provider's text, when OpenAI says no", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 429, text: async () => "rate limited: murals" });
    const data = await reasonOf(call(bytes("sound")));
    expect(data).toMatchObject({ code: "transcribe_unavailable" });
    expect(JSON.stringify(data)).not.toMatch(/rate limited|murals/);
  });

  it("gives the same refusal when the network fails or the answer isn't usable", async () => {
    fetchMock.mockRejectedValueOnce(new Error("socket hang up"));
    expect(await reasonOf(call(bytes("sound")))).toMatchObject({ code: "transcribe_unavailable" });
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ nope: 1 }) });
    expect(await reasonOf(call(bytes("sound")))).toMatchObject({ code: "transcribe_unavailable" });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => {
        throw new Error("not json");
      },
    });
    expect(await reasonOf(call(bytes("sound")))).toMatchObject({ code: "transcribe_unavailable" });
  });
});
