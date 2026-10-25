import { useMutation, useQuery } from "convex/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import {
  Bell,
  Briefcase,
  Buildings,
  CalendarBlank,
  CurrencyDollar,
  EnvelopeSimple,
  Heart,
  Megaphone,
  PaintBrush,
  PencilSimpleLine,
  UserPlus,
  type Icon,
} from "@phosphor-icons/react";
import { api } from "../../convex/_generated/api";
import { NewMessage } from "../components/NewMessage";
import { PastUpdates } from "../components/PastUpdates";
import { timeAgo } from "../lib/dates";
import { PAGE_WIDTH } from "../lib/pageWidth";
import { PageTop, TopButton } from "../components/phone/PageTop";
import { buildInbox, type InboxIcon, type InboxRow } from "../lib/inbox";
import { initialsOf } from "../lib/initials";

// Notifications fetched for the inbox. Retention deletes read ones after
// 30 days, so this covers the archive for nearly everyone.
const NOTIFICATIONS_FETCH = 100;

const ICONS: Record<InboxIcon, Icon> = {
  message: EnvelopeSimple,
  event: CalendarBlank,
  job: Briefcase,
  member: UserPlus,
  project: PaintBrush,
  money: CurrencyDollar,
  heart: Heart,
  news: Megaphone,
  org: Buildings,
  other: Bell,
};

export default function MessagesIndex() {
  const conversations = useQuery(api.messaging.getConversations);
  const notifications = useQuery(api.notifications.getNotifications, {
    limit: NOTIFICATIONS_FETCH,
  });
  const [showArchive, setShowArchive] = useState(false);

  // The New message box, and the button that opens it.
  const [composing, setComposing] = useState(false);
  const newMessageButton = useRef<HTMLButtonElement>(null);
  const closeComposer = useCallback((restoreFocus: boolean) => {
    setComposing(false);
    if (restoreFocus) newMessageButton.current?.focus();
  }, []);

  // The unread badge is Messages + Notifications combined, and this page is
  // where notifications are read — so mounting it clears them.
  const markAllNotificationsRead = useMutation(api.notifications.markAllAsRead);
  useEffect(() => {
    markAllNotificationsRead({});
  }, []);

  // markAllAsRead fires on mount, so the live query flips every readAt a
  // render or two later. Capture which rows were unread the first time data
  // arrives and keep them marked for the life of the page.
  const initialUnreadIds = useRef<Set<string> | null>(null);
  if (notifications !== undefined && initialUnreadIds.current === null) {
    initialUnreadIds.current = new Set(
      notifications.filter((n) => n.readAt === undefined).map((n) => n._id as string),
    );
  }

  const inbox = useMemo(
    () =>
      conversations === undefined || notifications === undefined
        ? null
        : buildInbox(conversations, notifications, initialUnreadIds.current ?? new Set(), Date.now()),
    [conversations, notifications],
  );

  return (
    <div className={`p-4 sm:p-6 ${PAGE_WIDTH.reading} mx-auto`}>
      {/* The page's bar (docs/features/phone-screens.md): sticky on a phone,
          the heading row on desktop. New opens the composer under it. */}
      <PageTop
        className="mb-4 md:mb-6"
        title="Messages"
        action={
          <TopButton
            ref={newMessageButton}
            onClick={() => setComposing((v) => !v)}
            aria-expanded={composing}
            icon={<PencilSimpleLine size={16} weight="bold" aria-hidden />}
          >
            New
          </TopButton>
        }
      />

      {composing && <NewMessage onClose={closeComposer} anchorRef={newMessageButton} />}

      {inbox === null ? (
        <div className="flex items-center justify-center py-16">
          <div
            className="animate-spin rounded-full h-8 w-8 border-b-2"
            style={{ borderBottomColor: "var(--app-accent)" }}
          />
        </div>
      ) : inbox.recent.length === 0 && inbox.archived.length === 0 ? (
        <div className="text-center py-16" style={{ color: "var(--app-text-dim)" }}>
          <EnvelopeSimple className="w-12 h-12 mx-auto mb-4" />
          <p className="text-lg font-medium mb-1" style={{ color: "var(--app-text-muted)" }}>
            No messages yet
          </p>
          <p className="text-sm">Start one with New message.</p>
        </div>
      ) : (
        <>
          {inbox.recent.length > 0 ? (
            <InboxList rows={inbox.recent} />
          ) : (
            <p className="text-sm py-4" style={{ color: "var(--app-text-dim)" }}>
              Nothing new in the last week.
            </p>
          )}

          {inbox.archived.length > 0 && (
            <div className="mt-4">
              <button
                type="button"
                aria-expanded={showArchive}
                onClick={() => setShowArchive((v) => !v)}
                className="text-[13.5px] font-medium px-3 py-1.5 rounded-lg border transition-colors hover:bg-[var(--app-hairline-raised)]"
                style={{ color: "var(--app-text-muted)", borderColor: "var(--app-hairline)" }}
              >
                {showArchive ? "Hide archive" : `Archive · ${inbox.archived.length}`}
              </button>
              {showArchive && (
                <div className="mt-3">
                  <InboxList rows={inbox.archived} />
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Updates you've read or that have ended — hidden when there are none */}
      <PastUpdates />
    </div>
  );
}

function InboxList({ rows }: { rows: InboxRow[] }) {
  return (
    <ul
      className="rounded-2xl border divide-y divide-[var(--app-hairline)] overflow-hidden"
      style={{ backgroundColor: "var(--app-surface-raised)", borderColor: "var(--app-hairline)" }}
    >
      {rows.map((row) => (
        <li key={row.key}>
          <InboxRowView row={row} />
        </li>
      ))}
    </ul>
  );
}

function InboxRowView({ row }: { row: InboxRow }) {
  const RowIcon = ICONS[row.icon];
  // The person's photo, else their initials, else the icon for the kind of
  // row. The title already says who, so the picture is decoration.
  const [photoFailed, setPhotoFailed] = useState(false);
  const photo = row.avatar?.imageUrl && !photoFailed ? row.avatar.imageUrl : null;
  const hasName = Boolean(row.avatar?.name.trim());
  const className = `flex items-start gap-3 px-4 py-3 transition-colors ${
    row.href ? "hover:bg-[var(--app-hairline-raised)]" : ""
  }`;
  const content = (
    <>
      <span
        className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden"
        style={
          !photo && hasName
            ? { backgroundColor: "var(--app-accent-wash)", color: "var(--app-text)" }
            : { backgroundColor: "var(--app-hairline-raised)", color: "var(--app-text-muted)" }
        }
        aria-hidden
      >
        {photo ? (
          <img
            src={photo}
            alt=""
            loading="lazy"
            onError={() => setPhotoFailed(true)}
            className="w-full h-full object-cover"
          />
        ) : hasName ? (
          <span className="text-[13px] font-semibold">{initialsOf(row.avatar?.name)}</span>
        ) : (
          <RowIcon className="w-[18px] h-[18px]" />
        )}
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-2">
          <p
            className={`text-sm truncate ${row.unread ? "font-semibold" : "font-medium"}`}
            style={{ color: "var(--app-text)" }}
          >
            {row.title}
          </p>
          <span className="text-xs flex-shrink-0" style={{ color: "var(--app-text-dim)" }}>
            {timeAgo(row.at)}
          </span>
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <p
            className="text-sm line-clamp-2 flex-1"
            style={{ color: row.unread ? "var(--app-text-muted)" : "var(--app-text-dim)" }}
          >
            {row.preview}
          </p>
          {row.unread && (
            <>
              <span
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: "var(--app-accent)" }}
                aria-hidden
              />
              <span className="sr-only">Unread</span>
            </>
          )}
        </div>
      </div>
    </>
  );
  return row.href ? (
    <Link to={row.href} className={className}>
      {content}
    </Link>
  ) : (
    <div className={className}>{content}</div>
  );
}
