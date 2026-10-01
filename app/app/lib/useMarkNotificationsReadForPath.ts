import { useConvexAuth, useMutation } from "convex/react";
import { useEffect, useRef } from "react";
import { useLocation } from "react-router";
import { api } from "../../convex/_generated/api";

// A bell notification only clears when it's clicked in the bell list or via
// "mark all read". Reaching the same page another way — an email CTA, a
// direct link, the conversation list — left it unread and the badge count
// drifting from what the page actually shows. This mounts once in the
// signed-in app shell and, on every route change, tells the backend "the
// user is now looking at this path" so it can clear any unread notification
// pointed here (notifications.markReadByLinkUrl).
export function useMarkNotificationsReadForPath() {
  const { isAuthenticated } = useConvexAuth();
  const location = useLocation();
  const markReadByLinkUrl = useMutation(api.notifications.markReadByLinkUrl);
  const lastPathRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated) return;
    if (lastPathRef.current === location.pathname) return;
    lastPathRef.current = location.pathname;

    markReadByLinkUrl({ linkUrl: location.pathname }).catch(() => {
      // Best-effort — a failed clear just leaves the badge stale until the
      // next navigation or an explicit mark-as-read.
    });
  }, [isAuthenticated, location.pathname, markReadByLinkUrl]);
}
