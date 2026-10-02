// How wide a page inside the app shell may be. One place, so a page picks a
// width by what it holds instead of typing its own max-w class.
//
// With the sidebar gone (FF_DESK) pages span the whole window, so each one
// caps and centres itself. Messages is the exception: its thread keeps its
// own column (routes/messages.$conversationId.tsx).
//
//   reading  text and forms: a profile editor, settings, FAQ, a project or
//            class page, the message inbox. 768px.
//   list     browse pages and detail pages with a side rail or a grid: People,
//            Projects, Events, Classes, Works, Following, a profile, an
//            event, a community. 1024px.
//   wide     admin tables only. 1280px.
//
// The classes are written out in full so Tailwind can see them.
export const PAGE_WIDTH = {
  reading: "max-w-3xl",
  list: "max-w-5xl",
  wide: "max-w-7xl",
} as const;

export type PageWidth = keyof typeof PAGE_WIDTH;
