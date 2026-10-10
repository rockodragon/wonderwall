// Pure-logic tests for the loops and their email (engagement/loops.ts).
// No Convex, no network.

import { describe, expect, it } from "vitest";
import { BANNED_PHRASES } from "../../app/constants/claims";
import { renderNotificationEmail } from "../email/template";
import {
  BODY_MAX,
  DEFAULT_LOOPS,
  SUBJECT_MAX,
  buildNudgeEmail,
  checkLoopText,
  isLoopKey,
  loopDefault,
  resolveLoop,
  signupNudgePlan,
} from "./loops";

describe("the default loops", () => {
  it("are the two share-a-project nudges, in activity email", () => {
    expect(DEFAULT_LOOPS.map((l) => l.key)).toEqual(["share_project_day1", "share_project_day4"]);
    for (const loop of DEFAULT_LOOPS) {
      expect(loop.category).toBe("activity");
      expect(loop.condition).toBe("no_project");
      expect(loop.enabled).toBe(true);
    }
  });

  it("carry the agreed words", () => {
    expect(loopDefault("share_project_day1")).toMatchObject({
      subject: "What are you working on?",
      body: "Share a project you're thinking about or working on. A title is enough to start.",
      ctaText: "Share your project",
      ctaPath: "/projects?new=project",
    });
    expect(loopDefault("share_project_day4")).toMatchObject({
      subject: "Still thinking about it?",
      body: "A project can start as an idea. Share yours when you're ready. A title is enough.",
      ctaText: "Share your project",
      ctaPath: "/projects?new=project",
    });
  });

  it("keep to the copy rules: never 'desk', no money words, no promise of cheers or funding", () => {
    for (const loop of DEFAULT_LOOPS) {
      const words = `${loop.name} ${loop.subject} ${loop.body} ${loop.ctaText}`;
      expect(words, loop.key).not.toMatch(/\bdesk\b/i);
      expect(words, loop.key).not.toMatch(/\$|\bfund|\bbacking|\bbacked\b|\bdues\b|\bpaid\b|\bmoney\b|\bgrant/i);
      expect(words, loop.key).not.toMatch(/\bcheer|\bget funded\b/i);
      for (const banned of BANNED_PHRASES) expect(banned.test(words), `${loop.key} matches ${banned}`).toBe(false);
    }
  });

  it("fit the limits an admin is held to", () => {
    for (const loop of DEFAULT_LOOPS) {
      expect(checkLoopText(loop), loop.key).toEqual({ ok: true, subject: loop.subject, body: loop.body });
    }
  });
});

describe("isLoopKey", () => {
  it("knows a loop and nothing else", () => {
    expect(isLoopKey("share_project_day1")).toBe(true);
    expect(isLoopKey("share_project_day9")).toBe(false);
    expect(isLoopKey("")).toBe(false);
    expect(isLoopKey("toString")).toBe(false);
  });
});

describe("resolveLoop", () => {
  it("is null for a key that isn't a loop", () => {
    expect(resolveLoop("nope", null)).toBeNull();
  });

  it("runs on the defaults until an admin saves a row", () => {
    const loop = resolveLoop("share_project_day1", null);
    expect(loop).toMatchObject({ enabled: true, edited: false, subject: "What are you working on?" });
    expect(loop?.updatedAt).toBeUndefined();
  });

  it("lets a saved row override the on/off switch, subject and text, and keeps the rest", () => {
    const loop = resolveLoop("share_project_day4", { enabled: false, subject: "Hi", body: "Hello.", updatedAt: 42 });
    expect(loop).toMatchObject({
      key: "share_project_day4",
      enabled: false,
      subject: "Hi",
      body: "Hello.",
      edited: true,
      updatedAt: 42,
      ctaText: "Share your project",
      ctaPath: "/projects?new=project",
      condition: "no_project",
    });
  });
});

describe("checkLoopText", () => {
  it("trims, and needs both a subject and text", () => {
    expect(checkLoopText({ subject: "  Hi  ", body: "  Hello.\n" })).toEqual({ ok: true, subject: "Hi", body: "Hello." });
    expect(checkLoopText({ subject: "  ", body: "Hello." })).toEqual({ ok: false, reason: "Add a subject." });
    expect(checkLoopText({ subject: "Hi", body: " \n " })).toEqual({ ok: false, reason: "Add the text." });
  });

  it("keeps both short", () => {
    expect(checkLoopText({ subject: "x".repeat(SUBJECT_MAX), body: "y" }).ok).toBe(true);
    expect(checkLoopText({ subject: "x".repeat(SUBJECT_MAX + 1), body: "y" }).ok).toBe(false);
    expect(checkLoopText({ subject: "x", body: "y".repeat(BODY_MAX) }).ok).toBe(true);
    expect(checkLoopText({ subject: "x", body: "y".repeat(BODY_MAX + 1) }).ok).toBe(false);
  });
});

describe("buildNudgeEmail", () => {
  const day1 = loopDefault("share_project_day1")!;

  it("uses the subject as both subject and heading, and the button's words and path", () => {
    expect(buildNudgeEmail(day1)).toEqual({
      subject: "What are you working on?",
      previewText: "Share a project you're thinking about or working on. A title is enough to start.",
      heading: "What are you working on?",
      body: "Share a project you&#39;re thinking about or working on. A title is enough to start.",
      ctaText: "Share your project",
      ctaUrl: "/projects?new=project",
    });
  });

  it("escapes what an admin typed, since the template trusts the body as HTML", () => {
    const email = buildNudgeEmail({ ...day1, subject: "A <b>& B", body: `<script>alert("x")</script> & more` });
    expect(email.body).toBe("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; more");
    expect(email.body).not.toContain("<script>");
    // The subject and preview are plain text: the template escapes them, so they stay raw here.
    expect(email.subject).toBe("A <b>& B");
    expect(email.heading).toBe("A <b>& B");
  });

  it("turns a blank line into a paragraph break and a single line break into a <br>", () => {
    const email = buildNudgeEmail({ ...day1, body: "One.\nStill one.\n\nTwo.\n\n\n  \nThree." });
    expect(email.body).toBe("One.<br>Still one.<br><br>Two.<br><br>Three.");
    expect(email.previewText).toBe("One.\nStill one.");
  });

  it("cuts a long first paragraph for the preview", () => {
    const email = buildNudgeEmail({ ...day1, body: "word ".repeat(100) });
    expect(email.previewText.length).toBeLessThanOrEqual(140);
    expect(email.previewText.endsWith("…")).toBe(true);
  });

  it("renders through the house template with an unsubscribe link and an absolute button", () => {
    const email = buildNudgeEmail(day1);
    const { html, text } = renderNotificationEmail({
      heading: email.heading,
      body: email.body,
      previewText: email.previewText,
      ctaText: email.ctaText,
      ctaUrl: email.ctaUrl,
      baseUrl: "https://thecreative.exchange",
      unsubscribeUrl: "https://thecreative.exchange/unsubscribe/tok",
    });
    expect(html).toContain('href="https://thecreative.exchange/projects?new=project"');
    expect(html).toContain("Share your project");
    expect(html).toContain("/unsubscribe/tok");
    expect(text).toContain("Share your project: https://thecreative.exchange/projects?new=project");
  });
});

describe("signupNudgePlan", () => {
  it("schedules day 1 and day 4 from signup", () => {
    const day = 24 * 60 * 60 * 1000;
    expect(signupNudgePlan()).toEqual([
      { loop: "share_project_day1", delayMs: day },
      { loop: "share_project_day4", delayMs: 4 * day },
    ]);
  });

  it("gives every loop a day", () => {
    for (const loop of DEFAULT_LOOPS) expect(loop.afterDays).toBeGreaterThan(0);
  });
});
