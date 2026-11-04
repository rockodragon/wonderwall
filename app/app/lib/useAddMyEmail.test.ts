import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConvexError } from "convex/values";
import { getFunctionName } from "convex/server";
import { renderHook } from "../../test-support/fakeHooks";
import { useAddMyEmail } from "./useAddMyEmail";

vi.mock("react", async () => (await import("../../test-support/fakeHooks")).fakeReact);

const mock = vi.hoisted(() => ({ calls: {} as Record<string, ReturnType<typeof vi.fn>> }));
vi.mock("convex/react", () => ({
  useMutation: (ref: Parameters<typeof getFunctionName>[0]) => (mock.calls[getFunctionName(ref)] ??= vi.fn(async () => null)),
}));

describe("useAddMyEmail", () => {
  beforeEach(() => { mock.calls = {}; });

  it("saves a trimmed address through fillMissingBasics", async () => {
    const hook = renderHook(useAddMyEmail, undefined);
    hook.result.setEmail("  ada@example.com ");
    expect(await hook.result.save()).toBe(true);
    expect(mock.calls["profiles:fillMissingBasics"]).toHaveBeenCalledWith({ email: "ada@example.com" });
    expect(hook.result.error).toBe("");
  });

  it("refuses a typo without asking the server", async () => {
    const hook = renderHook(useAddMyEmail, undefined);
    hook.result.setEmail("ada@example");
    expect(await hook.result.save()).toBe(false);
    expect(hook.result.error).toBe("That doesn't look like a valid email.");
    expect(mock.calls["profiles:fillMissingBasics"]).not.toHaveBeenCalled();
  });

  it("clears the error once they type again", async () => {
    const hook = renderHook(useAddMyEmail, undefined);
    hook.result.setEmail("ada@");
    await hook.result.save();
    expect(hook.result.error).not.toBe("");
    hook.result.setEmail("ada@example.com");
    expect(hook.result.error).toBe("");
  });

  it("shows the server's reason when it refuses", async () => {
    const hook = renderHook(useAddMyEmail, undefined);
    mock.calls["profiles:fillMissingBasics"] = vi.fn(async () => { throw new ConvexError({ code: "x", reason: "Try again later." }); });
    hook.result.setEmail("ada@example.com");
    expect(await hook.result.save()).toBe(false);
    expect(hook.result.error).toBe("Try again later.");
    expect(hook.result.pending).toBe(false);
  });
});
