import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { UploadedVideoStill } from "./EmbedStill";

describe("UploadedVideoStill", () => {
  it("is a muted first frame under a play badge, never a player", () => {
    const html = renderToStaticMarkup(<UploadedVideoStill src="https://files.example/a.mp4" badgeSize="sm" />);
    expect(html).toContain('src="https://files.example/a.mp4#t=0.1"');
    expect(html).toContain("muted");
    expect(html).not.toContain("controls");
    expect(html).toContain("w-10 h-10");
  });
});
