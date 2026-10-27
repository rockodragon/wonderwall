// The top of an invite link (routes/signup.tsx): who invited you, to what, and
// that joining is free (CLAIMS.join). On a Garden domain: The Garden's mark
// and the one line its home page leads with (CLAIMS.heroGarden); the
// community's tagline and description were too much here (Rick, 2026-10-27).
// Elsewhere: TheCreative.exchange's name. Nothing about other members: anyone
// with the link sees this.

import { GARDEN_NAME, PLATFORM_NAME } from "../../convex/garden/brandHosts";
import { useBrand } from "../brand/brands";
import { GardenLockupThemed } from "../brand/GardenMark";
import { CLAIMS } from "../constants/claims";
import { shownInterests } from "../constants/interests";
import { PersonAvatar } from "./PersonAvatar";

/** The inviter's interests shown: a few, not their whole list. */
export const INVITER_INTERESTS = 3;

export function InviteWelcome({
  inviter,
}: {
  inviter: { name: string; imageUrl?: string | null; interests?: readonly string[] };
}) {
  const garden = useBrand() === "garden";
  const place = garden ? GARDEN_NAME : PLATFORM_NAME;
  const interests = shownInterests(inviter.interests).slice(0, INVITER_INTERESTS);

  return (
    <section className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-lg border border-gray-200 dark:border-gray-700">
      {garden && (
        <div className="mb-5 text-gray-900 dark:text-white">
          <GardenLockupThemed fontSize={20} />
        </div>
      )}
      <div className="flex items-center gap-4">
        <PersonAvatar name={inviter.name} imageUrl={inviter.imageUrl} size="lg" tone="gray" />
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold leading-tight text-gray-900 dark:text-white">
            {inviter.name} invited you to {place}
          </h1>
          {interests.length > 0 && (
            <p className="mt-0.5 text-[13.5px] text-gray-500 dark:text-gray-400">{interests.join(" · ")}</p>
          )}
        </div>
      </div>
      {garden && (
        <p className="mt-5 border-t border-gray-100 pt-5 text-[15px] font-semibold leading-snug text-gray-900 dark:border-gray-700 dark:text-white">
          {CLAIMS.heroGarden}
        </p>
      )}
      <p className={`text-[13.5px] font-medium text-gray-600 dark:text-gray-400 ${garden ? "mt-3" : "mt-5"}`}>
        {CLAIMS.join}
      </p>
    </section>
  );
}
