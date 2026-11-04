import { ConvexError } from "convex/values";
import { getFunctionName } from "convex/server";
import { describe, expect, it } from "vitest";
import { makeCtx, run, type Row } from "../test-support/convexContext";
import {
  apply,
  backfillArtifactPreviews,
  canonicalMediaUrl,
  parseBandcampPreview,
  parseInstagramPreview,
  schedulePreviewFetch,
  wantsPreviewFetch,
} from "./linkPreview";

const REEL = "https://www.instagram.com/reel/DdSHmHWSDFn/";
const IMAGE = `<meta property="og:image" content="https://scontent.cdninstagram.com/a.jpg" />`;

// The head of a reel page as Instagram serves it to a link crawler
// (checked 2026-09-23 with the Googlebot UA). A browser UA from a server
// gets the login shell instead, which carries none of these tags.
const CRAWLER_HEAD = `<!DOCTYPE html><html><head>
<meta property="og:site_name" content="Instagram" />
<meta property="og:title" content="AK, Sublab, Azaleh on Instagram: &quot;PRESENCE
A Creative Gathering for Worship and Reflection

Tickets at the link in bio&quot;" />
<meta property="og:image" content="https://scontent-ord5-1.cdninstagram.com/v/t51.82787-15/810148653_n.jpg?stp=dst-jpg&amp;_nc_ht=x&amp;oe=68D5B2C1" />
<meta property="og:description" content="63 likes, 4 comments - temple_sd" />
<meta property="og:url" content="${REEL}" />
</head><body></body></html>`;

describe("parseInstagramPreview", () => {
  it("reads the still and the caption's first line as the title", () => {
    expect(parseInstagramPreview(CRAWLER_HEAD, REEL)).toEqual({
      canonicalUrl: REEL,
      title: "PRESENCE",
      imageUrl:
        "https://scontent-ord5-1.cdninstagram.com/v/t51.82787-15/810148653_n.jpg?stp=dst-jpg&_nc_ht=x&oe=68D5B2C1",
    });
  });

  it("accepts content-before-property attribute order", () => {
    const html = `<meta content="https://scontent.cdninstagram.com/a.jpg" property="og:image">`;
    expect(parseInstagramPreview(html, REEL)?.imageUrl).toBe(
      "https://scontent.cdninstagram.com/a.jpg",
    );
  });

  it("clamps a long caption line", () => {
    const long = "x".repeat(200);
    const html = `${IMAGE}<meta property="og:title" content="Jane on Instagram: &quot;${long}&quot;" />`;
    expect(parseInstagramPreview(html, REEL)?.title).toHaveLength(120);
  });

  it("keeps an apostrophe in the title and in the image URL", () => {
    const html = `<meta property="og:title" content="Jane on Instagram: &quot;Don't miss Friday's show&quot;" />
<meta property="og:image" content="https://scontent.cdninstagram.com/v/it's.jpg?oe=1" />`;
    expect(parseInstagramPreview(html, REEL)).toEqual({
      canonicalUrl: REEL,
      title: "Don't miss Friday's show",
      imageUrl: "https://scontent.cdninstagram.com/v/it's.jpg?oe=1",
    });
  });

  it("skips a caption's leading blank lines", () => {
    const html = `${IMAGE}<meta property="og:title" content="Jane on Instagram: &quot;

Second line is the first with words&quot;" />`;
    expect(parseInstagramPreview(html, REEL)?.title).toBe("Second line is the first with words");
  });

  it("gives no title for a captionless post, so 'Jane on Instagram' never names a work", () => {
    const html = `${IMAGE}<meta property="og:title" content="Jane on Instagram" />`;
    expect(parseInstagramPreview(html, REEL)?.title).toBeUndefined();
    // …nor does an og:title that isn't Instagram's shape at all.
    expect(
      parseInstagramPreview(`${IMAGE}<meta property="og:title" content="Instagram" />`, REEL)?.title,
    ).toBeUndefined();
  });

  it("decodes entities once: a caption that spelled out &quot; keeps it", () => {
    const html = `${IMAGE}<meta property="og:title" content="Jane on Instagram: &quot;She said &amp;quot;hi&amp;quot; &amp; left&quot;" />`;
    expect(parseInstagramPreview(html, REEL)?.title).toBe("She said &quot;hi&quot; & left");
  });

  it("returns null for the login shell a browser UA gets, and for a non-https image", () => {
    expect(parseInstagramPreview("<html><head><title>Instagram</title></head></html>", REEL)).toBeNull();
    expect(
      parseInstagramPreview(`<meta property="og:image" content="javascript:alert(1)" />`, REEL),
    ).toBeNull();
  });
});

describe("canonicalMediaUrl", () => {
  it("treats blank as no link", () => {
    expect(canonicalMediaUrl(undefined)).toBeUndefined();
    expect(canonicalMediaUrl("")).toBeUndefined();
    expect(canonicalMediaUrl("   ")).toBeUndefined();
  });

  it("gives a bare host its scheme and keeps an ordinary page as typed", () => {
    expect(canonicalMediaUrl("vimeo.com/123456789")).toBe("https://vimeo.com/123456789");
    expect(canonicalMediaUrl("https://example.com/flyer")).toBe("https://example.com/flyer");
  });

  it("refuses a link that is not a web address, with a reason the client can show", () => {
    let thrown: unknown;
    try {
      canonicalMediaUrl("javascript:alert(1)");
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(ConvexError);
    expect((thrown as ConvexError<{ code: string }>).data.code).toBe("invalid_media_url");
  });

  it("stores a pasted reel in its canonical form, share token dropped", () => {
    expect(
      canonicalMediaUrl("https://www.instagram.com/reel/DdSHmHWSDFn/?stkn=bG0xZ2VsM2dmMDM0"),
    ).toBe(REEL);
  });

  it("keeps a TikTok short link as pasted — the server resolves it when it fetches the still", () => {
    expect(canonicalMediaUrl("https://vm.tiktok.com/ZMabcdef/")).toBe("https://vm.tiktok.com/ZMabcdef/");
  });
});

describe("wantsPreviewFetch", () => {
  it("is true only for the providers a server has to ask", () => {
    expect(wantsPreviewFetch(REEL)).toBe(true);
    expect(wantsPreviewFetch("https://www.tiktok.com/@scout2015/video/6718335390845095173")).toBe(true);
    expect(wantsPreviewFetch("https://vm.tiktok.com/ZMabcdef/")).toBe(true);
    // YouTube's still is derived client-side; Vimeo has none; other links
    // go through the plain og:image scrape, not this module.
    expect(wantsPreviewFetch("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(false);
    expect(wantsPreviewFetch("https://vimeo.com/123456789")).toBe(false);
    expect(wantsPreviewFetch("https://example.com/page")).toBe(false);
    expect(wantsPreviewFetch(undefined)).toBe(false);
  });
});

// ————— Bandcamp (a piece's music link) —————

const ALBUM_PAGE = "https://whatadall.bandcamp.com/album/christmas-dall-vol-1";
const ALBUM_PLAYER = "https://bandcamp.com/EmbeddedPlayer/album=3356185885/";

// The head of an album page as Bandcamp serves it (checked 2026-11-04).
const BANDCAMP_HEAD = `<head>
<meta name="bc-page-properties" content="{&quot;item_type&quot;:&quot;a&quot;,&quot;item_id&quot;:3356185885,&quot;tralbum_page_version&quot;:0}">
<meta property="og:title" content="Christmas DALL Vol.1, by DALL">
<meta property="og:image" content="https://f4.bcbits.com/img/a3871542038_5.jpg">
<meta property="twitter:player" content="https://bandcamp.com/EmbeddedPlayer/v=2/album=3356185885/size=large/linkcol=0084B4/notracklist=true/twittercard=true/">
</head>`;

describe("parseBandcampPreview", () => {
  it("reads the album's player link, its title without the byline, and its cover", () => {
    expect(parseBandcampPreview(BANDCAMP_HEAD)).toEqual({
      canonicalUrl: ALBUM_PLAYER,
      title: "Christmas DALL Vol.1",
      imageUrl: "https://f4.bcbits.com/img/a3871542038_5.jpg",
      stillIfNone: true,
    });
  });

  it("falls back to the twitter:player link when the page has no properties", () => {
    const html = `<meta property="twitter:player" content="https://bandcamp.com/EmbeddedPlayer/v=2/track=482758711/size=large/">`;
    expect(parseBandcampPreview(html)?.canonicalUrl).toBe("https://bandcamp.com/EmbeddedPlayer/track=482758711/");
  });

  it("returns null for a page that names no album or track", () => {
    expect(parseBandcampPreview(`<meta property="og:title" content="DALL">`)).toBeNull();
    const notJson = `<meta name="bc-page-properties" content="{oops">`;
    expect(parseBandcampPreview(notJson)).toBeNull();
  });
});

function scheduledOn(ctx: any) {
  const scheduled: { name: string; args: any }[] = [];
  ctx.scheduler.runAfter = async (_ms: number, fn: unknown, args: any) => {
    scheduled.push({ name: getFunctionName(fn as any), args });
  };
  return scheduled;
}

describe("schedulePreviewFetch for a Bandcamp page", () => {
  it("fetches it for a piece, for its player", async () => {
    const ctx = makeCtx({}, null);
    const scheduled = scheduledOn(ctx);
    await schedulePreviewFetch(ctx as any, "artifact", "artifacts:a" as any, ALBUM_PAGE);
    expect(scheduled).toEqual([
      { name: "linkPreview:fetchPreview", args: { target: "artifact", id: "artifacts:a", url: ALBUM_PAGE } },
    ]);
  });

  it("leaves an event's or a project's link alone, as before", async () => {
    const ctx = makeCtx({}, null);
    const scheduled = scheduledOn(ctx);
    await schedulePreviewFetch(ctx as any, "event", "events:e" as any, ALBUM_PAGE);
    await schedulePreviewFetch(ctx as any, "project", "projects:p" as any, ALBUM_PAGE);
    expect(scheduled).toEqual([]);
  });
});

describe("apply, for a Bandcamp page", () => {
  const PIECE = "artifacts:song";
  const PROJECT = "projects:song";
  const setup = (over: Partial<Row> = {}) => {
    const ctx = makeCtx({
      profiles: [{ _id: "profiles:dall", userId: "users:dall", name: "DALL", interests: [], createdAt: 0 }],
      artifacts: [
        { _id: PIECE, profileId: "profiles:dall", type: "audio", mediaUrl: ALBUM_PAGE, projectId: PROJECT, order: 0, createdAt: 0, ...over },
      ],
      projects: [{ _id: PROJECT, userId: "users:dall", title: "Untitled audio", updatedAt: 0 }],
      uploadClaims: [],
      _storage: [{ _id: "_storage:still", _creationTime: 0 }],
    }, null);
    scheduledOn(ctx);
    return {
      ctx,
      row: () => ctx.store.artifacts.find((r: Row) => r._id === PIECE) as Row,
      project: () => ctx.store.projects.find((r: Row) => r._id === PROJECT) as Row,
    };
  };
  const fetched = {
    target: "artifact" as const,
    id: PIECE,
    sourceUrl: ALBUM_PAGE,
    canonicalUrl: ALBUM_PLAYER,
    title: "Christmas DALL Vol.1",
    imageUrl: "https://files.test/still",
    imageStorageId: "_storage:still" as any,
    stillIfNone: true,
  };

  it("swaps in the player link, fills a blank title and takes the cover when the piece has none", async () => {
    const { ctx, row, project } = setup();
    await run(apply, ctx, fetched);
    expect(row()).toMatchObject({
      mediaUrl: ALBUM_PLAYER,
      title: "Christmas DALL Vol.1",
      ogImageUrl: "https://files.test/still",
      coverStorageId: "_storage:still",
    });
    expect(project().title).toBe("Christmas DALL Vol.1");
  });

  it("keeps the picture a piece already has, and lets the fetched one go", async () => {
    const { ctx, row } = setup({ title: "Christmas DALL, Vol. 1", ogImageUrl: "https://files.test/mine", coverStorageId: "_storage:mine" });
    await run(apply, ctx, fetched);
    expect(row()).toMatchObject({
      mediaUrl: ALBUM_PLAYER,
      title: "Christmas DALL, Vol. 1",
      ogImageUrl: "https://files.test/mine",
      coverStorageId: "_storage:mine",
    });
    expect(ctx.deletedFiles).toEqual(["_storage:still"]);
  });
});

describe("backfillArtifactPreviews", () => {
  it("fetches a Bandcamp page that has a picture but no player, and skips one already a player", async () => {
    const ctx = makeCtx({
      artifacts: [
        { _id: "artifacts:page", type: "link", mediaUrl: ALBUM_PAGE, ogImageUrl: "https://f4.bcbits.com/a.jpg" },
        { _id: "artifacts:player", type: "audio", mediaUrl: ALBUM_PLAYER },
        { _id: "artifacts:site", type: "link", mediaUrl: "https://example.com" },
      ],
    }, null);
    const scheduled = scheduledOn(ctx);
    expect(await run(backfillArtifactPreviews, ctx, {})).toEqual({ scheduled: 1 });
    expect(scheduled.map((s) => s.args.id)).toEqual(["artifacts:page"]);
  });
});
