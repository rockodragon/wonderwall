// A small QR code for a page that's up on a big screen, so a room can scan it
// with their phones (the Sophia fund's page and its Canvas card, Rick
// 2026-11-06). Wide screens only: on a phone you're already on the page.
// A default export, so the Canvas can load it, and the QR library with it,
// only when a card that has one opens.

import { useMemo } from "react";
import { qrMatrix, qrSvgDataUrl } from "../lib/qrCode";

export default function ScanQr({
  url,
  label,
  colors,
  size = 112,
}: {
  /** Absolute: a phone scanning it has no site to be relative to. */
  url: string;
  /** What scanning does: "Scan to give". */
  label: string;
  colors: { text: string; muted: string };
  size?: number;
}) {
  const src = useMemo(() => qrSvgDataUrl(qrMatrix(url), 2), [url]);
  const shown = url.replace(/^https?:\/\//, "");
  return (
    <figure className="hidden md:flex" style={{ margin: 0, alignItems: "center", gap: 14 }}>
      <img
        src={src}
        alt={`QR code for ${shown}`}
        width={size}
        height={size}
        style={{ display: "block", flex: "none", borderRadius: 6, background: "#fff", padding: 4 }}
      />
      <figcaption style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
        <span style={{ fontSize: 15, fontWeight: 500, color: colors.text }}>{label}</span>
        <span style={{ fontSize: 13, color: colors.muted, overflowWrap: "anywhere" }}>{shown}</span>
      </figcaption>
    </figure>
  );
}
