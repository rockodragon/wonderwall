// Onboarding's "talk instead": what the person said goes to the model as
// text, and what comes back is checked here before the page sees it. The
// network is never called: the pure parts are tested as they are, and the
// action runs with fetch replaced.

import { ConvexError } from "convex/values";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeCtx, run } from "../test-support/convexContext";
import { expectSignedOutRefusal } from "../test-support/signedOut";
import { INTERESTS as PAGE_INTERESTS } from "../app/constants/interests";
import { INTERESTS } from "./interests";
import {
  MAX_LINE,
  MAX_PICKS,
  MAX_TRANSCRIPT,
  PICKABLE,
  buildRequestBody,
  checkTranscript,
  pickFromSpeech,
  pickSchema,
  readPick,
  tidyLine,
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
