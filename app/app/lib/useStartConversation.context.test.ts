import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "../../test-support/fakeHooks";

const mocks = vi.hoisted(() => ({
  create: vi.fn(), navigate: vi.fn(), capture: vi.fn(),
}));
vi.mock("react", async () => (await import("../../test-support/fakeHooks")).fakeReact);
vi.mock("convex/react", () => ({ useMutation: () => mocks.create }));
vi.mock("react-router", () => ({ useNavigate: () => mocks.navigate }));
vi.mock("@posthog/react", () => ({ usePostHog: () => ({ capture: mocks.capture }) }));

import { useStartConversation } from "./useStartConversation";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.create.mockResolvedValue({ _id: "conversations:one" });
});

describe("starting a contextual conversation", () => {
  it("passes only the member identity to the server and opens its context in the existing thread", async () => {
    const hook = renderHook(() => useStartConversation(), undefined);
    await hook.result.start("users:applicant", undefined, { projectMemberId: "projectMembers:one" });
    expect(mocks.create).toHaveBeenCalledWith({ otherUserId: "users:applicant", projectMemberId: "projectMembers:one" });
    expect(mocks.navigate).toHaveBeenCalledWith("/messages/conversations:one?application=projectMembers%3Aone");
    expect(mocks.capture).not.toHaveBeenCalled();
  });

  it("keeps the existing ordinary and tracked entry points compatible", async () => {
    const hook = renderHook(() => useStartConversation({ track: { source: "profile" } }), undefined);
    await hook.result.start("users:applicant", { place: "header" });
    expect(mocks.create).toHaveBeenCalledWith({ otherUserId: "users:applicant" });
    expect(mocks.navigate).toHaveBeenCalledWith("/messages/conversations:one");
    expect(mocks.capture).toHaveBeenCalledWith("conversation_started", { source: "profile", place: "header" });
  });

  it("stays on the review surface and allows retry when the context is refused", async () => {
    mocks.create.mockRejectedValueOnce(new Error("Refused"));
    const hook = renderHook(() => useStartConversation(), undefined);
    await hook.result.start("users:applicant", undefined, { projectMemberId: "projectMembers:one" });
    expect(hook.result.error).toBeTruthy();
    expect(hook.result.starting).toBe(false);
    expect(mocks.navigate).not.toHaveBeenCalled();
    await hook.result.start("users:applicant");
    expect(mocks.navigate).toHaveBeenCalledOnce();
  });
});
