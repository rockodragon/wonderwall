// functions/embed/[handle].ts: the profile card other sites frame. Static
// HTML, framing allowed, noindex, everything escaped. (The test lives here
// because any file under functions/ becomes a route.)

import { afterEach, describe, expect, it, vi } from "vitest";
import { EMBED_WORKS, onRequestGet, onRequestHead } from "../functions/embed/[handle]";

const ANA = {
  _id: "profiles:ana",
  name: "Ana Reyes",
  handle: "ana",
  interests: ["Photography", "Film", "Music", "Dance"],
  location: "San Diego, CA",
  imageUrl: "https://thecreative.exchange/media/face1234",
  artifacts: [
    { _id: "a1", type: "image", mediaUrl: "https://thecreative.exchange/media/loose111", createdAt: 1 },
    { _id: "a2", type: "image", projectId: "p1", mediaUrl: "https://thecreative.exchange/media/inproj11", createdAt: 2 },
  ],
};

const PROJECTS = [
  { projectId: "p1", title: "Bloom.", imageUrl: "https://thecreative.exchange/media/bloom111" },
  { projectId: "p2", title: "No picture", imageUrl: null },
];

type Answers = { profile?: unknown; projects?: unknown; profileDown?: boolean; projectsDown?: boolean };

/** Convex's HTTP query API, answering by function name. */
function convex({ profile = ANA, projects = PROJECTS, profileDown = false, projectsDown = false }: Answers = {}) {
  const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
    const { path } = JSON.parse(String(init.body)) as { path: string };
    if (path === "profiles:getProfileByHandle") {
      if (profileDown) throw new Error("offline");
      return Response.json({ status: "success", value: profile });
    }
    if (projectsDown) return new Response("nope", { status: 500 });
    return Response.json({ status: "success", value: projects });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function context(segment: string, query = "") {
  return {
    request: new Request(`https://thecreative.exchange/embed/${segment}${query}`),
    params: { handle: segment },
    env: { CONVEX_URL: "https://convex.test" },
  };
}

const bodyOf = (call: unknown[]) => JSON.parse(String((call[1] as RequestInit).body));

afterEach(() => vi.unstubAllGlobals());

describe("/embed/@handle", () => {
  it("draws the compact card by default: one line, no works, and no works lookup", async () => {
    const fetchMock = convex();
    const res = await onRequestGet(context("@ana"));
    const html = await res.text();

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(html).toContain('<main class="card compact">');
    expect(html).toContain('<h1 class="name">Ana Reyes</h1>');
    expect(html).toContain('<p class="meta">Photography · Film · Music</p>');
    expect(html).not.toContain("San Diego, CA");
    expect(html).not.toContain('<ul class="works">');
    expect(html).toContain(
      '<a class="cta" href="https://thecreative.exchange/@ana?ref=embed" target="_blank" rel="noopener">See my work</a>',
    );
    expect(html).not.toMatch(/<script/i);
  });

  it("with ?works, draws the card: photo, name, what they do and where, works, and the way to the portfolio", async () => {
    const fetchMock = convex();
    const res = await onRequestGet(context("@ana", "?works"));
    const html = await res.text();

    expect(res.status).toBe(200);
    expect(bodyOf(fetchMock.mock.calls[0])).toMatchObject({ path: "profiles:getProfileByHandle", args: { handle: "ana" } });
    expect(bodyOf(fetchMock.mock.calls[1])).toMatchObject({
      path: "garden/projectTeam:listAffiliations",
      args: { profileId: "profiles:ana" },
    });
    expect(String(fetchMock.mock.calls[0][0])).toBe("https://convex.test/api/query");

    expect(html).toContain('<h1 class="name">Ana Reyes</h1>');
    expect(html).toContain('<img class="face" src="https://thecreative.exchange/media/face1234"');
    expect(html).toContain('<p class="meta">Photography · Film · Music</p>');
    expect(html).toContain('<p class="meta">San Diego, CA</p>');
    // The project with a picture, then the piece with no project; the piece
    // inside the project and the project with no picture are left out.
    expect(html).toContain(
      '<a href="https://thecreative.exchange/projects/p1?ref=embed" target="_blank" rel="noopener"><img src="https://thecreative.exchange/media/bloom111" alt="Bloom."',
    );
    expect(html).toContain('src="https://thecreative.exchange/media/loose111" alt="Work by Ana Reyes"');
    expect(html).not.toContain("inproj11");
    expect(html.match(/<li>/g)).toHaveLength(2);
    expect(html).toContain(
      '<a class="cta" href="https://thecreative.exchange/@ana?ref=embed" target="_blank" rel="noopener">See my portfolio</a>',
    );
    expect(html).not.toMatch(/<script/i);
  });

  it("may be framed anywhere, isn't for search engines, and is cached a few minutes", async () => {
    convex();
    const res = await onRequestGet(context("@ana"));
    expect(res.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(res.headers.get("x-frame-options")).toBeNull();
    expect(res.headers.get("content-security-policy")).toContain("frame-ancestors *");
    expect(res.headers.get("content-security-policy")).toContain("default-src 'none'");
    expect(res.headers.get("x-robots-tag")).toBe("noindex, noai, noimageai");
    expect(res.headers.get("tdm-reservation")).toBe("1");
    expect(res.headers.get("cache-control")).toBe("public, max-age=300");
  });

  it("escapes everything a person wrote", async () => {
    convex({
      profile: {
        ...ANA,
        name: `<script>alert("x")</script> & co`,
        location: `"><img src=x onerror=alert(1)>`,
        interests: ["<b>bold</b>"],
        imageUrl: `https://x.test/a.jpg" onerror="alert(1)`,
        artifacts: [],
      },
      projects: [{ projectId: `p"1`, title: `<i>"Quotes"</i>`, imageUrl: "https://x.test/p.jpg" }],
    });
    const html = await (await onRequestGet(context("@ana", "?works"))).text();
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toContain("<b>");
    expect(html).not.toContain("<i>");
    expect(html).not.toContain("<img src=x");
    expect(html).not.toContain('" onerror="');
    expect(html).toContain("&quot;&gt;&lt;img src=x onerror=alert(1)&gt;");
    expect(html).toContain('src="https://x.test/a.jpg&quot; onerror=&quot;alert(1)"');
    expect(html).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; co");
    expect(html).toContain("<title>&lt;script&gt;");
    expect(html).toContain('alt="&lt;i&gt;&quot;Quotes&quot;&lt;/i&gt;"');
    expect(html).toContain("/projects/p%221?ref=embed");
  });

  it("serves stored pictures through /media and leaves out ones that aren't https", async () => {
    convex({
      profile: { ...ANA, imageUrl: "https://happy-otter-123.convex.cloud/api/storage/abc-123-def", artifacts: [] },
      projects: [
        { projectId: "p1", imageUrl: "http://plain.example/p.jpg" },
        { projectId: "p2", imageUrl: "javascript:alert(1)" },
      ],
    });
    const html = await (await onRequestGet(context("@ana", "?works"))).text();
    expect(html).toContain('src="https://thecreative.exchange/media/abc-123-def"');
    expect(html).not.toContain("convex.cloud");
    expect(html).not.toContain("plain.example");
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain('<ul class="works">');
  });

  it("shows three works at most", async () => {
    convex({
      profile: { ...ANA, artifacts: [] },
      projects: Array.from({ length: 9 }, (_, i) => ({ projectId: `p${i}`, imageUrl: `https://x.test/${i}.jpg` })),
    });
    const html = await (await onRequestGet(context("@ana", "?works"))).text();
    expect(html.match(/<li>/g)).toHaveLength(EMBED_WORKS);
    expect(EMBED_WORKS).toBe(3);
  });

  it("draws initials without a photo, and the card without works when that lookup fails", async () => {
    convex({ profile: { ...ANA, imageUrl: null }, projectsDown: true });
    const res = await onRequestGet(context("@ana", "?works"));
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('<span class="face initials" aria-hidden="true">AR</span>');
    // The loose piece still comes from the profile itself.
    expect(html.match(/<li>/g)).toHaveLength(1);
  });

  it("links to the current address when an old one was asked for", async () => {
    convex();
    const html = await (await onRequestGet(context("@ana.old"))).text();
    expect(html).toContain('href="https://thecreative.exchange/@ana?ref=embed"');
  });

  it("shows the Not found card for an address nobody has, one that breaks the rules, or no address", async () => {
    const nobody = convex({ profile: null });
    const res = await onRequestGet(context("@nobody"));
    const html = await res.text();
    expect(res.status).toBe(404);
    expect(html).toContain('<p class="name">Not found</p>');
    expect(nobody).toHaveBeenCalledTimes(1);
    expect(res.headers.get("x-frame-options")).toBeNull();
    expect(res.headers.get("content-security-policy")).toContain("frame-ancestors *");
    expect(res.headers.get("x-robots-tag")).toContain("noindex");

    for (const segment of ["@a..b", "ana", "%40", "@settings"]) {
      const fetchMock = convex();
      const r = await onRequestGet(context(segment));
      expect(r.status, segment).toBe(404);
      expect(await r.text(), segment).toContain("Not found");
      expect(fetchMock, segment).not.toHaveBeenCalled();
    }
  });

  it("says it can't show the card when Convex can't be reached, and doesn't cache that", async () => {
    convex({ profileDown: true });
    const res = await onRequestGet(context("@ana"));
    expect(res.status).toBe(503);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.text()).toContain("Can't show this right now");
  });

  it("answers HEAD with the same status and headers", async () => {
    convex();
    const res = await onRequestHead(context("@ana"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-security-policy")).toContain("frame-ancestors *");
    expect(await res.text()).toBe("");
  });
});
