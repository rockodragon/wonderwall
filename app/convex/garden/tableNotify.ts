// Table email: a new date, a date that moved or was canceled, an accepted
// request, and "Run it again"; and, in the app as well as by email, the
// host hears when someone joins or asks, and a person hears when the host
// answers or removes them. One email path for all of them:
//   - people with an account go through scheduleNotificationEmail, so their
//     email preferences apply and the footer carries their unsubscribe link;
//   - guests with no account (Table guest RSVPs) go straight to
//     emails.sendNotificationEmail, carrying their RSVP's stop token, which
//     the same /unsubscribe/:token link and one-click POST understand
//     (emailPreferences.unsubscribeByToken → eventRsvps.stopGuestEmails).
// Every email names the Table's community as the sender. No email ever
// carries a meeting link: guests get the Table page, accounts the Event page,
// and both pages decide what the reader may see.

import type { MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import { escapeHtml } from "../email/template";
import { getUserEmail, scheduleNotificationEmail } from "../emailHelpers";
import { hasTableCommunityMembership, normalizeTable } from "./tablePolicy";
import { newGuestEmailToken, normalizeEmail } from "./eventRsvps";

// ——— Pure: words ———

/** "Thu, Oct 30, 7pm PDT". Events store no time zone; like the reminder
 * emails (announcements.ts formatReminderTime), times read in Pacific and
 * say so. */
export function formatTableDate(ms: number): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZoneName: "short",
  }).formatToParts(new Date(ms));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const minute = get("minute");
  const time = `${get("hour")}${minute && minute !== "00" ? `:${minute}` : ""}${get("dayPeriod").toLowerCase()}`;
  return `${get("weekday")}, ${get("month")} ${get("day")}, ${time} ${get("timeZoneName")}`.trim();
}

/** Where a date is, in words. Online says "Online" and nothing more: the
 * room link stays on the page, behind its own checks. */
export function placeWords(event: { location?: string; locationType?: string }): string {
  if (event.locationType === "online") return "Online";
  return event.location?.trim() || "Place to be announced";
}

export interface TableEmail {
  subject: string;
  previewText: string;
  heading: string;
  /** HTML; every interpolated value is escaped. */
  body: string;
  ctaText: string;
  ctaUrl: string;
}

const p = (text: string) => `<p style="margin:0 0 10px">${text}</p>`;

/** The Event page for people with an account; the Table page (where the
 * guest RSVP form is) for guests. */
function dateLink(table: Doc<"gardenTables">, eventId: Id<"events">, guest: boolean) {
  return guest ? `/tables/${table.slug}` : `/events/${eventId}`;
}

export function newDateEmail(
  table: Doc<"gardenTables">,
  event: Pick<Doc<"events">, "_id" | "datetime" | "location" | "locationType">,
  guest: boolean,
): TableEmail {
  const when = formatTableDate(event.datetime);
  const line = `${table.name} has a new date: ${when}.`;
  return {
    subject: `${table.name} has a new date`,
    previewText: line,
    heading: `${table.name} has a new date`,
    body:
      p(escapeHtml(line)) +
      p(`Where: ${escapeHtml(placeWords(event))}`) +
      (guest ? p("You asked us to tell you. RSVP on the Table's page.") : ""),
    ctaText: guest ? "RSVP" : "See the date",
    ctaUrl: dateLink(table, event._id, guest),
  };
}

export type DateChange = { time: boolean; place: boolean };

export function changedDateEmail(
  table: Doc<"gardenTables">,
  before: Pick<Doc<"events">, "datetime">,
  after: Pick<Doc<"events">, "_id" | "datetime" | "location" | "locationType">,
  change: DateChange,
  guest: boolean,
): TableEmail {
  const was = formatTableDate(before.datetime);
  const now = formatTableDate(after.datetime);
  const where = placeWords(after);
  const what = change.time && change.place ? "time and place" : change.time ? "time" : "place";
  const line = change.time
    ? `${table.name} moved from ${was} to ${now}.`
    : `${table.name} on ${now} has a new place.`;
  return {
    subject: `New ${what} for ${table.name}`,
    previewText: line,
    heading: `New ${what} for ${table.name}`,
    body: p(escapeHtml(line)) + p(`Where: ${escapeHtml(where)}`),
    ctaText: "See the date",
    ctaUrl: dateLink(table, after._id, guest),
  };
}

export function canceledDateEmail(
  table: Doc<"gardenTables">,
  event: Pick<Doc<"events">, "datetime">,
): TableEmail {
  const when = formatTableDate(event.datetime);
  const line = `${table.name} on ${when} is canceled.`;
  return {
    subject: `Canceled: ${table.name}, ${when}`,
    previewText: line,
    heading: `Canceled: ${table.name}`,
    body: p(escapeHtml(line)),
    ctaText: "See the Table",
    ctaUrl: `/tables/${table.slug}`,
  };
}

export function acceptedEmail(table: Doc<"gardenTables">): TableEmail {
  const paid = normalizeTable(table).pricingType === "fixed";
  const line = paid
    ? `The host said yes. Pay to take your chair at ${table.name}.`
    : `The host said yes. You have a chair at ${table.name}.`;
  return {
    subject: paid ? `The host said yes: ${table.name}` : `You're in: ${table.name}`,
    previewText: line,
    heading: paid ? "The host said yes" : "You're in",
    body: p(escapeHtml(line)),
    ctaText: paid ? "Pay for your chair" : "See the Table",
    ctaUrl: `/tables/${table.slug}`,
  };
}

export function runAgainEmail(
  table: Doc<"gardenTables">,
  firstEvent: Pick<Doc<"events">, "datetime" | "location" | "locationType">,
): TableEmail {
  const when = formatTableDate(firstEvent.datetime);
  const line = `${table.name} is happening again. First date: ${when}.`;
  return {
    subject: `${table.name} is happening again`,
    previewText: line,
    heading: `${table.name} is happening again`,
    body:
      p(escapeHtml(line)) +
      p(`Where: ${escapeHtml(placeWords(firstEvent))}`) +
      p("You were part of it last time. Join if you want a chair."),
    ctaText: "See the Table",
    ctaUrl: `/tables/${table.slug}`,
  };
}

// ——— Who ———

/** One guest address and the stop token its emails carry. */
export interface GuestRecipient {
  email: string;
  token: string;
}

/** The people at this Table now: active chairs that meet the Table's
 * payment and membership rules (the same rule as getTable's roster), plus
 * its hosts. */
export async function activeTablePeople(
  ctx: MutationCtx,
  table: Doc<"gardenTables">,
): Promise<Id<"users">[]> {
  const policy = normalizeTable(table);
  const rows = await ctx.db
    .query("tableMemberships")
    .withIndex("by_tableId", (q) => q.eq("tableId", table._id))
    .collect();
  const out = new Set<Id<"users">>();
  if (table.hostUserId) out.add(table.hostUserId);
  for (const id of table.coHostIds ?? []) out.add(id);
  for (const m of rows) {
    if ((m.status ?? "active") !== "active") continue;
    const hostRole = ["host", "co_host"].includes(m.role ?? "");
    if (!hostRole && policy.pricingType === "fixed" && m.paymentStatus !== "confirmed") continue;
    if (
      !hostRole &&
      policy.membershipRequired &&
      !(await hasTableCommunityMembership(ctx, m.userId, table.hostOrgId))
    )
      continue;
    out.add(m.userId);
  }
  return [...out];
}

/** A guest row's stop token, made on first use for rows saved before
 * tokens existed. */
async function tokenFor(ctx: MutationCtx, row: Doc<"eventRsvps">): Promise<string> {
  if (row.notifyToken) return row.notifyToken;
  const token = newGuestEmailToken();
  await ctx.db.patch(row._id, { notifyToken: token });
  return token;
}

/** Guest (no account) RSVP rows on these Events, one per address, that
 * haven't pressed stop. `optedIn` keeps only those who asked to hear about
 * new dates. */
export async function guestRecipients(
  ctx: MutationCtx,
  eventIds: Id<"events">[],
  opts: { optedIn: boolean },
): Promise<GuestRecipient[]> {
  const byEmail = new Map<string, Doc<"eventRsvps">[]>();
  for (const eventId of eventIds) {
    const rows = await ctx.db
      .query("eventRsvps")
      .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
      .collect();
    for (const row of rows) {
      if (row.userId) continue;
      const email = normalizeEmail(row.email);
      byEmail.set(email, [...(byEmail.get(email) ?? []), row]);
    }
  }
  const out: GuestRecipient[] = [];
  for (const [email, rows] of byEmail) {
    if (rows.some((r) => r.notifyStoppedAt)) continue;
    const pick = opts.optedIn ? rows.find((r) => r.notifyNewDates === true) : rows[0];
    if (!pick) continue;
    out.push({ email, token: await tokenFor(ctx, pick) });
  }
  return out;
}

/** Accounts with an RSVP on one date: an RSVP row or an application that
 * isn't declined (Table participants RSVP through events.apply). */
export async function accountsWithRsvp(
  ctx: MutationCtx,
  eventId: Id<"events">,
): Promise<Id<"users">[]> {
  const [rsvps, applications] = await Promise.all([
    ctx.db
      .query("eventRsvps")
      .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
      .collect(),
    ctx.db
      .query("eventApplications")
      .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
      .collect(),
  ]);
  const out = new Set<Id<"users">>();
  for (const r of rsvps) if (r.userId) out.add(r.userId);
  for (const a of applications) if (a.status !== "declined") out.add(a.applicantId);
  return [...out];
}

async function tableEventIds(ctx: MutationCtx, tableId: Id<"gardenTables">) {
  const events = await ctx.db
    .query("events")
    .withIndex("by_tableId", (q) => q.eq("tableId", tableId))
    .collect();
  return events.map((e) => e._id);
}

// ——— Send ———

/** Emails each account once and each guest address once. A guest address
 * that belongs to one of the accounts is skipped: that person already gets
 * the account's email. `exceptUserId` (the person who made the change) gets
 * nothing. Returns how many emails were queued or handed to the preference
 * check. */
export async function emailTableAudience(
  ctx: MutationCtx,
  opts: {
    table: Doc<"gardenTables">;
    userIds: Id<"users">[];
    guests: GuestRecipient[];
    exceptUserId?: Id<"users">;
    build: (guest: boolean) => TableEmail;
  },
): Promise<number> {
  const userIds = [...new Set(opts.userIds)].filter((id) => id !== opts.exceptUserId);
  const accountEmails = new Set<string>();
  for (const id of userIds) {
    const email = await getUserEmail(ctx, id);
    if (email) accountEmails.add(normalizeEmail(email));
  }
  if (opts.exceptUserId) {
    const email = await getUserEmail(ctx, opts.exceptUserId);
    if (email) accountEmails.add(normalizeEmail(email));
  }
  let sent = 0;
  const accountEmail = opts.build(false);
  for (const userId of userIds) {
    await scheduleNotificationEmail(ctx, {
      userId,
      ...accountEmail,
      category: "activity",
      communityId: opts.table.hostOrgId,
    });
    sent++;
  }
  const guestEmail = opts.build(true);
  const seen = new Set<string>();
  for (const guest of opts.guests) {
    const email = normalizeEmail(guest.email);
    if (accountEmails.has(email) || seen.has(email)) continue;
    seen.add(email);
    await ctx.scheduler.runAfter(0, internal.emails.sendNotificationEmail, {
      to: email,
      ...guestEmail,
      category: "activity",
      unsubscribeToken: guest.token,
      communityId: opts.table.hostOrgId,
    });
    sent++;
  }
  return sent;
}

// ——— Triggers ———

/** A host added a date: the people at the Table (not the host who added
 * it) and guests who asked to hear about new dates. */
export async function notifyNewDate(
  ctx: MutationCtx,
  table: Doc<"gardenTables">,
  eventId: Id<"events">,
  actorId: Id<"users">,
): Promise<number> {
  const event = await ctx.db.get(eventId);
  if (!event) return 0;
  const otherEvents = (await tableEventIds(ctx, table._id)).filter((id) => id !== eventId);
  return emailTableAudience(ctx, {
    table,
    userIds: await activeTablePeople(ctx, table),
    guests: await guestRecipients(ctx, otherEvents, { optedIn: true }),
    exceptUserId: actorId,
    build: (guest) => newDateEmail(table, event, guest),
  });
}

/** What changed between two versions of a date that people should hear
 * about: its time or its place. A title or description edit is neither. */
export function dateChange(
  before: Pick<Doc<"events">, "datetime" | "endTime" | "location" | "locationType" | "address">,
  after: Pick<Doc<"events">, "datetime" | "endTime" | "location" | "locationType" | "address">,
): DateChange {
  const addressKey = (a: Doc<"events">["address"]) =>
    a ? [a.street, a.city, a.state, a.zip, a.country].map((s) => s?.trim() ?? "").join("|") : "";
  return {
    time: before.datetime !== after.datetime || (before.endTime ?? null) !== (after.endTime ?? null),
    place:
      (before.location?.trim() ?? "") !== (after.location?.trim() ?? "") ||
      (before.locationType ?? "") !== (after.locationType ?? "") ||
      addressKey(before.address) !== addressKey(after.address),
  };
}

/** Only upcoming, published Table dates are worth an email. */
function isUpcomingTableDate(event: Doc<"events">, now = Date.now()) {
  return !!event.tableId && event.status === "published" && (event.endTime ?? event.datetime) > now;
}

/** A Table date's time or place changed: people with an RSVP on it
 * (accounts and guests) and the people at the Table. */
export async function notifyDateChanged(
  ctx: MutationCtx,
  before: Doc<"events">,
  after: Doc<"events">,
  actorId: Id<"users">,
): Promise<number> {
  if (!after.tableId) return 0;
  const change = dateChange(before, after);
  if (!change.time && !change.place) return 0;
  if (!isUpcomingTableDate(before) && !isUpcomingTableDate(after)) return 0;
  const table = await ctx.db.get(after.tableId);
  if (!table) return 0;
  return emailTableAudience(ctx, {
    table,
    userIds: [
      ...(await accountsWithRsvp(ctx, after._id)),
      ...(await activeTablePeople(ctx, table)),
    ],
    guests: await guestRecipients(ctx, [after._id], { optedIn: false }),
    exceptUserId: actorId,
    build: (guest) => changedDateEmail(table, before, after, change, guest),
  });
}

/** A Table date was canceled: the same people as a change. */
export async function notifyDateCanceled(
  ctx: MutationCtx,
  event: Doc<"events">,
  actorId: Id<"users">,
): Promise<number> {
  if (!event.tableId || !isUpcomingTableDate(event)) return 0;
  const table = await ctx.db.get(event.tableId);
  if (!table) return 0;
  return emailTableAudience(ctx, {
    table,
    userIds: [
      ...(await accountsWithRsvp(ctx, event._id)),
      ...(await activeTablePeople(ctx, table)),
    ],
    guests: await guestRecipients(ctx, [event._id], { optedIn: false }),
    exceptUserId: actorId,
    build: () => canceledDateEmail(table, event),
  });
}

/** The host accepted someone's request to join: that person, in the app
 * and by email. */
export async function notifyRequestAccepted(
  ctx: MutationCtx,
  table: Doc<"gardenTables">,
  userId: Id<"users">,
  actorId?: Id<"users">,
): Promise<number> {
  const paid = normalizeTable(table).pricingType === "fixed";
  await insertTableNote(ctx, table, userId, personNote(table.name, paid ? "accepted_pay" : "accepted"), actorId);
  return emailTableAudience(ctx, {
    table,
    userIds: [userId],
    guests: [],
    build: () => acceptedEmail(table),
  });
}

/** Who "Run it again" invites from the old Table: its active and former
 * (left) participants, anyone recorded as attended, and guests who asked
 * to hear about new dates. Never anyone the host removed, never the host
 * running it. */
export async function runAgainInvitees(
  ctx: MutationCtx,
  oldTable: Doc<"gardenTables">,
  actorId: Id<"users">,
): Promise<{ userIds: Id<"users">[]; guests: GuestRecipient[] }> {
  const memberships = await ctx.db
    .query("tableMemberships")
    .withIndex("by_tableId", (q) => q.eq("tableId", oldTable._id))
    .collect();
  const removed = new Set(
    memberships.filter((m) => m.status === "removed").map((m) => m.userId),
  );
  const people = new Set<Id<"users">>();
  for (const m of memberships)
    if (["active", "left"].includes(m.status ?? "active")) people.add(m.userId);
  const eventIds = await tableEventIds(ctx, oldTable._id);
  for (const eventId of eventIds) {
    const attendance = await ctx.db
      .query("tableAttendance")
      .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
      .collect();
    for (const row of attendance) if (row.status === "attended") people.add(row.userId);
  }
  people.delete(actorId);
  for (const id of removed) people.delete(id);
  // A removed person's own address stays out too, even on a guest RSVP.
  const removedEmails = new Set<string>();
  for (const id of removed) {
    const email = await getUserEmail(ctx, id);
    if (email) removedEmails.add(normalizeEmail(email));
  }
  const guests = await guestRecipients(ctx, eventIds, { optedIn: true });
  return {
    userIds: [...people],
    guests: guests.filter((g) => !removedEmails.has(normalizeEmail(g.email))),
  };
}

/** "Run it again": one email to each invitee, linking the new Table. Nobody
 * is enrolled; they join (and pay, or wait for approval) like anyone. */
export async function inviteToRunAgain(
  ctx: MutationCtx,
  oldTable: Doc<"gardenTables">,
  newTable: Doc<"gardenTables">,
  firstEventId: Id<"events">,
  actorId: Id<"users">,
): Promise<number> {
  const firstEvent = await ctx.db.get(firstEventId);
  if (!firstEvent) return 0;
  const { userIds, guests } = await runAgainInvitees(ctx, oldTable, actorId);
  return emailTableAudience(ctx, {
    table: newTable,
    userIds,
    guests,
    exceptUserId: actorId,
    build: () => runAgainEmail(newTable, firstEvent),
  });
}

// ——— In the app: joins, requests, answers ———

export interface TableNote {
  type: string;
  title: string;
  message: string;
}

/** What a host reads when someone takes a chair, pays for one, or asks. */
export function hostNote(name: string, tableName: string, how: "joined" | "paid" | "asked"): TableNote {
  if (how === "asked")
    return {
      type: "table_join_request",
      title: `${name} asked to join ${tableName}`,
      message: "Say yes or no on the Table page.",
    };
  return {
    type: "table_joined",
    title: how === "paid" ? `${name} paid and joined ${tableName}` : `${name} joined ${tableName}`,
    message: "See who's at your Table.",
  };
}

/** What a person reads when the host answers their request or removes them. */
export function personNote(
  tableName: string,
  how: "accepted" | "accepted_pay" | "declined" | "removed",
): TableNote {
  switch (how) {
    case "accepted":
      return { type: "table_request_accepted", title: `You're in: ${tableName}`, message: "The host said yes." };
    case "accepted_pay":
      return {
        type: "table_request_accepted",
        title: `The host said yes: ${tableName}`,
        message: "Pay to take your chair.",
      };
    case "declined":
      return {
        type: "table_request_declined",
        title: `Your request to join ${tableName} wasn't accepted`,
        message: "The host can't take you this time.",
      };
    case "removed":
      return {
        type: "table_removed",
        title: `You're no longer at ${tableName}`,
        message: "The host removed you from this Table.",
      };
  }
}

async function insertTableNote(
  ctx: MutationCtx,
  table: Doc<"gardenTables">,
  userId: Id<"users">,
  note: TableNote,
  relatedUserId?: Id<"users">,
) {
  await ctx.db.insert("notifications", {
    userId,
    type: note.type,
    title: note.title,
    message: note.message,
    linkUrl: `/tables/${table.slug}`,
    ...(relatedUserId ? { relatedUserId } : {}),
    createdAt: Date.now(),
  });
}

function noteEmail(table: Doc<"gardenTables">, note: TableNote): TableEmail {
  return {
    subject: note.title,
    previewText: note.message,
    heading: note.title,
    body: p(escapeHtml(note.message)),
    ctaText: "See the Table",
    ctaUrl: `/tables/${table.slug}`,
  };
}

/** Someone took a chair, paid for one, or asked: the Table's hosts (not
 * that person), in the app and by email. */
export async function notifyHostsOfJoin(
  ctx: MutationCtx,
  table: Doc<"gardenTables">,
  userId: Id<"users">,
  how: "joined" | "paid" | "asked",
): Promise<void> {
  const hosts = [...new Set([table.hostUserId, ...(table.coHostIds ?? [])])].filter(
    (id): id is Id<"users"> => !!id && id !== userId,
  );
  if (hosts.length === 0) return;
  const profile = await ctx.db
    .query("profiles")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .first();
  const note = hostNote(profile?.name?.trim() || "Someone", table.name, how);
  for (const host of hosts) await insertTableNote(ctx, table, host, note, userId);
  await emailTableAudience(ctx, { table, userIds: hosts, guests: [], build: () => noteEmail(table, note) });
}

/** The host declined someone's request or removed them: that person, in
 * the app and by email. */
export async function notifyRemoved(
  ctx: MutationCtx,
  table: Doc<"gardenTables">,
  userId: Id<"users">,
  how: "declined" | "removed",
  actorId: Id<"users">,
): Promise<void> {
  const note = personNote(table.name, how);
  await insertTableNote(ctx, table, userId, note, actorId);
  await emailTableAudience(ctx, { table, userIds: [userId], guests: [], build: () => noteEmail(table, note) });
}
