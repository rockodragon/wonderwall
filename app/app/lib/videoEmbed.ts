// Re-export shim — the video link resolver's single source of truth lives on
// the SERVER side (convex/videoEmbed.ts) so the composer's auto-detect, every
// card and player, and artifacts.create's preview scheduling can never drift
// from each other. Same convention as app/app/lib/richText.ts. Pure TS, no
// runtime dependencies.
export * from "../../convex/videoEmbed";
