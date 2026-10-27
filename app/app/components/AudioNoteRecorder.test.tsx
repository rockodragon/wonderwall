import { isValidElement, type ReactElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ConvexError } from "convex/values";
import type { Id } from "../../convex/_generated/dataModel";
import { AudioNoteRecorder, removeNote, saveTake } from "./AudioNoteRecorder";

// What the browser can record, and what the recording and upload hooks are
// doing, are theirs to say (a test here has no microphone); the control is
// only what is drawn from them.
const recorder = vi.hoisted(() => ({
  // What the control asked the hook for (onFinish), kept so a test can end a take.
  options: undefined as { onFinish?: (blob: Blob) => void } | undefined,
  supported: true,
  recording: false,
  seconds: 0,
  blob: null as Blob | null,
  error: null as string | null,
  start: vi.fn(() => Promise.resolve()),
  stop: vi.fn(() => Promise.resolve(null as Blob | null)),
  reset: () => {},
}));
const upload = vi.hoisted(() => ({
  upload: vi.fn(async (_file: Blob) => null as unknown),
  onPick: async () => null,
  uploading: false,
  error: null as string | null,
  storageId: null,
  kind: null,
  preview: null as string | null,
  reset: vi.fn(),
}));
vi.mock("../lib/useAudioRecorder", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/useAudioRecorder")>()),
  useAudioRecorder: (options: typeof recorder.options) => {
    recorder.options = options;
    return recorder;
  },
}));
vi.mock("../lib/useFileUpload", () => ({ useFileUpload: () => upload }));

const generateUploadUrl = async () => "https://upload.test";
const draw = (props: Partial<Parameters<typeof AudioNoteRecorder>[0]> = {}) =>
  renderToStaticMarkup(<AudioNoteRecorder generateUploadUrl={generateUploadUrl} onRecorded={() => {}} {...props} />);
const buttons = (html: string) => [...html.matchAll(/<button[^>]*>([\s\S]*?)<\/button>/g)].map((m) => m[1].replace(/<[^>]*>/g, ""));

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(recorder, { options: undefined, supported: true, recording: false, seconds: 0, blob: null, error: null });
  Object.assign(upload, { uploading: false, error: null, preview: null });
});

describe("AudioNoteRecorder", () => {
  it("draws nothing where the browser can't record and there is no note", () => {
    recorder.supported = false;
    expect(draw()).toBe("");
    expect(draw({ url: null })).toBe("");
    expect(draw({ onRemove: () => {} })).toBe("");
  });

  it("where the browser can't record, still plays a saved note, with no record button", () => {
    recorder.supported = false;
    const html = draw({ url: "https://files.test/note.webm" });
    expect(html).toContain("<audio");
    expect(html).toContain('src="https://files.test/note.webm"');
    expect(html).not.toContain("<button");
    expect(html).not.toContain("Record");
  });

  it("where the browser can't record, a saved note can still be removed", () => {
    recorder.supported = false;
    const html = draw({ url: "https://files.test/note.webm", onRemove: () => {} });
    expect(html).toContain("<audio");
    expect(buttons(html)).toEqual(["Remove"]);
  });

  it("at rest with no note: one button, 'Record a note', with a microphone", () => {
    const html = draw();
    expect(buttons(html)).toEqual(["Record a note"]);
    expect(html).toContain('type="button"');
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain("<svg");
    expect(html).not.toContain("<audio");
    expect(html).not.toContain("Remove");
    expect(html).not.toContain('role="alert"');
  });

  it("the record button is at least 44px tall, 13.5px, paper on ink", () => {
    const style = draw().match(/<button[^>]*style="([^"]*)"/)![1];
    expect(style).toContain("min-height:44px");
    expect(style).toContain("font-size:13.5px");
    expect(style).toContain("background-color:var(--garden-ink)");
    expect(style).toContain("color:var(--garden-paper)");
  });

  it("while recording: a pressed Stop with citron fill, and the time of the maximum", () => {
    Object.assign(recorder, { recording: true, seconds: 7 });
    const html = draw();
    expect(buttons(html)).toEqual(["Stop"]);
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('type="button"');
    expect(html.match(/<button[^>]*style="([^"]*)"/)![1]).toContain("background-color:var(--garden-citron)");
    expect(html).toContain("0:07");
    expect(html).toContain("/ 2:00");
    expect(html).not.toContain("Record a note");
    expect(html).not.toContain("<audio");
  });

  it("the time reads like a clock", () => {
    Object.assign(recorder, { recording: true, seconds: 65 });
    expect(draw()).toContain("1:05 / 2:00");
    recorder.seconds = 120;
    expect(draw()).toContain("2:00 / 2:00");
  });

  it("while recording again over a saved note, hides the player", () => {
    Object.assign(recorder, { recording: true, seconds: 2 });
    const html = draw({ url: "https://files.test/note.webm", onRemove: () => {} });
    expect(buttons(html)).toEqual(["Stop"]);
    expect(html).not.toContain("<audio");
  });

  it("while uploading: says 'Saving…' and nothing to press", () => {
    upload.uploading = true;
    const html = draw();
    expect(html).toContain("Saving…");
    expect(html).not.toContain("<button");
  });

  it("with a saved note: a plain player, 'Record again' and 'Remove'", () => {
    const html = draw({ url: "https://files.test/note.webm", onRemove: () => {} });
    expect(html).toContain("<audio");
    expect(html).toContain("controls");
    expect(html).toContain('preload="none"');
    expect(html).toMatch(/<audio[^>]*class="w-full"/);
    expect(html).toContain('src="https://files.test/note.webm"');
    expect(buttons(html)).toEqual(["Record again", "Remove"]);
    expect(html.match(/type="button"/g)).toHaveLength(2);
    expect(html).not.toContain("Record a note");
  });

  it("has no Remove without onRemove", () => {
    const html = draw({ url: "https://files.test/note.webm" });
    expect(buttons(html)).toEqual(["Record again"]);
    expect(html).not.toContain("Remove");
  });

  it("plays the take just made until the saved note arrives", () => {
    upload.preview = "blob:take";
    const html = draw();
    expect(html).toContain('src="blob:take"');
    expect(buttons(html)).toEqual(["Record again"]);
    // Once the parent passes the saved note, that plays.
    const saved = draw({ url: "https://files.test/saved.webm" });
    expect(saved).toContain('src="https://files.test/saved.webm"');
    expect(saved).not.toContain("blob:take");
  });

  it("shows a problem under the control, as an alert", () => {
    upload.error = "Audio files up to 64 MB.";
    const html = draw();
    expect(html).toContain('role="alert"');
    expect(html).toContain("Audio files up to 64 MB.");
    expect(buttons(html)).toEqual(["Record a note"]);
  });

  it("says why recording failed", () => {
    recorder.error = "Microphone access was blocked.";
    const html = draw({ url: "https://files.test/note.webm" });
    expect(html).toContain('role="alert"');
    expect(html).toContain("Microphone access was blocked.");
    expect(html).toContain("<audio");
  });

  it("puts the recorder's problem before the upload's", () => {
    recorder.error = "No microphone was found.";
    upload.error = "That didn't upload. Try again.";
    const html = draw();
    expect(html).toContain("No microphone was found.");
    expect(html).not.toContain("That didn't upload.");
  });

  it("says nothing of a problem while recording", () => {
    Object.assign(recorder, { recording: true, seconds: 1 });
    upload.error = "That didn't upload. Try again.";
    expect(draw()).not.toContain('role="alert"');
  });

  it("never says 'artist', and nothing is under 12px", () => {
    const html = [
      draw(),
      draw({ url: "https://files.test/note.webm", onRemove: () => {} }),
      draw({ url: "https://files.test/note.webm", onRemove: () => {} }).replace("Record again", ""),
    ].join("");
    expect(html.toLowerCase()).not.toContain("artist");
    const sizes = [...html.matchAll(/font-size:(\d+(?:\.\d+)?)px/g)].map((m) => Number(m[1]));
    expect(sizes.length).toBeGreaterThan(0);
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(12);
  });
});

// What a tap does. The hooks are mocked and state can't change in a server
// render, so the control is drawn once and its buttons are read off the
// element tree it returns, then pressed.
function press(label: string, props: Partial<Parameters<typeof AudioNoteRecorder>[0]> = {}) {
  let tree: ReactNode = null;
  const Probe = () => {
    tree = AudioNoteRecorder({ generateUploadUrl, onRecorded: () => {}, ...props });
    return null;
  };
  renderToStaticMarkup(<Probe />);
  const texts = (node: ReactNode): string =>
    Array.isArray(node)
      ? node.map(texts).join("")
      : isValidElement(node)
        ? texts((node.props as { children?: ReactNode }).children)
        : typeof node === "string"
          ? node
          : "";
  const find = (node: ReactNode): ReactElement<{ onClick?: () => void }> | null => {
    if (Array.isArray(node)) return node.map(find).find(Boolean) ?? null;
    if (!isValidElement(node)) return null;
    const el = node as ReactElement<{ onClick?: () => void; children?: ReactNode }>;
    if (el.type === "button" && texts(el) === label) return el;
    return find(el.props.children);
  };
  const button = find(tree);
  expect(button, `a "${label}" button`).not.toBeNull();
  return button!.props.onClick!();
}

describe("AudioNoteRecorder taps", () => {
  it("Record a note starts the recorder; Stop stops it", () => {
    press("Record a note");
    expect(recorder.start).toHaveBeenCalledTimes(1);
    expect(recorder.stop).not.toHaveBeenCalled();
    recorder.recording = true;
    press("Stop");
    expect(recorder.stop).toHaveBeenCalledTimes(1);
    expect(recorder.start).toHaveBeenCalledTimes(1);
  });

  it("Record again starts the recorder", () => {
    press("Record again", { url: "https://files.test/note.webm" });
    expect(recorder.start).toHaveBeenCalledTimes(1);
  });

  it("Remove removes the note and lets go of the take just made", async () => {
    const onRemove = vi.fn();
    await press("Remove", { url: "https://files.test/note.webm", onRemove });
    expect(onRemove).toHaveBeenCalledTimes(1);
    expect(upload.reset).toHaveBeenCalledTimes(1);
  });

  it("a finished take goes up and its id goes to the parent", async () => {
    const onRecorded = vi.fn();
    const take = new Blob(["x"], { type: "audio/webm" });
    upload.upload.mockResolvedValueOnce({ storageId: "s1", kind: "audio", preview: "blob:t" });
    renderToStaticMarkup(<AudioNoteRecorder generateUploadUrl={generateUploadUrl} onRecorded={onRecorded} />);
    recorder.options!.onFinish!(take);
    await vi.waitFor(() => expect(onRecorded).toHaveBeenCalledWith("s1"));
    expect(upload.upload).toHaveBeenCalledWith(take);
  });
});

describe("saveTake", () => {
  const take = new Blob(["x"], { type: "audio/webm" });
  const uploaded = { storageId: "s1" as Id<"_storage">, kind: "audio" as const, preview: "blob:t" };
  const uploader = (result: unknown) => ({ upload: vi.fn(async () => result as never), reset: vi.fn() });

  it("hands the stored file's id to the parent, and is done", async () => {
    const up = uploader(uploaded);
    const onRecorded = vi.fn();
    expect(await saveTake(take, up, onRecorded)).toBeNull();
    expect(up.upload).toHaveBeenCalledWith(take);
    expect(onRecorded).toHaveBeenCalledWith("s1");
    expect(up.reset).not.toHaveBeenCalled();
  });

  it("waits for a parent that saves slowly", async () => {
    const up = uploader(uploaded);
    let done = false;
    const result = saveTake(take, up, () => new Promise((resolve) => setTimeout(() => ((done = true), resolve(null)), 5)));
    expect(done).toBe(false);
    expect(await result).toBeNull();
    expect(done).toBe(true);
  });

  it("leaves the parent alone when the upload didn't go up (the upload says why)", async () => {
    const up = uploader(null);
    const onRecorded = vi.fn();
    expect(await saveTake(take, up, onRecorded)).toBeNull();
    expect(onRecorded).not.toHaveBeenCalled();
  });

  it("gives the server's reason when the parent can't save, and drops the take", async () => {
    const up = uploader(uploaded);
    const problem = await saveTake(take, up, () => {
      throw new ConvexError({ code: "forbidden", reason: "That piece is gone." });
    });
    expect(problem).toBe("That piece is gone.");
    expect(up.reset).toHaveBeenCalledTimes(1);
  });

  it("says 'That didn't save' for any other failure, even an async one", async () => {
    const up = uploader(uploaded);
    expect(await saveTake(take, up, async () => Promise.reject(new Error("Server Error")))).toBe(
      "That didn't save. Try again.",
    );
    expect(up.reset).toHaveBeenCalledTimes(1);
  });
});

describe("removeNote", () => {
  it("removes the note and lets go of the take just made", async () => {
    const reset = vi.fn();
    const onRemove = vi.fn();
    expect(await removeNote({ upload: vi.fn(), reset }, onRemove)).toBeNull();
    expect(onRemove).toHaveBeenCalledTimes(1);
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it("gives the server's reason, or says 'That didn't remove', and keeps the take", async () => {
    const reset = vi.fn();
    const uploader = { upload: vi.fn(), reset };
    const reason = await removeNote(uploader, () => {
      throw new ConvexError("Not yours to remove.");
    });
    expect(reason).toBe("Not yours to remove.");
    expect(await removeNote(uploader, async () => Promise.reject(new Error("x")))).toBe("That didn't remove. Try again.");
    expect(reset).not.toHaveBeenCalled();
  });
});
