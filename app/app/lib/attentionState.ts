// What a row on /admin/attention means and what an admin does about it, in
// plain words. The contact reasons are the unread reminder's own check
// (convex/emailDeliveries.ts contactEligibility, reported by
// convex/engagement/attention.ts); this turns them into a badge to filter
// on and one line saying what to do.

import { shortDay } from "./dates";

export type AttentionReason = "unanswered" | "newcomer" | "invite";

export type ContactState =
  | "can_email"
  | "reminder_off"
  | "no_email"
  | "email_off"
  | "bounced"
  | "emailed_recently"
  | "seen"
  | "blocked"
  | "check";

export type BadgeTone = "green" | "amber" | "red" | "sky" | "neutral";

/** The badge for each state, in the order the filters list them. */
export const CONTACT_STATES: Record<ContactState, { badge: string; tone: BadgeTone }> = {
  no_email: { badge: "No email", tone: "red" },
  bounced: { badge: "Email bounced", tone: "red" },
  email_off: { badge: "Email off", tone: "amber" },
  reminder_off: { badge: "Reminder off", tone: "amber" },
  emailed_recently: { badge: "Emailed today", tone: "sky" },
  can_email: { badge: "Can email", tone: "green" },
  seen: { badge: "Seen it", tone: "neutral" },
  blocked: { badge: "Blocked", tone: "neutral" },
  check: { badge: "Check by hand", tone: "neutral" },
};

/** contactEligibility's reason → the state an admin acts on. */
export function contactState(reason: string): ContactState {
  switch (reason) {
    case "eligible":
      return "can_email";
    case "loop_off":
      return "reminder_off";
    case "no_email":
      return "no_email";
    case "email_off":
      return "email_off";
    case "suppressed":
      return "bounced";
    case "contact_cooldown":
      return "emailed_recently";
    case "read_or_replied": // opened it, didn't answer
      return "seen";
    case "blocked":
      return "blocked";
    default:
      return "check";
  }
}

/** What's going on, in one line. */
export function attentionSituation(reason: AttentionReason, sourceAt: number): string {
  const day = shortDay(sourceAt);
  if (reason === "unanswered") return `Hasn't answered a message since ${day}.`;
  if (reason === "newcomer") return `Joined ${day}. Hasn't posted, followed anyone or had a conversation.`;
  return `Joined from an invite ${day}. Hasn't posted, followed anyone or had a conversation.`;
}

/** What to do about it, in one line. */
export function attentionTodo(reason: AttentionReason, state: ContactState): string {
  if (reason === "unanswered") {
    switch (state) {
      case "can_email":
        return "Nothing to do. The reminder will email them.";
      case "reminder_off":
        return "Turn on the reminder above and it emails them once.";
      case "no_email":
        return "No email on file. Text them or tell them in person.";
      case "email_off":
        return "They turned off activity email. Text them or tell them in person.";
      case "bounced":
        return "Their email bounces. Text them or tell them in person.";
      case "emailed_recently":
        return "They got an email in the last day. Check back tomorrow.";
      case "seen":
      case "blocked":
        return "Nothing to do. Mark it reviewed.";
      case "check":
        return "Open their profile and decide.";
    }
  }
  const welcome = reason === "invite" ? "Ask whoever invited them to check in, or say hi." : "Say hi, or help them post a first project.";
  switch (state) {
    case "can_email":
    case "reminder_off":
      return welcome;
    case "no_email":
      return "No email on file. Message them in the app or text them.";
    case "email_off":
      return "They turned off activity email. Message them in the app.";
    case "bounced":
      return "Their email bounces. Message them in the app.";
    case "emailed_recently":
      return "They got an email in the last day. Message them in the app.";
    default:
      return "Open their profile and decide.";
  }
}

// emailDeliveries.status values that mean it went out (schema.ts).
const LANDED = new Set(["accepted", "sent", "delivered"]);

/** "Last emailed Oct 28", or how the last one ended when it didn't land. */
export function lastEmailLine(last: { status: string; at: number } | null): string {
  if (!last) return "Never emailed.";
  const day = shortDay(last.at);
  return LANDED.has(last.status) ? `Last emailed ${day}.` : `Last email ${day}: ${last.status}.`;
}
