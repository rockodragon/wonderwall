import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import type { CoverPick } from "../lib/useCoverPick";
import { InviteToThis } from "./InviteToThis";

const device = vi.hoisted(() => ({ canShare: false }));

vi.mock("../lib/useInviteLink", () => ({
  useInviteLink: (_variant: string, page?: { path: string }) => ({
    loading: false,
    url: `https://x.test${page?.path}?invite=K7M4QD`,
    copied: false,
    copy: () => {},
    canShare: device.canShare,
    share: () => {},
  }),
}));

const idle: CoverPick = { pick: () => {}, picker: null, error: null, busy: false };

const html = (
  url: string,
  owner: boolean,
  extra: { needsMedia?: boolean; onAddLink?: () => void; picture?: CoverPick } = {},
) =>
  renderToStaticMarkup(
    <MemoryRouter initialEntries={[url]}>
      <InviteToThis path={url.split("?")[0]} title="Open studio" owner={owner} className="px-6" {...extra} />
    </MemoryRouter>,
  );

describe("InviteToThis", () => {
  it("offers the owner their link right after publishing", () => {
    const markup = html("/events/abc?new=1", true);
    expect(markup).toContain("Invite people");
    expect(markup).toContain("Invite a friend");
    expect(markup).not.toContain("Copy your link");
    expect(markup).toContain('class="px-6"');
  });
  it("puts the invite buttons in order: Invite a friend, Share…, Say who you need, Done", () => {
    device.canShare = true;
    try {
      const markup = html("/projects/abc?new=1", true);
      const order = ["Invite a friend", "Share…", "Say who you need", "Done"].map((label) => markup.indexOf(label));
      expect(order.every((i) => i > -1)).toBe(true);
      expect(order).toEqual([...order].sort((a, b) => a - b));
    } finally {
      device.canShare = false;
    }
  });
  it("leaves out Share… where the device can't share, and Say who you need off a project's page", () => {
    expect(html("/projects/abc?new=1", true)).not.toContain("Share…");
    expect(html("/events/abc?new=1", true)).not.toContain("Say who you need");
  });
  it("shows nothing to anyone else, or later", () => {
    expect(html("/events/abc?new=1", false)).toBe("");
    expect(html("/events/abc", true)).toBe("");
  });
  it("asks a project with nothing to look at for a picture or a link first", () => {
    const markup = html("/projects/abc?new=1", true, { needsMedia: true, picture: idle, onAddLink: () => {} });
    expect(markup).toContain("Add a picture or a link");
    expect(markup).toContain("Add a picture");
    expect(markup).toContain("Add a link");
    expect(markup).toContain("Done");
    expect(markup).not.toContain("Invite people");
    expect(markup).not.toContain("Invite a friend");
  });
  it("uploads the picture right there, from a hidden image-only file input", () => {
    const markup = html("/projects/abc?new=1", true, { needsMedia: true, picture: idle, onAddLink: () => {} });
    expect(markup).toMatch(/<input[^>]*type="file"[^>]*accept="image\/\*"[^>]*hidden/);
  });
  it("shows the upload going, and says why a picture didn't go up under the card", () => {
    const busy = html("/projects/abc?new=1", true, {
      needsMedia: true,
      picture: { ...idle, busy: true },
      onAddLink: () => {},
    });
    expect(busy).toContain("Uploading…");
    expect(busy).not.toContain(">Add a picture<");
    expect(busy).toMatch(/<button[^>]*disabled[^>]*>Uploading…/);

    const failed = html("/projects/abc?new=1", true, {
      needsMedia: true,
      picture: { ...idle, error: "Pictures up to 20 MB." },
      onAddLink: () => {},
    });
    expect(failed).toContain('role="alert"');
    expect(failed).toContain("Pictures up to 20 MB.");
    expect(failed.indexOf("Done")).toBeLessThan(failed.indexOf("Pictures up to 20 MB."));
  });
  it("offers only the way it has: no picture upload, no 'Add a picture'; no link, no 'Add a link'", () => {
    const linkOnly = html("/projects/abc?new=1", true, { needsMedia: true, onAddLink: () => {} });
    expect(linkOnly).toContain("Add a link");
    expect(linkOnly).not.toContain(">Add a picture<");
    const pictureOnly = html("/projects/abc?new=1", true, { needsMedia: true, picture: idle });
    expect(pictureOnly).toContain(">Add a picture<");
    expect(pictureOnly).not.toContain("Add a link");
    // With neither, the invite card stands.
    expect(html("/projects/abc?new=1", true, { needsMedia: true })).toContain("Invite people");
  });
  it("gives way to the invite card once there is something to look at", () => {
    const markup = html("/projects/abc?new=1", true, { needsMedia: false, picture: idle, onAddLink: () => {} });
    expect(markup).toContain("Invite people");
    expect(markup).toContain("Invite a friend");
    expect(markup).not.toContain("Add a picture");
  });
  it("asks nobody but the owner, and only right after publishing", () => {
    const extra = { needsMedia: true, picture: idle, onAddLink: () => {} };
    expect(html("/projects/abc?new=1", false, extra)).toBe("");
    expect(html("/projects/abc", true, extra)).toBe("");
  });
});
