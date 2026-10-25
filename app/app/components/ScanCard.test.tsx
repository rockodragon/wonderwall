import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { ScanCard } from "./ScanCard";

// The card above a profile opened from that person's code, for each kind of
// viewer. The queries answer by name; isFavorited is whether the viewer
// already follows Ana.
const scene = vi.hoisted(() => ({ signedIn: false, authLoading: false, following: false as boolean | undefined }));

vi.mock("convex/react", async () => {
  const { getFunctionName } = await import("convex/server");
  return {
    useConvexAuth: () => ({ isAuthenticated: scene.signedIn, isLoading: scene.authLoading }),
    useMutation: () => async () => {},
    useQuery: (fn: Parameters<typeof getFunctionName>[0], args?: unknown) => {
      if (args === "skip") return undefined;
      return getFunctionName(fn) === "favorites:isFavorited" ? scene.following : undefined;
    },
  };
});
vi.mock("@posthog/react", () => ({ usePostHog: () => undefined }));

const ana = { _id: "ana", name: "Ana Reyes" };

/** `owner`: whether the viewer is Ana, or "loading" while that isn't known. */
function card(url: string, owner: "no" | "yes" | "loading" = "no") {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={[url]}>
      <ScanCard profile={ana} isOwner={owner === "loading" ? undefined : owner === "yes"} />
    </MemoryRouter>,
  );
}

function as(viewer: Partial<typeof scene>) {
  Object.assign(scene, { signedIn: false, authLoading: false, following: false }, viewer);
}

describe("ScanCard", () => {
  it("tells someone signed out who invited them, with Join and Sign in coming back here", () => {
    as({ signedIn: false });
    const html = card("/@ana?invite=K7M4QD&ref=f2f");
    expect(html).toContain("Ana invited you to TheCreative.exchange.");
    // Back to this page, still a scan; the invite was kept from the address.
    expect(html).toMatch(/<a [^>]*href="\/signup\?redirect=%2F%40ana%3Fref%3Df2f"[^>]*>Join<\/a>/);
    expect(html).toMatch(/<a [^>]*href="\/login\?redirect=%2F%40ana%3Fref%3Df2f"[^>]*>Sign in<\/a>/);
    expect(html).not.toContain(">Follow<");
  });

  it("offers a member the Follow button", () => {
    as({ signedIn: true, following: false });
    const html = card("/@ana?invite=K7M4QD&ref=f2f");
    expect(html).toContain("You scanned Ana&#x27;s code.");
    expect(html).toMatch(/<button[^>]*>Follow<\/button>/);
    expect(html).not.toContain("Join");
  });

  it("says so once they follow", () => {
    as({ signedIn: true, following: true });
    const html = card("/@ana?ref=f2f");
    expect(html).toContain("You&#x27;re following Ana.");
    expect(html).toContain("Following");
  });

  it("works on /profile/<id> too", () => {
    as({ signedIn: false });
    expect(card("/profile/ana?invite=K7M4QD&ref=f2f")).toContain('href="/signup?redirect=%2Fprofile%2Fana%3Fref%3Df2f"');
  });

  it("isn't there for anyone else", () => {
    as({ signedIn: false });
    expect(card("/@ana")).toBe("");
    expect(card("/@ana?ref=qr")).toBe("");
    as({ signedIn: true });
    expect(card("/@ana")).toBe("");
    // The owner scanning their own code, or before it's known who's looking.
    expect(card("/@ana?ref=f2f", "yes")).toBe("");
    expect(card("/@ana?ref=f2f", "loading")).toBe("");
    as({ signedIn: true, following: undefined });
    expect(card("/@ana?ref=f2f")).toBe("");
    as({ authLoading: true });
    expect(card("/@ana?ref=f2f")).toBe("");
  });

  it("calls a person with no name yet by what they have", () => {
    as({ signedIn: false });
    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={["/@x?ref=f2f"]}>
        <ScanCard profile={{ _id: "x", name: "New User" }} isOwner={false} />
      </MemoryRouter>,
    );
    expect(html).toContain("New User invited you to");
  });
});
