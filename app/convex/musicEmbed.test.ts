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
