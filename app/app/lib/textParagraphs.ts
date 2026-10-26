// Plain text's paragraphs: what a host typed into a description or mission,
// split on blank lines. The Garden's home page, its link preview, an invite
// link and an organization's page all read their words this way. Pure, with
// no imports, so the edge (brand/gardenHtml.ts) can use it too.

/** The paragraphs, each passed through `clean` (say, stripInlineMarks) and
 *  trimmed, the empty ones dropped. */
export function textParagraphs(text: string | null | undefined, clean: (paragraph: string) => string = (p) => p): string[] {
  return (text ?? "")
    .split(/\n\s*\n/)
    .map((p) => clean(p).trim())
    .filter(Boolean);
}
