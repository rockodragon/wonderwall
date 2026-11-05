# Pieces: one way to add and show work

Rick, 2026-11-04: work added on a profile and media added to a project came
out differently, though "they're basically stored as the same thing". Now
they are the same thing, saved and shown one way.

## What a piece is

A piece is an `artifacts` row: an upload (picture, video, audio) or a link,
with an optional cover picture, title, a few words (`description`, 500
characters) and a voice note. Every piece belongs to a project
(`artifacts.projectId`).

- Sharing work from a profile makes a finished project around its piece.
- Starting a project can bring its first piece ("Show it").
- A project's owner adds more on its page ("Add a piece").

A project made before this may still hold one pasted link on the project row
(`projects.mediaUrl`). Its page shows that link as its first piece; Edit
turns it into a real piece and takes the link off the project in the same
step (`artifacts.addToProject` with `replacesProjectLink`). Jobs and gigs keep
their one link; they have no pieces.

## Links a piece takes

| Link | Plays as | Stored as |
|---|---|---|
| YouTube, Vimeo, Instagram, TikTok | the platform's video player | canonical link, type `video` |
| Bandcamp album or track page | Bandcamp's player (the server reads its number off the page) | the player link, type `audio` |
| Spotify track, album, playlist, episode, show, artist | Spotify's player | `open.spotify.com/<kind>/<id>`, type `audio` |
| SoundCloud track or set (private ones with their s- token) | SoundCloud's player | `soundcloud.com/<artist>/<track>`, type `audio` |
| An audio file's address (.mp3, .wav, …) | the browser's audio player | as pasted, type `audio` |
| Any other web page | a card with the page's picture | as pasted, type `link` |

Event and job link fields still take a video only
(`describeMediaLink(value)`; pieces call it with `"piece"`). Spotify and
SoundCloud stills come from their oEmbed answers, like Vimeo's.

## Where the code is

- Server: `convex/pieces.ts` (`readyPiece` checks a piece and claims its
  files before anything is written; `insertPiece`; `schedulePiecePreview`).
  Callers: `artifacts.create`, `artifacts.addToProject`,
  `garden/projects.createPassionProject` (`piece`). `artifacts.update` edits
  everything the editor shows.
- Players: `convex/musicEmbed.ts`, `convex/videoEmbed.ts`.
- What a pasted link is: `app/lib/mediaLink.ts`.
- Forms: `app/components/piece/usePieceDraft.ts` (state, `readDraft`,
  `updateArgs`), `PieceFields.tsx` (the fields), `PieceEditor.tsx` (Add/Save/
  Remove), used by the start sheet (`ProjectModal`, "Show it"), the project
  page (`ProjectPieces.tsx`) and Settings → Work & Portfolio.
- Showing a piece: `app/components/piece/PieceMedia.tsx` (`pieceDisplay`),
  also behind work samples (`PortfolioSamplePreview`). Card pictures:
  `convex/coverRules.ts`.

`test-support/driftGuard.test.ts` keeps the copies from coming back: a piece's
player, a card's picture, link helpers, the uploaded-video poster and the
error colour each have one home.
