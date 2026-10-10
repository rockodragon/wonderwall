// Engagement loops (docs/features/engagement-loops.md): PostHog decides when,
// the app decides whether and sends. This file is the loops themselves: their
// keys, the default words, how a row an admin has edited overrides them, and
// the email built from them. Pure: no Convex, no network, so the unit tests
// (loops.test.ts) and the admin page can both read it.

import { escapeHtml } from "../email/template";

/** What a loop's "still true?" check asks of the app. */
export type LoopCondition = "no_project";

export type LoopDefault = {
  key: string;
  /** What the admin page calls it. */
  name: string;
  /** When PostHog calls, for the setup box. PostHog owns the timing; this is
   * a reminder of what was set up there. */
  when: string;
  /** Which email setting turns it off. Nudges are never "transactional". */
  category: "activity";
  /** The app re-checks this before every send, because PostHog can't see the
   * app's data. */
  condition: LoopCondition;
  enabled: boolean;
  subject: string;
  /** Plain text. A blank line starts a new paragraph. */
  body: string;
  /** The button. Fixed in code; admins edit the subject and text. */
  ctaText: string;
  /** App path for the button; the email template adds SITE_URL. */
  ctaPath: string;
};

const SHARE_PROJECT_PATH = "/projects?new=project";

// Copy rules (PRODUCT.md): plain, no money words, no promise of cheers or
// funding, and never "desk": the signed-in home is the Canvas. loops.test.ts
// holds the defaults to these.
export const DEFAULT_LOOPS: readonly LoopDefault[] = [
  {
    key: "share_project_day1",
    name: "Share a project, day 1",
    when: "1 day after user_signed_up, unless project_created",
    category: "activity",
    condition: "no_project",
    enabled: true,
    subject: "What are you working on?",
    body: "Share a project you're thinking about or working on. A title is enough to start.",
    ctaText: "Share your project",
    ctaPath: SHARE_PROJECT_PATH,
  },
  {
    key: "share_project_day4",
    name: "Share a project, day 4",
    when: "4 days after user_signed_up, unless project_created",
    category: "activity",
    condition: "no_project",
    enabled: true,
    subject: "Still thinking about it?",
    body: "A project can start as an idea. Share yours when you're ready. A title is enough.",
    ctaText: "Share your project",
    ctaPath: SHARE_PROJECT_PATH,
  },
];

export const LOOP_KEYS: readonly string[] = DEFAULT_LOOPS.map((l) => l.key);

export function isLoopKey(key: string): boolean {
  return LOOP_KEYS.includes(key);
}

export function loopDefault(key: string): LoopDefault | null {
  return DEFAULT_LOOPS.find((l) => l.key === key) ?? null;
}

/** What an admin has saved for a loop (the engagementLoops row). */
export type LoopRow = { enabled: boolean; subject: string; body: string; updatedAt?: number };

/** A loop as it runs: the code's defaults, with an admin's row on top. */
export type EffectiveLoop = LoopDefault & {
  /** True once an admin has saved a row. */
  edited: boolean;
  updatedAt?: number;
};

/** The default, overridden by the row when there is one. Null for a key that
 * isn't a loop. */
export function resolveLoop(key: string, row: LoopRow | null | undefined): EffectiveLoop | null {
  const base = loopDefault(key);
  if (!base) return null;
  if (!row) return { ...base, edited: false };
  return {
    ...base,
    enabled: row.enabled,
    subject: row.subject,
    body: row.body,
    edited: true,
    updatedAt: row.updatedAt,
  };
}

// ——— What an admin may save ———

export const SUBJECT_MAX = 120;
export const BODY_MAX = 1000;

export type LoopTextCheck = { ok: true; subject: string; body: string } | { ok: false; reason: string };

/** The subject and text an admin typed, trimmed, or the reason it can't be
 * saved. Both are required and short: this is one line and a few sentences. */
export function checkLoopText(input: { subject: string; body: string }): LoopTextCheck {
  const subject = input.subject.trim();
  const body = input.body.trim();
  if (!subject) return { ok: false, reason: "Add a subject." };
  if (subject.length > SUBJECT_MAX) return { ok: false, reason: `Keep the subject under ${SUBJECT_MAX} characters.` };
  if (!body) return { ok: false, reason: "Add the text." };
  if (body.length > BODY_MAX) return { ok: false, reason: `Keep the text under ${BODY_MAX} characters.` };
  return { ok: true, subject, body };
}

// ——— The email ———

/** The words of a nudge email, in the shape scheduleNotificationEmail takes
 * (emailHelpers.ts). Its own words are the heading: the subject is plain
 * text, so the template escapes it. The body is HTML the template trusts, so
 * the admin's text is escaped here, paragraph by paragraph. */
export type NudgeEmail = {
  subject: string;
  previewText: string;
  heading: string;
  body: string;
  ctaText: string;
  ctaUrl: string;
};

const PREVIEW_MAX = 140;

export function buildNudgeEmail(loop: Pick<LoopDefault, "subject" | "body" | "ctaText" | "ctaPath">): NudgeEmail {
  const paragraphs = loop.body
    .split(/\r?\n\s*\r?\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  const html = paragraphs.map((p) => escapeHtml(p).replace(/\r?\n/g, "<br>")).join("<br><br>");
  const first = paragraphs[0] ?? "";
  const previewText = first.length > PREVIEW_MAX ? `${first.slice(0, PREVIEW_MAX - 1).trimEnd()}…` : first;
  return {
    subject: loop.subject,
    previewText,
    heading: loop.subject,
    body: html,
    ctaText: loop.ctaText,
    ctaUrl: loop.ctaPath,
  };
}
