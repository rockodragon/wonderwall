// Re-export shim — the music link resolver lives on the SERVER side
// (convex/musicEmbed.ts) so the piece page and linkPreview.ts can't drift.
// Same convention as app/app/lib/videoEmbed.ts.
export * from "../../convex/musicEmbed";
