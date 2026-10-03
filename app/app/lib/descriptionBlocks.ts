// A community's description is one text field in host tools, written the
// way people already type: blank lines between paragraphs, "- " for a
// bullet, "1. " for a numbered item, "## " for a heading, "> " for a quote,
// and **bold** / *italic* / [link](https://…) inside a line. This turns it
// into the block array RichContent.tsx already renders, so a description
// gets the same formatting (and the same no-HTML safety) as a project page
// without a second editor or a new stored format.

import { richDocPlainText, type RichBlock } from "./richText";

const BULLET = /^\s*[-*•]\s+(.*)$/;
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/;
const HEADING = /^\s*(#{1,3})\s+(.*)$/;
const QUOTE = /^\s*>\s?(.*)$/;

export function descriptionBlocks(text: string | null | undefined): RichBlock[] {
  if (!text?.trim()) return [];
  const blocks: RichBlock[] = [];
  let paragraph: string[] = [];
  let list: { items: string[]; ordered: boolean } | null = null;
  let quote: string[] = [];

  const flush = () => {
    if (paragraph.length) blocks.push({ type: "text", text: paragraph.join("\n") });
    if (list) blocks.push({ type: "list", items: list.items, ...(list.ordered ? { ordered: true } : {}) });
    if (quote.length) blocks.push({ type: "quote", text: quote.join("\n") });
    paragraph = [];
    list = null;
    quote = [];
  };

  for (const line of text.replace(/\r\n?/g, "\n").split("\n")) {
    if (!line.trim()) {
      flush();
      continue;
    }
    const heading = line.match(HEADING);
    const bullet = line.match(BULLET);
    const numbered = line.match(NUMBERED);
    const quoted = line.match(QUOTE);
    if (heading) {
      flush();
      blocks.push({ type: "heading", text: heading[2].trim(), level: heading[1].length === 3 ? 3 : 2 });
    } else if (bullet || numbered) {
      const ordered = !bullet;
      if (!list || list.ordered !== ordered) {
        flush();
        list = { items: [], ordered };
      }
      list.items.push((bullet ?? numbered)![1].trim());
    } else if (quoted) {
      if (!quote.length) flush();
      quote.push(quoted[1]);
    } else {
      if (list || quote.length) flush();
      paragraph.push(line.trim());
    }
  }
  flush();
  return blocks;
}

/** The description as plain sentences — for a meta description or anywhere
 * that can't show formatting. */
export function descriptionPlainText(text: string | null | undefined): string {
  return richDocPlainText(descriptionBlocks(text)).replace(/\s+/g, " ").trim();
}
