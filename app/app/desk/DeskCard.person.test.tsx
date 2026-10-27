import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";

vi.mock("convex/react", () => ({
  useQuery: () => undefined,
  useMutation: () => async () => ({ ok: true }),
  useAction: () => async () => ({ ok: true }),
  useConvexAuth: () => ({ isAuthenticated: false, isLoading: false }),
}));
vi.mock("@posthog/react", () => ({ usePostHog: () => undefined }));

import { DeskCardView } from "./DeskCard";
import { activityCard, directoryCard } from "./deskBrowseCards";
import type { DeskCard } from "./deskCards";
import type { ShortlistPost } from "../lib/shortlist/types";

const NOW = Date.now();
const DAY = 24 * 60 * 60 * 1000;

function followed(latest: ShortlistPost | null): DeskCard {
  const card = directoryCard({ _id: "ana", name: "Ana Reyes", imageUrl: null, interests: ["Photography"] }, true);
  return activityCard(card, { profileId: "ana", name: "Ana Reyes", imageUrl: null, interests: ["Photography"], since: NOW, latest });
}

const post = (extra: Partial<ShortlistPost> = {}): ShortlistPost => ({
  type: "project",
  id: "projects:harbor",
  title: "Harbor Light",
  at: NOW - 2 * DAY,
  thumbUrl: "https://p/harbor.jpg",
  media: "image",
  share: false,
  when: null,
  ...extra,
});

function render(card: DeskCard) {
  return renderToStaticMarkup(
    <MemoryRouter>
      <DeskCardView
        card={card}
        place={{ x: 24, y: 24, w: 243, h: 324, r: 0, opacity: 1, z: 30 }}
        open={false}
        inert={false}
        vh={800}
        onOpen={() => {}}
        onClose={() => {}}
      />
    </MemoryRouter>,
  );
}

describe("A card on Following", () => {
  it("shows what they last posted under their name: its picture, title and when", () => {
    const html = render(followed(post()));
    expect(html).toContain('data-post-thumb="image"');
    expect(html).toContain('src="https://p/harbor.jpg"');
    expect(html).toContain(">Harbor Light<");
    expect(html).toContain(">Started a project · 2d ago<");
    // The discipline up top; FOLLOWING goes without saying on Following.
    expect(html).toContain(">Photography<");
    expect(html).not.toContain(">FOLLOWING<");
    // Said to a screen reader as well.
    expect(html).toContain("Ana Reyes, Started a project · 2d ago, Harbor Light");
  });

  it("marks a recording with no picture with the waveform alone", () => {
    const html = render(followed(post({ thumbUrl: null, media: "audio" })));
    expect(html).toContain('data-post-thumb="audio"');
    expect(html).not.toContain("harbor.jpg");
  });

  it("with nothing posted, is their name alone", () => {
    const html = render(followed(null));
    expect(html).not.toContain("data-post-thumb");
    expect(html).not.toContain("Started a project");
    expect(html).toContain(">Ana Reyes<");
  });
});

// The crimson sprout (components/LeaderBadge.tsx) under the name of a person
// who leads a community, on Everyone and on Following alike.
describe("A card for a community leader", () => {
  const person = (isLeader: boolean) => ({ _id: "ana", name: "Ana Reyes", imageUrl: null, interests: ["Photography"], isLeader });

  it("wears the badge under their name, in words", () => {
    const html = render(directoryCard(person(true), false));
    expect(html).toContain(">community leader<");
    expect(html).toContain("text-[#fb7185]");
    // After the name, before the discipline.
    expect(html.indexOf(">Ana Reyes<")).toBeLessThan(html.indexOf(">community leader<"));
    expect(html.indexOf(">community leader<")).toBeLessThan(html.indexOf(">Photography<"));
  });

  it("says so to a screen reader on the card's button, after the name", () => {
    expect(render(directoryCard(person(true), false))).toContain('aria-label="Ana Reyes, Community leader, Photography"');
  });

  it("wears it on Following too, above what they last posted", () => {
    const card = activityCard(directoryCard(person(true), true), {
      profileId: "ana",
      name: "Ana Reyes",
      imageUrl: null,
      interests: ["Photography"],
      since: NOW,
      latest: { type: "project", id: "projects:harbor", title: "Harbor Light", at: NOW - DAY, thumbUrl: null, media: null, share: false, when: null },
    });
    const html = render(card);
    expect(html.indexOf(">community leader<")).toBeGreaterThan(html.indexOf(">Ana Reyes<"));
    expect(html.indexOf(">community leader<")).toBeLessThan(html.indexOf(">Harbor Light<"));
  });

  it("is a card like any other for everyone else: no badge, the same label", () => {
    const html = render(directoryCard(person(false), false));
    expect(html).not.toContain("community leader");
    expect(html).not.toContain("Community leader");
    expect(html).toContain('aria-label="Ana Reyes, Photography"');
  });
});
