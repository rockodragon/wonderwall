// The rules for a nudge (docs/features/engagement-loops.md): who may send the
// call, whether the app sends, and how the admin page counts what happened.
// All pure, so loops.test.ts-style unit tests can hold them. Nothing here
// reads the database; engagement/nudges.ts gathers the facts and this decides.

import { isLoopKey, type LoopCondition } from "./loops";

const DAY_MS = 24 * 60 * 60 * 1000;

/** One message a day is the most (Rick, 2026-10-04): a nudge is skipped when
 * another reached the person in the last 24 hours. */
export const NUDGE_GAP_MS = DAY_MS;

/** "Shared": a project created within 7 days after a nudge was sent. */
export const SHARED_WINDOW_MS = 7 * DAY_MS;

// ——— The shared secret ———

export type SecretCheck = "ok" | "not_configured" | "denied";

async function sha256(text: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
}

/** True when the two strings are equal, in time that doesn't depend on where
 * they first differ or how long the one sent is. Both are hashed to 32 bytes
 * first, then every byte is compared. */
export async function secretsMatch(provided: string, expected: string): Promise<boolean> {
  const [a, b] = await Promise.all([sha256(provided), sha256(expected)]);
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a[i] ^ b[i];
  return difference === 0;
}

/** The webhook's gate. With no secret set on the deployment nothing is let
 * through ("not_configured"); a missing or wrong header is "denied". */
export async function checkNudgeSecret(expected: string | undefined, provided: string | null): Promise<SecretCheck> {
  if (!expected) return "not_configured";
  if (!provided) return "denied";
  return (await secretsMatch(provided, expected)) ? "ok" : "denied";
}

// ——— The call's body ———

export type NudgeCall = { loop: string; distinctId: string };
export type ParsedCall = { ok: true; call: NudgeCall } | { ok: false; error: string };

const BODY_MAX_CHARS = 4096;
const DISTINCT_ID_MAX = 200;

/** `{"loop": "...", "distinct_id": "..."}`, or what is wrong with it. An
 * unknown loop is wrong here, so it's answered before anything is looked up. */
export function parseNudgeBody(text: string): ParsedCall {
  if (text.length > BODY_MAX_CHARS) return { ok: false, error: "Body is too large." };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: "Body must be JSON." };
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, error: "Body must be a JSON object." };
  const { loop, distinct_id } = raw as Record<string, unknown>;
  if (typeof loop !== "string" || loop.trim() === "") return { ok: false, error: "Missing loop." };
  if (!isLoopKey(loop.trim())) return { ok: false, error: "Unknown loop." };
  if (typeof distinct_id !== "string" || distinct_id.trim() === "") return { ok: false, error: "Missing distinct_id." };
  const distinctId = distinct_id.trim();
  if (distinctId.length > DISTINCT_ID_MAX) return { ok: false, error: "distinct_id is too long." };
  return { ok: true, call: { loop: loop.trim(), distinctId } };
}

// ——— Send, or skip and say why ———

/** Why a nudge wasn't sent. The words are for /admin/engagement-loops. */
export const SKIP_LABELS = {
  loop_off: "Loop is off",
  unknown_user: "Not one of our members",
  no_email: "No email on file",
  email_off: "Turned off activity email",
  suppressed: "Address bounced or complained",
  has_project: "Already shared a project",
  already_sent: "Already sent this one",
  sent_recently: "Another nudge went in the last day",
  digest_recent: "The cheers email went in the last day",
} as const;

export type SkipReason = keyof typeof SKIP_LABELS;

export function skipLabel(reason: string): string {
  return (SKIP_LABELS as Record<string, string>)[reason] ?? reason;
}

/** What the app knows about this loop and this person at the moment the
 * call lands. */
export type NudgeFacts = {
  now: number;
  loopEnabled: boolean;
  userExists: boolean;
  hasEmail: boolean;
  /** Their email settings allow the loop's category (activity). */
  emailAllowed: boolean;
  /** The address has bounced or complained, so nothing is delivered to it. */
  suppressed: boolean;
  /** The loop's own condition still holds (share a project: they have none). */
  conditionHolds: boolean;
  condition: LoopCondition;
  /** This loop was already sent to them. */
  alreadySent: boolean;
  /** When the last nudge of any loop was sent to them. */
  lastNudgeAt: number | null;
  /** When the last cheers email (supportDigest.ts) went to them. */
  lastDigestAt: number | null;
};

export type NudgeDecision = { send: true } | { send: false; reason: SkipReason };

/** The reason a loop's condition fails, by loop. */
export function conditionSkipReason(condition: LoopCondition): SkipReason {
  switch (condition) {
    case "no_project":
      return "has_project";
  }
}

/** Send only when every check passes; otherwise the first one that fails, in
 * the order the spec lists them. Pure: the facts are read before this runs. */
export function decideNudge(f: NudgeFacts): NudgeDecision {
  if (!f.loopEnabled) return { send: false, reason: "loop_off" };
  if (!f.userExists) return { send: false, reason: "unknown_user" };
  if (!f.hasEmail) return { send: false, reason: "no_email" };
  if (!f.emailAllowed) return { send: false, reason: "email_off" };
  if (f.suppressed) return { send: false, reason: "suppressed" };
  if (!f.conditionHolds) return { send: false, reason: conditionSkipReason(f.condition) };
  if (f.alreadySent) return { send: false, reason: "already_sent" };
  if (f.lastNudgeAt !== null && f.now - f.lastNudgeAt < NUDGE_GAP_MS) return { send: false, reason: "sent_recently" };
  if (f.lastDigestAt !== null && f.now - f.lastDigestAt < NUDGE_GAP_MS) return { send: false, reason: "digest_recent" };
  return { send: true };
}

/** The newest of some times, ignoring the missing ones. Null when there are
 * none. For "when did the last one go out". */
export function latestOf(times: readonly (number | undefined)[]): number | null {
  let latest: number | null = null;
  for (const t of times) {
    if (t !== undefined && (latest === null || t > latest)) latest = t;
  }
  return latest;
}

// ——— A project that counts as shared ———

/** A project someone posted. The finished piece onboarding used to ask for is
 * stored as a hidden companion project with origin "portfolio"
 * (artifacts.create); the audit says that doesn't count as sharing a project,
 * and project_created never fires for it. An older row with no origin was
 * posted. */
export function isPostedProject(project: { origin?: string }): boolean {
  return project.origin !== "portfolio";
}

// ——— Counts for the admin page ———

export type LogEntry = { status: "sent" | "skipped"; reason?: string; at: number };

export type WindowCounts = {
  sent: number;
  skipped: number;
  /** Skipped, by reason, most common first. */
  reasons: { reason: string; label: string; count: number }[];
};

/** Sent and skipped (by reason) over the last `days` days. */
export function countLog(rows: readonly LogEntry[], now: number, days: number): WindowCounts {
  const since = now - days * DAY_MS;
  let sent = 0;
  let skipped = 0;
  const byReason = new Map<string, number>();
  for (const row of rows) {
    if (row.at <= since) continue;
    if (row.status === "sent") {
      sent += 1;
    } else {
      skipped += 1;
      const reason = row.reason ?? "unknown";
      byReason.set(reason, (byReason.get(reason) ?? 0) + 1);
    }
  }
  const reasons = [...byReason]
    .map(([reason, count]) => ({ reason, label: skipLabel(reason), count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  return { sent, skipped, reasons };
}

/** How many sends were followed by a project: one the same person created
 * within 7 days after the send. `projectTimes` is each person's project
 * creation times. */
export function countShared(
  sends: readonly { userId: string; at: number }[],
  projectTimes: ReadonlyMap<string, readonly number[]>,
): number {
  let shared = 0;
  for (const send of sends) {
    const times = projectTimes.get(send.userId) ?? [];
    if (times.some((t) => t >= send.at && t <= send.at + SHARED_WINDOW_MS)) shared += 1;
  }
  return shared;
}
