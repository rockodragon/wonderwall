import { describe, expect, it } from "vitest";
import { ConvexError } from "convex/values";
import {
  collectStorageIds,
  isRichDocEmpty,
  isSafeHttpUrl,
  normalizeBlocks,
  normalizeRichDoc,
  normalizeUrl,
  orphanedStorageIds,
  parseInline,
  resolveRichDocMedia,
  richDocExcerpt,
  richDocPlainText,
  stripInlineMarks,
  toStoredDoc,
  type RichDoc,
} from "./richText";

describe("isSafeHttpUrl", () => {
  it("accepts http and https", () => {
    expect(isSafeHttpUrl("https://example.com/a.png")).toBe(true);
    expect(isSafeHttpUrl("http://example.com")).toBe(true);
  });

  it("rejects the schemes that parse as valid URLs but aren't web addresses", () => {
    expect(isSafeHttpUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeHttpUrl("data:text/html;base64,PHNjcmlwdD4=")).toBe(false);
    expect(isSafeHttpUrl("vbscript:msgbox(1)")).toBe(false);
    expect(isSafeHttpUrl("file:///etc/passwd")).toBe(false);
  });

  it("rejects empty and unparseable input", () => {
    expect(isSafeHttpUrl("")).toBe(false);
    expect(isSafeHttpUrl("   ")).toBe(false);
    expect(isSafeHttpUrl(undefined)).toBe(false);
    expect(isSafeHttpUrl("not a url")).toBe(false);
  });
});

describe("normalizeUrl", () => {
  it("adds https to a bare host", () => {
    expect(normalizeUrl("vimeo.com/12345")).toBe("https://vimeo.com/12345");
  });

  it("leaves an existing scheme alone, including a bad one", () => {
    expect(normalizeUrl("http://example.com")).toBe("http://example.com");
    expect(normalizeUrl("javascript:alert(1)")).toBe("javascript:alert(1)");
  });
});

describe("parseInline", () => {
  it("returns one text token when there are no marks", () => {
    expect(parseInline("just words")).toEqual([{ kind: "text", text: "just words" }]);
  });

  it("reads bold before italic at the same position", () => {
    expect(parseInline("**loud**")).toEqual([{ kind: "bold", text: "loud" }]);
    expect(parseInline("*soft*")).toEqual([{ kind: "italic", text: "soft" }]);
  });

  it("keeps the surrounding text", () => {
    expect(parseInline("a **b** c")).toEqual([
      { kind: "text", text: "a " },
      { kind: "bold", text: "b" },
      { kind: "text", text: " c" },
    ]);
  });

  it("reads links", () => {
    expect(parseInline("see [the show](https://example.com)")).toEqual([
      { kind: "text", text: "see " },
      { kind: "link", text: "the show", href: "https://example.com" },
    ]);
  });

  it("adds a scheme to a bare link host", () => {
    expect(parseInline("[here](example.com/x)")).toEqual([
      { kind: "link", text: "here", href: "https://example.com/x" },
    ]);
  });

  it("degrades an unsafe link to its literal source text", () => {
    expect(parseInline("[click](javascript:alert(1))")).toEqual([
      { kind: "text", text: "[click](javascript:alert(1)" },
      { kind: "text", text: ")" },
    ]);
  });

  it("leaves an unterminated marker as plain text", () => {
    expect(parseInline("2 * 3 = 6")).toEqual([{ kind: "text", text: "2 * 3 = 6" }]);
    expect(parseInline("**open")).toEqual([{ kind: "text", text: "**open" }]);
  });

  it("does not let a mark run across a line break", () => {
    expect(parseInline("*one\ntwo*")).toEqual([{ kind: "text", text: "*one\ntwo*" }]);
  });

  it("is reusable — the shared regex's lastIndex never leaks between calls", () => {
    const first = parseInline("**a** **b**");
    const second = parseInline("**a** **b**");
    expect(second).toEqual(first);
    expect(first).toHaveLength(3);
  });
});

describe("stripInlineMarks", () => {
  it("removes the markers and keeps the words", () => {
    expect(stripInlineMarks("a **bold** and [a link](https://example.com)")).toBe(
      "a bold and a link",
    );
  });
});

describe("normalizeBlocks", () => {
  it("drops blocks with no content", () => {
    const doc: RichDoc = [
      { type: "text", text: "   " },
      { type: "heading", text: "" },
      { type: "quote", text: "\n" },
      { type: "list", items: ["", "  "] },
      { type: "image" },
      { type: "video" },
      { type: "text", text: "kept" },
    ];
    expect(normalizeBlocks(doc)).toEqual([{ type: "text", text: "kept" }]);
  });

  it("keeps a text block's interior blank lines but trims its ends", () => {
    expect(normalizeBlocks([{ type: "text", text: "\n one\n\n two \n" }])).toEqual([
      { type: "text", text: "one\n\n two" },
    ]);
  });

  it("only allows heading levels 2 and 3", () => {
    expect(normalizeBlocks([{ type: "heading", text: "A", level: 1 }])).toEqual([
      { type: "heading", text: "A", level: 2 },
    ]);
    expect(normalizeBlocks([{ type: "heading", text: "A", level: 3 }])).toEqual([
      { type: "heading", text: "A", level: 3 },
    ]);
  });

  it("drops leading, trailing and doubled dividers", () => {
    const doc: RichDoc = [
      { type: "divider" },
      { type: "text", text: "a" },
      { type: "divider" },
      { type: "divider" },
      { type: "text", text: "b" },
      { type: "divider" },
    ];
    expect(normalizeBlocks(doc)).toEqual([
      { type: "text", text: "a" },
      { type: "divider" },
      { type: "text", text: "b" },
    ]);
  });

  it("normalizes a bare media host to https", () => {
    expect(normalizeBlocks([{ type: "image", url: "example.com/a.png" }])).toEqual([
      { type: "image", url: "https://example.com/a.png" },
    ]);
  });

  it("clamps overlong text rather than refusing it", () => {
    const long = "x".repeat(6000);
    const out = normalizeBlocks([{ type: "text", text: long }]);
    expect((out[0] as { text: string }).text).toHaveLength(5000);
  });

  it("caps list items", () => {
    const items = Array.from({ length: 80 }, (_, i) => `item ${i}`);
    const out = normalizeBlocks([{ type: "list", items }]);
    expect((out[0] as { items: string[] }).items).toHaveLength(50);
  });
});

describe("normalizeRichDoc", () => {
  it("returns undefined for nothing and for an all-empty document", () => {
    expect(normalizeRichDoc(undefined)).toBeUndefined();
    expect(normalizeRichDoc([])).toBeUndefined();
    expect(normalizeRichDoc([{ type: "text", text: "  " }, { type: "divider" }])).toBeUndefined();
  });

  it("refuses a document with too many blocks", () => {
    const doc: RichDoc = Array.from({ length: 121 }, () => ({ type: "text", text: "a" }));
    expect(() => normalizeRichDoc(doc)).toThrow(ConvexError);
  });

  it("refuses an unsafe media URL", () => {
    expect(() => normalizeRichDoc([{ type: "image", url: "javascript:alert(1)" }])).toThrow(
      ConvexError,
    );
    expect(() => normalizeRichDoc([{ type: "video", url: "data:text/html,x" }])).toThrow(
      ConvexError,
    );
  });

  it("refuses a document over the total character budget", () => {
    const doc: RichDoc = Array.from({ length: 20 }, () => ({
      type: "text" as const,
      text: "y".repeat(5000),
    }));
    expect(() => normalizeRichDoc(doc)).toThrow(ConvexError);
  });

  it("accepts a real document unchanged apart from trimming", () => {
    const doc: RichDoc = [
      { type: "heading", text: " Act One ", level: 3 },
      { type: "text", text: "We shot **all of it** in one room." },
      { type: "image", storageId: "kg123", caption: " Day two " },
      { type: "video", url: "https://youtu.be/dQw4w9WgXcQ" },
    ];
    expect(normalizeRichDoc(doc)).toEqual([
      { type: "heading", text: "Act One", level: 3 },
      { type: "text", text: "We shot **all of it** in one room." },
      { type: "image", storageId: "kg123", caption: "Day two" },
      { type: "video", url: "https://youtu.be/dQw4w9WgXcQ" },
    ]);
  });
});

describe("richDocPlainText / excerpt / empty", () => {
  const doc: RichDoc = [
    { type: "heading", text: "Act One", level: 2 },
    { type: "text", text: "A **loud** start." },
    { type: "list", items: ["one", "two"] },
    { type: "image", storageId: "kg1", caption: "A caption" },
    { type: "divider" },
    { type: "video", url: "https://youtu.be/abc123" },
  ];

  it("reads every block that carries words, markers stripped", () => {
    expect(richDocPlainText(doc)).toBe("Act One\n\nA loud start.\n\none\n\ntwo\n\nA caption");
  });

  it("returns empty string for nothing", () => {
    expect(richDocPlainText(undefined)).toBe("");
    expect(richDocPlainText([])).toBe("");
  });

  // Cut-at-N-then-trimEnd, the same excerpt rule routes/opportunities.tsx
  // already applies to a blurb — not a back-up-to-the-last-space rule.
  it("ellipsises an over-long excerpt", () => {
    expect(richDocExcerpt(doc, 12)).toBe("Act One A lo…");
    expect(richDocExcerpt(doc, 9)).toBe("Act One A…");
    expect(richDocExcerpt(doc, 500)).not.toContain("…");
  });

  it("knows an empty document from a real one", () => {
    expect(isRichDocEmpty(undefined)).toBe(true);
    expect(isRichDocEmpty([{ type: "text", text: "   " }])).toBe(true);
    expect(isRichDocEmpty([{ type: "divider" }])).toBe(true);
    expect(isRichDocEmpty(doc)).toBe(false);
  });
});

describe("storage ids", () => {
  const doc: RichDoc = [
    { type: "image", storageId: "a" },
    { type: "video", storageId: "b" },
    { type: "image", storageId: "a" },
    { type: "image", url: "https://example.com/c.png" },
    { type: "text", text: "no file here" },
  ];

  it("collects each referenced file once", () => {
    expect(collectStorageIds(doc)).toEqual(["a", "b"]);
    expect(collectStorageIds(undefined)).toEqual([]);
  });

  it("finds the files a save orphaned", () => {
    expect(orphanedStorageIds(doc, [{ type: "image", storageId: "a" }])).toEqual(["b"]);
    expect(orphanedStorageIds(doc, undefined)).toEqual(["a", "b"]);
    expect(orphanedStorageIds(undefined, doc)).toEqual([]);
  });
});

describe("resolveRichDocMedia", () => {
  const storage = {
    async getUrl(id: string) {
      if (id === "gone") return null;
      if (id === "boom") throw new Error("storage down");
      return `https://files.test/${id}`;
    },
  };

  it("resolves uploaded media and leaves other blocks alone", async () => {
    const out = await resolveRichDocMedia(storage, [
      { type: "text", text: "hi" },
      { type: "image", storageId: "a" },
      { type: "video", url: "https://youtu.be/x" },
    ]);
    expect(out).toEqual([
      { type: "text", text: "hi" },
      { type: "image", storageId: "a", resolvedUrl: "https://files.test/a" },
      { type: "video", url: "https://youtu.be/x", resolvedUrl: "https://youtu.be/x" },
    ]);
  });

  it("falls back to the external URL, then to null, when a file is gone", async () => {
    const out = await resolveRichDocMedia(storage, [
      { type: "image", storageId: "gone", url: "https://example.com/a.png" },
      { type: "image", storageId: "gone" },
    ]);
    expect(out?.[0]).toMatchObject({ resolvedUrl: "https://example.com/a.png" });
    expect(out?.[1]).toMatchObject({ resolvedUrl: null });
  });

  it("survives storage throwing", async () => {
    const out = await resolveRichDocMedia(storage, [{ type: "image", storageId: "boom" }]);
    expect(out?.[0]).toMatchObject({ resolvedUrl: null });
  });

  it("returns undefined for an empty document", async () => {
    expect(await resolveRichDocMedia(storage, undefined)).toBeUndefined();
    expect(await resolveRichDocMedia(storage, [])).toBeUndefined();
  });
});

describe("toStoredDoc", () => {
  it("drops resolvedUrl so the validator accepts the document back", async () => {
    const resolved = await resolveRichDocMedia(
      { async getUrl(id: string) { return `https://files.test/${id}`; } },
      [{ type: "image", storageId: "a", caption: "c" }, { type: "text", text: "t" }],
    );
    expect(toStoredDoc(resolved)).toEqual([
      { type: "image", storageId: "a", caption: "c" },
      { type: "text", text: "t" },
    ]);
  });
});
