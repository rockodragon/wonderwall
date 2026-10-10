// Under every sign-up name field: an account is a person. An organization
// gets its own page, which people add to their profile — never a login of
// its own (Rick, 2026-10-10: "make it clear ... so they cant make mistakes
// like this going forward"). Typing an organization's exact name says so.

import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

export function PersonNameHint({ name }: { name: string }) {
  const typed = name.trim();
  const match = useQuery(api.organizations.matchByName, typed.length >= 3 ? { name: typed } : "skip");
  if (match) {
    return (
      <p role="alert" className="mt-1.5 text-[13.5px] text-amber-800 dark:text-amber-300">
        {match.name} is an organization here. Use your own name, then add {match.name} to your profile.
      </p>
    );
  }
  return (
    <p className="mt-1.5 text-[13.5px] text-gray-600 dark:text-gray-300">
      Your own name. Organizations get their own page.
    </p>
  );
}
