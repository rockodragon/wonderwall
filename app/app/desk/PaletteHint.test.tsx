import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { HINT_BODY, HINT_KEY, HINT_TITLE, PaletteHint, hintSeen, markHintSeen } from "./PaletteHint";

function fakeStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    store,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the palette's first-visit note", () => {
  it("is unseen until dismissed, then stays seen", () => {
    const storage = fakeStorage();
    vi.stubGlobal("localStorage", storage);
    expect(hintSeen()).toBe(false);
    markHintSeen();
    expect(storage.store.get(HINT_KEY)).toBe("seen");
    expect(hintSeen()).toBe(true);
  });

  it("treats blocked storage as unseen and doesn't throw", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    });
    expect(hintSeen()).toBe(false);
    expect(() => markHintSeen()).not.toThrow();
  });

  it("says where the menu is, names Tables, and can be dismissed", () => {
    const html = renderToString(<PaletteHint onDismiss={() => {}} reduced={false} />);
    expect(html).toContain(HINT_TITLE);
    expect(HINT_BODY).toContain("Tables");
    expect(html).toContain(HINT_BODY);
    expect(html).toContain(">Got it</button>");
    // The section is named by its title.
    const id = /<p id="([^"]+)"/.exec(html)?.[1];
    expect(id).toBeTruthy();
    expect(html).toContain(`aria-labelledby="${id}"`);
  });

  it("drops its motion for a visitor who asked for less", () => {
    const html = renderToString(<PaletteHint onDismiss={() => {}} reduced />);
    expect(html).toContain(".desk-pal-hint { animation: none; }");
    expect(html).toContain(".desk-pal-hint-ring { animation: none; }");
  });
});
