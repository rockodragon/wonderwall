// Shared "post to a community (optional)" select — wired into the four
// content-creation forms (PaidProjectForm/PassionProjectForm in
// routes/projects.tsx, CreateEventModal, PostOfferingForm in
// routes/offerings.tsx). Renders nothing when the signed-in user belongs to
// no active communities, per community-groups.md §0/§5: a community is just
// a tag on content the person still owns, so a person in no community sees
// no picker at all rather than an empty, pointless select.
//
// Two visual variants because the four host forms use two different design
// systems: the garden `--garden-*` token forms (Projects, Offerings) and
// CreateEventModal's plain Tailwind gray/dark-mode classes. `variant` picks
// which one to render as; the underlying <select> and its options are
// identical either way.

import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

const EMPTY_VALUE = "";

export function CommunityPicker({
  value,
  onChange,
  variant = "garden",
  className,
}: {
  /** The selected community's hostOrgId, or "" for none. */
  value: string;
  onChange: (hostOrgId: string) => void;
  variant?: "garden" | "tailwind";
  className?: string;
}) {
  const communities = useQuery(api.garden.communities.listMyCommunities);
  const active = (communities ?? []).filter((c) => c.status === "active");

  // Nothing to post into: render nothing at all (not an empty/disabled
  // select) — same "don't show a control with only one useless option"
  // instinct as the rest of these forms.
  if (communities === undefined || active.length === 0) return null;

  if (variant === "tailwind") {
    return (
      <div className={className}>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Post to a community (optional)
        </label>
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-white"
        >
          <option value={EMPTY_VALUE}>No community — just me</option>
          {active.map((c) => (
            <option key={c._id} value={c._id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
    );
  }

  return (
    <div className={className}>
      <label
        className="block text-xs uppercase tracking-[0.06em] mb-1.5"
        style={{ color: "var(--garden-dim)" }}
      >
        Post to a community (optional)
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
        style={{
          backgroundColor: "var(--garden-ink)",
          borderColor: "var(--garden-hairline-raised)",
          color: "var(--garden-paper)",
        }}
      >
        <option value={EMPTY_VALUE}>No community — just me</option>
        {active.map((c) => (
          <option key={c._id} value={c._id}>
            {c.name}
          </option>
        ))}
      </select>
    </div>
  );
}
