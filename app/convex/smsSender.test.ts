import { ConvexError } from "convex/values";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CODE_TEXT_FAILED, sendCodeText } from "./smsSender";

describe("sendCodeText", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("TELNYX_API_KEY", "test-key");
    vi.stubEnv("TELNYX_FROM", "+18885550100");
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("sends the text", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ data: { id: "m1" } }), { status: 200 }));
    await expect(sendCodeText("+16195550100", "code: 123456")).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("turns a refused send into a line the page can show", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 403 }));
    const err = await sendCodeText("+16195550100", "code: 123456").catch((e) => e);
    expect(err).toBeInstanceOf(ConvexError);
    expect(err.data).toEqual({ code: "text_failed", reason: CODE_TEXT_FAILED });
    // Telnyx's status reaches the log; the number doesn't.
    expect(console.error).toHaveBeenCalledWith(expect.any(String), expect.stringContaining("403"));
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("6195550100");
  });

  it("does the same when Telnyx can't be reached", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    const err = await sendCodeText("+16195550100", "code: 123456").catch((e) => e);
    expect(err).toBeInstanceOf(ConvexError);
    expect(err.data.code).toBe("text_failed");
  });
});
