import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { qrMatrix, qrSvg } from "../lib/qrCode";
import { MyCodePage } from "./code";

// /code for a member with an address, one without, and before the invite
// slug exists. The queries answer by name.
const scene = vi.hoisted(() => ({
  me: { _id: "k57ana", name: "Ana Reyes", handle: "ana" as string | undefined, imageUrl: null as string | null },
  slug: "K7M4QD" as string | null,
}));

vi.mock("convex/react", async () => {
  const { getFunctionName } = await import("convex/server");
  return {
    useMutation: () => async () => {},
    useQuery: (fn: Parameters<typeof getFunctionName>[0], args?: unknown) => {
      if (args === "skip") return undefined;
      switch (getFunctionName(fn)) {
        case "profiles:getMyProfile":
          return scene.me;
        case "invites:getMyInviteLink":
          return { slug: scene.slug, usageCount: 0 };
        default:
          return undefined;
      }
    },
  };
});
vi.mock("@posthog/react", () => ({ usePostHog: () => undefined }));

const html = () =>
  renderToStaticMarkup(
    <MemoryRouter initialEntries={["/code"]}>
      <MyCodePage />
    </MemoryRouter>,
  );

/** The QR code's picture, decoded back to its SVG. */
function qrSvgOf(markup: string): string {
  const src = markup.match(/<img [^>]*src="data:image\/svg\+xml;charset=utf-8,([^"]+)"[^>]*alt="QR code/)?.[1];
  if (!src) throw new Error("no QR code");
  return decodeURIComponent(src.replace(/&amp;/g, "&"));
}

describe("/code", () => {
  it("shows the code with the photo, name, address and the two lines", () => {
    scene.me = { ...scene.me, handle: "ana" };
    scene.slug = "K7M4QD";
    const markup = html();
    expect(markup).toContain("Ana Reyes");
    expect(markup).toContain("@ana");
    expect(markup).toContain("Scan to follow me");
    expect(markup).toContain("New here? It brings you in with my invite.");
    expect(markup).toContain("thecreative.exchange/@ana");
    // The picture is the code for the address with the invite and ref=f2f.
    expect(qrSvgOf(markup)).toBe(qrSvg(qrMatrix("https://thecreative.exchange/@ana?invite=K7M4QD&ref=f2f"), 2));
    expect(markup).not.toContain("/settings#address");
  });

  it("without an address, still shows the code and says where to claim one", () => {
    scene.me = { ...scene.me, handle: undefined };
    scene.slug = "K7M4QD";
    const markup = html();
    expect(markup).toContain("Scan to follow me");
    expect(qrSvgOf(markup)).toBe(qrSvg(qrMatrix("https://thecreative.exchange/profile/k57ana?invite=K7M4QD&ref=f2f"), 2));
    expect(markup).toContain('href="/settings#address"');
  });

  it("waits for the invite before drawing a code", () => {
    scene.me = { ...scene.me, handle: "ana" };
    scene.slug = null;
    const markup = html();
    expect(markup).toContain("Getting your code ready");
    expect(markup).not.toContain("data:image/svg+xml");
  });
});
