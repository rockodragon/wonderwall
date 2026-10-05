import { describe, expect, it } from "vitest";
import { avatarOf, buildInbox, inboxIcon } from "./inbox";

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 2, 12);

const convo = (id: string, daysAgo: number, unreadCount = 0) => ({
  _id: id,
  participant: { name: `Person ${id}` },
  lastMessageAt: NOW - daysAgo * DAY,
  lastMessagePreview: "hi",
  unreadCount,
});

const note = (id: string, type: string, daysAgo: number) => ({
  _id: id,
  type,
  title: `Note ${id}`,
  message: "body",
  linkUrl: `/x/${id}`,
  createdAt: NOW - daysAgo * DAY,
});

describe("inboxIcon", () => {
  it("names the common kinds", () => {
    expect(inboxIcon("new_message")).toBe("message");
    expect(inboxIcon("event_application")).toBe("event");
    expect(inboxIcon("job_interest")).toBe("job");
    expect(inboxIcon("invite_accepted")).toBe("member");
    expect(inboxIcon("update")).toBe("news");
    expect(inboxIcon("new_follower")).toBe("heart");
  });

  it("gives cheers and offers of help a heart, and money a coin", () => {
    expect(inboxIcon("encouragement")).toBe("heart");
    expect(inboxIcon("help_offered")).toBe("heart");
    expect(inboxIcon("backing_received")).toBe("money");
    expect(inboxIcon("gift_received")).toBe("money");
    expect(inboxIcon("fund_award")).toBe("money");
    expect(inboxIcon("grant_proposal_approved")).toBe("money");
    expect(inboxIcon("grant_proposal_decided")).toBe("money");
  });

  it("groups gigs with jobs, except getting paid", () => {
    expect(inboxIcon("gig_booked")).toBe("job");
    expect(inboxIcon("gig_time_changed")).toBe("job");
    expect(inboxIcon("gig_paid")).toBe("money");
  });

  it("treats someone joining a team as a new member", () => {
    expect(inboxIcon("project_member_joined")).toBe("member");
    expect(inboxIcon("project_join_request")).toBe("project");
  });

  it("falls back to a bell for unknown types", () => {
    expect(inboxIcon("something_new")).toBe("other");
  });
});

describe("buildInbox", () => {
  it("puts conversations and notifications in one list, newest first", () => {
    const { recent } = buildInbox(
      [convo("a", 3), convo("b", 0.5)],
      [note("1", "event_application", 1), note("2", "job_interest", 0.1)],
      new Set(),
      NOW,
    );
    expect(recent.map((r) => r.key)).toEqual(["n:2", "c:b", "n:1", "c:a"]);
    expect(recent[1]).toMatchObject({ icon: "message", href: "/messages/b" });
  });

  it("drops new-message notifications; the conversation is the row", () => {
    const { recent } = buildInbox([convo("a", 0)], [note("1", "new_message", 0)], new Set(), NOW);
    expect(recent.map((r) => r.key)).toEqual(["c:a"]);
  });

  it("keeps the last seven days and archives the rest", () => {
    const { recent, archived } = buildInbox(
      [convo("a", 6.9), convo("b", 8)],
      [note("1", "update", 30)],
      new Set(),
      NOW,
    );
    expect(recent.map((r) => r.key)).toEqual(["c:a"]);
    expect(archived.map((r) => r.key)).toEqual(["c:b", "n:1"]);
  });

  it("never archives something unread", () => {
    const { recent, archived } = buildInbox(
      [convo("a", 20, 2)],
      [note("1", "job_interest", 12)],
      new Set(["1"]),
      NOW,
    );
    expect(recent.map((r) => r.key)).toEqual(["n:1", "c:a"]);
    expect(recent.every((r) => r.unread)).toBe(true);
    expect(archived).toEqual([]);
  });
});

describe("avatarOf", () => {
  it("keeps the photo and the name", () => {
    expect(avatarOf({ name: "Ana Ruiz", imageUrl: "https://x/a.jpg" })).toEqual({
      imageUrl: "https://x/a.jpg",
      name: "Ana Ruiz",
    });
  });

  it("falls back to the name alone when there is no photo", () => {
    expect(avatarOf({ name: " Ana ", imageUrl: null })).toEqual({ imageUrl: null, name: "Ana" });
    expect(avatarOf({ name: "Ana" })).toEqual({ imageUrl: null, name: "Ana" });
    expect(avatarOf({ name: "Ana", imageUrl: "" })).toEqual({ imageUrl: null, name: "Ana" });
  });

  it("still shows a photo when the name is blank", () => {
    expect(avatarOf({ name: "  ", imageUrl: "https://x/a.jpg" })).toEqual({
      imageUrl: "https://x/a.jpg",
      name: "",
    });
  });

  it("is null with no photo and no name, or no person", () => {
    expect(avatarOf({ name: "  ", imageUrl: null })).toBeNull();
    expect(avatarOf({})).toBeNull();
    expect(avatarOf(null)).toBeNull();
    expect(avatarOf(undefined)).toBeNull();
  });
});

describe("buildInbox avatars", () => {
  it("gives a conversation row the other person's photo", () => {
    const { recent } = buildInbox(
      [{ ...convo("a", 0), participant: { name: "Ana Ruiz", imageUrl: "https://x/a.jpg" } }],
      [],
      new Set(),
      NOW,
    );
    expect(recent[0].avatar).toEqual({ imageUrl: "https://x/a.jpg", name: "Ana Ruiz" });
  });

  it("gives a conversation with no photo their name for initials", () => {
    const { recent } = buildInbox([convo("a", 0)], [], new Set(), NOW);
    expect(recent[0].avatar).toEqual({ imageUrl: null, name: "Person a" });
  });

  it("leaves a conversation with no name and no photo on the icon", () => {
    const { recent } = buildInbox(
      [{ ...convo("a", 0), participant: { name: "", imageUrl: null } }],
      [],
      new Set(),
      NOW,
    );
    expect(recent[0].avatar).toBeNull();
    expect(recent[0].icon).toBe("message");
  });

  it("gives a notification from a person their face, and keeps its icon underneath", () => {
    const { recent } = buildInbox(
      [],
      [{ ...note("1", "new_follower", 0), relatedUserProfile: { name: "Ben Cho", imageUrl: "https://x/b.jpg" } }],
      new Set(),
      NOW,
    );
    expect(recent[0].avatar).toEqual({ imageUrl: "https://x/b.jpg", name: "Ben Cho" });
    expect(recent[0].icon).toBe("heart");
  });

  it("leaves a notification with nobody related on the icon", () => {
    const { recent } = buildInbox(
      [],
      [note("1", "update", 0), { ...note("2", "update", 1), relatedUserProfile: null }],
      new Set(),
      NOW,
    );
    expect(recent.map((r) => r.avatar)).toEqual([null, null]);
  });

  it("shows no face on a fund's decision, though the operator is recorded", () => {
    const operator = { name: "Op Erator", imageUrl: "https://x/o.jpg" };
    const { recent } = buildInbox(
      [],
      ["grant_proposal_approved", "grant_proposal_decided", "fund_award"].map((type, i) => ({
        ...note(String(i), type, 0),
        relatedUserProfile: operator,
      })),
      new Set(),
      NOW,
    );
    expect(recent.map((r) => r.avatar)).toEqual([null, null, null]);
  });
});
