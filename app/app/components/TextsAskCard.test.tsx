import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { getFunctionName } from "convex/server";
import { TextsAskCard } from "./TextsAskCard";

vi.mock("react", async () => (await import("../../test-support/fakeHooks")).fakeReact);

const mock = vi.hoisted(() => ({ settings: undefined as unknown, calls: {} as Record<string, ReturnType<typeof vi.fn>> }));
vi.mock("convex/react", () => ({
  useQuery: () => mock.settings,
  useMutation: (ref: Parameters<typeof getFunctionName>[0]) => (mock.calls[getFunctionName(ref)] ??= vi.fn(async () => null)),
}));

const tree = <MemoryRouter><TextsAskCard tone="page" /></MemoryRouter>;
const render = () => renderToString(tree);
const base = { available: true, on: false, optedOut: false, decided: false, updatesNumber: null };

describe("TextsAskCard", () => {
  beforeEach(() => { mock.settings = undefined; mock.calls = {}; });

  it("shows the question, the consent line, the policy link and both buttons when it can ask", () => {
    mock.settings = base;
    const html = render();
    expect(html).toContain("Get a text when someone messages you?");
    expect(html).toContain("Up to 3 texts a day. Message and data rates may apply. Reply STOP to stop, HELP for help.");
    expect(html).toMatch(/<a[^>]*href="\/legal\/privacy"[^>]*>Privacy Policy<\/a>/);
    expect(html).toContain("Turn on");
    expect(html).toContain("Not now");
  });

  it.each([
    ["loading", undefined],
    ["decided", { ...base, decided: true }],
    ["not available", { ...base, available: false }],
    ["opted out", { ...base, optedOut: true }],
  ])("renders nothing while %s", (_name, value) => {
    mock.settings = value;
    expect(render()).toBe("");
  });

  /** The card's element tree (hooks run by fakeReact, no DOM), searched for a button by its text. */
  function buttonLabelled(node: any, label: string): any {
    if (!node || typeof node !== "object") return null;
    if (node.type === "button" && node.props.children === label) return node;
    for (const child of [].concat(node.props?.children ?? [])) {
      const found = buttonLabelled(child, label);
      if (found) return found;
    }
    return null;
  }
  async function click(label: string) {
    mock.settings = base;
    await buttonLabelled(TextsAskCard({ tone: "page" }), label).props.onClick();
  }

  it("Turn on saves the consent from the card", async () => {
    await click("Turn on");
    expect(mock.calls["textConsent:setMyTexts"]).toHaveBeenCalledWith({ on: true, from: "card" });
    expect(mock.calls["textConsent:dismissTextsAsk"]).not.toHaveBeenCalled();
  });

  it("Not now dismisses and never switches texts on", async () => {
    await click("Not now");
    expect(mock.calls["textConsent:dismissTextsAsk"]).toHaveBeenCalled();
    expect(mock.calls["textConsent:setMyTexts"]).not.toHaveBeenCalled();
  });
});
