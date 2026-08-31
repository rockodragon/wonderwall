import { useState } from "react";
import {
  buildGoogleCalendarUrl,
  buildIcs,
  icsFileName,
  type CalendarEventInput,
} from "../lib/eventCalendar";

// docs/gated-event-video-prd.md, "Calendar invite". Two affordances because
// two are enough: Google's template URL covers the common case, the .ics
// covers Apple Calendar, Outlook and everything else. Both are generated in
// the browser from fields the page already has — no server round trip.
//
// Whatever the calendar entry ends up holding, the link inside it is the
// /j/{eventId} proxy, never the real meeting URL. See lib/eventCalendar.ts.

export function AddToCalendar({
  event,
  className = "",
}: {
  event: CalendarEventInput;
  className?: string;
}) {
  const [downloaded, setDownloaded] = useState(false);

  function handleDownloadIcs() {
    const blob = new Blob([buildIcs(event)], {
      type: "text/calendar;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = icsFileName(event.title);
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    // Safari needs the object URL alive past the click.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setDownloaded(true);
    setTimeout(() => setDownloaded(false), 2000);
  }

  return (
    <div className={className}>
      <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">
        Add to calendar
      </h3>
      <div className="flex flex-wrap gap-2">
        <a
          href={buildGoogleCalendarUrl(event)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
        >
          <CalendarPlusIcon />
          Google Calendar
        </a>
        <button
          type="button"
          onClick={handleDownloadIcs}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
        >
          <DownloadIcon />
          {downloaded ? "Downloaded" : "Apple / Outlook (.ics)"}
        </button>
      </div>
      <p className="mt-2 text-xs text-gray-600 dark:text-gray-300">
        The invite carries a permanent join link, so it keeps working even if
        the organizer changes the room.
      </p>
    </div>
  );
}

function CalendarPlusIcon() {
  return (
    <svg
      className="w-4 h-4"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
      />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg
      className="w-4 h-4"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3"
      />
    </svg>
  );
}
