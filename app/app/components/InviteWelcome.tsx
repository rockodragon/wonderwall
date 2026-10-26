// The top of an invite link (routes/signup.tsx): who invited you, to what, in
// the community's own words, and that joining is free (CLAIMS.join). On a
// Garden domain: The Garden's mark, its tagline and the first paragraph of its
// description, from host tools as on its home page (brand/GardenHome.tsx);
// nothing about The Garden is written here. Elsewhere: TheCreative.exchange's
// name. Nothing about other members: anyone with the link sees this.

import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { GARDEN_NAME, PLATFORM_NAME } from "../../convex/garden/brandHosts";
import { useBrand } from "../brand/brands";
import { GardenLockupThemed } from "../brand/GardenMark";
import { CLAIMS } from "../constants/claims";
import { shownInterests } from "../constants/interests";
import { GARDEN_SLUG } from "../lib/communitySlugs";
import { stripInlineMarks } from "../lib/richText";
import { textParagraphs } from "../lib/textParagraphs";
import { PersonAvatar } from "./PersonAvatar";

/** The inviter's interests shown: a few, not their whole list. */
export const INVITER_INTERESTS = 3;

export function InviteWelcome({
  inviter,
}: {
  inviter: { name: string; imageUrl?: string | null; interests?: readonly string[] };
}) {
  const garden = useBrand() === "garden";
  const landing = useQuery(api.garden.communityDomains.getCommunityLanding, garden ? { slug: GARDEN_SLUG } : "skip");
  const place = garden ? GARDEN_NAME : PLATFORM_NAME;
  const tagline = landing?.tagline ? stripInlineMarks(landing.tagline).trim() : null;
  const [lead] = textParagraphs(landing?.description, stripInlineMarks);
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
      {(tagline || lead) && (
        <div className="mt-5 border-t border-gray-100 pt-5 dark:border-gray-700">
          {tagline && <p className="text-[15px] font-semibold text-gray-900 dark:text-white">{tagline}</p>}
          {lead && <p className="mt-1.5 text-[15px] leading-relaxed text-gray-700 dark:text-gray-300">{lead}</p>}
        </div>
      )}
      <p className={`text-[13.5px] font-medium text-gray-600 dark:text-gray-400 ${tagline || lead ? "mt-3" : "mt-5"}`}>
        {CLAIMS.join}
      </p>
    </section>
  );
}
