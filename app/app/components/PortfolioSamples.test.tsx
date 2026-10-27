import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PortfolioSamplePicker, PortfolioSamplePreview, toggleSampleSelection } from "./PortfolioSamples";

const samples = ["one", "two", "three", "four"].map((_id) => ({ _id, type: "text", title: `Sample ${_id}` }));

describe("portfolio evidence shared by application forms", () => {
  it("caps additions while keeping selected samples removable", () => {
    expect(toggleSampleSelection(["one", "two", "three"], "four", 3)).toEqual(["one", "two", "three"]);
    expect(toggleSampleSelection(["one", "two", "three"], "two", 3)).toEqual(["one", "three"]);
    expect(toggleSampleSelection(["one", "three"], "four", 3)).toEqual(["one", "three", "four"]);
    const html = renderToStaticMarkup(<PortfolioSamplePicker samples={samples} selected={["one", "two", "three"]} maximum={3} onChange={() => {}} />);
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(3);
    expect(html.match(/disabled=""/g)).toHaveLength(1);
  });

  it("distinguishes work still loading from an empty portfolio", () => {
    const loading = renderToStaticMarkup(<PortfolioSamplePicker samples={undefined} selected={[]} maximum={3} onChange={() => {}} />);
    expect(loading).toContain("Loading your work");
    const empty = renderToStaticMarkup(<PortfolioSamplePicker samples={[]} selected={[]} maximum={3} onChange={() => {}} />);
    expect(empty).toContain("Add work to your profile");
  });

  it("plays submitted video inline and keeps pasted videos in the platform embed player", () => {
    const uploaded = renderToStaticMarkup(<PortfolioSamplePreview sample={{ type: "video", title: "My editing", mediaUrl: "https://files.example/edit.mp4" }} />);
    expect(uploaded).toContain('<video controls=""');
    expect(uploaded).toContain('src="https://files.example/edit.mp4"');
    const embedded = renderToStaticMarkup(<PortfolioSamplePreview sample={{ type: "link", title: "My cinematography", linkUrl: "https://youtu.be/dQw4w9WgXcQ" }} />);
    expect(embedded).toContain("<iframe");
    expect(embedded).toContain('title="My cinematography"');
    expect(embedded).toContain('loading="lazy"');
  });

  it("supports image, audio and text evidence, and does not create executable link-outs", () => {
    expect(renderToStaticMarkup(<PortfolioSamplePreview sample={{ type: "image", title: "Storyboard", mediaUrl: "https://files.example/boards.jpg" }} />)).toContain('alt="Storyboard"');
    expect(renderToStaticMarkup(<PortfolioSamplePreview sample={{ type: "audio", mediaUrl: "https://files.example/mix.mp3" }} />)).toContain("<audio");
    expect(renderToStaticMarkup(<PortfolioSamplePreview sample={{ type: "text", content: "Scene <one>" }} />)).toContain("Scene &lt;one&gt;");
    const hostile = renderToStaticMarkup(<PortfolioSamplePreview sample={{ type: "link", linkUrl: "javascript:alert(1)" }} />);
    expect(hostile).not.toContain("href=");
    expect(hostile).toContain("no longer available");
  });
});
