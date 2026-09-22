// The reader half of rich project content (docs/features/rich-project-
// content.md). A switch over the closed block union in convex/garden/
// richText.ts — that is the whole safety story: there is no HTML string
// anywhere in this file, no dangerouslySetInnerHTML, and no path by which
// stored content becomes markup. A block type this file doesn't know is
// skipped rather than guessed at.
//
// Used by the project page (/projects/:id), the public story page
// (/story/:slug) and each update in a timeline, so it carries no page
// chrome of its own and inherits type colour from its container.

import type { CSSProperties, ReactNode } from "react";
import {
  isSafeHttpUrl,
  parseInline,
  type InlineToken,
  type ResolvedRichBlock,
} from "../lib/richText";
import { toEmbedUrl } from "../lib/videoEmbed";

// ————— inline marks —————

function InlineTokens({ text }: { text: string }) {
  return (
    <>
      {parseInline(text).map((token: InlineToken, i: number) => {
        switch (token.kind) {
          case "bold":
            return (
              <strong key={i} style={{ fontWeight: 700, color: "var(--garden-paper)" }}>
                {token.text}
              </strong>
            );
          case "italic":
            return (
              <em key={i} style={{ fontStyle: "italic" }}>
                {token.text}
              </em>
            );
          case "link":
            // Every link here was typed by another person, so it leaves the
            // site in a new tab and carries noopener — the same treatment
            // the story page already gives an author-supplied media link.
            return (
              <a
                key={i}
                href={token.href}
                target="_blank"
                rel="noopener noreferrer nofollow"
                style={{ color: "var(--garden-citron)", textDecoration: "underline", textUnderlineOffset: 2 }}
              >
                {token.text}
              </a>
            );
          default:
            return <span key={i}>{token.text}</span>;
        }
      })}
    </>
  );
}

/** A text block's blank lines are the author's paragraph breaks. Splitting
    here (rather than rendering one <p> with white-space: pre-wrap) keeps
    real paragraph spacing instead of a double line-break. */
function Paragraphs({ text, style }: { text: string; style?: CSSProperties }) {
  const paragraphs = text.split(/\n{2,}/).filter((p) => p.trim());
  return (
    <>
      {paragraphs.map((paragraph, i) => (
        <p
          key={i}
          style={{
            margin: i === 0 ? 0 : "0.85em 0 0",
            fontSize: 15,
            lineHeight: 1.65,
            color: "var(--garden-body)",
            // A single newline inside a paragraph is a deliberate line
            // break (an address, a set list), so it survives.
            whiteSpace: "pre-wrap",
            ...style,
          }}
        >
          <InlineTokens text={paragraph} />
        </p>
      ))}
    </>
  );
}

// ————— media —————

function Caption({ children }: { children: ReactNode }) {
  return (
    <figcaption
      style={{ marginTop: 8, fontSize: 13, lineHeight: 1.5, color: "var(--garden-muted)" }}
    >
      {children}
    </figcaption>
  );
}

function ImageBlock({ block }: { block: Extract<ResolvedRichBlock, { type: "image" }> }) {
  const src = block.resolvedUrl ?? block.url ?? null;
  // A file deleted out from under the document resolves to null. Rendering
  // nothing beats rendering a broken-image icon on someone's project page.
  if (!src || !isSafeHttpUrl(src)) return null;
  return (
    <figure style={{ margin: 0 }}>
      <img
        src={src}
        alt={block.alt ?? block.caption ?? ""}
        loading="lazy"
        style={{
          display: "block",
          width: "100%",
          height: "auto",
          borderRadius: "var(--garden-radius-card, 10px)",
          border: "1px solid var(--garden-hairline)",
        }}
      />
      {block.caption && <Caption>{block.caption}</Caption>}
    </figure>
  );
}

/** 16:9 box an iframe or <video> fills. aspect-ratio rather than a padding
    hack — every browser this app supports has it. */
const FRAME: CSSProperties = {
  display: "block",
  width: "100%",
  aspectRatio: "16 / 9",
  border: "1px solid var(--garden-hairline)",
  borderRadius: "var(--garden-radius-card, 10px)",
  backgroundColor: "var(--garden-ink-raised)",
  overflow: "hidden",
};

/** A reel, a TikTok or a Short is portrait. Full-width portrait video on a
    desktop page is a wall, so it is capped at phone width and centred. */
const PORTRAIT_FRAME: CSSProperties = {
  ...FRAME,
  aspectRatio: "9 / 16",
  maxWidth: 420,
  marginLeft: "auto",
  marginRight: "auto",
};

function VideoBlock({ block }: { block: Extract<ResolvedRichBlock, { type: "video" }> }) {
  const src = block.resolvedUrl ?? block.url ?? null;
  if (!src || !isSafeHttpUrl(src)) return null;

  // An uploaded file plays natively; a pasted watch link goes through the
  // shared resolver (YouTube, Vimeo, Instagram, TikTok — a reel plays here
  // in the platform's own player). Anything else it doesn't recognise
  // fails closed to a link-out, exactly as it does on the event page —
  // Zoom, Meet and friends send frame-ancestors headers that would render
  // an empty box with no visible failure.
  if (block.storageId) {
    return (
      <figure style={{ margin: 0 }}>
        <video controls preload="metadata" src={src} style={{ ...FRAME, objectFit: "contain" }} />
        {block.caption && <Caption>{block.caption}</Caption>}
      </figure>
    );
  }

  const embed = toEmbedUrl(src);
  if (embed) {
    return (
      <figure style={{ margin: 0 }}>
        <iframe
          src={embed.embedUrl}
          title={block.caption || "Embedded video"}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          loading="lazy"
          referrerPolicy="strict-origin-when-cross-origin"
          style={embed.aspect === "9/16" ? PORTRAIT_FRAME : FRAME}
        />
        {block.caption && <Caption>{block.caption}</Caption>}
      </figure>
    );
  }

  return (
    <a
      href={src}
      target="_blank"
      rel="noopener noreferrer nofollow"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "10px 14px",
        borderRadius: "var(--garden-radius-card, 10px)",
        border: "1px solid var(--garden-hairline-raised)",
        fontSize: 14,
        color: "var(--garden-citron)",
      }}
    >
      Watch on {hostOf(src)} →
    </a>
  );
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "the web";
  }
}

// ————— the document —————

export function RichContent({
  blocks,
  className,
  style,
}: {
  blocks: ResolvedRichBlock[] | undefined | null;
  className?: string;
  style?: CSSProperties;
}) {
  if (!blocks?.length) return null;

  return (
    <div
      className={className}
      style={{ display: "flex", flexDirection: "column", gap: 16, ...style }}
    >
      {blocks.map((block, i) => {
        switch (block.type) {
          case "heading": {
            const Tag = block.level === 3 ? "h3" : "h2";
            return (
              <Tag
                key={i}
                style={{
                  margin: 0,
                  fontFamily: "var(--garden-font-display)",
                  fontSize: block.level === 3 ? 17 : 20,
                  lineHeight: 1.3,
                  fontWeight: 600,
                  color: "var(--garden-paper)",
                  // A heading introduces what follows, so it sits closer to
                  // the next block than to the previous one. First block in
                  // the document gets no extra space above it.
                  marginTop: i === 0 ? 0 : 8,
                }}
              >
                <InlineTokens text={block.text} />
              </Tag>
            );
          }

          case "text":
            return (
              <div key={i}>
                <Paragraphs text={block.text} />
              </div>
            );

          case "quote":
            return (
              <blockquote
                key={i}
                style={{
                  margin: 0,
                  paddingLeft: 16,
                  borderLeft: "2px solid var(--garden-citron)",
                }}
              >
                <Paragraphs
                  text={block.text}
                  style={{ fontSize: 16, fontStyle: "italic", color: "var(--garden-muted)" }}
                />
              </blockquote>
            );

          case "list": {
            const Tag = block.ordered ? "ol" : "ul";
            return (
              <Tag
                key={i}
                style={{
                  margin: 0,
                  paddingLeft: 22,
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                  listStyleType: block.ordered ? "decimal" : "disc",
                }}
              >
                {block.items.map((item, j) => (
                  <li
                    key={j}
                    style={{ fontSize: 15, lineHeight: 1.6, color: "var(--garden-body)" }}
                  >
                    <InlineTokens text={item} />
                  </li>
                ))}
              </Tag>
            );
          }

          case "image":
            return <ImageBlock key={i} block={block} />;

          case "video":
            return <VideoBlock key={i} block={block} />;

          case "divider":
            return (
              <hr
                key={i}
                style={{
                  border: 0,
                  borderTop: "1px solid var(--garden-hairline)",
                  margin: "8px 0",
                }}
              />
            );

          default:
            // A block type this build doesn't know about — a row written by
            // a newer deploy, read by an older tab. Skip it silently.
            return null;
        }
      })}
    </div>
  );
}
