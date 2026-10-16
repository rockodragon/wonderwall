import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { InviteToThis } from "./InviteToThis";

vi.mock("../lib/useInviteLink", () => ({
  useInviteLink: (_variant: string, page?: { path: string }) => ({
    loading: false,
    url: `https://x.test${page?.path}?invite=K7M4QD`,
    copied: false,
    copy: () => {},
    canShare: false,
    share: () => {},
  }),
}));

const html = (url: string, owner: boolean, extra: { needsMedia?: boolean; onAddLink?: () => void } = {}) =>
  renderToStaticMarkup(
    <MemoryRouter initialEntries={[url]}>
      <InviteToThis path="/events/abc" title="Open studio" owner={owner} className="px-6" {...extra} />
    </MemoryRouter>,
  );

describe("InviteToThis", () => {
  it("offers the owner their link right after publishing", () => {
    const markup = html("/events/abc?new=1", true);
    expect(markup).toContain("Invite people");
    expect(markup).toContain("Copy your link");
    expect(markup).toContain('class="px-6"');
  });
  it("shows nothing to anyone else, or later", () => {
    expect(html("/events/abc?new=1", false)).toBe("");
    expect(html("/events/abc", true)).toBe("");
  });
  it("asks a finished piece with nothing to look at for an image or a link first", () => {
    const markup = html("/events/abc?new=1", true, { needsMedia: true, onAddLink: () => {} });
    expect(markup).toContain("Add an image or a link");
    expect(markup).toContain("Add a link");
    expect(markup).not.toContain("Invite people");
    // Without a way to open the edit, the invite card stands.
    expect(html("/events/abc?new=1", true, { needsMedia: true })).toContain("Invite people");
  });
});
