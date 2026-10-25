import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { ProfileShareKit } from "./ProfileShareKit";

vi.mock("@posthog/react", () => ({ usePostHog: () => undefined }));

const html = (handle: string | null) =>
  renderToStaticMarkup(
    <MemoryRouter>
      <ProfileShareKit profile={{ name: "Ana Reyes", handle, imageUrl: null, artifacts: [] }} projects={[]} onClose={() => {}} />
    </MemoryRouter>,
  );

describe("ProfileShareKit", () => {
  it("without an address, says one is needed and where to choose it", () => {
    const markup = html(null);
    expect(markup).toContain("Sharing needs an address of your own");
    expect(markup).toContain('href="/settings#address"');
    expect(markup).not.toContain("QR code");
  });

  it("with one, offers the link, the QR code, the story picture and the website code", () => {
    const markup = html("ana");
    expect(markup).toContain("thecreative.exchange/@ana");
    for (const label of ["Copy link", "For Instagram bio", "For Linktree", "For your website", "Download PNG", "Download SVG", "Copy code"]) {
      expect(markup, label).toContain(label);
    }
    expect(markup).toContain('src="https://thecreative.exchange/embed/@ana"');
    expect(markup).toContain("thecreative.exchange/@ana?ref=badge");
  });
});
