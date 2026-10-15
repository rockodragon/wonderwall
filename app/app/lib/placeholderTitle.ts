// "Untitled image", "Untitled video"… are what the artifact migration
// (convex/garden/artifactsMigration.ts) stored when a piece had no title. They
// are placeholders, not names: show nothing rather than a wall of "Untitled".
export function isPlaceholderTitle(title: string | null | undefined): boolean {
  const t = title?.trim();
  return !t || /^untitled(\s+(image|video|audio|link))?$/i.test(t);
}

/** The title to show, or undefined when the author gave none. */
export function shownTitle(title: string | null | undefined): string | undefined {
  return isPlaceholderTitle(title) ? undefined : title!.trim();
}
