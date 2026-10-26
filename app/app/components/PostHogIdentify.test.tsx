import { beforeEach, describe, expect, it, vi } from "vitest";
import { PostHogIdentify } from "./PostHogIdentify";

const state = vi.hoisted(() => ({
  auth: { isAuthenticated: true, isLoading: false },
  profile: { userId: "users:one", name: "One", email: "one@example.com", interests: ["Film"], plan: "member" } as Record<string, unknown> | undefined,
  ready: true,
  storedId: undefined as string | undefined,
  previous: { current: null as string | null },
  effect: undefined as (() => void) | undefined,
  identify: vi.fn(),
  reset: vi.fn(),
}));

vi.mock("react", () => ({ useRef: () => state.previous, useEffect: (effect: () => void) => { state.effect = effect; } }));
vi.mock("convex/react", () => ({ useConvexAuth: () => state.auth, useQuery: () => state.profile }));
vi.mock("../lib/posthog", () => ({
  browserAnalyticsReady: () => state.ready,
  posthog: {
    get_property: () => state.storedId,
    identify: (id: string, properties: unknown) => { state.storedId = id; state.identify(id, properties); },
    reset: () => { state.storedId = undefined; state.reset(); },
  },
}));

function render() {
  PostHogIdentify();
  state.effect?.();
}

beforeEach(() => {
  vi.clearAllMocks();
  state.auth = { isAuthenticated: true, isLoading: false };
  state.profile = { userId: "users:one", name: "One", email: "one@example.com", interests: ["Film"], plan: "member" };
  state.ready = true;
  state.storedId = undefined;
  state.previous.current = null;
});

describe("canonical analytics identity", () => {
  it("identifies by user ID and refreshes profile properties without using email as identity", () => {
    render();
    expect(state.identify).toHaveBeenCalledWith("users:one", { name: "One", email: "one@example.com", interests: ["Film"], plan: "member" });
    state.profile = { ...state.profile, name: "Changed", interests: ["Music"] };
    render();
    expect(state.identify).toHaveBeenLastCalledWith("users:one", expect.objectContaining({ name: "Changed", interests: ["Music"] }));
    expect(state.reset).not.toHaveBeenCalled();
  });

  it("resets between members on a shared device before identifying the next one", () => {
    render();
    state.profile = { userId: "users:two", name: "Two", interests: [] };
    render();
    expect(state.reset).toHaveBeenCalledTimes(1);
    expect(state.identify).toHaveBeenLastCalledWith("users:two", { name: "Two", interests: [] });
    expect(state.reset.mock.invocationCallOrder[0]).toBeLessThan(state.identify.mock.invocationCallOrder[1]);
  });

  it("clears a persisted identity after signed-out reload or while the next profile is unresolved", () => {
    state.storedId = "users:old";
    state.auth.isAuthenticated = false;
    state.profile = undefined;
    render();
    expect(state.reset).toHaveBeenCalledTimes(1);
    render();
    expect(state.reset).toHaveBeenCalledTimes(1);
    expect(state.identify).not.toHaveBeenCalled();
    state.auth.isAuthenticated = true;
    state.storedId = "users:old";
    render();
    expect(state.reset).toHaveBeenCalledTimes(2);
  });

  it("waits for authentication and respects the browser environment gate", () => {
    state.auth.isLoading = true;
    state.storedId = "users:old";
    render();
    state.auth.isLoading = false;
    state.ready = false;
    render();
    expect(state.reset).not.toHaveBeenCalled();
    expect(state.identify).not.toHaveBeenCalled();
  });
});
