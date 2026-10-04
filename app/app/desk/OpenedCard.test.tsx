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

import type { DeskCard } from "./deskCards";
import { DetailPanel, metaParts } from "./OpenedCard";

describe("metaParts", () => {
  it("splits the meta line into the items it wraps between", () => {
    expect(metaParts("NOV 6 · 6PM · LIGHT CHURCH")).toEqual(["NOV 6", "6PM", "LIGHT CHURCH"]);
    expect(metaParts("Join request · Hymns")).toEqual(["Join request", "Hymns"]);
  });

  it("keeps a single item, and an empty line, whole", () => {
    expect(metaParts("FOLLOWING")).toEqual(["FOLLOWING"]);
    expect(metaParts("")).toEqual([]);
  });

  it("does not split inside an item", () => {
    expect(metaParts("OCT 17 · 5PM · ST. BRIGID'S HALL")).toEqual(["OCT 17", "5PM", "ST. BRIGID'S HALL"]);
  });
});

function event(extra: Partial<DeskCard["detail"]> = {}): DeskCard {
  return {
    id: "event:e1",
    kind: "event",
    href: "/events/e1",
    face: { kicker: "NOV 6", title: "Renaissance is Beginning" },
    detail: { meta: "NOV 6 · 6PM · LIGHT CHURCH", title: "Renaissance is Beginning", host: "Hosted by Ruth", description: "Come.", ...extra },
  } as unknown as DeskCard;
}

function render(card: DeskCard) {
  return renderToStaticMarkup(
    <MemoryRouter>
      <DetailPanel card={card} visible sheet={false} share={0.62} onClose={() => {}} />
    </MemoryRouter>,
  );
}

describe("DetailPanel layout", () => {
  it("reads the same text, with each meta item its own unit", () => {
    const html = render(event());
    expect(html).toContain(">NOV 6 ·</span>");
    expect(html).toContain(">6PM ·</span>");
    expect(html).toContain(">LIGHT CHURCH</span>");
  });

  it("sizes its type and padding by its own width, and never breaks a word early", () => {
    const html = render(event());
    expect(html).toContain("container");
    expect(html).toMatch(/font-size:clamp\(28px,\s*10cqi,\s*44px\)/);
    expect(html).toMatch(/padding:clamp\(24px,\s*10cqi,\s*56px\)/);
    expect(html).toContain("word-break:normal");
    expect(html).not.toContain("break-all");
    expect(html).not.toContain("overflow-wrap:anywhere");
  });
});
