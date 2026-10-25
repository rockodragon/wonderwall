import { describe, expect, it } from "vitest";
import { injectShareHead } from "./shareHead";

const SHELL =
  '<!doctype html><html><head><meta charset="utf-8"><title>TheCreative.exchange</title>' +
  '<meta name="description" content="Create better together."><meta property="og:title" content="TheCreative.exchange">' +
  '<meta name="twitter:card" content="summary_large_image"></head><body><div id="root"></div></body></html>';

describe("injectShareHead", () => {
  it("replaces the shell's own tags with the page's, once each", () => {
    const html = injectShareHead(SHELL, {
      title: 'Ana "Film" Reyes',
      description: "Photographer & more",
      url: "https://thecreative.exchange/@ana",
      image: "https://files.example/ana.jpg",
    });
    expect(html.match(/<title>/g)).toHaveLength(1);
    expect(html).toContain("<title>Ana &quot;Film&quot; Reyes</title>");
    expect(html.match(/property="og:title"/g)).toHaveLength(1);
    expect(html).toContain('<meta property="og:description" content="Photographer &amp; more">');
    expect(html).toContain('<meta property="og:type" content="website">');
    expect(html).toContain('<meta property="og:image" content="https://files.example/ana.jpg">');
    expect(html.match(/name="twitter:card"/g)).toHaveLength(1);
    expect(html).toContain('<meta name="twitter:card" content="summary">');
    expect(html).not.toContain("Create better together.");
    expect(html).not.toContain('rel="canonical"');
    expect(html).not.toContain('name="robots"');
    expect(html.indexOf("</head>")).toBeGreaterThan(html.indexOf('og:url'));
  });

  it("can say what kind of thing it is, where it lives and that it is not for search", () => {
    const html = injectShareHead(SHELL, {
      title: "Ana",
      description: "d",
      url: "https://garden.thecreative.exchange/@ana",
      type: "profile",
      canonical: "https://thecreative.exchange/@ana",
      noindex: true,
    });
    expect(html).toContain('<meta property="og:type" content="profile">');
    expect(html).toContain('<link rel="canonical" href="https://thecreative.exchange/@ana">');
    expect(html).toContain('<meta name="robots" content="noindex">');
    expect(html).not.toContain("og:image");
  });
});
