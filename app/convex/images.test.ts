// Tests for images.ts: the one place a stored file or a pasted link becomes
// the address a page draws.
//
// First each helper on its own, with storage.getUrl stubbed per test. Then
// the real handlers on makeCtx (test-support/convexContext.ts), because the
// bugs were wiring, not the helpers: an uploaded avatar never reached a
// project's byline, a project whose stored photo stopped resolving came back
// blank instead of using its pasted link, and the event page ignored the
// gallery image the cards fall back to.

import { describe, expect, it } from "vitest";
import { makeCtx, run, type Row } from "../test-support/convexContext";
import {
  eventCoverUrl,
  orgLogoUrl,
  profileImageUrl,
  projectPhotoUrl,
  storedOrExternalUrl,
} from "./images";
import { getProject, listProjects } from "./garden/projects";
import { get as getEvent, list as listEvents } from "./events";
import { getOffering } from "./offerings";

/** A ctx whose storage knows only the ids it's given; every other id
 * resolves to null, as a deleted file does. */
function storageOf(urls: Record<string, string>, asked: string[] = []) {
  return {
    storage: {
      getUrl: async (id: string) => {
        asked.push(id);
        return urls[id] ?? null;
      },
    },
  } as any;
}

const sid = (s: string) => s as never;

describe("storedOrExternalUrl", () => {
  it("the stored file's URL when it resolves", async () => {
    const ctx = storageOf({ s1: "https://files/s1" });
    expect(await storedOrExternalUrl(ctx, sid("s1"), undefined)).toBe("https://files/s1");
  });

  it("the stored file wins over a pasted link", async () => {
    const ctx = storageOf({ s1: "https://files/s1" });
    expect(await storedOrExternalUrl(ctx, sid("s1"), "https://example.com/pasted.jpg")).toBe("https://files/s1");
  });

  it("a pasted link alone is returned without touching storage", async () => {
    const asked: string[] = [];
    const ctx = storageOf({}, asked);
    expect(await storedOrExternalUrl(ctx, undefined, "https://example.com/pasted.jpg")).toBe(
      "https://example.com/pasted.jpg",
    );
    expect(asked).toEqual([]);
  });

  it("a stored file that no longer resolves falls back to the pasted link", async () => {
    const ctx = storageOf({});
    expect(await storedOrExternalUrl(ctx, sid("gone"), "https://example.com/pasted.jpg")).toBe(
      "https://example.com/pasted.jpg",
    );
  });

  it("a lookup that throws falls back too, not a failed query", async () => {
    const ctx = {
      storage: {
        getUrl: async () => {
          throw new Error("storage unavailable");
        },
      },
    } as any;
    expect(await storedOrExternalUrl(ctx, sid("s1"), "https://example.com/pasted.jpg")).toBe(
      "https://example.com/pasted.jpg",
    );
  });

  it("nothing at all is null, never undefined or an empty string", async () => {
    const ctx = storageOf({});
    expect(await storedOrExternalUrl(ctx, undefined, undefined)).toBeNull();
    expect(await storedOrExternalUrl(ctx, null, null)).toBeNull();
    expect(await storedOrExternalUrl(ctx, sid("gone"), "")).toBeNull();
  });
});

describe("profileImageUrl", () => {
  it("an uploaded avatar resolves — the case the raw imageUrl missed", async () => {
    // files.ts clears imageUrl when a photo is uploaded.
    const ctx = storageOf({ av: "https://files/av" });
    expect(await profileImageUrl(ctx, { imageStorageId: sid("av") })).toBe("https://files/av");
  });

  it("the upload wins over an older pasted link", async () => {
    const ctx = storageOf({ av: "https://files/av" });
    expect(await profileImageUrl(ctx, { imageStorageId: sid("av"), imageUrl: "https://old/pic.jpg" })).toBe(
      "https://files/av",
    );
  });

  it("a pasted link alone is returned", async () => {
    expect(await profileImageUrl(storageOf({}), { imageUrl: "https://old/pic.jpg" })).toBe("https://old/pic.jpg");
  });

  it("an upload that no longer resolves falls back to the link", async () => {
    expect(
      await profileImageUrl(storageOf({}), { imageStorageId: sid("gone"), imageUrl: "https://old/pic.jpg" }),
    ).toBe("https://old/pic.jpg");
  });

  it("no profile, or no picture, is null", async () => {
    expect(await profileImageUrl(storageOf({}), null)).toBeNull();
    expect(await profileImageUrl(storageOf({}), undefined)).toBeNull();
    expect(await profileImageUrl(storageOf({}), {})).toBeNull();
  });
});

describe("projectPhotoUrl", () => {
  it("the uploaded photo, then the pasted link, then null", async () => {
    const ctx = storageOf({ ph: "https://files/ph" });
    expect(await projectPhotoUrl(ctx, { photoStorageId: sid("ph"), photoUrl: "https://x/y.jpg" })).toBe(
      "https://files/ph",
    );
    expect(await projectPhotoUrl(ctx, { photoUrl: "https://x/y.jpg" })).toBe("https://x/y.jpg");
    expect(await projectPhotoUrl(ctx, {})).toBeNull();
  });

  it("a stored photo that doesn't resolve uses the pasted link, not a blank", async () => {
    expect(await projectPhotoUrl(storageOf({}), { photoStorageId: sid("gone"), photoUrl: "https://x/y.jpg" })).toBe(
      "https://x/y.jpg",
    );
  });
});

describe("eventCoverUrl", () => {
  const ctx = storageOf({ cover: "https://files/cover", g1: "https://files/g1", g2: "https://files/g2" });

  it("the cover image first", async () => {
    expect(await eventCoverUrl(ctx, { coverImageStorageId: sid("cover"), imageStorageIds: [sid("g1")] })).toBe(
      "https://files/cover",
    );
  });

  it("no cover: the first gallery image", async () => {
    expect(await eventCoverUrl(ctx, { imageStorageIds: [sid("g1"), sid("g2")] })).toBe("https://files/g1");
  });

  it("a cover that no longer resolves falls through to the gallery", async () => {
    expect(await eventCoverUrl(ctx, { coverImageStorageId: sid("gone"), imageStorageIds: [sid("g1")] })).toBe(
      "https://files/g1",
    );
  });

  it("one lookup when the cover resolves", async () => {
    const asked: string[] = [];
    await eventCoverUrl(storageOf({ cover: "https://files/cover" }, asked), {
      coverImageStorageId: sid("cover"),
      imageStorageIds: [sid("g1")],
    });
    expect(asked).toEqual(["cover"]);
  });

  it("no pictures, or an empty gallery, is null", async () => {
    expect(await eventCoverUrl(ctx, {})).toBeNull();
    expect(await eventCoverUrl(ctx, { imageStorageIds: [] })).toBeNull();
  });
});

describe("orgLogoUrl", () => {
  it("the stored logo, or null", async () => {
    const ctx = storageOf({ logo: "https://files/logo" });
    expect(await orgLogoUrl(ctx, { logoStorageId: sid("logo") })).toBe("https://files/logo");
    expect(await orgLogoUrl(ctx, {})).toBeNull();
    expect(await orgLogoUrl(ctx, { logoStorageId: sid("gone") })).toBeNull();
  });
});

// ——————————————————————————————————————————————————————————————
// The handlers
// ——————————————————————————————————————————————————————————————

const LEAD = "users:lead";

/** Storage that resolves the ids it's given, on a makeCtx. */
function withStorage(ctx: any, urls: Record<string, string>) {
  ctx.storage.getUrl = async (id: string) => urls[id] ?? null;
  return ctx;
}

function projectWorld(
  project: Record<string, unknown> = {},
  profile: Record<string, unknown> = {},
): Record<string, Row[]> {
  return {
    profiles: [{ _id: "profiles:lead", userId: LEAD, name: "Lead", interests: ["music"], ...profile }],
    projects: [
      {
        _id: "projects:p1",
        userId: LEAD,
        kind: "passion",
        title: "Garden mural",
        status: "active",
        createdAt: 1,
        ...project,
      },
    ],
    artifacts: [],
    projectSupport: [],
    projectRoles: [],
    patronTiers: [],
    gigSeries: [],
    hostOrgs: [],
  };
}

describe("a project's creator and photo", () => {
  it("getProject shows an uploaded avatar on the creator (it used to be blank)", async () => {
    const data = projectWorld({}, { imageStorageId: "_storage:avatar" });
    const ctx = withStorage(makeCtx(data, null), { "_storage:avatar": "https://files/avatar" });
    const project = await run(getProject, ctx, { projectId: "projects:p1" });
    expect(project.creator.imageUrl).toBe("https://files/avatar");
  });

  it("listProjects shows it too, and a pasted avatar still shows when nothing was uploaded", async () => {
    const uploaded = withStorage(makeCtx(projectWorld({}, { imageStorageId: "_storage:avatar" }), null), {
      "_storage:avatar": "https://files/avatar",
    });
    const [a] = await run(listProjects, uploaded);
    expect(a.creator.imageUrl).toBe("https://files/avatar");

    const pasted = makeCtx(projectWorld({}, { imageUrl: "https://old/pic.jpg" }), null);
    const [b] = await run(listProjects, pasted);
    expect(b.creator.imageUrl).toBe("https://old/pic.jpg");
  });

  it("a project whose stored photo doesn't resolve falls back to its pasted photoUrl", async () => {
    const data = projectWorld({ photoStorageId: "_storage:gone", photoUrl: "https://example.com/pasted.jpg" });
    const one = await run(getProject, makeCtx(data, null), { projectId: "projects:p1" });
    expect(one.resolvedPhotoUrl).toBe("https://example.com/pasted.jpg");
    const [listed] = await run(listProjects, makeCtx(data, null));
    expect(listed.resolvedPhotoUrl).toBe("https://example.com/pasted.jpg");
  });

  it("a stored photo that resolves still wins over the pasted link", async () => {
    const data = projectWorld({ photoStorageId: "_storage:ph", photoUrl: "https://example.com/pasted.jpg" });
    const ctx = withStorage(makeCtx(data, null), { "_storage:ph": "https://files/ph" });
    const one = await run(getProject, ctx, { projectId: "projects:p1" });
    expect(one.resolvedPhotoUrl).toBe("https://files/ph");
  });
});

describe("a class's teacher and photo", () => {
  const offeringWorld = (offering: Record<string, unknown>, profile: Record<string, unknown>): Record<string, Row[]> => ({
    profiles: [{ _id: "profiles:lead", userId: LEAD, name: "Lead", interests: [], ...profile }],
    offerings: [
      {
        _id: "offerings:o1",
        userId: LEAD,
        title: "Drawing",
        status: "active",
        createdAt: 1,
        ...offering,
      },
    ],
    offeringSignups: [],
    hostOrgs: [],
  });

  it("getOffering shows the teacher's uploaded avatar and falls back to the pasted photo", async () => {
    const data = offeringWorld(
      { photoStorageId: "_storage:gone", photoUrl: "https://example.com/class.jpg" },
      { imageStorageId: "_storage:avatar" },
    );
    const ctx = withStorage(makeCtx(data, null), { "_storage:avatar": "https://files/avatar" });
    const offering = await run(getOffering, ctx, { offeringId: "offerings:o1" });
    expect(offering.creator.imageUrl).toBe("https://files/avatar");
    expect(offering.photoUrl).toBe("https://example.com/class.jpg");
  });
});

describe("an event's cover", () => {
  const HOST = "users:host";
  const eventWorld = (event: Record<string, unknown>): Record<string, Row[]> => ({
    users: [{ _id: HOST, name: "Host" }],
    profiles: [{ _id: "profiles:h", userId: HOST, name: "Host", imageStorageId: "_storage:host" }],
    hostOrgs: [],
    events: [
      {
        _id: "events:e1",
        organizerId: HOST,
        title: "Showcase",
        description: "",
        datetime: Date.now() + 7 * 24 * 3600000,
        status: "published",
        accessType: "public",
        requiresApproval: false,
        tags: [],
        location: "Somewhere",
        ...event,
      },
    ],
    eventRsvps: [],
    eventApplications: [],
    eventWaitlist: [],
    ticketPurchases: [],
    communityMembers: [],
    memberships: [],
  });
  const urls = { "_storage:g1": "https://files/g1", "_storage:host": "https://files/host" };

  it("the event page shows the first gallery image when there is no cover, like the cards", async () => {
    const data = eventWorld({ imageStorageIds: ["_storage:g1"] });
    const page = await run(getEvent, withStorage(makeCtx(data, null), urls), { eventId: "events:e1" });
    const [card] = await run(listEvents, withStorage(makeCtx(data, null), urls), {});
    expect(card.coverImageUrl).toBe("https://files/g1");
    expect(page.coverImageUrl).toBe("https://files/g1");
  });

  it("the organizer's uploaded avatar shows on the event page", async () => {
    const data = eventWorld({});
    const page = await run(getEvent, withStorage(makeCtx(data, null), urls), { eventId: "events:e1" });
    expect(page.organizer.imageUrl).toBe("https://files/host");
  });
});
