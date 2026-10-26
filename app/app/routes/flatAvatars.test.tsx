import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { StaticRouterProvider, createStaticHandler, createStaticRouter } from "react-router";
import { getFunctionName } from "convex/server";
import { api } from "../../convex/_generated/api";
import { CreateWonderingComposer } from "../components/CreateWonderingComposer";
import { CreateWorkComposer } from "../components/CreateWorkComposer";
import ConversationView from "./messages.$conversationId";
import JobDetail from "./jobs.$id";
import Signup from "./signup";
import WorkDetail from "./work";

// The gray-gradient faces (a white initial at about 2.5:1) are the flat
// PersonAvatar now. Each page below is rendered with the query answers it
// needs, and the face found in its HTML: no gradient, an initial that is
// not white, the size the page had.
let answers: Record<string, unknown> = {};
vi.mock("convex/react", () => ({
  useQuery: (ref: Parameters<typeof getFunctionName>[0], args: unknown) =>
    args === "skip" ? undefined : answers[getFunctionName(ref)],
  useMutation: () => async () => {},
  useAction: () => async () => {},
  useConvexAuth: () => ({ isAuthenticated: false, isLoading: false }),
}));
vi.mock("@convex-dev/auth/react", () => ({
  useAuthActions: () => ({ signIn: async () => {}, signOut: async () => {} }),
}));
vi.mock("@posthog/react", () => ({ usePostHog: () => null }));
// The jobs page is dark behind this flag; its faces still need checking.
vi.mock("../lib/featureFlags", async (original) => ({
  ...(await original<typeof import("../lib/featureFlags")>()),
  FF_JOBS: true,
}));

beforeEach(() => {
  answers = {};
});

const name = (ref: Parameters<typeof getFunctionName>[0]) => getFunctionName(ref);

async function page(path: string, url: string, Component: () => React.ReactNode) {
  const handler = createStaticHandler([{ path, Component }]);
  const context = await handler.query(new Request(`http://localhost${url}`));
  if (context instanceof Response) throw new Error(`redirected to ${context.headers.get("Location")}`);
  const router = createStaticRouter(handler.dataRoutes, context);
  return renderToString(<StaticRouterProvider router={router} context={context} hydrate={false} />);
}

// The round faces that show an initial, as their opening tag and the letter.
function faces(html: string) {
  return [...html.matchAll(/<span([^>]*rounded-full[^>]*)>([^<]*)<\/span>/g)]
    .filter((m) => /\bh-\d+ w-\d+\b/.test(m[1]))
    .map((m) => ({ tag: m[1], initial: m[2] }));
}

function oneFace(html: string, initial: string) {
  const found = faces(html).filter((f) => f.initial === initial);
  expect(found, `a face with the initial ${initial}`).toHaveLength(1);
  return found[0].tag;
}

// What a hand-drawn gray face looked like.
function notTheOldFace(html: string, tag: string) {
  expect(html).not.toContain("from-gray-400");
  expect(html).not.toContain("bg-gradient-to-br from-gray");
  expect(tag).not.toContain("text-white");
  expect(tag).not.toContain("bg-gradient");
}

const STRONG = "color:var(--app-text)";
const GRAY = "text-gray-700 dark:text-gray-200";

describe("the conversation header", () => {
  it("is a 40px face with a bold app-text initial on the raised hairline", async () => {
    answers = {
      [name(api.messaging.getConversation)]: {
        participant: { profileId: "p1", userId: "u1", name: "Mara Ellison", imageUrl: null },
      },
      [name(api.messaging.getMessages)]: { messages: [] },
    };
    const html = await page("/messages/:conversationId", "/messages/c1", ConversationView);
    const tag = oneFace(html, "M");
    notTheOldFace(html, tag);
    expect(tag).toContain("h-10 w-10 text-base");
    expect(tag).toContain("font-bold");
    expect(tag).toContain(STRONG);
    expect(tag).toContain("var(--app-hairline-raised)");
    // The name is the link's text, so the face adds nothing to read.
    expect(html).toContain("Mara Ellison</h1>");
    expect(tag).toContain('aria-hidden="true"');
  });

  it("shows the picture on the same circle when there is one", async () => {
    answers = {
      [name(api.messaging.getConversation)]: {
        participant: { profileId: "p1", userId: "u1", name: "Mara Ellison", imageUrl: "/mara.jpg" },
      },
      [name(api.messaging.getMessages)]: { messages: [] },
    };
    const html = await page("/messages/:conversationId", "/messages/c1", ConversationView);
    expect(html).toMatch(/<img[^>]*src="\/mara\.jpg"[^>]*h-10 w-10 text-base|<img[^>]*h-10 w-10 text-base[^>]*src="\/mara\.jpg"/);
  });
});

describe("a job's applicants and poster", () => {
  const job = {
    _id: "j1",
    title: "Mural for the lobby",
    description: "Paint it.",
    location: "San Diego",
    jobType: "one-time",
    status: "open",
    isPoster: true,
    postAnonymously: false,
    createdAt: 0,
    skills: [],
    poster: { profileId: "p9", name: "Odell Park", imageUrl: null },
  };
  const interest = {
    _id: "i1",
    createdAt: 0,
    note: "",
    status: "pending",
    profile: { _id: "p2", name: "Ines Varga", imageUrl: null, interests: [] },
  };

  it("draws the poster and each applicant as a 48px face with a bold app-text initial", async () => {
    answers = {
      [name(api.jobs.getJob)]: job,
      [name(api.jobs.getJobInterests)]: { interests: [interest] },
      [name(api.jobs.getUserJobInterest)]: null,
    };
    const html = await page("/jobs/:id", "/jobs/j1", JobDetail);
    for (const initial of ["O", "I"]) {
      const tag = oneFace(html, initial);
      notTheOldFace(html, tag);
      expect(tag).toContain("h-12 w-12 text-base");
      expect(tag).toContain("font-bold");
      expect(tag).toContain(STRONG);
    }
  });

  it("names the applicant's face-only link, which used to get its name from the picture's alt", async () => {
    answers = {
      [name(api.jobs.getJob)]: job,
      [name(api.jobs.getJobInterests)]: { interests: [interest] },
      [name(api.jobs.getUserJobInterest)]: null,
    };
    const html = await page("/jobs/:id", "/jobs/j1", JobDetail);
    expect(html).toMatch(/<a[^>]*aria-label="Ines Varga"[^>]*><span[^>]*>I<\/span><\/a>/);
  });
});

describe("a piece's creator card", () => {
  it("is a 56px face in the Tailwind grays, not the old gradient", async () => {
    answers = {
      [name(api.artifacts.get)]: {
        _id: "a1",
        type: "link",
        title: "Field notes",
        mediaUrl: "https://example.com/notes",
        createdAt: 0,
        isOwner: false,
        likeCount: 0,
        hasLiked: false,
        profile: { _id: "p3", name: "Wen Okafor", imageUrl: null, interests: ["sound"] },
      },
    };
    const html = await page("/work/:artifactId", "/work/a1", WorkDetail);
    const tag = oneFace(html, "W");
    notTheOldFace(html, tag);
    expect(tag).toContain("h-14 w-14 text-xl");
    expect(tag).toContain(GRAY);
    expect(tag).toContain("font-medium");
  });
});

describe("the inviter on the sign-up page", () => {
  it("is a 56px face in the Tailwind grays", async () => {
    answers = {
      [name(api.invites.getInviterInfo)]: { name: "Sol Reyes", imageUrl: null, interests: [] },
      [name(api.garden.defaultCommunity.getSignupCommunity)]: { id: "c1", name: "The Garden", inviteOnly: false },
    };
    const html = await page("/signup/:inviteSlug", "/signup/sol", Signup);
    const tag = oneFace(html, "S");
    notTheOldFace(html, tag);
    expect(tag).toContain("h-14 w-14 text-xl");
    expect(tag).toContain(GRAY);
  });

  it("names no one else who joined with the link", async () => {
    answers = {
      [name(api.invites.getInviterInfo)]: { name: "Sol Reyes", imageUrl: null, interests: [] },
      [name(api.garden.defaultCommunity.getSignupCommunity)]: { id: "c1", name: "The Garden", inviteOnly: false },
    };
    const html = await page("/signup/:inviteSlug", "/signup/sol", Signup);
    expect(html).not.toContain("from-purple-400");
    expect(html).not.toContain("Also connected here");
    expect(faces(html)).toHaveLength(1);
  });
});

describe("the composers", () => {
  it("shows the share-your-work prompt with a 40px gray face and its ring", () => {
    answers = { [name(api.profiles.getMyProfile)]: { name: "Tala Brandt", imageUrl: null } };
    const html = renderToString(<CreateWorkComposer />);
    const tag = oneFace(html, "T");
    notTheOldFace(html, tag);
    expect(tag).toContain("h-10 w-10 text-base");
    expect(tag).toContain(GRAY);
    expect(tag).toContain("ring-2 ring-gray-100 dark:ring-gray-600");
    // The button says what it is; the face is decoration.
    expect(html).toContain("Share something you&#x27;ve made...");
  });

  it("shows the wondering prompt with a 40px gray face", () => {
    answers = { [name(api.profiles.getMyProfile)]: { name: "Uma Costa", imageUrl: null } };
    const html = renderToString(<CreateWonderingComposer />);
    const tag = oneFace(html, "U");
    notTheOldFace(html, tag);
    expect(tag).toContain("h-10 w-10 text-base");
    expect(tag).toContain("shrink-0");
    expect(tag).toContain(GRAY);
  });

  it("keeps a picture on the same 40px circle", () => {
    answers = { [name(api.profiles.getMyProfile)]: { name: "Tala Brandt", imageUrl: "/tala.jpg" } };
    expect(renderToString(<CreateWorkComposer />)).toMatch(/<img[^>]*h-10 w-10 text-base/);
    expect(renderToString(<CreateWonderingComposer />)).toMatch(/<img[^>]*h-10 w-10 text-base/);
  });
});
