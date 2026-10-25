// Picks a cover: checks the file, frames it 4:5 if needed (the framer in
// components/CoverPicker.tsx), and hands back a small JPEG
// (docs/features/cover-4x5.md). The signature is fixed — callers code
// against `CoverPick`.

import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { CoverPicker, type CoverChoice } from "../components/CoverPicker";
import { cropRect, isCoverShape, wholeSize } from "./coverCrop";
import { UNREADABLE_PICTURE, drawJpeg, loadImage } from "./shrinkImage";

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

const ERR_NOT_IMAGE = "Choose a picture.";
const ERR_TOO_BIG = "Pictures up to 20 MB.";
const ERR_UNREADABLE = UNREADABLE_PICTURE;
const ERR_UPLOAD = "Upload failed — try again.";

type Loaded = { url: string; img: HTMLImageElement; w: number; h: number };

const CENTRED_FILL: CoverChoice = { mode: "fill", zoom: 1, x: 0.5, y: 0.5 };

function encode({ img, w, h }: Loaded, choice: CoverChoice): Promise<Blob> {
  if (choice.mode === "fill") {
    const r = cropRect({ w, h, zoom: choice.zoom, x: choice.x, y: choice.y });
    return drawJpeg(FILL_WIDTH, FILL_HEIGHT, (ctx) =>
      ctx.drawImage(img, r.sx, r.sy, r.sw, r.sh, 0, 0, FILL_WIDTH, FILL_HEIGHT),
    );
  }
  const { width, height } = wholeSize(w, h, WHOLE_MAX_LONG);
  return drawJpeg(width, height, (ctx) => ctx.drawImage(img, 0, 0, width, height));
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
