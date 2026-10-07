// "Hosted by …" with each host a link: an organization to its page here
// (/orgs/:slug, public), a person to their profile. One rule for the event
// page and the canvas's opened event card (Rick, 2026-10-07: the card showed
// them as plain text). An organization from before org pages has no page
// yet, and a signed-out visitor gets plain person names, since /profile/:id
// needs sign-in. The order and wording come from lib/eventHosts.ts.

import { Link } from "react-router";
import type { HostLabel } from "../lib/eventHosts";

const TONES = {
  /** The event page: its light/dark Tailwind palette. */
  page: {
    name: "font-medium text-gray-900 dark:text-white",
    link: "font-medium text-gray-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400",
    aside: "text-gray-600 dark:text-gray-300",
    asideLink: "hover:text-blue-600 dark:hover:text-blue-400",
  },
  /** The canvas: always dark, the accent on hover, underlined so it reads as a link. */
  desk: {
    name: "text-[#D6D6D6]",
    link: "text-[#D6D6D6] underline decoration-[#5a5a55] underline-offset-4 hover:text-[#FFE066] hover:decoration-[#FFE066]",
    aside: "",
    asideLink: "underline decoration-[#5a5a55] underline-offset-4 hover:text-[#FFE066] hover:decoration-[#FFE066]",
  },
} as const;

export function HostedBy({
  hosts,
  linkPeople,
  tone = "page",
}: {
  hosts: readonly HostLabel[];
  /** False for a signed-out visitor: people show as names only. */
  linkPeople: boolean;
  tone?: keyof typeof TONES;
}) {
  const t = TONES[tone];
  return (
    <>
      Hosted by{" "}
      {hosts.map((h, idx) => (
        <span key={`${h.primary}-${idx}`}>
          {idx > 0 && ", "}
          {h.orgSlug ? (
            <Link to={`/orgs/${h.orgSlug}`} className={t.link}>
              {h.primary}
            </Link>
          ) : h.profileId && linkPeople && !h.person ? (
            <Link to={`/profile/${h.profileId}`} className={t.link}>
              {h.primary}
            </Link>
          ) : (
            <span className={t.name}>{h.primary}</span>
          )}
          {h.person && (
            <span className={t.aside}>
              {" ("}
              {h.profileId && linkPeople ? (
                <Link to={`/profile/${h.profileId}`} className={t.asideLink}>
                  {h.person}
                </Link>
              ) : (
                h.person
              )}
              {")"}
            </span>
          )}
        </span>
      ))}
    </>
  );
}
