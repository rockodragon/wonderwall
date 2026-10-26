// A followed person's latest post, small: its picture, a play mark on a video
// and a waveform on a recording; the mark alone when there's no picture, or it
// won't load. Decoration: the words beside it already say what it is. The
// Shortlist's People rows (ShortlistRow.tsx) and the desk's Following cards
// (desk/DeskCard.tsx) both draw it.

import { Play, Waveform } from "@phosphor-icons/react";
import { useState } from "react";
import type { PostThumb } from "./rowModel";

const POST_MARK = { video: Play, audio: Waveform } as const;

export function PostThumbView({
  post,
  size = 44,
  well,
  line,
  muted,
}: {
  post: PostThumb;
  size?: number;
  /** The square's colour behind a mark with no picture. */
  well: string;
  line: string;
  /** The mark's colour when it stands alone. */
  muted: string;
}) {
  const [broken, setBroken] = useState<string | null>(null);
  const url = post.url !== broken ? post.url : null;
  const Mark = post.media === "image" ? null : POST_MARK[post.media];
  if (!url && !Mark) return null;
  return (
    <span
      aria-hidden
      data-post-thumb={post.media}
      style={{
        width: size,
        height: size,
        borderRadius: 4,
        overflow: "hidden",
        flex: "none",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
        background: well,
        border: `1px solid ${line}`,
      }}
    >
      {url && (
        <img
          src={url}
          alt=""
          decoding="async"
          loading="lazy"
          onError={() => setBroken(url)}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
        />
      )}
      {Mark &&
        (url ? (
          <span
            style={{
              position: "relative",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: Math.round(size / 2),
              height: Math.round(size / 2),
              borderRadius: "50%",
              background: "rgba(0,0,0,.55)",
              color: "#fff",
            }}
          >
            <Mark size={Math.round(size * 0.27)} weight="fill" />
          </span>
        ) : (
          <Mark size={Math.round(size * 0.45)} weight={post.media === "video" ? "fill" : "regular"} style={{ color: muted }} />
        ))}
    </span>
  );
}
