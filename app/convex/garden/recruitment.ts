// The additive recruitment fields shared by schema, mutations and UI.
// These are an applicant's proposal, never a confirmed engagement.
import { v } from "convex/values";
import { fail } from "../errors";
import { formatCurrency } from "../money";

export const MAX_AVAILABILITY_LENGTH = 500;
export const REVIEW_STAGES = ["new", "considering", "discussing"] as const;
export type ReviewStage = (typeof REVIEW_STAGES)[number];
export type RateProposal = { amount: number; currency: string; unit: "hour" | "day" | "fixed" };

export const reviewStageValidator = v.union(v.literal("new"), v.literal("considering"), v.literal("discussing"));
export const rateProposalValidator = v.object({
  amount: v.number(),
  currency: v.string(),
  unit: v.union(v.literal("hour"), v.literal("day"), v.literal("fixed")),
});

export function validateAvailability(value: string | undefined): string | undefined {
  const availability = value?.trim();
  if (!availability) return undefined;
  if (availability.length > MAX_AVAILABILITY_LENGTH) {
    fail("invalid_availability", `Keep availability under ${MAX_AVAILABILITY_LENGTH} characters.`);
  }
  return availability;
}

export function validateRateProposal(value: RateProposal | undefined): RateProposal | undefined {
  if (!value) return undefined;
  if (!Number.isFinite(value.amount) || value.amount <= 0 || value.amount > 1_000_000_000) {
    fail("invalid_rate", "Propose a real amount greater than zero.");
  }
  const currency = value.currency.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) fail("invalid_rate", "Use a three-letter currency code, such as USD.");
  if (value.unit !== "hour" && value.unit !== "day" && value.unit !== "fixed") {
    fail("invalid_rate", "Say whether your proposal is hourly, daily or a fixed total.");
  }
  return { amount: value.amount, currency, unit: value.unit };
}

export function rateProposalLabel(rate: RateProposal): string {
  const amount = formatCurrency(rate.amount, rate.currency);
  return `${rate.currency} ${amount}${rate.unit === "fixed" ? " total" : `/${rate.unit}`}`;
}
