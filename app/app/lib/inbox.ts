// The Messages inbox: conversations and notifications in one list, newest
// first, each with an icon for what it's about (Rick, 2026-10-02). The last
// seven days show; older rows wait behind "Archive". Pure rules, no React.

export const INBOX_RECENT_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

/** What a row is about. Each kind has one icon in the inbox. */
export type InboxIcon =
  | "message"
  | "event"
  | "job"
  | "member"
  | "project"
  | "money"
  | "heart"
  | "news"
  | "org"
  | "other";

export type InboxRow = {
  key: string;
  icon: InboxIcon;
  title: string;
  preview: string;
  at: number;
  unread: boolean;
  href: string | null;
};

type ConversationLike = {
  _id: string;
  participant: { name: string };
  lastMessageAt: number;
  lastMessagePreview: string | null;
  unreadCount: number;
};

type NotificationLike = {
  _id: string;
  type: string;
  title: string;
  message: string;
  linkUrl?: string;
  createdAt: number;
};

const EXACT: Record<string, InboxIcon> = {
  new_message: "message",
  event_application: "event",
  followed_created_event: "event",
  reminder: "event",
  job_interest: "job",
  invite_accepted: "member",
  followed_posted_project: "project",
  backing_received: "money",
  gift_opened: "money",
  member_gift_out: "money",
  class_purchased: "money",
  grant_proposal_decided: "money",
  grant_proposal_approved: "money",
  gift_received: "money",
  fund_award: "money",
  new_follower: "heart",
  likes_digest: "heart",
  encouragement: "heart",
  help_offered: "heart",
  update: "news",
  announcement: "news",
  org_joined: "org",
  org_added: "org",
};

/** The icon for a notification type. Unknown types get a plain bell. */
export function inboxIcon(type: string): InboxIcon {
  const exact = EXACT[type];
  if (exact) return exact;
  // Someone joining a team reads as a new member, not project news.
  if (type === "project_member_joined") return "member";
  // Paid gigs say so; the rest of a gig's life sits with jobs ("Jobs and gigs").
  if (type === "gig_paid" || type === "gig_paid_confirmed") return "money";
  if (type.startsWith("gig_")) return "job";
  if (type.startsWith("project_")) return "project";
  return "other";
}

/**
 * One list, newest first. A new-message notification is dropped because its
 * conversation is already a row. Rows from the last seven days are `recent`;
 * anything unread stays there however old it is, so nothing unread hides
 * behind Archive.
 */
export function buildInbox(
  conversations: readonly ConversationLike[],
  notifications: readonly NotificationLike[],
  unreadNotificationIds: ReadonlySet<string>,
  now: number,
): { recent: InboxRow[]; archived: InboxRow[] } {
  const rows: InboxRow[] = [
    ...conversations.map((c) => ({
      key: `c:${c._id}`,
      icon: "message" as const,
      title: c.participant.name,
      preview: c.lastMessagePreview || "No messages yet",
      at: c.lastMessageAt,
      unread: c.unreadCount > 0,
      href: `/messages/${c._id}`,
    })),
    ...notifications
      .filter((n) => n.type !== "new_message")
      .map((n) => ({
        key: `n:${n._id}`,
        icon: inboxIcon(n.type),
        title: n.title,
        preview: n.message,
        at: n.createdAt,
        unread: unreadNotificationIds.has(n._id),
        href: n.linkUrl ?? null,
      })),
  ].sort((a, b) => b.at - a.at);

  const since = now - INBOX_RECENT_DAYS * DAY_MS;
  const recent: InboxRow[] = [];
  const archived: InboxRow[] = [];
  for (const row of rows) (row.at >= since || row.unread ? recent : archived).push(row);
  return { recent, archived };
}
