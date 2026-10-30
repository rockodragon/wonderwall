import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { Speech } from "../lib/useSpeech";
import { SPOKEN_MAX, SpokenNote, SpokenTextarea, useSpoken, useSpokenInto } from "./SpokenTextarea";

// Whether the browser can listen is useSpeech's to say (a test here has no
// browser, and a server render never can); the box and its mic are only what
// is drawn from it.
const support = vi.hoisted(() => ({ supported: false }));
vi.mock("../lib/useSpeech", () => ({ useSpeechSupported: () => support.supported }));

// The hooks run inside a server render here, which keeps no state and runs no
// effects: refs are kept between renders and effects are collected, so a
// test can run them by hand, in the order a browser would.
const hooks = vi.hoisted(() => ({ refs: [] as { current: unknown }[], at: 0, effects: [] as (() => void)[] }));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useRef: (initial: unknown) => {
    hooks.refs[hooks.at] ??= { current: initial };
    return hooks.refs[hooks.at++];
  },
  useEffect: (effect: () => void) => {
    hooks.effects.push(effect);
  },
}));

const noop = () => {};
const box = (props: Partial<Parameters<typeof SpokenTextarea>[0]> = {}) =>
  renderToStaticMarkup(
    <SpokenTextarea
      id="bio"
      value=""
      onChange={noop}
      placeholder="Who you are, in a sentence"
      listening={false}
      onStart={noop}
      onStop={noop}
      className="w-full px-4"
      {...props}
    />,
  );
const textareaTag = (html: string) => html.match(/<textarea[^>]*>/)?.[0] ?? "";

beforeEach(() => {
  support.supported = false;
});

describe("SpokenTextarea in a server render", () => {
  it("draws no mic, and asks with the plain placeholder", () => {
    const html = box();
    expect(html).not.toContain("Talk instead");
    expect(html).not.toContain("<button");
    expect(html).toContain('placeholder="Who you are, in a sentence"');
    expect(html).not.toContain("Talk or type");
    expect(textareaTag(html)).not.toContain("pr-16");
  });

  it("is a two-row box that doesn't resize, and takes the page's look", () => {
    const html = box({ style: { borderColor: "var(--app-hairline)" }, wrapperClassName: "mt-1" });
    const tag = textareaTag(html);
    expect(tag).toContain('id="bio"');
    expect(tag).toContain('rows="2"');
    expect(tag).toMatch(/class="resize-none w-full px-4"/);
    expect(tag).toContain("border-color:var(--app-hairline)");
    expect(html).toMatch(/^<div class="relative mt-1"><textarea/);
  });

  it("takes the row count, and a wrapper with nothing extra is just relative", () => {
    expect(textareaTag(box({ rows: 4 }))).toContain('rows="4"');
    expect(box()).toMatch(/^<div class="relative"><textarea/);
  });

  it("shows what it holds", () => {
    expect(box({ value: "Muralist." })).toContain(">Muralist.</textarea>");
  });
});

describe("SpokenTextarea where the browser can listen", () => {
  beforeEach(() => {
    support.supported = true;
  });

  it("puts the mic inside the box, at the right, and leaves room for it", () => {
    const html = box();
    expect(textareaTag(html)).toContain('placeholder="Talk or type. Who you are, in a sentence"');
    expect(textareaTag(html)).toMatch(/class="[^"]*\bpr-16\b/);
    expect(html).toMatch(/<\/textarea><button[^>]*aria-label="Talk instead"[^>]*absolute right-2/);
  });

  it("says it is listening, and the mic becomes Stop", () => {
    const html = box({ listening: true });
    expect(textareaTag(html)).toContain('placeholder="Listening… tap the mic to stop"');
    expect(html).toContain('aria-label="Stop"');
    expect(html).not.toContain("Talk or type");
  });
});

describe("SpokenNote", () => {
  const note = (props: Partial<Parameters<typeof SpokenNote>[0]> = {}) =>
    renderToStaticMarkup(<SpokenNote working={false} error={null} {...props} />);

  it("says nothing when there is nothing to say", () => {
    expect(note()).toBe("");
  });

  it("tells an error as an alert", () => {
    const html = note({ error: "Microphone access was blocked." });
    expect(html).toContain('role="alert"');
    expect(html).toContain("Microphone access was blocked.");
    expect(html).toContain("color:#fca5a5");
  });

  it("says the words are being sorted, as a status", () => {
    const html = note({ working: true });
    expect(html).toContain('role="status"');
    expect(html).toContain("Sorting that out…");
    expect(html).toContain("color:var(--garden-body)");
  });

  it("puts an error before the sorting line", () => {
    const html = note({ working: true, error: "Couldn't hear that. Try again." });
    expect(html).toContain("Couldn&#x27;t hear that. Try again.");
    expect(html).not.toContain("Sorting that out");
  });

  it("takes the page's size and colors", () => {
    const html = note({ error: "No microphone was found.", className: "mt-2 text-sm", errorColor: "var(--app-text)" });
    expect(html).toMatch(/class="mt-2 text-sm"/);
    expect(html).toContain("color:var(--app-text)");
  });
});

// A speech object as useTalk() hands it back, with the calls recorded.
function fakeSpeech(over: Partial<Speech> = {}) {
  const calls: string[] = [];
  const speech: Speech = {
    supported: true,
    listening: false,
    transcribing: false,
    transcript: "",
    error: null,
    start: () => void calls.push("start"),
    stop: () => void calls.push("stop"),
    reset: () => void calls.push("reset"),
    ...over,
  };
  return { speech, calls };
}

// Render a hook as a component would call it, keeping its refs from one pass
// to the next, and hand back its result and the effects it asked for.
function pass<T>(use: () => T) {
  hooks.at = 0;
  hooks.effects = [];
  let result!: T;
  function Probe() {
    result = use();
    return null;
  }
  renderToStaticMarkup(<Probe />);
  return { result, runEffects: () => hooks.effects.forEach((effect) => effect()) };
}

describe("useSpoken", () => {
  beforeEach(() => {
    hooks.refs = [];
  });

  it("starts from a fresh transcript", () => {
    const { speech, calls } = fakeSpeech();
    pass(() => useSpoken(speech, noop)).result.start();
    expect(calls).toEqual(["reset", "start"]);
  });

  it("puts the words in the box as they're said, not before", () => {
    const words: string[] = [];
    pass(() => useSpoken(fakeSpeech({ listening: false, transcript: "old" }).speech, (said) => words.push(said))).runEffects();
    expect(words).toEqual([]);
    pass(() => useSpoken(fakeSpeech({ listening: true, transcript: "I paint" }).speech, (said) => words.push(said))).runEffects();
    expect(words).toEqual(["I paint"]);
  });

  it("hands the whole of what was said to onSaid once listening stops, capped", () => {
    const said: string[] = [];
    const use = (listening: boolean, transcript: string) => () =>
      useSpoken(fakeSpeech({ listening, transcript }).speech, noop, (s) => void said.push(s));
    pass(use(true, "I paint")).runEffects();
    expect(said).toEqual([]);
    pass(use(false, `  ${"a".repeat(SPOKEN_MAX + 10)}  `)).runEffects();
    expect(said).toEqual(["a".repeat(SPOKEN_MAX)]);
  });

  it("has nothing to hand over when nothing was said", () => {
    const said: string[] = [];
    const use = (listening: boolean) => () => useSpoken(fakeSpeech({ listening, transcript: "  " }).speech, noop, (s) => void said.push(s));
    pass(use(true)).runEffects();
    pass(use(false)).runEffects();
    expect(said).toEqual([]);
  });
});

describe("useSpokenInto", () => {
  beforeEach(() => {
    hooks.refs = [];
  });

  it("adds what is said after the words already in the box", () => {
    const seen: string[] = [];
    const { speech } = fakeSpeech({ listening: true, transcript: "and I teach" });
    const run = pass(() => useSpokenInto(speech, "  I paint murals. ", (value) => seen.push(value)));
    run.result.start();
    run.runEffects();
    expect(seen).toEqual(["I paint murals. and I teach"]);
  });

  it("keeps a saved bio when the mic is first tapped (nothing said yet)", () => {
    const seen: string[] = [];
    const { speech } = fakeSpeech({ listening: true, transcript: "" });
    const run = pass(() => useSpokenInto(speech, "I paint murals.", (value) => seen.push(value)));
    run.result.start();
    run.runEffects();
    expect(seen).toEqual(["I paint murals."]);
  });

  it("is just what was said when the box was empty", () => {
    const seen: string[] = [];
    const { speech } = fakeSpeech({ listening: true, transcript: "I paint" });
    const run = pass(() => useSpokenInto(speech, "", (value) => seen.push(value)));
    run.result.start();
    run.runEffects();
    expect(seen).toEqual(["I paint"]);
  });
});
