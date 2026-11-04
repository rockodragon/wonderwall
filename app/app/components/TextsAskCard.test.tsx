import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { getFunctionName } from "convex/server";
import { renderHook } from "../../test-support/fakeHooks";
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

  it("asks for an email first, then offers texts with the consent line and the policy link", () => {
    mock.settings = base;
    const html = render();
    expect(html).toContain("How should we reach you when someone messages you?");
    expect(html).toMatch(/<input[^>]*type="email"/);
    expect(html).toContain("Email me");
    expect(html).toContain("Text me instead");
    expect(html).toContain("Up to 3 texts a day. Message and data rates may apply. Reply STOP to stop, HELP for help.");
    expect(html).toMatch(/<a[^>]*href="\/legal\/privacy"[^>]*>Privacy Policy<\/a>/);
    expect(html).toContain("Not now");
    // Email before texts, and the consent line after the text button.
    expect(html.indexOf("Email me")).toBeLessThan(html.indexOf("Text me instead"));
    expect(html.indexOf("Text me instead")).toBeLessThan(html.indexOf("Up to 3 texts a day"));
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

  /** The card's element tree (hooks run by fakeReact, no DOM), searched for an element. */
  function find(node: any, match: (n: any) => boolean): any {
    if (!node || typeof node !== "object") return null;
    if (match(node)) return node;
    for (const child of [].concat(node.props?.children ?? [])) {
      const found = find(child, match);
      if (found) return found;
    }
    return null;
  }
  const buttonLabelled = (node: any, label: string) => find(node, n => n.type === "button" && n.props.children === label);
  async function click(label: string) {
    mock.settings = base;
    await buttonLabelled(TextsAskCard({ tone: "page" }), label).props.onClick();
  }

  it("Email me saves the typed address and never switches texts on", async () => {
    mock.settings = base;
    const card = renderHook(() => TextsAskCard({ tone: "page" }), undefined);
    find(card.result, n => n.type === "input").props.onChange({ target: { value: "ada@example.com" } });
    const form = find(card.result, n => n.type === "form");
    // Enter in the box and the button both submit: the button is the form's own.
    expect(buttonLabelled(form, "Email me").props).toMatchObject({ type: "submit", disabled: false });
    form.props.onSubmit({ preventDefault() {} });
    await vi.waitFor(() => expect(mock.calls["profiles:fillMissingBasics"]).toHaveBeenCalledWith({ email: "ada@example.com" }));
    expect(mock.calls["textConsent:setMyTexts"]).not.toHaveBeenCalled();
  });

  it("Email me is off until something is typed", () => {
    mock.settings = base;
    const card = renderHook(() => TextsAskCard({ tone: "page" }), undefined);
    expect(buttonLabelled(card.result, "Email me").props.disabled).toBe(true);
  });

  it("Text me instead saves the consent from the card", async () => {
    await click("Text me instead");
    expect(mock.calls["textConsent:setMyTexts"]).toHaveBeenCalledWith({ on: true, from: "card" });
    expect(mock.calls["textConsent:dismissTextsAsk"]).not.toHaveBeenCalled();
  });

  it("Not now dismisses and never switches texts on", async () => {
    await click("Not now");
    expect(mock.calls["textConsent:dismissTextsAsk"]).toHaveBeenCalled();
    expect(mock.calls["textConsent:setMyTexts"]).not.toHaveBeenCalled();
  });
});
