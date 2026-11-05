// Tests for artifacts.update: editing a portfolio piece (Settings > Works).
//
// The real handlers on the shared in-memory ctx (test-support/convexContext.ts).
// What has to hold: the form sends title and content every time, so media only
// changes when new media is given (an edit of just the title of an uploaded
// picture must not wipe it); a pasted link is canonicalized and refused like
// create does; and a link that changes (or never got a preview) gets one
// fetched, with the old site's preview cleared first so a card never shows
// one site's picture on another's link. A cover belongs to the link it was
// for (so it goes with it), the companion project's mirrored picture goes
// too, and a legacy piece whose stored link isn't canonical isn't "new" the
// next time its title is edited.

import { getFunctionName } from "convex/server";
import { describe, expect, it } from "vitest";
import { makeCtx, run, type Row } from "../test-support/convexContext";
import { addToProject, create, get, getMyArtifacts, remove, setAudioNote, setDescription, update, updateOgImage } from "./artifacts";
import { MAX_DESCRIPTION_LENGTH } from "./pieceNote";

const ME = "users:me";
const OTHER = "users:other";
const PIECE = "artifacts:piece";
const PROJECT = "projects:piece";

const SITE = "https://getupsight.com";
const OLD_SITE = "https://old.example.com";
const REEL = "https://www.instagram.com/reel/DdSHmHWSDFn/";
const REEL_AS_SHARED = `${REEL}?stkn=bG0xZ2VsM2dmMDM0`;

/** What a plain website's fetch left on a card. */
const PREVIEW = { ogImageUrl: "https://old.example.com/og.png", ogTitle: "Old site", ogDescription: "About the old site" };

/** The piece has no preview fields at all (a patch of undefined removes them). */
const expectNoPreview = (r: Row) => {
  expect([r.ogImageUrl, r.ogTitle, r.ogDescription]).toEqual([undefined, undefined, undefined]);
};

const piece = (over: Partial<Row> = {}): Row => ({
  _id: PIECE,
  profileId: "profiles:me",
  type: "link",
  order: 0,
  createdAt: 0,
  ...over,
});

/** One member with one piece (plus whatever stored files exist), and a
 * `scheduled` list of every function the handler scheduled. */
function setup(pieces: Row[], files: string[] = [], viewer: string | null = ME, projects: Row[] = []) {
  const ctx = makeCtx(
    {
      profiles: [
        { _id: "profiles:me", userId: ME, name: "Mia", interests: [], createdAt: 0 },
        { _id: "profiles:other", userId: OTHER, name: "Olu", interests: [], createdAt: 0 },
      ],
      artifacts: pieces,
      projects,
      uploadClaims: [],
      _storage: files.map((_id) => ({ _id, _creationTime: Date.now() })),
    },
    viewer,
  );
  ctx.storage.getUrl = async (id: string) => `https://files.test/${id.split(":")[1]}`;
  const scheduled: { name: string; args: any }[] = [];
  ctx.scheduler.runAfter = async (_ms: number, fn: unknown, args: any) => {
    scheduled.push({ name: getFunctionName(fn as any), args });
  };
  return {
    ctx,
    scheduled,
    row: () => ctx.store.artifacts.find((r: Row) => r._id === PIECE) as Row,
    project: () => ctx.store.projects.find((r: Row) => r._id === PROJECT) as Row,
  };
}

/** Everything scheduled except the embeddings, which edits to a piece's
 * words always queue (its own, and its project's for search). */
const EMBEDDINGS = ["embeddings:embedArtifact", "embeddings:embedProject"];
const fetches = (scheduled: { name: string; args: any }[]) =>
  scheduled.filter((s) => !EMBEDDINGS.includes(s.name));

const OG_FETCH = (url: string) => ({ name: "artifacts:fetchOgImage", args: { artifactId: PIECE, url } });

/** What the form sends when only the title changed: the other fields blank. */
const titleOnly = (extra: Record<string, unknown> = {}) => ({
  artifactId: PIECE,
  title: "Renamed",
  content: undefined,
  mediaUrl: undefined,
  mediaStorageId: undefined,
  ...extra,
});

describe("a title-only edit of an uploaded piece", () => {
  const SENT: [string, Record<string, unknown>][] = [
    ["no link sent", { mediaUrl: undefined }],
    ["an empty link", { mediaUrl: "" }],
    ["a blank link", { mediaUrl: "   " }],
  ];
  const CASES = (["image", "video", "audio"] as const).flatMap((type) =>
    SENT.map(([how, sent]) => [type, how, sent] as const),
  );

  it.each(CASES)("keeps a %s's file and address (%s)", async (type, _how, sent) => {
    const { ctx, scheduled, row } = setup([piece({ type, mediaStorageId: "_storage:pic" })], ["_storage:pic"]);

    await run(update, ctx, titleOnly(sent));

    expect(row()).toMatchObject({ title: "Renamed", mediaStorageId: "_storage:pic" });
    expect(row().mediaUrl).toBeUndefined();
    expect(ctx.deletedFiles).toEqual([]);
    expect((await run(getMyArtifacts, ctx))[0].resolvedMediaUrl).toBe("https://files.test/pic");
    expect(fetches(scheduled)).toEqual([]);
  });

  it("keeps the file when the form sends its id back unchanged", async () => {
    const { ctx, row } = setup([piece({ type: "image", mediaStorageId: "_storage:pic" })], ["_storage:pic"]);
    await run(update, ctx, titleOnly({ mediaStorageId: "_storage:pic" }));
    expect(row().mediaStorageId).toBe("_storage:pic");
    expect(ctx.deletedFiles).toEqual([]);
  });

  it("still edits the title and the words like before", async () => {
    const { ctx, row } = setup([piece({ type: "text", title: "Old", content: "old words" })]);
    await run(update, ctx, titleOnly({ title: "New", content: "new words" }));
    expect(row()).toMatchObject({ title: "New", content: "new words" });
  });
});

describe("new media", () => {
  it("a new upload replaces the file: the old one is deleted, the new one claimed, any link dropped", async () => {
    const { ctx, row } = setup(
      [piece({ type: "image", mediaStorageId: "_storage:old" })],
      ["_storage:old", "_storage:new"],
    );
    await run(update, ctx, titleOnly({ mediaStorageId: "_storage:new" }));
    expect(row().mediaStorageId).toBe("_storage:new");
    expect(row().mediaUrl).toBeUndefined();
    expect(ctx.deletedFiles).toEqual(["_storage:old"]);
    expect(ctx.store.uploadClaims).toMatchObject([{ storageId: "_storage:new", userId: ME }]);
  });

  it("a pasted link replaces an uploaded file: the link is stored canonical, the file dropped and deleted", async () => {
    const { ctx, scheduled, row } = setup(
      [piece({ type: "video", mediaStorageId: "_storage:clip" })],
      ["_storage:clip"],
    );
    await run(update, ctx, titleOnly({ mediaUrl: REEL_AS_SHARED }));
    expect(row().mediaUrl).toBe(REEL);
    expect(row().mediaStorageId).toBeUndefined();
    expect(ctx.deletedFiles).toEqual(["_storage:clip"]);
    expect(fetches(scheduled)).toEqual([
      { name: "linkPreview:fetchPreview", args: { target: "artifact", id: PIECE, url: REEL } },
    ]);
  });

  it("an upload replaces a link: the link and its preview go, and nothing is fetched", async () => {
    const { ctx, scheduled, row } = setup([piece({ type: "video", mediaUrl: OLD_SITE, ...PREVIEW })], ["_storage:clip"]);
    await run(update, ctx, titleOnly({ mediaStorageId: "_storage:clip" }));
    expect(row()).toMatchObject({ mediaStorageId: "_storage:clip" });
    expectNoPreview(row());
    expect(row().mediaUrl).toBeUndefined();
    expect(fetches(scheduled)).toEqual([]);
  });
});

describe("editing a link", () => {
  it("a new link is stored canonical, the old site's preview is cleared, and a fetch is scheduled", async () => {
    const { ctx, scheduled, row } = setup([piece({ mediaUrl: OLD_SITE, ...PREVIEW })]);
    await run(update, ctx, titleOnly({ mediaUrl: "getupsight.com" }));
    expect(row().mediaUrl).toBe(SITE);
    expectNoPreview(row());
    expect(fetches(scheduled)).toEqual([OG_FETCH(SITE)]);
  });

  it("a link added to a piece that had none gets its fetch", async () => {
    const { ctx, scheduled, row } = setup([piece({ type: "link" })]);
    await run(update, ctx, titleOnly({ mediaUrl: SITE }));
    expect(row().mediaUrl).toBe(SITE);
    expect(fetches(scheduled)).toEqual([OG_FETCH(SITE)]);
  });

  it("an Instagram reel goes through the preview fetcher, share token dropped", async () => {
    const { ctx, scheduled, row } = setup([piece({ type: "video", mediaUrl: OLD_SITE, ...PREVIEW })]);
    await run(update, ctx, titleOnly({ mediaUrl: REEL_AS_SHARED }));
    expect(row().mediaUrl).toBe(REEL);
    expectNoPreview(row());
    expect(fetches(scheduled)).toEqual([
      { name: "linkPreview:fetchPreview", args: { target: "artifact", id: PIECE, url: REEL } },
    ]);
  });

  it("a YouTube link needs no fetch, but the old preview still goes", async () => {
    const { ctx, scheduled, row } = setup([piece({ type: "video", mediaUrl: OLD_SITE, ...PREVIEW })]);
    await run(update, ctx, titleOnly({ mediaUrl: "https://youtu.be/dQw4w9WgXcQ" }));
    expect(row().mediaUrl).toContain("youtube.com");
    expectNoPreview(row());
    expect(fetches(scheduled)).toEqual([]);
  });

  it("an unchanged link that never got a preview is fetched again, so pressing Update retries", async () => {
    const { ctx, scheduled, row } = setup([piece({ mediaUrl: SITE })]);
    await run(update, ctx, titleOnly({ mediaUrl: SITE }));
    expect(row().mediaUrl).toBe(SITE);
    expect(fetches(scheduled)).toEqual([OG_FETCH(SITE)]);
  });

  it("the same link typed without https:// is the same link, not a change", async () => {
    const { ctx, scheduled, row } = setup([piece({ mediaUrl: SITE, ...PREVIEW })]);
    await run(update, ctx, titleOnly({ mediaUrl: "getupsight.com" }));
    expect(row()).toMatchObject({ mediaUrl: SITE, ...PREVIEW });
    expect(fetches(scheduled)).toEqual([]);
  });

  it.each([
    ["a title and an image", { ogTitle: undefined, ogImageUrl: PREVIEW.ogImageUrl }],
    ["a title only", { ogTitle: "Old site", ogImageUrl: undefined }],
  ])("an unchanged link that already has a preview (%s) schedules nothing and keeps it", async (_label, have) => {
    const { ctx, scheduled, row } = setup([piece({ mediaUrl: SITE, ...PREVIEW, ...have })]);
    const before = { ...row() };
    await run(update, ctx, titleOnly({ title: before.title, mediaUrl: SITE }));
    expect(fetches(scheduled)).toEqual([]);
    expect(row()).toMatchObject({ ogImageUrl: before.ogImageUrl, ogTitle: before.ogTitle, ogDescription: before.ogDescription });
  });

  it("a text piece with no link schedules no fetch", async () => {
    const { ctx, scheduled } = setup([piece({ type: "text", content: "words" })]);
    await run(update, ctx, titleOnly({ content: "more words" }));
    expect(fetches(scheduled)).toEqual([]);
  });

  it("still queues the embedding when the title or words are sent", async () => {
    const { ctx, scheduled } = setup([piece({ mediaUrl: SITE, ...PREVIEW })]);
    await run(update, ctx, titleOnly({ mediaUrl: SITE }));
    expect(scheduled.map((s) => s.name)).toEqual(["embeddings:embedArtifact"]);
  });
});

describe("a cover belongs to the link it was for", () => {
  // `coverStorageId` holds BOTH a cover the creator uploaded beside a pasted
  // link (create's coverStorageId) AND the still convex/linkPreview.ts copied
  // in for a reel or clip. Nothing says which, so both are treated alike: the
  // cover goes when the link does, and the new link gets its own preview.
  const REEL_B = "https://www.instagram.com/reel/OtherReel1/";
  const withCover = (over: Partial<Row> = {}) =>
    piece({
      type: "video",
      mediaUrl: REEL,
      coverStorageId: "_storage:cover",
      ogImageUrl: "https://files.test/cover",
      ...over,
    });
  const REEL_B_FETCH = { name: "linkPreview:fetchPreview", args: { target: "artifact", id: PIECE, url: REEL_B } };

  it("re-pointing reel A at reel B drops A's still: file deleted, fields cleared, B fetched", async () => {
    // What linkPreview.ts apply leaves on a reel: the still, stored, plus its address.
    const { ctx, scheduled, row } = setup([withCover()], ["_storage:cover"]);
    await run(update, ctx, titleOnly({ mediaUrl: REEL_B }));
    expect(row().mediaUrl).toBe(REEL_B);
    expect(row()).not.toHaveProperty("coverStorageId");
    expectNoPreview(row());
    expect(ctx.deletedFiles).toEqual(["_storage:cover"]);
    expect(fetches(scheduled)).toEqual([REEL_B_FETCH]);
  });

  it("a cover the creator uploaded beside the link goes the same way", async () => {
    // Created with a cover: no fetch ever ran, so there are no title or description either.
    const { ctx, scheduled, row } = setup([withCover({ mediaUrl: OLD_SITE, type: "link" })], ["_storage:cover"]);
    await run(update, ctx, titleOnly({ mediaUrl: SITE }));
    expect(row().mediaUrl).toBe(SITE);
    expect(row()).not.toHaveProperty("coverStorageId");
    expectNoPreview(row());
    expect(ctx.deletedFiles).toEqual(["_storage:cover"]);
    expect(fetches(scheduled)).toEqual([OG_FETCH(SITE)]);
  });

  it("a new link that needs no fetch (YouTube) still loses the old cover", async () => {
    const { ctx, scheduled, row } = setup([withCover()], ["_storage:cover"]);
    await run(update, ctx, titleOnly({ mediaUrl: "https://youtu.be/dQw4w9WgXcQ" }));
    expect(row().mediaUrl).toContain("youtube.com");
    expect(row()).not.toHaveProperty("coverStorageId");
    expectNoPreview(row());
    expect(ctx.deletedFiles).toEqual(["_storage:cover"]);
    expect(fetches(scheduled)).toEqual([]);
  });

  it("an upload that replaces the link takes the cover with it, and nothing is fetched", async () => {
    const { ctx, scheduled, row } = setup([withCover()], ["_storage:cover", "_storage:clip"]);
    await run(update, ctx, titleOnly({ mediaStorageId: "_storage:clip" }));
    expect(row()).toMatchObject({ mediaStorageId: "_storage:clip" });
    expect(row().mediaUrl).toBeUndefined();
    expect(row()).not.toHaveProperty("coverStorageId");
    expectNoPreview(row());
    expect(ctx.deletedFiles).toEqual(["_storage:cover"]);
    expect(fetches(scheduled)).toEqual([]);
  });

  it("clears the old site's title and description with it", async () => {
    const { ctx, row } = setup([withCover({ ogTitle: "Old site", ogDescription: "About" })], ["_storage:cover"]);
    await run(update, ctx, titleOnly({ mediaUrl: REEL_B }));
    expectNoPreview(row());
  });

  describe("a cover file something else still uses is let go, not deleted", () => {
    it("the piece's own file, which the new link already drops, is deleted once", async () => {
      const { ctx, row } = setup([withCover({ mediaStorageId: "_storage:cover" })], ["_storage:cover"]);
      await run(update, ctx, titleOnly({ mediaUrl: REEL_B }));
      expect(row()).toMatchObject({ mediaUrl: REEL_B });
      expect(row()).not.toHaveProperty("mediaStorageId");
      expect(row()).not.toHaveProperty("coverStorageId");
      expect(ctx.deletedFiles).toEqual(["_storage:cover"]);
    });

    it("the file the piece now holds (the new upload is the cover's own file)", async () => {
      const { ctx, row } = setup([withCover()], ["_storage:cover"]);
      await run(update, ctx, titleOnly({ mediaStorageId: "_storage:cover" }));
      expect(row()).toMatchObject({ mediaStorageId: "_storage:cover" });
      expect(row()).not.toHaveProperty("coverStorageId");
      expect(ctx.deletedFiles).toEqual([]);
    });

    it("the companion project's uploaded photo", async () => {
      const { ctx, row, project } = setup(
        [withCover({ projectId: PROJECT })],
        ["_storage:cover"],
        ME,
        [{ _id: PROJECT, userId: ME, title: "Reel", photoStorageId: "_storage:cover" }],
      );
      await run(update, ctx, titleOnly({ mediaUrl: REEL_B }));
      expect(row()).not.toHaveProperty("coverStorageId");
      expect(ctx.deletedFiles).toEqual([]);
      expect(project().photoStorageId).toBe("_storage:cover");
    });
  });

  describe("while the link is the same", () => {
    it("the cover and its file stay, and no fetch is scheduled", async () => {
      const { ctx, scheduled, row } = setup([withCover({ ogTitle: "Old site" })], ["_storage:cover"]);
      await run(update, ctx, titleOnly({ mediaUrl: REEL }));
      expect(row()).toMatchObject({ coverStorageId: "_storage:cover", ogImageUrl: "https://files.test/cover", ogTitle: "Old site" });
      expect(ctx.deletedFiles).toEqual([]);
      expect(fetches(scheduled)).toEqual([]);
    });

    it("no retry either, even with no preview fields to show for it", async () => {
      const { ctx, scheduled, row } = setup([withCover({ ogImageUrl: undefined })], ["_storage:cover"]);
      await run(update, ctx, titleOnly({ mediaUrl: REEL }));
      expect(row()).toMatchObject({ coverStorageId: "_storage:cover" });
      expect(fetches(scheduled)).toEqual([]);
    });

    it("and with no link sent at all", async () => {
      const { ctx, scheduled, row } = setup([withCover()], ["_storage:cover"]);
      await run(update, ctx, titleOnly());
      expect(row()).toMatchObject({ mediaUrl: REEL, coverStorageId: "_storage:cover" });
      expect(ctx.deletedFiles).toEqual([]);
      expect(fetches(scheduled)).toEqual([]);
    });
  });
});

describe("the companion project's picture follows the link", () => {
  // updateOgImage mirrors a fetched picture onto the project only when the
  // project has no real photo of its own, so a stale mirror has to go when the
  // link does, or the new link's picture is never mirrored (projectCover in
  // garden/projectTeam.ts would keep showing the old site's).
  const NEW_PICTURE = "https://getupsight.com/og.png";
  const mirrored = (over: Partial<Row> = {}) => ({
    _id: PROJECT,
    userId: ME,
    title: "Site",
    photoUrl: PREVIEW.ogImageUrl,
    updatedAt: 1,
    ...over,
  });
  const linked = (over: Partial<Row> = {}) => piece({ mediaUrl: OLD_SITE, projectId: PROJECT, ...PREVIEW, ...over });

  it("a new link clears the picture mirrored from the old one, so the new picture is mirrored when it lands", async () => {
    const { ctx, scheduled, row, project } = setup([linked()], [], ME, [mirrored()]);
    await run(update, ctx, titleOnly({ mediaUrl: SITE }));
    expect(project()).not.toHaveProperty("photoUrl");
    expect(project().updatedAt).toBeGreaterThan(1);
    expect(fetches(scheduled)).toEqual([OG_FETCH(SITE)]);

    // The fetch for the new link lands.
    await run(updateOgImage, ctx, { artifactId: PIECE, sourceUrl: SITE, ogImageUrl: NEW_PICTURE, ogTitle: "Upsight" });
    expect(row().ogImageUrl).toBe(NEW_PICTURE);
    expect(project().photoUrl).toBe(NEW_PICTURE);
  });

  it("an upload that replaces the link clears it too", async () => {
    const { ctx, project } = setup([linked()], ["_storage:clip"], ME, [mirrored()]);
    await run(update, ctx, titleOnly({ mediaStorageId: "_storage:clip" }));
    expect(project()).not.toHaveProperty("photoUrl");
  });

  it("a photo the owner uploaded is never touched", async () => {
    const { ctx, project } = setup([linked()], [], ME, [mirrored({ photoStorageId: "_storage:photo" })]);
    await run(update, ctx, titleOnly({ mediaUrl: SITE }));
    expect(project()).toMatchObject({ photoStorageId: "_storage:photo", photoUrl: PREVIEW.ogImageUrl, updatedAt: 1 });
  });

  it("a picture address the owner set (not the mirrored one) is never touched", async () => {
    const { ctx, project } = setup([linked()], [], ME, [mirrored({ photoUrl: "https://photos.test/mine.jpg" })]);
    await run(update, ctx, titleOnly({ mediaUrl: SITE }));
    expect(project()).toMatchObject({ photoUrl: "https://photos.test/mine.jpg", updatedAt: 1 });
  });

  it("a piece that never had a picture leaves the project alone", async () => {
    const { ctx, project } = setup([linked({ ogImageUrl: undefined })], [], ME, [mirrored({ photoUrl: undefined })]);
    await run(update, ctx, titleOnly({ mediaUrl: SITE }));
    expect(project()).toMatchObject({ updatedAt: 1 });
  });

  it("the same link leaves the project's picture alone", async () => {
    const { ctx, project } = setup([linked()], [], ME, [mirrored()]);
    await run(update, ctx, titleOnly({ mediaUrl: OLD_SITE }));
    expect(project()).toMatchObject({ photoUrl: PREVIEW.ogImageUrl, updatedAt: 1 });
  });

  it("a title-only edit with no link sent leaves it alone", async () => {
    const { ctx, project } = setup([linked()], [], ME, [mirrored()]);
    await run(update, ctx, titleOnly());
    expect(project()).toMatchObject({ photoUrl: PREVIEW.ogImageUrl, updatedAt: 1 });
  });
});

describe("a legacy piece whose stored link isn't canonical", () => {
  // Pieces stored before create canonicalized (schemeless `example.com`, an
  // Instagram link with its `?igsh=` share token) must not look "new" when the
  // form sends their link back on a title-only edit: that would delete a
  // file the piece also holds and re-fetch a preview it already has.
  const IGSH = "https://www.instagram.com/reel/DdSHmHWSDFn/?igsh=MXhzbWV4";
  const STORED: [string, string, string][] = [
    ["a schemeless link", "getupsight.com", SITE],
    ["an Instagram link with its share token", IGSH, REEL],
  ];
  const WITH_FILE = [
    ["with no file", undefined],
    ["with a file as well", "_storage:clip"],
  ] as const;

  describe.each(STORED)("%s", (_label, stored, canonical) => {
    describe.each(WITH_FILE)("%s", (_how, file) => {
      const legacy = (over: Partial<Row> = {}) =>
        piece({
          type: "video",
          mediaUrl: stored,
          mediaStorageId: file,
          projectId: PROJECT,
          ...PREVIEW,
          ...over,
        });
      const proj = { _id: PROJECT, userId: ME, title: "Site", photoUrl: PREVIEW.ogImageUrl, updatedAt: 1 };

      it.each([
        ["the stored spelling sent back", stored],
        ["the canonical spelling sent", canonical],
        ["no link sent", undefined],
      ])("a title-only edit (%s) leaves the link, file, preview and project as they were", async (_sent, sent) => {
        const { ctx, scheduled, row, project } = setup([legacy()], file ? [file] : [], ME, [proj]);
        await run(update, ctx, titleOnly({ mediaUrl: sent, mediaStorageId: file }));
        expect(row()).toMatchObject({ title: "Renamed", mediaUrl: stored, ...PREVIEW });
        expect(row().mediaStorageId).toBe(file);
        expect(ctx.deletedFiles).toEqual([]);
        expect(project()).toMatchObject({ photoUrl: PREVIEW.ogImageUrl, updatedAt: 1 });
        expect(fetches(scheduled)).toEqual([]);
      });

      it("with no preview yet, the retry fetch still runs, against the stored link", async () => {
        const { ctx, scheduled, row } = setup(
          [legacy({ ogImageUrl: undefined, ogTitle: undefined, ogDescription: undefined })],
          file ? [file] : [],
        );
        await run(update, ctx, titleOnly({ mediaUrl: canonical, mediaStorageId: file }));
        expect(row()).toMatchObject({ mediaUrl: stored });
        expect(row().mediaStorageId).toBe(file);
        expect(ctx.deletedFiles).toEqual([]);
        expect(fetches(scheduled).map((f) => f.args.url)).toEqual([stored]);
      });

      it("a different link is still a new link", async () => {
        const { ctx, scheduled, row } = setup([legacy()], file ? [file] : [], ME, [proj]);
        await run(update, ctx, titleOnly({ mediaUrl: "https://www.instagram.com/reel/OtherReel1/" }));
        expect(row().mediaUrl).toBe("https://www.instagram.com/reel/OtherReel1/");
        expect(row().mediaStorageId).toBeUndefined();
        expectNoPreview(row());
        expect(ctx.deletedFiles).toEqual(file ? [file] : []);
        expect(fetches(scheduled)).toHaveLength(1);
      });
    });
  });

  it("a stored link that isn't safe to show is simply a different link: replaced, not thrown over", async () => {
    const { ctx, scheduled, row } = setup([piece({ mediaUrl: "javascript:alert(1)" })]);
    await run(update, ctx, titleOnly({ mediaUrl: SITE }));
    expect(row().mediaUrl).toBe(SITE);
    expect(fetches(scheduled)).toEqual([OG_FETCH(SITE)]);
  });

  it("and a title-only edit of it with no link sent leaves it as it was", async () => {
    const { ctx, row } = setup([piece({ mediaUrl: "javascript:alert(1)" })]);
    await run(update, ctx, titleOnly());
    expect(row().mediaUrl).toBe("javascript:alert(1)");
    expect(row().title).toBe("Renamed");
  });
});

describe("refusing a link", () => {
  it.each(["javascript:alert(1)", "ftp://files.example.com/a", "data:text/html,hi"])(
    "%s is refused with a reason a person can read, and nothing is touched",
    async (bad) => {
      const { ctx, scheduled, row } = setup(
        [piece({ type: "video", mediaStorageId: "_storage:clip", title: "Keep" })],
        ["_storage:clip"],
      );
      const before = { ...row() };

      await expect(run(update, ctx, titleOnly({ mediaUrl: bad }))).rejects.toMatchObject({
        data: { code: "invalid_media_url", reason: expect.stringContaining("isn't a link we can show") },
      });

      expect(row()).toEqual(before);
      expect(ctx.deletedFiles).toEqual([]);
      expect(scheduled).toEqual([]);
    },
  );

  it("a new upload isn't held up by a link sent beside it: the upload wins", async () => {
    const { ctx, row } = setup([piece({ type: "image", mediaStorageId: "_storage:old" })], ["_storage:old", "_storage:new"]);
    await run(update, ctx, titleOnly({ mediaStorageId: "_storage:new", mediaUrl: "javascript:alert(1)" }));
    expect(row()).toMatchObject({ mediaStorageId: "_storage:new" });
    expect(row().mediaUrl).toBeUndefined();
  });
});

describe("whose piece it is", () => {
  it("someone else's piece is refused and left as it was", async () => {
    const { ctx, scheduled, row } = setup([piece({ profileId: "profiles:other", mediaUrl: OLD_SITE, ...PREVIEW })]);
    const before = { ...row() };
    await expect(run(update, ctx, titleOnly({ mediaUrl: SITE }))).rejects.toMatchObject({
      data: { code: "forbidden" },
    });
    expect(row()).toEqual(before);
    expect(scheduled).toEqual([]);
  });

  it("signed out is refused", async () => {
    const { ctx } = setup([piece()], [], null);
    await expect(run(update, ctx, titleOnly())).rejects.toMatchObject({ data: { code: "unauthenticated" } });
  });
});

describe("a fetch that lands after the link changed (updateOgImage)", () => {
  const landing = (over: Record<string, unknown> = {}) => ({
    artifactId: PIECE,
    ogImageUrl: "https://old.example.com/og.png",
    ogTitle: "Old site",
    ogDescription: "About the old site",
    ...over,
  });

  it("is dropped when the piece has moved on to another link", async () => {
    const { ctx, row } = setup([piece({ mediaUrl: SITE })]);
    await run(updateOgImage, ctx, landing({ sourceUrl: OLD_SITE }));
    expectNoPreview(row());
  });

  it("is applied when it is for the piece's current link", async () => {
    const { ctx, row } = setup([piece({ mediaUrl: SITE })]);
    await run(updateOgImage, ctx, landing({ sourceUrl: SITE }));
    expect(row()).toMatchObject(PREVIEW);
  });

  it("is applied when it names no link, as a fetch queued before this check was", async () => {
    const { ctx, row } = setup([piece({ mediaUrl: SITE })]);
    await run(updateOgImage, ctx, landing());
    expect(row()).toMatchObject(PREVIEW);
  });
});

// ——————————————————————————————————————————————————————————————
// What the maker says about a piece: a description and a spoken note
// ——————————————————————————————————————————————————————————————

describe("a piece's description", () => {
  it("is saved trimmed by its owner, and blank clears it", async () => {
    const { ctx, row } = setup([piece({ type: "image", mediaStorageId: "_storage:pic" })], ["_storage:pic"]);
    await run(setDescription, ctx, { artifactId: PIECE, description: "  Shot at dawn on the pier.  " });
    expect(row().description).toBe("Shot at dawn on the pier.");
    await run(setDescription, ctx, { artifactId: PIECE, description: "   " });
    expect(row().description).toBeUndefined();
  });

  it("one past the cap is refused with a reason", async () => {
    const { ctx, row } = setup([piece()]);
    await expect(
      run(setDescription, ctx, { artifactId: PIECE, description: "x".repeat(MAX_DESCRIPTION_LENGTH + 1) }),
    ).rejects.toMatchObject({ data: { code: "invalid_input", reason: expect.stringContaining(String(MAX_DESCRIPTION_LENGTH)) } });
    expect(row().description).toBeUndefined();
  });

  it("someone else's piece is refused, and signed out is refused", async () => {
    const theirs = setup([piece({ profileId: "profiles:other" })]);
    await expect(run(setDescription, theirs.ctx, { artifactId: PIECE, description: "mine now" })).rejects.toMatchObject({
      data: { code: "forbidden" },
    });
    expect(theirs.row().description).toBeUndefined();
    const out = setup([piece()], [], null);
    await expect(run(setDescription, out.ctx, { artifactId: PIECE, description: "hi" })).rejects.toMatchObject({
      data: { code: "unauthenticated" },
    });
  });

  it("a Settings edit (update) leaves it alone", async () => {
    const { ctx, row } = setup([piece({ type: "image", mediaStorageId: "_storage:pic", description: "Kept" })], ["_storage:pic"]);
    await run(update, ctx, titleOnly());
    expect(row()).toMatchObject({ title: "Renamed", description: "Kept" });
  });
});

describe("a piece's spoken note", () => {
  it("is claimed and saved, and the page gets its address", async () => {
    const { ctx, row } = setup([piece()], ["_storage:note"]);
    await run(setAudioNote, ctx, { artifactId: PIECE, storageId: "_storage:note" });
    expect(row().audioNoteStorageId).toBe("_storage:note");
    expect(ctx.store.uploadClaims).toMatchObject([{ storageId: "_storage:note", userId: ME }]);
    expect((await run(get, ctx, { artifactId: PIECE }))?.audioNoteUrl).toBe("https://files.test/note");
  });

  it("recording again deletes the old file; removing deletes it too", async () => {
    const { ctx, row } = setup([piece({ audioNoteStorageId: "_storage:old" })], ["_storage:old", "_storage:new"]);
    await run(setAudioNote, ctx, { artifactId: PIECE, storageId: "_storage:new" });
    expect(row().audioNoteStorageId).toBe("_storage:new");
    expect(ctx.deletedFiles).toEqual(["_storage:old"]);
    await run(setAudioNote, ctx, { artifactId: PIECE });
    expect(row().audioNoteStorageId).toBeUndefined();
    expect(ctx.deletedFiles).toEqual(["_storage:old", "_storage:new"]);
  });

  it("sending the note it already has changes nothing", async () => {
    const { ctx, row } = setup([piece({ audioNoteStorageId: "_storage:note" })], ["_storage:note"]);
    await run(setAudioNote, ctx, { artifactId: PIECE, storageId: "_storage:note" });
    expect(row().audioNoteStorageId).toBe("_storage:note");
    expect(ctx.deletedFiles).toEqual([]);
  });

  it("someone else's piece is refused and its note kept", async () => {
    const { ctx, row } = setup([piece({ profileId: "profiles:other", audioNoteStorageId: "_storage:theirs" })], [
      "_storage:theirs",
      "_storage:mine",
    ]);
    await expect(run(setAudioNote, ctx, { artifactId: PIECE })).rejects.toMatchObject({ data: { code: "forbidden" } });
    expect(row().audioNoteStorageId).toBe("_storage:theirs");
    expect(ctx.deletedFiles).toEqual([]);
  });

  it("deleting the piece deletes its note with the work and the cover", async () => {
    const { ctx } = setup(
      [piece({ mediaStorageId: "_storage:pic", coverStorageId: "_storage:cover", audioNoteStorageId: "_storage:note" })],
      ["_storage:pic", "_storage:cover", "_storage:note"],
    );
    await run(remove, ctx, { artifactId: PIECE });
    expect(ctx.deletedFiles).toEqual(["_storage:pic", "_storage:cover", "_storage:note"]);
  });
});

describe("sharing a piece with words and a note (create)", () => {
  it("saves the description trimmed and claims the note", async () => {
    const { ctx } = setup([], ["_storage:pic", "_storage:note"]);
    const id = await run(create, ctx, {
      type: "image",
      mediaStorageId: "_storage:pic",
      description: "  From the harbor series. ",
      audioNoteStorageId: "_storage:note",
    });
    const saved = ctx.store.artifacts.find((r: Row) => r._id === id) as Row;
    expect(saved).toMatchObject({ description: "From the harbor series.", audioNoteStorageId: "_storage:note" });
    expect(ctx.store.uploadClaims.map((c: Row) => c.storageId)).toEqual(["_storage:pic", "_storage:note"]);
  });

  it("a description past the cap is refused before anything is saved", async () => {
    const { ctx } = setup([], ["_storage:pic"]);
    await expect(
      run(create, ctx, { type: "image", mediaStorageId: "_storage:pic", description: "x".repeat(MAX_DESCRIPTION_LENGTH + 1) }),
    ).rejects.toMatchObject({ data: { code: "invalid_input" } });
    expect(ctx.store.artifacts).toEqual([]);
  });
});

describe("a Bandcamp page pasted as a piece", () => {
  const PAGE = "https://whatadall.bandcamp.com/album/christmas-dall-vol-1";
  const PAGE_FETCH = (id: string) => ({ name: "linkPreview:fetchPreview", args: { target: "artifact", id, url: PAGE } });

  it.each(["audio", "link"])("is fetched for its player when posted as %s", async (type) => {
    const { ctx, scheduled } = setup([]);
    const id = await run(create, ctx, { type, title: "Christmas DALL, Vol. 1", mediaUrl: PAGE });
    expect(fetches(scheduled)).toEqual([PAGE_FETCH(id)]);
  });

  it("is fetched even with a cover beside it (the still never replaces the cover)", async () => {
    const { ctx, scheduled } = setup([], ["_storage:cover"]);
    const id = await run(create, ctx, { type: "audio", mediaUrl: PAGE, coverStorageId: "_storage:cover" });
    expect(fetches(scheduled)).toEqual([PAGE_FETCH(id)]);
  });

  it("is fetched again on Update until it has become a player link, then never", async () => {
    const page = setup([piece({ type: "audio", mediaUrl: PAGE, ogImageUrl: "https://files.test/mine" })]);
    await run(update, page.ctx, titleOnly());
    expect(fetches(page.scheduled)).toEqual([PAGE_FETCH(PIECE)]);

    const player = setup([piece({ type: "audio", mediaUrl: "https://bandcamp.com/EmbeddedPlayer/album=3356185885/" })]);
    await run(update, player.ctx, titleOnly());
    expect(fetches(player.scheduled)).toEqual([]);
  });
});

// ——————————————————————————————————————————————————————————————
// One piece, whichever door it came in by (convex/pieces.ts)
// ——————————————————————————————————————————————————————————————

const VIMEO = "https://vimeo.com/76979871";
const TRACK_ID = "4uLU6hMCjMI75M1A2tKUQC";
const SPOTIFY = `https://open.spotify.com/track/${TRACK_ID}`;
const FETCH_PREVIEW = "linkPreview:fetchPreview";

/** setup() plus a project the viewer owns (and optionally others' rows). */
function projectWorld(pieces: Row[] = [], files: string[] = [], projectOver: Partial<Row> = {}, viewer: string | null = ME) {
  return setup(pieces, files, viewer, [
    { _id: PROJECT, userId: ME, kind: "passion", title: "Harbor", status: "active", createdAt: 0, updatedAt: 0, ...projectOver },
  ]);
}

describe("adding a piece to a project (addToProject)", () => {
  it("the owner's piece lands on the project, on their profile, after their last one", async () => {
    const { ctx } = projectWorld([piece({ _id: "artifacts:last", order: 3 })], ["_storage:pic"]);
    const id = await run(addToProject, ctx, { projectId: PROJECT, type: "image", mediaStorageId: "_storage:pic", title: "Dusk" });
    expect(ctx.store.artifacts.find((r: Row) => r._id === id)).toMatchObject({
      projectId: PROJECT,
      profileId: "profiles:me",
      type: "image",
      title: "Dusk",
      mediaStorageId: "_storage:pic",
      order: 4,
    });
    expect(ctx.store.uploadClaims).toMatchObject([{ storageId: "_storage:pic", userId: ME }]);
  });

  it.each([
    ["a Vimeo link", "video", VIMEO],
    ["an Instagram reel", "video", REEL_AS_SHARED],
  ])("%s schedules a still fetch", async (_n, type, mediaUrl) => {
    const { ctx, scheduled } = projectWorld();
    const id = await run(addToProject, ctx, { projectId: PROJECT, type, mediaUrl });
    const canonical = (ctx.store.artifacts.find((r: Row) => r._id === id) as Row).mediaUrl;
    expect(canonical).not.toContain("stkn");
    expect(fetches(scheduled)).toEqual([{ name: FETCH_PREVIEW, args: { target: "artifact", id, url: canonical } }]);
  });

  it("someone who doesn't own the project is refused, and nothing is written", async () => {
    const { ctx, scheduled } = projectWorld([], ["_storage:pic"], {}, OTHER);
    await expect(
      run(addToProject, ctx, { projectId: PROJECT, type: "image", mediaStorageId: "_storage:pic" }),
    ).rejects.toMatchObject({ data: { code: "forbidden" } });
    expect(ctx.store.artifacts).toEqual([]);
    expect(ctx.store.uploadClaims).toEqual([]);
    expect(scheduled).toEqual([]);
  });

  it("a piece with no file and no link is refused", async () => {
    const { ctx } = projectWorld();
    await expect(run(addToProject, ctx, { projectId: PROJECT, type: "video" })).rejects.toMatchObject({
      data: { code: "invalid_input" },
    });
    await expect(run(addToProject, ctx, { projectId: PROJECT, type: "text", content: "  " })).rejects.toMatchObject({
      data: { code: "invalid_input" },
    });
    expect(ctx.store.artifacts).toEqual([]);
  });

  it("replacesProjectLink moves the project's old link off it and deletes its preview file", async () => {
    const { ctx, project } = projectWorld([], ["_storage:preview"], {
      mediaUrl: VIMEO,
      mediaPreviewUrl: "https://files.test/preview",
      mediaPreviewStorageId: "_storage:preview",
    });
    await run(addToProject, ctx, { projectId: PROJECT, type: "video", mediaUrl: VIMEO, replacesProjectLink: true });
    expect(project().mediaUrl).toBeUndefined();
    expect(project().mediaPreviewUrl).toBeUndefined();
    expect(project().mediaPreviewStorageId).toBeUndefined();
    expect(ctx.deletedFiles).toEqual(["_storage:preview"]);
    expect(ctx.store.artifacts).toMatchObject([{ projectId: PROJECT, mediaUrl: VIMEO }]);
  });

  it("without replacesProjectLink the project's link stays", async () => {
    const { ctx, project } = projectWorld([], [], { mediaUrl: VIMEO });
    await run(addToProject, ctx, { projectId: PROJECT, type: "video", mediaUrl: VIMEO });
    expect(project().mediaUrl).toBe(VIMEO);
    expect(ctx.deletedFiles).toEqual([]);
  });
});

describe("editing a piece's words, note, cover and kind (update)", () => {
  it("saves the description trimmed, and an empty one clears it", async () => {
    const { ctx, row } = setup([piece({ type: "text", content: "hi" })]);
    await run(update, ctx, titleOnly({ description: "  Made at dusk. " }));
    expect(row().description).toBe("Made at dusk.");
    await run(update, ctx, titleOnly({ description: "" }));
    expect(row().description).toBeUndefined();
  });

  it("a description past the cap is refused", async () => {
    const { ctx } = setup([piece()]);
    await expect(run(update, ctx, titleOnly({ description: "x".repeat(MAX_DESCRIPTION_LENGTH + 1) }))).rejects.toMatchObject({
      data: { code: "invalid_input" },
    });
  });

  it("a description left out is left as it was", async () => {
    const { ctx, row } = setup([piece({ description: "Keep me" })]);
    await run(update, ctx, titleOnly());
    expect(row().description).toBe("Keep me");
  });

  it("a new voice note replaces the old: the old file is deleted, the new one claimed", async () => {
    const { ctx, row } = setup([piece({ audioNoteStorageId: "_storage:old" })], ["_storage:old", "_storage:new"]);
    await run(update, ctx, titleOnly({ audioNoteStorageId: "_storage:new" }));
    expect(row().audioNoteStorageId).toBe("_storage:new");
    expect(ctx.deletedFiles).toEqual(["_storage:old"]);
    expect(ctx.store.uploadClaims).toMatchObject([{ storageId: "_storage:new", userId: ME }]);
  });

  it("clearAudioNote removes the note and deletes its file", async () => {
    const { ctx, row } = setup([piece({ audioNoteStorageId: "_storage:old" })], ["_storage:old"]);
    await run(update, ctx, titleOnly({ clearAudioNote: true }));
    expect(row().audioNoteStorageId).toBeUndefined();
    expect(ctx.deletedFiles).toEqual(["_storage:old"]);
  });

  it("a note left out is kept", async () => {
    const { ctx, row } = setup([piece({ audioNoteStorageId: "_storage:old" })], ["_storage:old"]);
    await run(update, ctx, titleOnly());
    expect(row().audioNoteStorageId).toBe("_storage:old");
    expect(ctx.deletedFiles).toEqual([]);
  });

  describe("a cover", () => {
    const withCover = () =>
      piece({ type: "video", mediaUrl: REEL, coverStorageId: "_storage:cover", ogImageUrl: "https://files.test/cover" });

    it("a new cover is stored as the still, the old file is deleted, and no still is fetched", async () => {
      const { ctx, scheduled, row } = setup([withCover()], ["_storage:cover", "_storage:new"]);
      await run(update, ctx, titleOnly({ coverStorageId: "_storage:new" }));
      expect(row()).toMatchObject({ coverStorageId: "_storage:new", ogImageUrl: "https://files.test/new" });
      expect(ctx.deletedFiles).toEqual(["_storage:cover"]);
      expect(ctx.store.uploadClaims).toMatchObject([{ storageId: "_storage:new", userId: ME }]);
      expect(fetches(scheduled)).toEqual([]);
    });

    it("a first cover on a piece that had none is stored and fetches nothing", async () => {
      const { ctx, scheduled, row } = setup([piece({ type: "video", mediaUrl: REEL })], ["_storage:new"]);
      await run(update, ctx, titleOnly({ coverStorageId: "_storage:new" }));
      expect(row()).toMatchObject({ coverStorageId: "_storage:new", ogImageUrl: "https://files.test/new" });
      expect(fetches(scheduled)).toEqual([]);
    });

    it("sending the cover it already has changes nothing", async () => {
      const { ctx, row } = setup([withCover()], ["_storage:cover"]);
      await run(update, ctx, titleOnly({ coverStorageId: "_storage:cover" }));
      expect(row()).toMatchObject({ coverStorageId: "_storage:cover", ogImageUrl: "https://files.test/cover" });
      expect(ctx.deletedFiles).toEqual([]);
    });

    it("clearCover removes it, deletes the file, and fetches the link's own still", async () => {
      const { ctx, scheduled, row } = setup([withCover()], ["_storage:cover"]);
      await run(update, ctx, titleOnly({ clearCover: true }));
      expect(row().coverStorageId).toBeUndefined();
      expect(row().ogImageUrl).toBeUndefined();
      expect(ctx.deletedFiles).toEqual(["_storage:cover"]);
      expect(fetches(scheduled)).toEqual([
        { name: FETCH_PREVIEW, args: { target: "artifact", id: PIECE, url: REEL } },
      ]);
    });

    it("changing the link and giving a cover in one edit keeps the cover, and fetches nothing", async () => {
      const REEL_B = "https://www.instagram.com/reel/OtherReel1/";
      const { ctx, scheduled, row } = setup([withCover()], ["_storage:cover", "_storage:new"]);
      await run(update, ctx, titleOnly({ mediaUrl: REEL_B, coverStorageId: "_storage:new" }));
      expect(row()).toMatchObject({ mediaUrl: REEL_B, coverStorageId: "_storage:new", ogImageUrl: "https://files.test/new" });
      expect(ctx.deletedFiles).toEqual(["_storage:cover"]);
      expect(fetches(scheduled)).toEqual([]);
    });

    it("someone else's file can't be a cover", async () => {
      const { ctx, row } = setup([withCover()], ["_storage:cover"]);
      await expect(run(update, ctx, titleOnly({ coverStorageId: "_storage:nope" }))).rejects.toBeTruthy();
      expect(row().coverStorageId).toBe("_storage:cover");
    });
  });

  describe("the kind of piece", () => {
    it("is changed when sent", async () => {
      const { ctx, row } = setup([piece({ type: "link", mediaUrl: SITE })]);
      await run(update, ctx, titleOnly({ type: "audio" }));
      expect(row().type).toBe("audio");
    });

    it("is left alone when not sent", async () => {
      const { ctx, row } = setup([piece({ type: "link", mediaUrl: SITE })]);
      await run(update, ctx, titleOnly());
      expect(row().type).toBe("link");
    });

    it("an unknown one is refused and nothing changes", async () => {
      const { ctx, row } = setup([piece({ type: "link", mediaUrl: SITE })]);
      await expect(run(update, ctx, titleOnly({ type: "bogus" }))).rejects.toMatchObject({ data: { code: "invalid_input" } });
      expect(row()).toMatchObject({ type: "link" });
      expect(row().title).toBeUndefined();
    });
  });
});

describe("a Spotify link shared as a piece (create)", () => {
  it("is stored without its ?si= and fetched for its title and still", async () => {
    const { ctx, scheduled } = setup([]);
    const id = await run(create, ctx, { type: "audio", mediaUrl: `${SPOTIFY}?si=abc123` });
    expect(ctx.store.artifacts.find((r: Row) => r._id === id)).toMatchObject({ mediaUrl: SPOTIFY, type: "audio" });
    expect(fetches(scheduled)).toEqual([{ name: FETCH_PREVIEW, args: { target: "artifact", id, url: SPOTIFY } }]);
  });

  it("is fetched whatever kind the piece was filed as", async () => {
    const { ctx, scheduled } = setup([]);
    const id = await run(create, ctx, { type: "link", mediaUrl: SPOTIFY });
    expect(fetches(scheduled)).toEqual([{ name: FETCH_PREVIEW, args: { target: "artifact", id, url: SPOTIFY } }]);
  });
});

describe("a piece with nothing to show (create)", () => {
  it.each([
    ["a video with no file or link", { type: "video" }],
    ["a link with a blank address", { type: "link", mediaUrl: "   " }],
    ["a text piece with no words", { type: "text", content: "  " }],
  ])("%s is refused and leaves no piece or project", async (_n, args) => {
    const { ctx, scheduled } = setup([]);
    await expect(run(create, ctx, args)).rejects.toMatchObject({ data: { code: "invalid_input" } });
    expect(ctx.store.artifacts).toEqual([]);
    expect(ctx.store.projects).toEqual([]);
    expect(ctx.store.uploadClaims).toEqual([]);
    expect(scheduled).toEqual([]);
  });

  it("an unknown type is refused before anything is claimed", async () => {
    const { ctx } = setup([], ["_storage:pic"]);
    await expect(run(create, ctx, { type: "bogus", mediaStorageId: "_storage:pic" })).rejects.toMatchObject({
      data: { code: "invalid_input" },
    });
    expect(ctx.store.projects).toEqual([]);
    expect(ctx.store.uploadClaims).toEqual([]);
  });
});

// The independent review of the piece editor, 2026-11-04: what an edit has to
// take with it when the work itself changes.
describe("an edit that changes what the work is", () => {
  it("words in place of a link: the link, its still and its cover go", async () => {
    const { ctx, row, scheduled } = setup(
      [piece({ type: "video", mediaUrl: REEL, ogImageUrl: "https://files.test/cover", coverStorageId: "_storage:cover" })],
      ["_storage:cover"],
    );
    await run(update, ctx, titleOnly({ type: "text", content: "My words" }));
    expect(row()).toMatchObject({ type: "text", content: "My words" });
    expect(row().mediaUrl).toBeUndefined();
    expect(row()).not.toHaveProperty("coverStorageId");
    expect(row().ogImageUrl).toBeUndefined();
    expect(ctx.deletedFiles).toEqual(["_storage:cover"]);
    expect(fetches(scheduled)).toEqual([]);
  });

  it("words in place of an uploaded file: the file is deleted", async () => {
    const { ctx, row } = setup([piece({ type: "audio", mediaStorageId: "_storage:song" })], ["_storage:song"]);
    await run(update, ctx, titleOnly({ type: "text", content: "Lyrics" }));
    expect(row()).toMatchObject({ type: "text", content: "Lyrics" });
    expect(row()).not.toHaveProperty("mediaStorageId");
    expect(ctx.deletedFiles).toEqual(["_storage:song"]);
  });

  it("a new upload in place of a covered upload takes the old cover with it", async () => {
    const { ctx, row } = setup(
      [piece({ type: "video", mediaStorageId: "_storage:clip", coverStorageId: "_storage:cover", ogImageUrl: "https://files.test/cover" })],
      ["_storage:clip", "_storage:cover", "_storage:pic"],
    );
    await run(update, ctx, titleOnly({ type: "image", mediaStorageId: "_storage:pic" }));
    expect(row()).toMatchObject({ type: "image", mediaStorageId: "_storage:pic" });
    expect(row()).not.toHaveProperty("coverStorageId");
    expect(row().ogImageUrl).toBeUndefined();
    expect(ctx.deletedFiles.sort()).toEqual(["_storage:clip", "_storage:cover"]);
  });

  it("a new cover picked in the same edit as new media is kept", async () => {
    const { ctx, row } = setup(
      [piece({ type: "video", mediaStorageId: "_storage:clip", coverStorageId: "_storage:old", ogImageUrl: "https://files.test/old" })],
      ["_storage:clip", "_storage:old", "_storage:song", "_storage:new"],
    );
    await run(update, ctx, titleOnly({ type: "audio", mediaStorageId: "_storage:song", coverStorageId: "_storage:new" }));
    expect(row()).toMatchObject({ coverStorageId: "_storage:new", ogImageUrl: "https://files.test/new" });
    expect(ctx.deletedFiles.sort()).toEqual(["_storage:clip", "_storage:old"]);
  });
});
