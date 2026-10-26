import type { Id } from "./_generated/dataModel";
import { v } from "convex/values";

export const emailSendValidators = {
  to: v.string(), subject: v.string(), previewText: v.string(), heading: v.string(), body: v.string(),
  ctaText: v.optional(v.string()), ctaUrl: v.optional(v.string()),
  category: v.optional(v.union(v.literal("activity"), v.literal("digest"), v.literal("announcements"), v.literal("transactional"))),
  unsubscribeToken: v.optional(v.string()), sender: v.optional(v.union(v.literal("platform"), v.literal("community"))),
  communityId: v.optional(v.id("hostOrgs")), recipientUserId: v.optional(v.id("users")),
  contactId: v.optional(v.id("emailDeliveries")),
};

export const CONTACT_GAP_MS = 24 * 60 * 60 * 1000;
export const CONTACT_LEASE_MS = 5 * 60 * 1000;
export const CONTACT_MAX_ATTEMPTS = 3;

export type ContactPolicy = "standard" | "transactional" | "first_cheer";
export type ContactGoal = "no_project" | "unread_message";

export type EmailContactMetadata = {
  dedupeKey: string;
  journeyKey?: string;
  journeyRunId?: string;
  sourceType?: string;
  sourceId?: string;
  policy?: ContactPolicy;
  goal?: ContactGoal;
  conversationId?: Id<"conversations">;
  messageId?: Id<"messages">;
  blockedUserId?: Id<"users">;
  nudgeLogId?: Id<"nudgeLog">;
};

export type ProviderStatus = "sent" | "delivered" | "delayed" | "failed" | "bounced" | "suppressed" | "complained";

const PROVIDER_STATUS_ORDER: Record<ProviderStatus, number> = {
  sent: 0,
  delayed: 1,
  delivered: 2,
  failed: 3,
  bounced: 4,
  suppressed: 5,
  complained: 6,
};

/** Replays cannot erase a delivery or complaint, regardless of arrival order. */
export function acceptsProviderEvent(
  current: { status: string; lastProviderEventAt?: number },
  incoming: { status: ProviderStatus; eventAt: number },
): boolean {
  const previousOrder = PROVIDER_STATUS_ORDER[current.status as ProviderStatus];
  if (previousOrder !== undefined && PROVIDER_STATUS_ORDER[incoming.status] < previousOrder) return false;
  if (current.lastProviderEventAt !== undefined && incoming.eventAt < current.lastProviderEventAt) return false;
  return true;
}

export function contactRetryAt(now: number, attempts: number, retryable: boolean): number | null {
  if (!retryable || attempts >= CONTACT_MAX_ATTEMPTS) return null;
  return now + (attempts === 1 ? 60_000 : 5 * 60_000);
}

export function reservedUntil(row: { cooldownAt?: number; leaseUntil?: number; status: string }): number | null {
  if (row.cooldownAt === undefined) return null;
  if (row.status === "queued") return row.leaseUntil ?? null;
  if (["sent", "accepted", "delivered", "delayed", "bounced", "complained", "failed"].includes(row.status)) {
    return row.cooldownAt + CONTACT_GAP_MS;
  }
  return null;
}
