// "Post paid gigs" — a recurring booking (docs/features/live-booking.md).
// Same modal shell, pill styling, and validation conventions as
// PaidProjectForm (routes/projects.tsx), extended with the schedule fields
// a one-off paid posting doesn't need: days of the week, a repeat cadence,
// a start/end time, and how the series ends. The pure recurrence/label/
// validation logic lives in convex/garden/gigRules.ts and is shared with the
// server (garden/gigs.ts) — this file only re-implements the client-side
// mirror of validateSeriesRule's checks, the same way PaidProjectForm
// mirrors validateBudgetDeclaration.

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { INTERESTS } from "../constants/interests";
import { LocationAutocomplete, LocationVerifiedHint } from "./LocationAutocomplete";
import { useLocationField } from "../lib/useLocationField";
import { CommunityPicker } from "./CommunityPicker";
import { useCommunityContext } from "./CommunityFilter";
import { errorMessage } from "../routes/projects";
import { HORIZON_WEEKS, MAX_COUNT, WEEKDAY_SHORT, compareDates } from "../../convex/garden/gigRules";

// Same four money states PaidProjectForm offers, mirrored here rather than
// imported since PaidProjectForm doesn't export its copy.
const BUDGET_TYPE_OPTIONS = [
  { value: "amount", label: "Set amount" },
  { value: "range", label: "Range" },
  { value: "proposals", label: "Open to proposals" },
  { value: "volunteer", label: "Volunteer" },
] as const;

const REPEAT_OPTIONS: { value: 1 | 2 | 4; label: string }[] = [
  { value: 1, label: "Every week" },
  { value: 2, label: "Every other week" },
  { value: 4, label: "Every 4 weeks" },
];

const END_MODE_OPTIONS: { value: "never" | "until" | "count"; label: string }[] = [
  { value: "never", label: "No end date" },
  { value: "until", label: "On a date" },
  { value: "count", label: "After a number of dates" },
];

// Friday — the most common "live music night" default.
const DEFAULT_WEEKDAYS = [5];

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Today, "YYYY-MM-DD", on the browser's own clock. A friendly client-side
 * guard only — the server re-checks against the series' own time zone
 * (gigRules.ts's todayIn), which is the authority. */
function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** The next date (today or later) that falls on `weekday` (0 = Sunday). */
function nextDateForWeekday(weekday: number): string {
  const d = new Date();
  const diff = (weekday - d.getDay() + 7) % 7;
  d.setDate(d.getDate() + diff);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <label className="block text-xs uppercase tracking-[0.06em] mb-1.5" style={{ color: "var(--garden-dim)" }}>
      {children}
    </label>
  );
}

const fieldStyle = {
  backgroundColor: "var(--garden-ink)",
  borderColor: "var(--garden-hairline-raised)",
  color: "var(--garden-paper)",
} as const;

// The pill-button look every choice group in PaidProjectForm uses
// (BUDGET_TYPE_OPTIONS, INTERESTS) — pulled into one helper here since this
// form has five separate pill groups instead of two.
function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className="px-2.5 py-1 rounded-full text-xs font-medium transition-colors"
      style={{
        fontFamily: "var(--garden-font-body)",
        backgroundColor: active ? "var(--garden-citron)" : "var(--garden-ink)",
        color: active ? "var(--garden-ink)" : "var(--garden-muted)",
        border: `1px solid ${active ? "var(--garden-citron)" : "var(--garden-hairline-raised)"}`,
      }}
    >
      {children}
    </button>
  );
}

export function GigSeriesForm({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (projectId: string) => void;
}) {
  const createGigSeries = useMutation(api.garden.gigs.createGigSeries);
  const myProfile = useQuery(api.profiles.getMyProfile);

  const [venueName, setVenueName] = useState("");
  const venuePrefilled = useRef(false);
  useEffect(() => {
    if (!venuePrefilled.current && myProfile?.orgName) {
      setVenueName(myProfile.orgName);
      venuePrefilled.current = true;
    }
  }, [myProfile?.orgName]);

  const [title, setTitle] = useState("");
  const [blurb, setBlurb] = useState("");
  const [weekdays, setWeekdays] = useState<number[]>(DEFAULT_WEEKDAYS);
  const [repeat, setRepeat] = useState<1 | 2 | 4 | "once">(1);
  const isOnce = repeat === "once";

  const [startTime, setStartTime] = useState("20:00");
  const [endTime, setEndTime] = useState("22:00");

  const [firstDate, setFirstDate] = useState(() => nextDateForWeekday(DEFAULT_WEEKDAYS[0]));
  // Recompute the default first date as the weekday selection changes, but
  // only until the venue actually touches the date field themselves — after
  // that, their explicit pick wins.
  const firstDateEdited = useRef(false);
  useEffect(() => {
    if (firstDateEdited.current || weekdays.length === 0) return;
    setFirstDate(nextDateForWeekday(Math.min(...weekdays)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekdays.join(",")]);

  const [endMode, setEndMode] = useState<"never" | "until" | "count">("never");
  const [endDate, setEndDate] = useState("");
  const [count, setCount] = useState("");

  const [budgetType, setBudgetType] = useState<string>("amount");
  const [budget, setBudget] = useState("");
  const [budgetMax, setBudgetMax] = useState("");

  const location = useLocationField();

  const [interests, setInterests] = useState<string[]>(["Music"]);
  const [showInterests, setShowInterests] = useState(false);
  const [hostOrgId, setHostOrgId] = useState("");
  // Same sidebar-switcher prefill PaidProjectForm uses (community-ux.md
  // §2/§6) — still changeable via CommunityPicker.
  const { selected: switcherCommunitySlug, communities: myCommunities } = useCommunityContext();
  const defaultHostOrgId = myCommunities.find((c) => c.slug === switcherCommunitySlug)?._id;

  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function toggleWeekday(day: number) {
    setWeekdays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort((a, b) => a - b),
    );
  }

  function toggleInterest(tag: string) {
    setInterests((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!title.trim()) {
      setError("Give it a title.");
      return;
    }
    if (weekdays.length === 0) {
      setError("Pick at least one day of the week.");
      return;
    }
    if (!location.value.trim()) {
      setError("A gig happens somewhere — pick the venue's location.");
      return;
    }
    // Mirrors PaidProjectForm's client-side mirror of
    // validateBudgetDeclaration (convex/garden/projects.ts) — same messages.
    const budgetNum = Number(budget);
    const budgetMaxNum = Number(budgetMax);
    if (budgetType === "amount" && (!budget.trim() || !Number.isFinite(budgetNum) || budgetNum <= 0)) {
      setError("A set amount needs a real number bigger than zero.");
      return;
    }
    if (budgetType === "range") {
      if (!budget.trim() || !budgetMax.trim()) {
        setError("A range needs both a low and a high number.");
        return;
      }
      if (!Number.isFinite(budgetNum) || budgetNum <= 0 || !Number.isFinite(budgetMaxNum) || budgetMaxNum <= 0) {
        setError("A range needs real numbers bigger than zero.");
        return;
      }
      if (budgetMaxNum <= budgetNum) {
        setError("A range needs a high number bigger than the low one.");
        return;
      }
    }
    if (compareDates(firstDate, todayLocal()) < 0) {
      setError("The first date can't be in the past.");
      return;
    }
    const effectiveEndMode: "never" | "until" | "count" = isOnce ? "count" : endMode;
    const countNum = Number(count);
    if (!isOnce && effectiveEndMode === "until") {
      if (!endDate || compareDates(endDate, firstDate) < 0) {
        setError("The last date has to be on or after the first one.");
        return;
      }
    }
    if (!isOnce && effectiveEndMode === "count") {
      if (!Number.isInteger(countNum) || countNum < 1 || countNum > MAX_COUNT) {
        setError(`A number of dates between 1 and ${MAX_COUNT}.`);
        return;
      }
    }

    setSubmitting(true);
    try {
      const result = await createGigSeries({
        title: title.trim(),
        blurb: blurb.trim() || undefined,
        venueName: venueName.trim() || undefined,
        budgetType,
        budget: budgetType === "amount" || budgetType === "range" ? budgetNum : undefined,
        budgetMax: budgetType === "range" ? budgetMaxNum : undefined,
        interests: interests.length > 0 ? interests : undefined,
        hostOrgId: hostOrgId ? (hostOrgId as any) : undefined,
        ...location.toArgs(),
        weekdays,
        intervalWeeks: isOnce ? 1 : repeat,
        startDate: firstDate,
        endMode: effectiveEndMode,
        endDate: effectiveEndMode === "until" ? endDate : undefined,
        count: effectiveEndMode === "count" ? (isOnce ? 1 : countNum) : undefined,
        startTime,
        endTime,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Los_Angeles",
      });
      onCreated(String(result.projectId));
      onClose();
    } catch (err) {
      setError(errorMessage(err));
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto"
      style={{ backgroundColor: "rgba(0,0,0,0.6)" }}
    >
      <div
        className="w-full max-w-lg rounded-2xl border p-6 my-8"
        style={{ backgroundColor: "var(--garden-ink-raised)", borderColor: "var(--garden-hairline)" }}
      >
        <h2
          className="text-xl font-semibold mb-1"
          style={{ color: "var(--garden-paper)", fontFamily: "var(--garden-font-display)" }}
        >
          Post paid gigs
        </h2>
        <p className="text-sm mb-5" style={{ color: "var(--garden-dim)" }}>
          A recurring booking — say the day, the time, and what each date pays. Artists mark the dates they can
          play; you pick who plays.
        </p>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <FieldLabel>Venue name (optional)</FieldLabel>
            <input
              type="text"
              value={venueName}
              onChange={(e) => setVenueName(e.target.value)}
              placeholder="The Grove"
              className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
              style={fieldStyle}
            />
          </div>

          <div>
            <FieldLabel>Title</FieldLabel>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Live music, Friday nights"
              className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
              style={fieldStyle}
            />
          </div>

          <div>
            <FieldLabel>What you need</FieldLabel>
            <textarea
              value={blurb}
              onChange={(e) => setBlurb(e.target.value)}
              rows={3}
              placeholder="Acoustic duo or solo, 2 sets, PA provided"
              className="w-full px-3 py-2 rounded-lg border text-sm outline-none resize-none"
              style={fieldStyle}
            />
          </div>

          <div>
            <FieldLabel>Days of the week</FieldLabel>
            <div role="group" aria-label="Days of the week" className="flex flex-wrap gap-1.5">
              {WEEKDAY_SHORT.map((label, day) => (
                <Pill key={label} active={weekdays.includes(day)} onClick={() => toggleWeekday(day)}>
                  {label}
                </Pill>
              ))}
            </div>
          </div>

          <div>
            <FieldLabel>Repeats</FieldLabel>
            <div role="radiogroup" aria-label="Repeats" className="flex flex-wrap gap-1.5">
              {REPEAT_OPTIONS.map((opt) => (
                <Pill key={opt.value} active={!isOnce && repeat === opt.value} onClick={() => setRepeat(opt.value)}>
                  {opt.label}
                </Pill>
              ))}
              <Pill active={isOnce} onClick={() => setRepeat("once")}>
                Just once
              </Pill>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex-1">
              <FieldLabel>Start time</FieldLabel>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
                style={fieldStyle}
              />
            </div>
            <div className="flex-1">
              <FieldLabel>End time</FieldLabel>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
                style={fieldStyle}
              />
            </div>
          </div>
          <p className="text-xs -mt-2.5" style={{ color: "var(--garden-dim)" }}>
            An end time earlier than the start means it runs past midnight.
          </p>

          <div>
            <FieldLabel>First date</FieldLabel>
            <input
              type="date"
              value={firstDate}
              onChange={(e) => {
                firstDateEdited.current = true;
                setFirstDate(e.target.value);
              }}
              className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
              style={fieldStyle}
            />
          </div>

          {!isOnce && (
            <div>
              <FieldLabel>Ends</FieldLabel>
              <div role="radiogroup" aria-label="Ends" className="flex flex-wrap gap-1.5">
                {END_MODE_OPTIONS.map((opt) => (
                  <Pill key={opt.value} active={endMode === opt.value} onClick={() => setEndMode(opt.value)}>
                    {opt.label}
                  </Pill>
                ))}
              </div>
              {endMode === "never" && (
                <p className="text-xs mt-1.5" style={{ color: "var(--garden-dim)" }}>
                  Dates open {HORIZON_WEEKS} weeks ahead and keep going.
                </p>
              )}
              {endMode === "until" && (
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full mt-2.5 px-3 py-2 rounded-lg border text-sm outline-none"
                  style={fieldStyle}
                />
              )}
              {endMode === "count" && (
                <input
                  type="number"
                  min={1}
                  max={MAX_COUNT}
                  value={count}
                  onChange={(e) => setCount(e.target.value)}
                  placeholder="10"
                  aria-label="Number of dates"
                  className="w-full mt-2.5 px-3 py-2 rounded-lg border text-sm outline-none"
                  style={{ ...fieldStyle, fontFamily: "var(--garden-font-mono)" }}
                />
              )}
            </div>
          )}

          <div>
            <FieldLabel>What each date pays</FieldLabel>
            <div role="radiogroup" aria-label="What each date pays" className="flex flex-wrap gap-1.5">
              {BUDGET_TYPE_OPTIONS.map((opt) => (
                <Pill key={opt.value} active={budgetType === opt.value} onClick={() => setBudgetType(opt.value)}>
                  {opt.label}
                </Pill>
              ))}
            </div>
            <p className="text-xs mt-1.5" style={{ color: "var(--garden-dim)" }}>
              Posting a number gets more responses. If you don't have one yet, say so — just don't leave people
              guessing.
            </p>
            {budgetType === "amount" && (
              <input
                type="number"
                min="1"
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
                placeholder="300"
                aria-label="Amount in US dollars, per date"
                className="w-full mt-2.5 px-3 py-2 rounded-lg border text-sm outline-none"
                style={{ ...fieldStyle, fontFamily: "var(--garden-font-mono)" }}
              />
            )}
            {budgetType === "range" && (
              <div className="flex items-center gap-2 mt-2.5">
                <input
                  type="number"
                  min="1"
                  value={budget}
                  onChange={(e) => setBudget(e.target.value)}
                  placeholder="150"
                  aria-label="Low end, in US dollars, per date"
                  className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
                  style={{ ...fieldStyle, fontFamily: "var(--garden-font-mono)" }}
                />
                <span className="text-sm" style={{ color: "var(--garden-dim)" }}>
                  to
                </span>
                <input
                  type="number"
                  min="1"
                  value={budgetMax}
                  onChange={(e) => setBudgetMax(e.target.value)}
                  placeholder="300"
                  aria-label="High end, in US dollars, per date"
                  className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
                  style={{ ...fieldStyle, fontFamily: "var(--garden-font-mono)" }}
                />
              </div>
            )}
          </div>

          <div>
            <FieldLabel>Location</FieldLabel>
            <LocationAutocomplete
              value={location.value}
              onChange={location.onChange}
              onSelect={location.onSelect}
              placeholder="Search for the venue's location"
            />
            <LocationVerifiedHint value={location.value} selected={location.selected} />
          </div>

          <div>
            <FieldLabel>Interests</FieldLabel>
            {showInterests ? (
              <>
                <div className="flex flex-wrap gap-1.5">
                  {INTERESTS.map((tag) => (
                    <Pill key={tag} active={interests.includes(tag)} onClick={() => toggleInterest(tag)}>
                      {tag}
                    </Pill>
                  ))}
                </div>
                <p className="text-xs mt-1.5" style={{ color: "var(--garden-dim)" }}>
                  What's this gig about — helps people find it, separate from your own profile tags.
                </p>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setShowInterests(true)}
                className="text-xs underline underline-offset-2 hover:opacity-80"
                style={{ color: "var(--garden-citron)" }}
              >
                {interests.length > 0 ? `${interests.length} selected — edit` : "+ Add interests"}
              </button>
            )}
          </div>

          <CommunityPicker value={hostOrgId} onChange={setHostOrgId} defaultHostOrgId={defaultHostOrgId} />

          {error && <p className="text-sm text-red-400">{error}</p>}

          <div className="flex gap-2 justify-end pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm font-medium"
              style={{ color: "var(--garden-dim)" }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
              style={{ backgroundColor: "var(--garden-citron)", color: "var(--garden-ink)" }}
            >
              {submitting ? "Posting…" : "Post gigs"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
