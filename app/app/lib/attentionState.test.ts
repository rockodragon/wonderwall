import { describe, expect, it } from "vitest";
import { attentionSituation, attentionTodo, CONTACT_STATES, contactState, lastEmailLine } from "./attentionState";

describe("contactState", () => {
  it("names each reminder reason the way an admin reads it", () => {
    expect(contactState("loop_off")).toBe("reminder_off");
    expect(contactState("no_email")).toBe("no_email");
    expect(contactState("email_off")).toBe("email_off");
    expect(contactState("eligible")).toBe("can_email");
    expect(contactState("suppressed")).toBe("bounced");
    expect(contactState("contact_cooldown")).toBe("emailed_recently");
    expect(contactState("read_or_replied")).toBe("seen");
    expect(contactState("history_incomplete")).toBe("check");
    expect(CONTACT_STATES[contactState("loop_off")].badge).toBe("Reminder off");
  });
});

describe("attentionTodo", () => {
  it("says what to do for an unanswered message", () => {
    expect(attentionTodo("unanswered", "reminder_off")).toBe("Turn on the reminder above and it emails them once.");
    expect(attentionTodo("unanswered", "no_email")).toBe("No email on file. Text them or tell them in person.");
    expect(attentionTodo("unanswered", "can_email")).toBe("Nothing to do. The reminder will email them.");
  });

  it("says hi to a quiet newcomer, and asks the inviter for an invite", () => {
    expect(attentionTodo("newcomer", "can_email")).toBe("Say hi, or help them post a first project.");
    expect(attentionTodo("invite", "can_email")).toBe("Ask whoever invited them to check in, or say hi.");
    expect(attentionTodo("newcomer", "no_email")).toBe("No email on file. Message them in the app or text them.");
  });
});

describe("lines", () => {
  const OCT_28 = new Date(2026, 9, 28, 13, 26).getTime();
  it("dates the situation and the last email", () => {
    expect(attentionSituation("unanswered", OCT_28)).toBe("Hasn't answered a message since Oct 28.");
    expect(lastEmailLine({ status: "delivered", at: OCT_28 })).toBe("Last emailed Oct 28.");
    expect(lastEmailLine({ status: "bounced", at: OCT_28 })).toBe("Last email Oct 28: bounced.");
    expect(lastEmailLine(null)).toBe("Never emailed.");
  });
});
