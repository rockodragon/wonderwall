// The Garden's G as one SVG path on a 32-unit square, with no React, so the
// edge (functions/embed) and the story picture (lib/storyImage.ts) can draw
// the mark too. GardenMark.tsx owns the mark and re-exports this; when the
// member artist draws the final G, this is the one line to change.

export const GARDEN_G_PATH =
  "M23.4 10.4C21.7 8.3 19.1 7 16.2 7C10.8 7 6.6 11.2 6.6 16.5C6.6 21.8 10.8 26 16.2 26C21.2 26 25.2 22.3 25.4 17.2C22.6 17.2 19.8 17.2 17 17.2";
