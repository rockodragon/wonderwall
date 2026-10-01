// The one-line gig summary a project card carries ("Every Friday · 8–10pm ·
// next Fri, Sep 25 · 6 dates open"). Lives in its own module so
// garden/projects.ts (listProjects/getProject) can import it without
// pulling in garden/gigs.ts — which itself imports projects.ts for
// validateBudgetDeclaration, and a cycle between the two would be a
// bundling hazard for nothing.

import type { QueryCtx, MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { cadenceLabel, endLabel, formatSlotDate, formatTimeRange, scheduleLabel, type SeriesRule } from "./gigRules";

export interface GigSummary {
  seriesId: Id<"gigSeries">;
  status: string; // "open" | "paused" | "ended"
  venueName: string | null;
  /** "Every Friday" */
  cadence: string;
  /** "8–10pm" */
  timeRange: string;
  /** "Every Friday · 8–10pm" */
  schedule: string;
  /** "no end date · dates open 8 weeks ahead" / "through Fri, Nov 27" / "6 dates" */
  ends: string;
  /** Next date that is open or booked, venue-local, or null. */
  nextDate: string | null;
  nextDateLabel: string | null;
  /** Future dates still taking responses. */
  openCount: number;
}

export function ruleOf(series: Doc<"gigSeries">): SeriesRule {
  return {
    weekdays: series.weekdays,
    intervalWeeks: series.intervalWeeks,
    startDate: series.startDate,
    endMode: series.endMode as SeriesRule["endMode"],
    endDate: series.endDate,
    count: series.count,
    startTime: series.startTime,
    endTime: series.endTime,
    timeZone: series.timeZone,
  };
}

/** Cheap: one indexed lookup for the series, one bounded range scan of the
 * project's future slots. Returns null for an ordinary (non-gig) project,
 * which is every project that existed before live booking shipped. */
export async function summarizeGig(
  ctx: QueryCtx | MutationCtx,
  projectId: Id<"projects">,
  nowMs: number,
): Promise<GigSummary | null> {
  const series = await ctx.db
    .query("gigSeries")
    .withIndex("by_projectId", (q) => q.eq("projectId", projectId))
    .first();
  if (!series) return null;

  const future = await ctx.db
    .query("gigSlots")
    .withIndex("by_projectId_startsAt", (q) => q.eq("projectId", projectId).gte("startsAt", nowMs))
    .take(80);
  let next: Doc<"gigSlots"> | null = null;
  let openCount = 0;
  for (const slot of future) {
    if (slot.status === "cancelled") continue;
    if (!next) next = slot;
    if (slot.status === "open") openCount++;
  }

  const rule = ruleOf(series);
  return {
    seriesId: series._id,
    status: series.status,
    venueName: series.venueName ?? null,
    cadence: cadenceLabel(rule),
    timeRange: formatTimeRange(rule.startTime, rule.endTime),
    schedule: scheduleLabel(rule),
    ends: endLabel(rule),
    nextDate: next?.date ?? null,
    nextDateLabel: next ? formatSlotDate(next.date) : null,
    openCount,
  };
}
