import { usePostHog } from "@posthog/react";
import { useMutation, useQuery } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { api } from "../../convex/_generated/api";

/**
 * The signed-in member's personal invite link, shared by the sidebar card
 * (InviteCTA) and the Network tab in Settings. Generates the slug on first
 * use if the account doesn't have one yet, and owns the copy-to-clipboard
 * state so both surfaces behave the same.
 */
export function useInviteLink(variant: "sidebar" | "settings" | "people" | "palette") {
  const posthog = usePostHog();
  const inviteLink = useQuery(api.invites.getMyInviteLink);
  const generateSlug = useMutation(api.invites.generateInviteSlug);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (inviteLink && !inviteLink.slug && !generating) {
      setGenerating(true);
      generateSlug({})
        .catch((err) => console.error("Failed to generate slug:", err))
        .finally(() => setGenerating(false));
    }
  }, [inviteLink, generateSlug, generating]);

  useEffect(() => () => {
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
  }, []);

  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const url = inviteLink?.slug ? `${origin}/signup/${inviteLink.slug}` : "";
  // What we show: the same link without the scheme, so it fits and wraps.
  const displayUrl = url.replace(/^https?:\/\//, "");
  const unlimited = Boolean(inviteLink?.unlimitedInvites);
  const hasUsesLeft = unlimited || (inviteLink?.remainingUses ?? 0) > 0;

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      return;
    }
    setCopied(true);
    posthog?.capture("invite_link_copied", {
      variant,
      invites_used: inviteLink?.usageCount,
      invites_remaining: unlimited ? "unlimited" : inviteLink?.remainingUses,
    });
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setCopied(false), 2000);
  }

  const canShare =
    typeof navigator !== "undefined" && typeof navigator.share === "function";
  async function share() {
    if (!url || !canShare) return;
    try {
      await navigator.share({
        title: "Join me on TheCreative.exchange",
        text: "Here's my invite to TheCreative.exchange.",
        url,
      });
      posthog?.capture("invite_link_shared", { variant });
    } catch {
      // Dismissed share sheet — nothing to do.
    }
  }

  return {
    loading: inviteLink === undefined || generating || (!!inviteLink && !inviteLink.slug),
    inviteLink,
    url,
    displayUrl,
    unlimited,
    hasUsesLeft,
    copied,
    copy,
    canShare,
    share,
  };
}

/** "Unlimited invites" / "3 of 8 invites left" — one phrasing for both surfaces. */
export function inviteAllowanceLabel(
  link: { remainingUses: number; currentLimit: number; unlimitedInvites?: boolean } | null | undefined,
): string {
  if (!link) return "";
  if (link.unlimitedInvites) return "Unlimited invites";
  return `${link.remainingUses} of ${link.currentLimit} invites left`;
}
