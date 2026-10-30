import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { getFunctionName } from "convex/server";
import { api } from "../../convex/_generated/api";
import { stashProjectTitle } from "../lib/shareProject";
import Onboarding from "./onboarding";

// The onboarding screens as a member sees them, one step to a page: the
// step comes from ?step=, the answers from the profile. A server render runs
// no effects and takes no taps, so what a button does lives in the pure
// helpers' tests (lib/onboardingSteps, lib/useHandleCheck); this is what each
// step shows, and which steps a link may open.
let answers: Record<string, unknown> = {};
vi.mock("convex/react", () => ({
  // An answer is given whatever the arguments, "skip" included: the address
  // check only asks once an effect has run, and none do here.
  useQuery: (ref: Parameters<typeof getFunctionName>[0]) => answers[getFunctionName(ref)],
  useMutation: () => async () => {},
  // The mic's pick (onboardingAssist.pickFromSpeech): never called in a
  // server render.
  useAction: () => async () => ({ interests: [], line: "" }),
  useConvexAuth: () => ({ isAuthenticated: true, isLoading: false }),
}));
vi.mock("@posthog/react", () => ({ usePostHog: () => undefined }));
// Whether the browser can listen: never in a server render, unless a test
// says so to see the mic.
let canListen = false;
vi.mock("../lib/useSpeech", async (original) => ({
  ...(await original<typeof import("../lib/useSpeech")>()),
  useSpeechSupported: () => canListen,
}));

const name = (ref: Parameters<typeof getFunctionName>[0]) => getFunctionName(ref);

// A brand-new Google account: a real name, nothing else.
const NEW_MEMBER = { _id: "p1", userId: "u1", name: "Ana Reyes", imageUrl: null };
// Someone who finished onboarding and is back to change their answers.
const creative = { ...NEW_MEMBER, primaryRole: "creative", bio: "Muralist.", interests: ["Art"] };
const patron = { ...NEW_MEMBER, primaryRole: "patron", supportInterests: ["Music"] };
const partner = { ...NEW_MEMBER, primaryRole: "partner", partnerOfferings: ["Venue / space"] };

// The step 4 title is read from the browser's storage; there is none here.
function fakeStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
}

beforeEach(() => {
  vi.stubGlobal("localStorage", fakeStorage());
  answers = {
    [name(api.profiles.getMyProfile)]: creative,
    [name(api.garden.defaultCommunity.getSignupCommunity)]: { id: "c1", name: "The Garden", inviteOnly: false },
    [name(api.garden.communities.listMyCommunities)]: [],
  };
});
afterEach(() => {
  vi.unstubAllGlobals();
});

/** The page at /onboarding?step=N, as plain markup. */
function page(step?: string | number) {
  const url = step === undefined ? "/onboarding" : `/onboarding?step=${step}`;
  return renderToString(
    <MemoryRouter initialEntries={[url]}>
      <Onboarding />
    </MemoryRouter>,
  ).replace(/<!-- -->/g, "");
}

const heading = (html: string) => html.match(/<h1[^>]*>(.*?)<\/h1>/)?.[1].replace(/&#x27;/g, "'");
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ");
// The stepper: what a screen reader hears for the bar, its numbers, how many
// segments are filled, and the step's name under it.
const bar = (html: string) => html.match(/<div[^>]*role="progressbar"[^>]*>/)?.[0];
const progress = (html: string) => bar(html)?.match(/aria-label="(Step \d of \d)"/)?.[1];
const filled = (html: string) => (html.match(/scale-x-100/g) ?? []).length;
const segments = (html: string) => (html.match(/scale-x-(?:0|100)/g) ?? []).length;
const stepName = (html: string) => html.match(/role="progressbar".*?<\/div><p [^>]*>(.*?)<\/p>/s)?.[1].replace(/&#x27;/g, "'");
const buttons = (html: string) => [...html.matchAll(/<button[^>]*type="submit"[^>]*>(.*?)<\/button>/g)].map((m) => m[1]);

describe("a creative's four steps", () => {
  it("1: what brings you here, with the three doors and the first of four", () => {
    const html = page();
    expect(heading(html)).toBe("What brings you here?");
    expect(progress(html)).toBe("Step 1 of 4");
    for (const door of ["I make things", "I back creatives", "I have a space or resources"]) {
      expect(text(html)).toContain(door);
    }
    // Their earlier door is chosen; there is no Back on the first step.
    expect(html).toMatch(/aria-checked="true"[^>]*>(?:(?!<button).)*I make things/s);
    expect(html).not.toContain(">Back<");
  });

  it("2: set up your page, with a photo, their name and an address", () => {
    const html = page(2);
    expect(heading(html)).toBe("Set up your page");
    expect(progress(html)).toBe("Step 2 of 4");
    expect(text(html)).toContain("Add a photo");
    expect(html).toMatch(/<input[^>]*id="onboarding-name"[^>]*value="Ana Reyes"/);
    expect(text(html)).toContain("thecreative.exchange/@");
    expect(buttons(html)).toEqual(["Continue"]);
  });

  it("3: about you, a line and what they're into", () => {
    const html = page(3);
    expect(heading(html)).toBe("About you");
    expect(progress(html)).toBe("Step 3 of 4");
    expect(html).toMatch(/<textarea[^>]*id="onboarding-bio"[^>]*rows="2"[^>]*>Muralist\.<\/textarea>/);
    expect(text(html)).toContain("What are you into?");
    expect(html).toMatch(/aria-pressed="true"[^>]*>(?:(?!<button).)*Art</s);
    // A maker goes on to the project, so this is Continue, not the end.
    expect(buttons(html)).toEqual(["Continue"]);
  });

  it("4: what are you working on, the last of four", () => {
    const html = page(4);
    expect(heading(html)).toBe("Got a project to share?");
    expect(progress(html)).toBe("Step 4 of 4");
    for (const stage of ["Thinking about it", "Working on it", "Finished it"]) expect(text(html)).toContain(stage);
    expect(text(html)).toContain("then everyone can see it.");
    expect(buttons(html)).toEqual(["Share it"]);
    // Someone back to change their answers saves, rather than "Not yet".
    expect(text(html)).toContain("Save");
    expect(text(html)).not.toContain("Not yet");
  });

  it("puts a Back link on every step after the first, to the step before it", () => {
    expect(page(2)).toMatch(/<a [^>]*href="\/onboarding"[^>]*>(?:(?!<\/a>).)*Back<\/a>/s);
    expect(page(3)).toMatch(/<a [^>]*href="\/onboarding\?step=2"[^>]*>(?:(?!<\/a>).)*Back<\/a>/s);
    expect(page(4)).toMatch(/<a [^>]*href="\/onboarding\?step=3"[^>]*>(?:(?!<\/a>).)*Back<\/a>/s);
  });
});

describe("the stepper", () => {
  it("is a progress bar of one segment per step, filled up to the one they are on", () => {
    const expected = [
      [undefined, 1],
      [2, 2],
      [3, 3],
      [4, 4],
    ] as const;
    for (const [step, on] of expected) {
      const html = page(step);
      expect(bar(html), `step ${on}`).toMatch(/role="progressbar"/);
      expect(bar(html), `step ${on}`).toContain(`aria-valuenow="${on}"`);
      expect(bar(html), `step ${on}`).toContain('aria-valuemax="4"');
      expect(segments(html), `step ${on}`).toBe(4);
      expect(filled(html), `step ${on}`).toBe(on);
    }
  });

  it("names the step under the segments", () => {
    expect([undefined, 2, 3, 4].map((step) => stepName(page(step)))).toEqual([
      "You're here to",
      "Your page",
      "About you",
      "Project",
    ]);
  });

  it("is three segments for a backer or a partner", () => {
    for (const member of [patron, partner]) {
      answers[name(api.profiles.getMyProfile)] = member;
      const html = page(3);
      expect(bar(html)).toContain('aria-valuenow="3"');
      expect(bar(html)).toContain('aria-valuemax="3"');
      expect(segments(html)).toBe(3);
      expect(filled(html)).toBe(3);
      expect(stepName(html)).toBe("About you");
    }
  });

  it("is not the old 'N of N' text", () => {
    for (const step of [undefined, 2, 3, 4]) expect(text(page(step))).not.toMatch(/\b\d of \d\b/);
  });

  it("keeps the Back link on the left of the bar", () => {
    for (const step of [2, 3, 4]) {
      const html = page(step);
      expect(html.indexOf(">Back<"), `step ${step}`).toBeGreaterThan(-1);
      expect(html.indexOf(">Back<"), `step ${step}`).toBeLessThan(html.indexOf('role="progressbar"'));
    }
  });
});

describe("the screens slide", () => {
  it("opens the first screen as it is, with no slide to play", () => {
    for (const step of [undefined, 2, 3, 4]) expect(page(step)).not.toMatch(/class="onb-from-/);
  });

  it("slides from the right going on and from the left going back, for 240ms, only when motion is welcome", () => {
    const css = page().match(/<style>(.*?)<\/style>/s)?.[1] ?? "";
    expect(css).toMatch(/\.onb-from-right \{ animation: onb-from-right 240ms ease-out; \}/);
    expect(css).toMatch(/\.onb-from-left \{ animation: onb-from-left 240ms ease-out; \}/);
    expect(css).toMatch(/@keyframes onb-from-right \{ from \{ opacity: 0; transform: translateX\(24px\)/);
    expect(css).toMatch(/@keyframes onb-from-left \{ from \{ opacity: 0; transform: translateX\(-24px\)/);
    // Every rule that plays one is inside the no-preference query.
    const withoutQuery = css.replace(/@media \(prefers-reduced-motion: no-preference\) \{.*?\n\}/s, "");
    expect(css).toContain("@media (prefers-reduced-motion: no-preference)");
    expect(withoutQuery).not.toMatch(/animation:/);
    // Only transform and opacity move.
    expect(css.match(/(?<=\{ from \{)[^}]*|(?<=to \{)[^}]*/g)?.every((frame) => /^\s*(opacity|transform)/.test(frame))).toBe(true);
  });

  it("fills the stepper without a transition for someone who asked for less motion", () => {
    expect(bar(page(2))).toBeDefined();
    expect(page(2)).toMatch(/class="[^"]*transition-transform[^"]*motion-reduce:transition-none/);
  });

  it("makes each heading something focus can land on, without a ring", () => {
    for (const step of [undefined, 2, 3, 4]) {
      expect(page(step), `step ${step}`).toMatch(/<h1 tabindex="-1" class="[^"]*outline-none/);
    }
  });
});

describe("a backer or a partner finishes at step 3", () => {
  it("a backer: three steps, the third asks what they want to back and ends the flow", () => {
    answers[name(api.profiles.getMyProfile)] = patron;
    const html = page(3);
    expect(heading(html)).toBe("About you");
    expect(progress(html)).toBe("Step 3 of 3");
    expect(text(html)).toContain("What do you want to back?");
    // Back to change their answers: Save is the end of it.
    expect(buttons(html)).toEqual(["Save"]);
    expect(text(html)).not.toContain("Share it");
  });

  it("a partner: the offerings and their space or organization", () => {
    answers[name(api.profiles.getMyProfile)] = partner;
    const html = page(3);
    expect(progress(html)).toBe("Step 3 of 3");
    expect(text(html)).toContain("What can you offer?");
    expect(text(html)).toContain("Your space or organization (optional)");
    expect(text(html)).not.toContain("What are you into?");
  });

  it("has no project step to open", () => {
    for (const member of [patron, partner]) {
      answers[name(api.profiles.getMyProfile)] = member;
      const html = page(4);
      expect(heading(html)).toBe("About you");
      expect(text(html)).not.toContain("Got a project to share?");
    }
  });

  it("counts one step fewer from the first", () => {
    answers[name(api.profiles.getMyProfile)] = patron;
    expect(progress(page())).toBe("Step 1 of 3");
  });
});

describe("a link can't open a step past what's filled in", () => {
  it("keeps a new member on the first step until they pick a door", () => {
    answers[name(api.profiles.getMyProfile)] = NEW_MEMBER;
    for (const step of [2, 3, 4, "x"]) {
      const html = page(step);
      expect(heading(html)).toBe("What brings you here?");
      expect(progress(html)).toBe("Step 1 of 4");
    }
    // No door picked, so nothing to continue with.
    expect(buttons(page())).toEqual([]);
  });

  it("keeps someone with no name on the page step, where the name is asked", () => {
    answers[name(api.profiles.getMyProfile)] = { ...creative, name: "New User" };
    expect(heading(page(3))).toBe("Set up your page");
    expect(heading(page(4))).toBe("Set up your page");
  });

  it("draws nothing but the spinner while the profile loads", () => {
    answers[name(api.profiles.getMyProfile)] = undefined;
    expect(page()).not.toContain("<h1");
  });
});

describe("step 2, the page", () => {
  it("asks for the name when the account has none yet", () => {
    answers[name(api.profiles.getMyProfile)] = { ...creative, name: "New User" };
    const html = page(2);
    expect(html).toMatch(/<input[^>]*id="onboarding-name"[^>]*value=""/);
    // No name, so no address to suggest from it.
    expect(html).toMatch(/<input[^>]*id="onboarding-address"[^>]*value=""/);
  });

  it("has no line of explanation under the name", () => {
    const html = page(2);
    expect(text(html)).not.toContain("Your own name");
    expect(text(html)).not.toContain("Organizations get their own page");
  });

  it("still says so when the name typed is an organization already here", () => {
    answers[name(api.organizations.matchByName)] = { name: "Alliance Project" };
    const html = page(2);
    expect(html).toMatch(/<p [^>]*role="alert"[^>]*>Alliance Project is an organization here\./);
    expect(text(html)).toContain("Use your own name, then add Alliance Project to your profile.");
  });

  it("starts the address as one made from the name, and says what the check found", () => {
    answers[name(api.handles.checkHandle)] = { handle: "anareyes", ok: true, current: false, code: null, reason: null };
    const html = page(2);
    expect(html).toMatch(/<input[^>]*id="onboarding-address"[^>]*value="anareyes"/);
    expect(html).toMatch(/<p [^>]*role="status"[^>]*>Available\.<\/p>/);
  });

  it("shows why a refused address is refused, and holds the step", () => {
    answers[name(api.handles.checkHandle)] = {
      handle: "anareyes",
      ok: false,
      current: false,
      code: "handle_taken",
      reason: "That address is taken.",
    };
    const html = page(2);
    expect(html).toMatch(/<p [^>]*role="alert"[^>]*>That address is taken\.<\/p>/);
    expect(html).toMatch(/<input[^>]*id="onboarding-address"[^>]*aria-invalid="true"/);
    // Still the page step, still one way on.
    expect(heading(html)).toBe("Set up your page");
    expect(buttons(html)).toEqual(["Continue"]);
  });

  it("shows the address they already have, with nothing to check", () => {
    answers[name(api.profiles.getMyProfile)] = { ...creative, handle: "ana.paints" };
    const html = page(2);
    expect(html).toMatch(/<input[^>]*id="onboarding-address"[^>]*value="ana.paints"/);
    expect(html).not.toContain("Checking…");
    expect(html).not.toContain("Available.");
  });

  it("offers Change photo when there is one", () => {
    answers[name(api.profiles.getMyProfile)] = { ...creative, imageUrl: "https://example.com/ana.jpg" };
    const html = page(2);
    expect(text(html)).toContain("Change photo");
    expect(html).toContain('src="https://example.com/ana.jpg"');
  });
});

describe("step 3, about you", () => {
  const SEARCH = /<input[^>]*placeholder="Search for your city"[^>]*>/;

  it("asks where they are under what they are into, as one optional line", () => {
    const html = page(3);
    expect(text(html)).toContain("Where are you (optional)");
    expect(html).toMatch(SEARCH);
    expect(html.indexOf("Where are you")).toBeGreaterThan(html.indexOf("What are you into?"));
    // It is the place picker, in the phone's size.
    expect(html.match(SEARCH)?.[0]).toMatch(/text-\[17px\]/);
    // Nothing typed, so nothing to verify yet.
    expect(text(html)).not.toContain("Location verified");
  });

  it("asks it of a backer and a partner too, after the rest of their questions", () => {
    answers[name(api.profiles.getMyProfile)] = patron;
    expect(page(3).indexOf("Where are you")).toBeGreaterThan(page(3).indexOf("What do you want to back?"));
    answers[name(api.profiles.getMyProfile)] = partner;
    const html = page(3);
    expect(html).toMatch(SEARCH);
    expect(html.indexOf("Where are you")).toBeGreaterThan(html.indexOf("Your space or organization"));
  });

  it("starts from the city on the profile, and says it is matched to a place", () => {
    answers[name(api.profiles.getMyProfile)] = {
      ...creative,
      location: "San Diego, CA",
      locationType: "city",
      address: { city: "San Diego", stateCode: "CA" },
      coordinates: { lat: 32.7, lng: -117.1 },
      placeId: "abc",
    };
    const html = page(3);
    expect(html).toMatch(/<input[^>]*placeholder="Search for your city"[^>]*value="San Diego, CA"/);
    expect(text(html)).toContain("Location verified with coordinates");
  });

  it("says when a city on the profile is not matched to a place", () => {
    answers[name(api.profiles.getMyProfile)] = { ...creative, location: "Out past the pier" };
    const html = page(3);
    expect(html).toMatch(/value="Out past the pier"/);
    expect(text(html)).toContain("Not matched to a place yet");
  });

  it("asks for an email when the account has none", () => {
    for (const none of [{}, { email: null }, { email: "" }]) {
      answers[name(api.profiles.getMyProfile)] = { ...creative, ...none };
      const html = page(3);
      expect(html, JSON.stringify(none)).toMatch(/<input[^>]*id="onboarding-email"[^>]*type="email"/);
      expect(html).toMatch(/<label[^>]*for="onboarding-email"[^>]*>Email, so you hear when someone cheers you \(optional\)<\/label>/);
      expect(html).toMatch(/<input[^>]*id="onboarding-email"[^>]*autoComplete="email"/i);
      // Under the city, last before the button.
      expect(html.indexOf("onboarding-email")).toBeGreaterThan(html.indexOf("Search for your city"));
    }
  });

  it("does not ask for one when the account has an email", () => {
    answers[name(api.profiles.getMyProfile)] = { ...creative, email: "ana@example.com" };
    const html = page(3);
    expect(html).not.toContain("onboarding-email");
    expect(text(html)).not.toContain("someone cheers you");
  });

  it("asks a backer or a partner without an email too", () => {
    for (const member of [patron, partner]) {
      answers[name(api.profiles.getMyProfile)] = { ...member, email: null };
      expect(page(3)).toContain('id="onboarding-email"');
      answers[name(api.profiles.getMyProfile)] = { ...member, email: "ana@example.com" };
      expect(page(3)).not.toContain('id="onboarding-email"');
    }
  });

  it("does not show the email on the other steps", () => {
    for (const step of [undefined, 2, 4]) expect(page(step)).not.toContain("onboarding-email");
  });

  it("draws no mic where the browser can't listen, and the box asks plainly", () => {
    const html = page(3);
    expect(html).toMatch(/<label[^>]*for="onboarding-bio"[^>]*>A line about you \(optional\)<\/label><div class="relative mt-1"><textarea/);
    expect(html).not.toContain('aria-label="Talk instead"');
    expect(html).toMatch(/<textarea[^>]*id="onboarding-bio"[^>]*placeholder="Who you are, in a sentence"/);
  });

  it("puts the mic inside the box where the browser can listen, and the box says talk or type", () => {
    canListen = true;
    try {
      const html = page(3);
      expect(html).toMatch(/<textarea[^>]*id="onboarding-bio"[^>]*placeholder="Talk or type. Who you are, in a sentence"[^>]*pr-16/);
      expect(html).toMatch(/<textarea[^>]*id="onboarding-bio"[^>]*>[^<]*<\/textarea><button[^>]*aria-label="Talk instead"[^>]*absolute right-2/);
    } finally {
      canListen = false;
    }
  });

  it("checks the email on the server, in its own words, not the browser's", () => {
    expect(page(3)).toMatch(/<form[^>]*novalidate/i);
  });
});

describe("step 4, the project", () => {
  it("starts empty, with Share it waiting for a title", () => {
    const html = page(4);
    expect(html).toMatch(/<input[^>]*id="onboarding-title"[^>]*value=""/);
    expect(html).toMatch(/<button type="submit" disabled=""[^>]*>Share it<\/button>/);
  });

  it("asks for a project title, and says nothing is posted until Share it, then everyone sees it", () => {
    const html = page(4);
    expect(html).toMatch(/<input[^>]*id="onboarding-title"[^>]*placeholder="Project title"/);
    expect(text(html)).toContain("Something you're making or made. Nothing is posted until you tap Share it; then everyone can see it.");
    expect(text(html)).not.toContain("A title is enough");
  });

  it("asks what it is, as an optional two-line box between the title and where it is", () => {
    const html = page(4);
    expect(html).toMatch(/<label[^>]*for="onboarding-blurb"[^>]*>What is it \(optional\)<\/label>/);
    const box = html.match(/<textarea[^>]*id="onboarding-blurb"[^>]*>/)?.[0] ?? "";
    expect(box).toMatch(/rows="2"/);
    expect(box).toMatch(/placeholder="What you(?:'|&#x27;)re making, and why"/);
    expect(box).toMatch(/text-\[17px\]/);
    expect(html).toMatch(/<textarea[^>]*id="onboarding-blurb"[^>]*><\/textarea>/);
    expect(html.indexOf("onboarding-blurb")).toBeGreaterThan(html.indexOf("onboarding-title"));
    expect(html.indexOf("onboarding-blurb")).toBeLessThan(html.indexOf("Thinking about it"));
    // Optional: nothing in it, and Share it still waits only for the title.
    expect(html).toMatch(/<button type="submit" disabled=""[^>]*>Share it<\/button>/);
  });

  it("puts the mic inside 'What is it' only where the browser can listen (never in a server render)", () => {
    expect(page(4)).not.toContain('aria-label="Talk instead"');
    canListen = true;
    try {
      const html = page(4);
      expect(html).toMatch(/<textarea[^>]*id="onboarding-blurb"[^>]*placeholder="Talk or type. What you(?:'|&#x27;)re making, and why"/);
      expect(html).toMatch(/<textarea[^>]*id="onboarding-blurb"[^>]*><\/textarea><button[^>]*aria-label="Talk instead"/);
    } finally {
      canListen = false;
    }
  });

  it("is filled in from the title typed on the front door", () => {
    stashProjectTitle("Hollow Creek Field Recordings");
    const html = page(4);
    expect(html).toMatch(/<input[^>]*id="onboarding-title"[^>]*value="Hollow Creek Field Recordings"/);
    expect(html).toMatch(/<button type="submit" class="[^"]*"[^>]*>Share it<\/button>/);
    // Reading it leaves it for a reload; leaving the flow clears it.
    expect(page(4)).toContain('value="Hollow Creek Field Recordings"');
  });
});

describe("the type scale", () => {
  it("keeps every step to the phone sizes: nothing under 12px, fields 17px, buttons 52px tall", () => {
    for (const step of [1, 2, 3, 4]) {
      const html = page(step);
      expect(html, `step ${step}`).not.toMatch(/text-\[(?:\d|1[01])(?:\.\d+)?px\]/);
      for (const input of html.match(/<(?:input|textarea)[^>]*>/g) ?? []) {
        if (!/type="file"/.test(input)) expect(input, `step ${step}`).toMatch(/text-\[17px\]/);
      }
      for (const submit of html.match(/<button[^>]*type="submit"[^>]*>/g) ?? []) {
        expect(submit, `step ${step}`).toMatch(/min-h-\[52px\]/);
        expect(submit, `step ${step}`).toMatch(/text-\[17px\]/);
      }
    }
  });
});
