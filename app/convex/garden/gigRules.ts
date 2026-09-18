// Live booking — the pure core (docs/features/live-booking.md).
//
// No Convex imports on purpose: this file is imported by convex/garden/
// gigs.ts (server) AND by app/app/components/Gig*.tsx (client), the same
// way app/app/garden/capabilities.ts re-exports convex/garden/
// capabilities.ts. Everything here is a plain function over plain data, and
// everything here is unit-tested in gigRules.test.ts without Convex.
//
// Dates are "YYYY-MM-DD" strings in the series' own time zone, times are
// "HH:MM" 24-hour strings, and the only epoch numbers are the ones this
// file computes (slotTimes). A venue thinks in "Fridays, 8 to 10" — the
// rule is stored the way they said it, and the clock math happens once, at
// materialization, in zonedTimeToEpoch below.

export const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;
export const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/** Dates are opened this far ahead of today and extended daily by the cron
 * (docs/features/live-booking.md §3). A series with no end never runs out
 * of dates; it just never shows more than this many weeks at once. */
export const HORIZON_WEEKS = 8;
/** Work samples an artist can attach to one response. Same cap the legacy
 * jobs board used for jobInterests.workLinks. */
export const MAX_CLIPS = 3;
/** Same limit as projectTeam.ts's validateMessage. */
export const MAX_NOTE_LENGTH = 500;
export const MAX_VENUE_NAME_LENGTH = 80;
/** "count" mode ceiling — two years of weekly dates. */
export const MAX_COUNT = 104;
export const INTERVAL_OPTIONS = [1, 2, 4] as const;

export type EndMode = "never" | "until" | "count";

export interface SeriesRule {
  /** 0 = Sunday … 6 = Saturday. At least one. */
  weekdays: number[];
  /** 1 = every week, 2 = every other week, 4 = roughly monthly. */
  intervalWeeks: number;
  /** First date the series can happen on ("YYYY-MM-DD", venue-local). */
  startDate: string;
  endMode: EndMode;
  /** Last possible date, inclusive — only when endMode is "until". */
  endDate?: string;
  /** Total number of dates — only when endMode is "count". */
  count?: number;
  /** "HH:MM", 24-hour, venue-local. */
  startTime: string;
  /** "HH:MM". At or before startTime means it ends the next morning. */
  endTime: string;
  /** IANA zone the venue lives in, e.g. "America/Los_Angeles". */
  timeZone: string;
}

export type SeriesStatus = "open" | "paused" | "ended";
export type SlotStatus = "open" | "booked" | "cancelled";
export type ResponseStatus = "available" | "withdrawn" | "booked";
export type PaidMethod = "venmo" | "cashapp" | "paypal" | "zelle" | "cash" | "check" | "other";
export const PAID_METHODS: PaidMethod[] = ["venmo", "cashapp", "paypal", "zelle", "cash", "check", "other"];

// A type alias, not an interface, on purpose: ConvexError's payload wants an
// index signature, which object-literal types satisfy and interfaces don't.
export type RuleError = { code: string; reason: string };

// ——————————————————————————————————————————————————————————————
// Dates — string arithmetic on "YYYY-MM-DD", done in UTC so a DST change
// in the venue's zone can never make "the next day" 23 or 25 hours long.
// ——————————————————————————————————————————————————————————————

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function parseDate(s: string): { y: number; m: number; d: number } | null {
  const m = DATE_RE.exec(s);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  // Round-trip through UTC to reject Feb 30 and friends.
  const probe = new Date(Date.UTC(y, mo - 1, d));
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== mo - 1 || probe.getUTCDate() !== d) return null;
  return { y, m: mo, d };
}

export function isValidDate(s: string): boolean {
  return parseDate(s) !== null;
}

export function isValidTime(s: string): boolean {
  return TIME_RE.test(s);
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function toDateString(y: number, m: number, d: number): string {
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

/** `date` plus `n` calendar days (n may be negative). */
export function addDays(date: string, n: number): string {
  const p = parseDate(date);
  if (!p) throw new Error(`addDays: bad date ${date}`);
  const t = new Date(Date.UTC(p.y, p.m - 1, p.d + n));
  return toDateString(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

/** 0 = Sunday … 6 = Saturday. */
export function weekdayOf(date: string): number {
  const p = parseDate(date);
  if (!p) throw new Error(`weekdayOf: bad date ${date}`);
  return new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay();
}

/** Whole days from `a` to `b` (negative when b is earlier). */
export function daysBetween(a: string, b: string): number {
  const pa = parseDate(a);
  const pb = parseDate(b);
  if (!pa || !pb) throw new Error(`daysBetween: bad date ${a} / ${b}`);
  return Math.round((Date.UTC(pb.y, pb.m - 1, pb.d) - Date.UTC(pa.y, pa.m - 1, pa.d)) / 86_400_000);
}

/** ISO strings compare correctly as plain strings. */
export function compareDates(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

// ——————————————————————————————————————————————————————————————
// Time zones. The venue's "8pm Friday" has to become an epoch for sorting,
// for "is this date still in the future", and for the artist's own clock.
// Done with Intl only — no library — by reading the zone's wall clock at a
// guessed instant and correcting by the difference, twice (the second pass
// catches a guess that landed on the wrong side of a DST change).
// ——————————————————————————————————————————————————————————————

export function isValidTimeZone(tz: string): boolean {
  if (!tz || typeof tz !== "string") return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const wallClockFormatters = new Map<string, Intl.DateTimeFormat>();

function wallClockFormatter(tz: string): Intl.DateTimeFormat {
  let f = wallClockFormatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    wallClockFormatters.set(tz, f);
  }
  return f;
}

/** The zone's wall clock at `epochMs`, as its own UTC-labelled epoch —
 * i.e. Date.UTC(year, month, day, hour, minute, second) of what a clock on
 * the wall in `tz` reads at that instant. */
function wallClockAsUtc(epochMs: number, tz: string): number {
  const parts = wallClockFormatter(tz).formatToParts(new Date(epochMs));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0");
  // hourCycle h23 still yields "24" in some engines for midnight — normalize.
  const hour = get("hour") % 24;
  return Date.UTC(get("year"), get("month") - 1, get("day"), hour, get("minute"), get("second"));
}

/** Offset of `tz` from UTC at `epochMs`, in ms (positive east of UTC). */
export function tzOffsetMs(epochMs: number, tz: string): number {
  return wallClockAsUtc(epochMs, tz) - epochMs;
}

/** The epoch ms at which a clock on the wall in `tz` reads `date` `time`.
 * Inside a spring-forward gap (a time that never happens) the result is
 * the instant one hour later — the same choice most calendar apps make. */
export function zonedTimeToEpoch(date: string, time: string, tz: string): number {
  const p = parseDate(date);
  const t = TIME_RE.exec(time);
  if (!p || !t) throw new Error(`zonedTimeToEpoch: bad input ${date} ${time}`);
  const asUtc = Date.UTC(p.y, p.m - 1, p.d, Number(t[1]), Number(t[2]));
  // First guess: treat the wall time as UTC and subtract the offset there.
  let guess = asUtc - tzOffsetMs(asUtc, tz);
  // Second pass: the offset at the guess may differ from the offset at the
  // wall time (a DST boundary sits between them). Re-derive once.
  const corrected = asUtc - tzOffsetMs(guess, tz);
  if (corrected !== guess) {
    // If the corrected instant reads back as the requested wall time, use
    // it; otherwise we're inside a gap and the first guess (one hour later)
    // is the honest answer.
    if (wallClockAsUtc(corrected, tz) === asUtc) guess = corrected;
  }
  return guess;
}

/** Today's date ("YYYY-MM-DD") on the wall clock in `tz` at `nowMs`. */
export function todayIn(tz: string, nowMs: number): string {
  const wall = new Date(wallClockAsUtc(nowMs, tz));
  return toDateString(wall.getUTCFullYear(), wall.getUTCMonth() + 1, wall.getUTCDate());
}

/** Start and end instants for one date of a series. An end time at or
 * before the start time rolls to the next morning (a 9pm–1am set). */
export function slotTimes(rule: Pick<SeriesRule, "startTime" | "endTime" | "timeZone">, date: string): { startsAt: number; endsAt: number } {
  const startsAt = zonedTimeToEpoch(date, rule.startTime, rule.timeZone);
  const endDate = rule.endTime <= rule.startTime ? addDays(date, 1) : date;
  const endsAt = zonedTimeToEpoch(endDate, rule.endTime, rule.timeZone);
  return { startsAt, endsAt };
}

// ——————————————————————————————————————————————————————————————
// Recurrence
// ——————————————————————————————————————————————————————————————

/** Every date the rule lands on, from `fromDate` to `toDate` inclusive.
 *
 * Counting for `intervalWeeks` and for `count` always starts at the rule's
 * own startDate, never at fromDate — so asking for "the next eight weeks"
 * of an every-other-week series that began in January lands on the right
 * alternate weeks, and a 10-date series that has had 7 dates offers 3.
 * Weeks are Sunday-to-Saturday, anchored on the Sunday of startDate's
 * week. The scan is bounded (MAX_SCAN_DAYS) so a bad rule can't spin. */
const MAX_SCAN_DAYS = 366 * 3;

export function expandOccurrences(rule: SeriesRule, fromDate: string, toDate: string): string[] {
  const out: string[] = [];
  if (!isValidDate(fromDate) || !isValidDate(toDate) || !isValidDate(rule.startDate)) return out;
  const weekdays = new Set(rule.weekdays);
  const interval = Math.max(1, Math.floor(rule.intervalWeeks || 1));
  const anchorSunday = addDays(rule.startDate, -weekdayOf(rule.startDate));
  let last = toDate;
  if (rule.endMode === "until" && rule.endDate && compareDates(rule.endDate, last) < 0) last = rule.endDate;
  const limit = rule.endMode === "count" ? Math.max(0, Math.floor(rule.count ?? 0)) : Number.POSITIVE_INFINITY;

  let produced = 0;
  let date = rule.startDate;
  for (let i = 0; i < MAX_SCAN_DAYS && compareDates(date, last) <= 0 && produced < limit; i++) {
    const wd = weekdayOf(date);
    if (weekdays.has(wd)) {
      const weekIndex = Math.floor(daysBetween(anchorSunday, date) / 7);
      if (weekIndex % interval === 0) {
        produced++;
        if (compareDates(date, fromDate) >= 0) out.push(date);
      }
    }
    date = addDays(date, 1);
  }
  return out;
}

/** True when the rule can still produce a date after `afterDate` — i.e.
 * the cron should keep extending it. */
export function ruleHasDatesAfter(rule: SeriesRule, afterDate: string): boolean {
  if (rule.endMode === "never") return true;
  if (rule.endMode === "until") return !!rule.endDate && compareDates(rule.endDate, afterDate) > 0;
  // count: cheap upper bound — scan one interval-window past afterDate.
  const probeTo = addDays(afterDate, 7 * Math.max(1, rule.intervalWeeks) * 2 + 7);
  return expandOccurrences(rule, addDays(afterDate, 1), probeTo).length > 0;
}

// ——————————————————————————————————————————————————————————————
// Validation — returns the ConvexError payload to throw, or null.
// ——————————————————————————————————————————————————————————————

export function validateSeriesRule(rule: SeriesRule, today: string): RuleError | null {
  if (!Array.isArray(rule.weekdays) || rule.weekdays.length === 0) {
    return { code: "invalid_weekdays", reason: "Pick at least one day of the week." };
  }
  if (rule.weekdays.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) {
    return { code: "invalid_weekdays", reason: "Days of the week are Sunday through Saturday." };
  }
  if (new Set(rule.weekdays).size !== rule.weekdays.length) {
    return { code: "invalid_weekdays", reason: "Each day of the week once." };
  }
  if (!(INTERVAL_OPTIONS as readonly number[]).includes(rule.intervalWeeks)) {
    return { code: "invalid_interval", reason: "Repeat every week, every other week, or every four weeks." };
  }
  if (!isValidDate(rule.startDate)) {
    return { code: "invalid_start_date", reason: "Pick a real first date." };
  }
  if (compareDates(rule.startDate, today) < 0) {
    return { code: "invalid_start_date", reason: "The first date can't be in the past." };
  }
  if (rule.endMode !== "never" && rule.endMode !== "until" && rule.endMode !== "count") {
    return { code: "invalid_end", reason: "Say how it ends: never, on a date, or after a number of dates." };
  }
  if (rule.endMode === "until") {
    if (!rule.endDate || !isValidDate(rule.endDate)) {
      return { code: "invalid_end", reason: "Pick a real last date." };
    }
    if (compareDates(rule.endDate, rule.startDate) < 0) {
      return { code: "invalid_end", reason: "The last date has to be on or after the first one." };
    }
  }
  if (rule.endMode === "count") {
    if (!Number.isInteger(rule.count) || (rule.count as number) < 1 || (rule.count as number) > MAX_COUNT) {
      return { code: "invalid_end", reason: `A number of dates between 1 and ${MAX_COUNT}.` };
    }
  }
  if (!isValidTime(rule.startTime) || !isValidTime(rule.endTime)) {
    return { code: "invalid_time", reason: "Start and end need a real time of day." };
  }
  if (!isValidTimeZone(rule.timeZone)) {
    return { code: "invalid_time_zone", reason: "That time zone isn't one we know." };
  }
  // A rule that can never produce a date is a mistake, not a series.
  const probeTo = rule.endMode === "until" ? (rule.endDate as string) : addDays(rule.startDate, 7 * rule.intervalWeeks * 2 + 7);
  if (expandOccurrences(rule, rule.startDate, probeTo).length === 0) {
    return { code: "no_dates", reason: "Those settings never land on a date. Check the days and the end date." };
  }
  return null;
}

export function validateVenueName(name: string | undefined): string | undefined {
  const trimmed = name?.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, MAX_VENUE_NAME_LENGTH);
}

// ——————————————————————————————————————————————————————————————
// Labels — one place, so the card, the page and the notification all say
// the same thing about the same rule.
// ——————————————————————————————————————————————————————————————

function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

/** "Every Friday", "Every other Friday", "Every 4 weeks on Friday",
 * "Fridays and Saturdays", "One date" (count 1). */
export function cadenceLabel(rule: Pick<SeriesRule, "weekdays" | "intervalWeeks" | "endMode" | "count">): string {
  const days = [...rule.weekdays].sort((a, b) => a - b).map((d) => WEEKDAY_NAMES[d]);
  if (rule.endMode === "count" && rule.count === 1) return "One date";
  if (rule.intervalWeeks === 1) {
    if (days.length === 1) return `Every ${days[0]}`;
    return joinNames(days.map((d) => `${d}s`));
  }
  const every = rule.intervalWeeks === 2 ? "Every other" : `Every ${rule.intervalWeeks} weeks on`;
  return `${every} ${joinNames(days)}`;
}

/** "8pm" / "7:30pm" / "12am". */
export function formatClock(time: string): string {
  const t = TIME_RE.exec(time);
  if (!t) return time;
  const h = Number(t[1]);
  const m = Number(t[2]);
  const suffix = h < 12 ? "am" : "pm";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${h12}${suffix}` : `${h12}:${pad2(m)}${suffix}`;
}

/** "8–10pm" when both share a suffix, otherwise "9pm–1am". */
export function formatTimeRange(startTime: string, endTime: string): string {
  const a = formatClock(startTime);
  const b = formatClock(endTime);
  const sa = a.slice(-2);
  const sb = b.slice(-2);
  if (sa === sb) return `${a.slice(0, -2)}–${b}`;
  return `${a}–${b}`;
}

/** "Fri, Sep 25". */
export function formatSlotDate(date: string): string {
  const p = parseDate(date);
  if (!p) return date;
  const d = new Date(Date.UTC(p.y, p.m - 1, p.d));
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${WEEKDAY_SHORT[d.getUTCDay()]}, ${months[p.m - 1]} ${p.d}`;
}

/** "Every Friday · 8–10pm". */
export function scheduleLabel(rule: SeriesRule): string {
  return `${cadenceLabel(rule)} · ${formatTimeRange(rule.startTime, rule.endTime)}`;
}

/** How the series ends, in words — for the page header. */
export function endLabel(rule: Pick<SeriesRule, "endMode" | "endDate" | "count">): string {
  if (rule.endMode === "until" && rule.endDate) return `through ${formatSlotDate(rule.endDate)}`;
  if (rule.endMode === "count" && rule.count) return rule.count === 1 ? "" : `${rule.count} dates`;
  return `no end date · dates open ${HORIZON_WEEKS} weeks ahead`;
}

// ——————————————————————————————————————————————————————————————
// Responses — row reuse, same idea as projectTeam.ts's nextStatusForRequest.
// ——————————————————————————————————————————————————————————————

export type RespondDecision = "create" | "reactivate" | "no-op";

export function nextResponseAction(existing: ResponseStatus | undefined): RespondDecision {
  switch (existing) {
    case undefined:
      return "create";
    case "withdrawn":
      return "reactivate";
    case "available":
    case "booked":
      return "no-op";
    default:
      return "no-op";
  }
}

// ——————————————————————————————————————————————————————————————
// Getting paid — handles and the links that open the payer's app with the
// amount and note already filled in (docs/features/live-booking.md §6).
// The platform never touches the money; it hands the venue a link.
// ——————————————————————————————————————————————————————————————

export type PayoutKind = "venmo" | "cashapp" | "paypal" | "zelle";
export const PAYOUT_KINDS: PayoutKind[] = ["venmo", "cashapp", "paypal", "zelle"];

export interface PayoutHandles {
  venmo?: string;
  cashapp?: string;
  paypal?: string;
  zelle?: string;
}

const HANDLE_RE = /^[A-Za-z0-9_.-]{1,40}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\+?[0-9() .-]{7,20}$/;

/** Strips the decoration people paste ("@name", "$tag", "venmo.com/name",
 * "paypal.me/name") down to the bare handle, and rejects anything that
 * couldn't be one. Returns null for empty input (meaning "clear it"). */
export function normalizeHandle(kind: PayoutKind, raw: string | undefined): { ok: true; value: string | null } | { ok: false; reason: string } {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return { ok: true, value: null };
  if (kind === "zelle") {
    // Zelle is an email or a US phone number — there is no handle.
    if (EMAIL_RE.test(trimmed)) return { ok: true, value: trimmed.toLowerCase() };
    const digits = trimmed.replace(/[^0-9]/g, "");
    if (PHONE_RE.test(trimmed) && digits.length >= 10) return { ok: true, value: trimmed };
    return { ok: false, reason: "Zelle takes the email or phone number on your bank account." };
  }
  let value = trimmed;
  value = value.replace(/^https?:\/\//i, "");
  value = value.replace(/^(www\.)?(account\.)?venmo\.com\/(u\/)?/i, "");
  value = value.replace(/^(www\.)?cash\.app\//i, "");
  value = value.replace(/^(www\.)?paypal\.me\//i, "");
  value = value.replace(/^(www\.)?paypal\.com\/paypalme\//i, "");
  value = value.split(/[?#/]/)[0] ?? "";
  value = value.replace(/^[@$]+/, "");
  if (!HANDLE_RE.test(value)) {
    const what = kind === "venmo" ? "Venmo username" : kind === "cashapp" ? "$Cashtag" : "PayPal.Me name";
    return { ok: false, reason: `That doesn't look like a ${what}. Letters, numbers, dashes, dots and underscores only.` };
  }
  return { ok: true, value };
}

/** venmo.com/<user>?txn=pay&amount=300&note=… — opens the Venmo app on a
 * phone with the payment screen filled in. */
export function venmoPayUrl(handle: string, amountDollars?: number, note?: string): string {
  const params = new URLSearchParams({ txn: "pay" });
  if (amountDollars && amountDollars > 0) params.set("amount", String(amountDollars));
  if (note) params.set("note", note.slice(0, 120));
  return `https://venmo.com/${encodeURIComponent(handle)}?${params.toString()}`;
}

/** cash.app/$tag/300 — the amount rides in the path. */
export function cashAppPayUrl(cashtag: string, amountDollars?: number): string {
  const base = `https://cash.app/$${encodeURIComponent(cashtag)}`;
  return amountDollars && amountDollars > 0 ? `${base}/${amountDollars}` : base;
}

/** paypal.me/name/300USD. */
export function paypalMeUrl(name: string, amountDollars?: number): string {
  const base = `https://paypal.me/${encodeURIComponent(name)}`;
  return amountDollars && amountDollars > 0 ? `${base}/${amountDollars}USD` : base;
}

export interface PayLink {
  kind: PayoutKind;
  label: string;
  /** The handle as the artist gave it, for copy/paste. */
  handle: string;
  /** A deep link when the app has one; null for Zelle (bank-app only). */
  url: string | null;
}

/** Every way the venue can pay this artist, in the order they'd try. */
export function buildPayLinks(handles: PayoutHandles | undefined, amountDollars?: number, note?: string): PayLink[] {
  if (!handles) return [];
  const out: PayLink[] = [];
  if (handles.venmo) out.push({ kind: "venmo", label: "Venmo", handle: `@${handles.venmo}`, url: venmoPayUrl(handles.venmo, amountDollars, note) });
  if (handles.cashapp) out.push({ kind: "cashapp", label: "Cash App", handle: `$${handles.cashapp}`, url: cashAppPayUrl(handles.cashapp, amountDollars) });
  if (handles.paypal) out.push({ kind: "paypal", label: "PayPal", handle: `paypal.me/${handles.paypal}`, url: paypalMeUrl(handles.paypal, amountDollars) });
  if (handles.zelle) out.push({ kind: "zelle", label: "Zelle", handle: handles.zelle, url: null });
  return out;
}

// ——————————————————————————————————————————————————————————————
// Clips — which portfolio pieces count as something a venue can listen to
// or watch before booking. Audio and video always; a link only when it
// points at a place music actually lives.
// ——————————————————————————————————————————————————————————————

const CLIP_LINK_HOSTS = [
  "soundcloud.com",
  "open.spotify.com",
  "spotify.com",
  "bandcamp.com",
  "music.apple.com",
  "youtube.com",
  "youtu.be",
  "vimeo.com",
  "tiktok.com",
  "instagram.com",
  "music.youtube.com",
];

export function isClipArtifact(a: { type: string; mediaUrl?: string | null }): boolean {
  if (a.type === "audio" || a.type === "video") return true;
  if (a.type !== "link" || !a.mediaUrl) return false;
  try {
    const host = new URL(a.mediaUrl).hostname.toLowerCase().replace(/^www\./, "");
    return CLIP_LINK_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
  } catch {
    return false;
  }
}
