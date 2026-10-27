// Under every sign-up name field: an account is a person. An organization
// gets its own page, which people add to their profile — never a login of
// its own (Rick, 2026-10-10: "make it clear ... so they cant make mistakes
// like this going forward"). Typing an organization's exact name says so.
//
// `onInk` is for a page that is always dark (onboarding): the same words at
// the phone's reading size, in colors that hold their contrast on ink in
// either color scheme.

import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

export function PersonNameHint({ name, onInk = false }: { name: string; onInk?: boolean }) {
  const typed = name.trim();
  const match = useQuery(api.organizations.matchByName, typed.length >= 3 ? { name: typed } : "skip");
  const size = onInk ? "mt-2 text-[15px]" : "mt-1.5 text-[13.5px]";
  if (match) {
    return (
      <p role="alert" className={`${size} ${onInk ? "text-amber-300" : "text-amber-800 dark:text-amber-300"}`}>
        {match.name} is an organization here. Use your own name, then add {match.name} to your profile.
      </p>
    );
  }
  return (
    <p
      className={`${size} ${onInk ? "" : "text-gray-600 dark:text-gray-300"}`}
      style={onInk ? { color: "var(--garden-body)" } : undefined}
    >
      Your own name. Organizations get their own page.
    </p>
  );
}
