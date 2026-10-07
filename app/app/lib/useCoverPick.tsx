// Picks a cover: checks the file, frames it 4:5 if needed (the framer in
// components/CoverPicker.tsx), and hands back a small JPEG
// (docs/features/cover-4x5.md). The signature is fixed — callers code
// against `CoverPick`.

import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { CoverPicker, type CoverChoice } from "../components/CoverPicker";
import { cropRect, isCoverShape, wholeSize } from "./coverCrop";

export type CoverPick = {
  /** Check the file; a 4:5 picture is encoded right away, any other shape opens the framer. */
  pick: (file: File) => void;
  /** The framer dialog. Render it once, anywhere in the component. */
  picker: ReactNode;
  /** Shown under the picker when a file can't be used. */
  error: string | null;
  /** True while a picture is being read or encoded. */
  busy: boolean;
};

const MAX_BYTES = 20 * 1024 * 1024;
const FILL_WIDTH = 1080;
const FILL_HEIGHT = 1350;
const WHOLE_MAX_LONG = 2160;
const JPEG_QUALITY = 0.86;

const ERR_NOT_IMAGE = "Choose a picture.";
const ERR_TOO_BIG = "Pictures up to 20 MB.";
const ERR_UNREADABLE = "This picture can't be read here. Try a JPG or PNG.";
const ERR_UPLOAD = "Upload failed — try again.";

type Loaded = { url: string; img: HTMLImageElement; w: number; h: number };

/** Loads a picture. `onload`, not `img.decode()`: Chrome never settles
 *  decode() for a page that's hidden, as it can be while a phone's photo
 *  picker is open. */
function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Couldn't read the picture"));
    img.src = url;
  });
}

const CENTRED_FILL: CoverChoice = { mode: "fill", zoom: 1, x: 0.5, y: 0.5 };

async function encode(
  { img, w, h }: Loaded,
  choice: CoverChoice,
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No canvas");
  ctx.imageSmoothingQuality = "high";
  if (choice.mode === "fill") {
    canvas.width = FILL_WIDTH;
    canvas.height = FILL_HEIGHT;
    // Under any transparent pixels of a PNG.
    ctx.fillStyle = "#111";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const r = cropRect({ w, h, zoom: choice.zoom, x: choice.x, y: choice.y });
    ctx.drawImage(img, r.sx, r.sy, r.sw, r.sh, 0, 0, FILL_WIDTH, FILL_HEIGHT);
  } else {
    const { width, height } = wholeSize(w, h, WHOLE_MAX_LONG);
    canvas.width = width;
    canvas.height = height;
    ctx.fillStyle = "#111";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);
  }
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY),
  );
  if (!blob) throw new Error("Couldn't encode the picture");
  return blob;
}

export function useCoverPick(onReady: (blob: Blob) => Promise<void> | void): CoverPick {
  // Callers can pass an inline function; the latest one is used when the
  // picture is ready.
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [framing, setFraming] = useState<Loaded | null>(null);

  const busyRef = useRef(false);
  const urlRef = useRef<string | null>(null);

  const finish = useCallback(() => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = null;
    busyRef.current = false;
    setFraming(null);
    setBusy(false);
  }, []);

  // Let go of the object URL if the component goes away mid-pick.
  useEffect(() => {
    return () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    };
  }, []);

  const commit = useCallback(
    async (loaded: Loaded, choice: CoverChoice) => {
      setFraming(null);
      let blob: Blob;
      try {
        blob = await encode(loaded, choice);
      } catch (err) {
        console.error("Cover encode error:", err);
        setError(ERR_UNREADABLE);
        finish();
        return;
      }
      try {
        await onReadyRef.current(blob);
      } catch (err) {
        console.error("Cover upload error:", err);
        setError(ERR_UPLOAD);
      } finally {
        finish();
      }
    },
    [finish],
  );

  const run = useCallback(
    async (file: File) => {
      if (busyRef.current) return;
      setError(null);
      if (!file.type.startsWith("image/")) {
        setError(ERR_NOT_IMAGE);
        return;
      }
      if (file.size > MAX_BYTES) {
        setError(ERR_TOO_BIG);
        return;
      }

      busyRef.current = true;
      setBusy(true);
      const url = URL.createObjectURL(file);
      urlRef.current = url;
      let img: HTMLImageElement;
      try {
        img = await loadImage(url);
      } catch {
        setError(ERR_UNREADABLE);
        finish();
        return;
      }
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      if (!w || !h) {
        setError(ERR_UNREADABLE);
        finish();
        return;
      }
      const loaded: Loaded = { url, img, w, h };
      if (isCoverShape(w, h)) {
        await commit(loaded, CENTRED_FILL);
      } else {
        setFraming(loaded);
      }
    },
    [commit, finish],
  );

  const pick = useCallback(
    (file: File) => {
      void run(file);
    },
    [run],
  );

  const picker = framing ? (
    <CoverPicker
      src={framing.url}
      naturalWidth={framing.w}
      naturalHeight={framing.h}
      onUse={(choice) => void commit(framing, choice)}
      onCancel={finish}
    />
  ) : null;

  return { pick, picker, error, busy };
}
