// Updates (docs/features/desk-updates.md): the small pure rules the desk, the
// phone Today page and /admin/updates share. No React, no Convex calls, so
// each rule can be tested on its own.
//
// The limits are a hand copy of convex/updates.ts: that file imports server
// code, so the client can't. updates.test.ts checks they still match.

import type { FunctionArgs } from "convex/server";
import type { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

export const TITLE_MAX = 80;
export const BODY_MAX = 600;
export const ACTION_LABEL_MAX = 24;
export const NEW_FOR_DAYS_DEFAULT = 14;
export const NEW_FOR_DAYS_MIN = 1;
export const NEW_FOR_DAYS_MAX = 90;

export type UpdateAudience = "everyone" | "community" | "new";
export type UpdateStatus = "draft" | "published" | "archived";

// ——————————————————————————————————————————————————————————————
// Card ids and the button
// ——————————————————————————————————————————————————————————————

const CARD_PREFIX = "update:";

/** The desk card id for an Update: `update:<id>`. */
export function updateCardId(updateId: string): `update:${string}` {
  return `${CARD_PREFIX}${updateId}`;
}

/** The Update behind a desk card id, or null for any other card. */
export function updateIdOf(cardId: string | null | undefined): string | null {
  return cardId && cardId.startsWith(CARD_PREFIX) && cardId.length > CARD_PREFIX.length ? cardId.slice(CARD_PREFIX.length) : null;
}

/** Where an Update's button goes: an in-app path is followed in the app, an
 * https:// link opens in a new tab. */
export type ActionTarget = { kind: "app" | "external"; href: string };

export function actionTarget(url: string): ActionTarget {
  return { kind: url.startsWith("/") ? "app" : "external", href: url };
}

// ——————————————————————————————————————————————————————————————
// The admin list
// ——————————————————————————————————————————————————————————————

/** "Everyone", the community's name, or "New members, first 14 days". */
export function audienceLabel(
  u: { audience: UpdateAudience; newForDays?: number | null },
  communityName?: string | null,
): string {
  if (u.audience === "community") return communityName || "A community";
  if (u.audience === "new") {
    const days = u.newForDays ?? NEW_FOR_DAYS_DEFAULT;
    return `New members, first ${days} ${days === 1 ? "day" : "days"}`;
  }
  return "Everyone";
}

/** "Opened 12 · Clicked 3 · Archived 10 of 40" */
export function statsLine(u: { opened: number; clicked: number; archived: number; audienceNow: number }): string {
  return `Opened ${u.opened} · Clicked ${u.clicked} · Archived ${u.archived} of ${u.audienceNow}`;
}

export type StatusWord = "Draft" | "Published" | "Scheduled" | "Ended" | "Archived";

/** A published Update that hasn't started, or has ended, isn't on anyone's
 * desk, so the list says so. */
export function statusWord(u: { status: UpdateStatus; startsAt: number; endsAt?: number | null }, now: number): StatusWord {
  if (u.status === "draft") return "Draft";
  if (u.status === "archived") return "Archived";
  if (u.startsAt > now) return "Scheduled";
  if (u.endsAt != null && u.endsAt <= now) return "Ended";
  return "Published";
}

function dayAndTime(ms: number): string {
  return new Date(ms).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function day(ms: number): string {
  return new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** "Oct 1, 9:00 AM → Oct 8, 5:00 PM", or "From Oct 1, 9:00 AM" with no end. */
export function datesLabel(startsAt: number, endsAt?: number | null): string {
  return endsAt != null ? `${dayAndTime(startsAt)} → ${dayAndTime(endsAt)}` : `From ${dayAndTime(startsAt)}`;
}

/** "Sent to 40 · Oct 2" */
export function sentLabel(sentCount: number | undefined, sentAt: number): string {
  return `Sent to ${sentCount ?? 0} · ${day(sentAt)}`;
}

/** "128 people", "1 person" */
export function peopleLabel(n: number): string {
  return `${n.toLocaleString("en-US")} ${n === 1 ? "person" : "people"}`;
}

// ——————————————————————————————————————————————————————————————
// The editor's form
// ——————————————————————————————————————————————————————————————

const pad = (n: number) => String(n).padStart(2, "0");

/** A time as a <input type="datetime-local"> value, in the browser's zone. */
export function toLocalInput(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** The time a <input type="datetime-local"> value names; null when empty or not a date. */
export function fromLocalInput(value: string): number | null {
  if (!value.trim()) return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

/** Everything the editor holds, as the inputs hold it (strings). */
export type UpdateForm = {
  title: string;
  body: string;
  /** The stored picture, if the Update has one. */
  imageStorageId: Id<"_storage"> | null;
  /** What to show for the picture: the stored one, or the file just picked. */
  imageUrl: string | null;
  actionLabel: string;
  actionUrl: string;
  audience: UpdateAudience;
  hostOrgId: string;
  newForDays: string;
  startsAt: string;
  endsAt: string;
  order: string;
};

/** A new Update: no text, to everyone, starting now, after the others. */
export function emptyForm(now: number, order: number): UpdateForm {
  return {
    title: "",
    body: "",
    imageStorageId: null,
    imageUrl: null,
    actionLabel: "",
    actionUrl: "",
    audience: "everyone",
    hostOrgId: "",
    newForDays: String(NEW_FOR_DAYS_DEFAULT),
    startsAt: toLocalInput(now),
    endsAt: "",
    order: String(order),
  };
}

/** The fields of api.updates.adminList the form is filled from. */
export type FormSource = {
  title: string;
  body: string;
  imageStorageId?: Id<"_storage"> | null;
  imageUrl: string | null;
  actionLabel?: string | null;
  actionUrl?: string | null;
  audience: UpdateAudience;
  hostOrgId?: Id<"hostOrgs"> | null;
  newForDays?: number | null;
  startsAt: number;
  endsAt?: number | null;
  order: number;
};

export function formFrom(u: FormSource): UpdateForm {
  return {
    title: u.title,
    body: u.body,
    imageStorageId: u.imageStorageId ?? null,
    imageUrl: u.imageUrl,
    actionLabel: u.actionLabel ?? "",
    actionUrl: u.actionUrl ?? "",
    audience: u.audience,
    hostOrgId: u.hostOrgId ?? "",
    newForDays: String(u.newForDays ?? NEW_FOR_DAYS_DEFAULT),
    startsAt: toLocalInput(u.startsAt),
    endsAt: u.endsAt != null ? toLocalInput(u.endsAt) : "",
    order: String(u.order),
  };
}

export type SaveArgs = FunctionArgs<typeof api.updates.save>;

/** The form as api.updates.save takes it. The server checks every rule on
 * the text; this only turns the inputs into numbers, and sends hostOrgId only
 * with a community and newForDays only with "new". An edit replaces the whole
 * record, so an empty optional field is left out and gets cleared. */
export function saveArgs(
  form: UpdateForm,
  updateId?: Id<"updates">,
): { ok: true; args: SaveArgs } | { ok: false; message: string } {
  const startsAt = fromLocalInput(form.startsAt);
  if (startsAt === null) return { ok: false, message: "Pick a start." };
  const endsAt = fromLocalInput(form.endsAt);
  if (form.endsAt.trim() && endsAt === null) return { ok: false, message: "Pick an end." };
  const order = Number(form.order);
  if (!form.order.trim() || !Number.isFinite(order)) return { ok: false, message: "Order must be a number." };

  const args: SaveArgs = {
    updateId,
    title: form.title,
    body: form.body,
    imageStorageId: form.imageStorageId ?? undefined,
    actionLabel: form.actionLabel.trim() || undefined,
    actionUrl: form.actionUrl.trim() || undefined,
    audience: form.audience,
    startsAt,
    endsAt: endsAt ?? undefined,
    order,
  };
  if (form.audience === "community" && form.hostOrgId) args.hostOrgId = form.hostOrgId as Id<"hostOrgs">;
  if (form.audience === "new") {
    const days = Number(form.newForDays);
    if (!form.newForDays.trim() || !Number.isFinite(days)) return { ok: false, message: "Days must be a number." };
    args.newForDays = days;
  }
  return { ok: true, args };
}

/** The next free place in the order, for a new Update. */
export function nextOrder(updates: readonly { order: number }[]): number {
  return updates.length === 0 ? 1 : Math.floor(Math.max(...updates.map((u) => u.order))) + 1;
}
