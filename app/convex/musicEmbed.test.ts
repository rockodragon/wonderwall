import { describe, expect, it } from "vitest";
import { bandcampPlayerLink, isAudioFileLink, isBandcampPageLink, toMusicEmbed } from "./musicEmbed";

const PLAYER = "https://bandcamp.com/EmbeddedPlayer/album=3356185885/";

describe("isBandcampPageLink", () => {
  it("is true for an album or a track on an artist's Bandcamp", () => {
    expect(isBandcampPageLink("https://whatadall.bandcamp.com/album/christmas-dall-vol-1")).toBe(true);
    expect(isBandcampPageLink("https://whatadall.bandcamp.com/track/o-little-town?from=embed")).toBe(true);
    expect(isBandcampPageLink("http://WhatADall.bandcamp.com/album/x")).toBe(true);
  });

  it("is false for the artist's front page, the player link, other hosts and lookalikes", () => {
    expect(isBandcampPageLink("https://whatadall.bandcamp.com/")).toBe(false);
    expect(isBandcampPageLink("https://whatadall.bandcamp.com/music")).toBe(false);
    expect(isBandcampPageLink(PLAYER)).toBe(false);
    expect(isBandcampPageLink("https://open.spotify.com/album/1")).toBe(false);
    expect(isBandcampPageLink("https://x.bandcamp.com.evil.example/album/y")).toBe(false);
    expect(isBandcampPageLink("javascript://x.bandcamp.com/album/y")).toBe(false);
    expect(isBandcampPageLink(undefined)).toBe(false);
  });
});

describe("toMusicEmbed", () => {
  it("plays a stored player link, slim and dark, and keeps its canonical form", () => {
    expect(toMusicEmbed(PLAYER)).toEqual({
      kind: "bandcamp",
      embedUrl: `${PLAYER}size=large/bgcol=333333/linkcol=ffffff/tracklist=false/artwork=small/transparent=true/`,
      height: 120,
      maxWidth: 700,
      canonicalUrl: PLAYER,
      item: "album",
    });
  });

  it("reads Bandcamp's own player link, styling and all, down to the album or track", () => {
    const shared = "https://bandcamp.com/EmbeddedPlayer/v=2/track=482758711/size=large/linkcol=0084B4/notracklist=true/twittercard=true/";
    expect(toMusicEmbed(shared)?.canonicalUrl).toBe("https://bandcamp.com/EmbeddedPlayer/track=482758711/");
  });

  it("is null for a page link, another host, or an id that isn't a number", () => {
    expect(toMusicEmbed("https://whatadall.bandcamp.com/album/christmas-dall-vol-1")).toBeNull();
    expect(toMusicEmbed("https://evil.example/EmbeddedPlayer/album=1/")).toBeNull();
    expect(toMusicEmbed('https://bandcamp.com/EmbeddedPlayer/album=1"onload=x/')).toBeNull();
    expect(toMusicEmbed("https://bandcamp.com/EmbeddedPlayer/")).toBeNull();
    expect(toMusicEmbed(undefined)).toBeNull();
  });
});

describe("bandcampPlayerLink", () => {
  it("builds the stored link for digits only", () => {
    expect(bandcampPlayerLink("album", "3356185885")).toBe(PLAYER);
    expect(bandcampPlayerLink("track", "12/../x")).toBeNull();
  });
});

describe("isAudioFileLink", () => {
  it("is true for an audio file, whatever its query", () => {
    expect(isAudioFileLink("https://files.example/mix.mp3")).toBe(true);
    expect(isAudioFileLink("https://files.example/Take%202.WAV?dl=1")).toBe(true);
  });

  it("is false for a music page, which an <audio> can't play", () => {
    expect(isAudioFileLink("https://whatadall.bandcamp.com/album/christmas-dall-vol-1")).toBe(false);
    expect(isAudioFileLink("https://open.spotify.com/track/1")).toBe(false);
    expect(isAudioFileLink("https://soundcloud.com/jane/track")).toBe(false);
    expect(isAudioFileLink(undefined)).toBe(false);
  });
});

describe("toMusicEmbed: Spotify", () => {
  const ID = "4cOdK2wGLETKBW3PvgPWqT";

  it("plays a track compact and a list tall, from the link the app copies", () => {
    expect(toMusicEmbed(`https://open.spotify.com/track/${ID}?si=abc123`)).toEqual({
      kind: "spotify",
      embedUrl: `https://open.spotify.com/embed/track/${ID}?theme=0`,
      height: 152,
      maxWidth: 700,
      canonicalUrl: `https://open.spotify.com/track/${ID}`,
      item: "track",
    });
    expect(toMusicEmbed(`https://open.spotify.com/album/${ID}`)?.height).toBe(352);
    expect(toMusicEmbed(`https://open.spotify.com/playlist/${ID}`)?.item).toBe("playlist");
  });

  it("reads a localized link and a player link down to the same canonical link", () => {
    expect(toMusicEmbed(`https://open.spotify.com/intl-de/track/${ID}`)?.canonicalUrl).toBe(`https://open.spotify.com/track/${ID}`);
    expect(toMusicEmbed(`https://open.spotify.com/embed/track/${ID}?utm_source=generator`)?.canonicalUrl).toBe(
      `https://open.spotify.com/track/${ID}`,
    );
  });

  it("is null for a short link, a page that isn't a work, a bad id, or a lookalike host", () => {
    expect(toMusicEmbed("https://spotify.link/AbCdEf")).toBeNull();
    expect(toMusicEmbed(`https://open.spotify.com/user/${ID}`)).toBeNull();
    expect(toMusicEmbed("https://open.spotify.com/track/short")).toBeNull();
    expect(toMusicEmbed(`https://open.spotify.com/track/${ID}/extra`)).toBeNull();
    expect(toMusicEmbed(`https://open.spotify.com.evil.example/track/${ID}`)).toBeNull();
  });
});

describe("toMusicEmbed: SoundCloud", () => {
  it("plays a track from its link, share tokens and mobile host stripped", () => {
    const track = "https://soundcloud.com/whatadall/o-little-town";
    expect(toMusicEmbed(`https://m.soundcloud.com/whatadall/o-little-town?si=xyz&utm_source=clipboard`)).toEqual({
      kind: "soundcloud",
      embedUrl: `https://w.soundcloud.com/player/?url=${encodeURIComponent(track)}&color=%23ff5500&auto_play=false&hide_related=true&show_comments=false&show_user=true&show_reposts=false&show_teaser=false`,
      height: 166,
      maxWidth: 700,
      canonicalUrl: track,
      item: "track",
    });
  });

  it("plays a set, and a private track or set with its secret token", () => {
    expect(toMusicEmbed("https://soundcloud.com/whatadall/sets/christmas")).toMatchObject({ item: "playlist", height: 352 });
    expect(toMusicEmbed("https://soundcloud.com/whatadall/demo/s-AbC123")?.canonicalUrl).toBe(
      "https://soundcloud.com/whatadall/demo/s-AbC123",
    );
    expect(toMusicEmbed("https://soundcloud.com/whatadall/sets/demo/s-AbC123")?.item).toBe("playlist");
  });

  it("is null for an artist's own pages, the site's pages, short links and odd paths", () => {
    expect(toMusicEmbed("https://soundcloud.com/whatadall")).toBeNull();
    expect(toMusicEmbed("https://soundcloud.com/whatadall/likes")).toBeNull();
    expect(toMusicEmbed("https://soundcloud.com/discover/sets")).toBeNull();
    expect(toMusicEmbed("https://on.soundcloud.com/AbCdE")).toBeNull();
    expect(toMusicEmbed("https://soundcloud.com/whatadall/demo/not-a-token")).toBeNull();
    expect(toMusicEmbed('https://soundcloud.com/whatadall/x"onload=y')).toBeNull();
  });
});

describe("toMusicEmbed: Spotify kinds are its own, never an object's", () => {
  const ID = "4cOdK2wGLETKBW3PvgPWqT";
  it.each(["constructor", "__proto__", "toString", "hasOwnProperty"])("refuses /%s/", (kind) => {
    expect(toMusicEmbed(`https://open.spotify.com/${kind}/${ID}`)).toBeNull();
  });

  it("plays an older playlist link that names its owner", () => {
    expect(toMusicEmbed(`https://open.spotify.com/user/dall/playlist/${ID}`)).toMatchObject({
      item: "playlist",
      canonicalUrl: `https://open.spotify.com/playlist/${ID}`,
    });
  });
});
