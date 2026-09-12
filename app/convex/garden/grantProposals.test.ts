// Pure-logic tests for grantProposals.ts: field validation, the one-open-ask
// rule, and the client projections that must never leak `operatorNote` /
// `decidedByUserId` to the proposer's own list. No Convex, no network — same
// shape as projectTeam.test.ts.

import { describe, expect, it } from "vitest";
import type { Doc, Id } from "../_generated/dataModel";
import {
  MAX_SUMMARY_LENGTH,
  MAX_TITLE_LENGTH,
  MIN_AMOUNT_CENTS,
  hasOpenProposal,
  isOpenProposalStatus,
  isValidProposalAmountCents,
  toMyProposalEntry,
  toReviewProposalEntry,
  validateProposalSummary,
  validateProposalTitle,
} from "./grantProposals";

describe("isOpenProposalStatus", () => {
  it("submitted and under_review are open", () => {
    expect(isOpenProposalStatus("submitted")).toBe(true);
    expect(isOpenProposalStatus("under_review")).toBe(true);
  });
  it("approved / declined / withdrawn are not open", () => {
    expect(isOpenProposalStatus("approved")).toBe(false);
    expect(isOpenProposalStatus("declined")).toBe(false);
    expect(isOpenProposalStatus("withdrawn")).toBe(false);
  });
});

describe("hasOpenProposal — one open ask at a time", () => {
  it("false with no rows", () => {
    expect(hasOpenProposal([], "fund1")).toBe(false);
  });
  it("true when a submitted row exists for the same fund", () => {
    const rows = [{ hostOrgId: "fund1", status: "submitted" }];
    expect(hasOpenProposal(rows, "fund1")).toBe(true);
  });
  it("true when an under_review row exists for the same fund", () => {
    const rows = [{ hostOrgId: "fund1", status: "under_review" }];
    expect(hasOpenProposal(rows, "fund1")).toBe(true);
  });
  it("false when the open row is for a DIFFERENT fund — scoped per fund", () => {
    const rows = [{ hostOrgId: "fund1", status: "submitted" }];
    expect(hasOpenProposal(rows, "fund2")).toBe(false);
  });
  it("false when the only rows are decided/withdrawn — a new ask is allowed", () => {
    const rows = [
      { hostOrgId: "fund1", status: "approved" },
      { hostOrgId: "fund1", status: "declined" },
      { hostOrgId: "fund1", status: "withdrawn" },
    ];
    expect(hasOpenProposal(rows, "fund1")).toBe(false);
  });
  it("compares hostOrgId by String() — works whether ids arrive as Id objects or strings", () => {
    const rows = [{ hostOrgId: "fund1" as unknown, status: "submitted" }];
    expect(hasOpenProposal(rows, "fund1")).toBe(true);
  });
});

describe("validateProposalTitle", () => {
  it("trims and accepts a normal title", () => {
    expect(validateProposalTitle("  New mural series  ")).toBe("New mural series");
  });
  it("rejects empty / whitespace-only", () => {
    expect(() => validateProposalTitle("")).toThrow();
    expect(() => validateProposalTitle("   ")).toThrow();
  });
  it(`accepts exactly ${MAX_TITLE_LENGTH} characters, rejects one more`, () => {
    const atLimit = "a".repeat(MAX_TITLE_LENGTH);
    const overLimit = "a".repeat(MAX_TITLE_LENGTH + 1);
    expect(validateProposalTitle(atLimit)).toBe(atLimit);
    expect(() => validateProposalTitle(overLimit)).toThrow();
  });
});

describe("validateProposalSummary", () => {
  it("trims and accepts a normal summary", () => {
    expect(validateProposalSummary("  What the grant funds.  ")).toBe("What the grant funds.");
  });
  it("rejects empty / whitespace-only", () => {
    expect(() => validateProposalSummary("")).toThrow();
    expect(() => validateProposalSummary("  ")).toThrow();
  });
  it(`accepts exactly ${MAX_SUMMARY_LENGTH} characters, rejects one more`, () => {
    const atLimit = "a".repeat(MAX_SUMMARY_LENGTH);
    const overLimit = "a".repeat(MAX_SUMMARY_LENGTH + 1);
    expect(validateProposalSummary(atLimit)).toBe(atLimit);
    expect(() => validateProposalSummary(overLimit)).toThrow();
  });
});

describe("isValidProposalAmountCents", () => {
  it(`accepts the $${MIN_AMOUNT_CENTS / 100} floor and above, as a whole number`, () => {
    expect(isValidProposalAmountCents(MIN_AMOUNT_CENTS)).toBe(true);
    expect(isValidProposalAmountCents(MIN_AMOUNT_CENTS + 1)).toBe(true);
    expect(isValidProposalAmountCents(100_000)).toBe(true);
  });
  it("rejects below the floor", () => {
    expect(isValidProposalAmountCents(MIN_AMOUNT_CENTS - 1)).toBe(false);
    expect(isValidProposalAmountCents(0)).toBe(false);
    expect(isValidProposalAmountCents(-500)).toBe(false);
  });
  it("rejects non-integers", () => {
    expect(isValidProposalAmountCents(500.5)).toBe(false);
  });
});

describe("client projections never leak operatorNote / decidedByUserId", () => {
  const row = {
    _id: "p1" as Id<"grantProposals">,
    _creationTime: 1_800_000_000_000,
    userId: "u-proposer" as Id<"users">,
    hostOrgId: "fund1" as Id<"hostOrgs">,
    projectId: "proj1" as Id<"projects">,
    title: "New mural series",
    summary: "Three murals across town, materials + install.",
    amountCents: 250_000,
    status: "declined",
    decidedByUserId: "u-operator" as Id<"users">,
    decidedAt: 1_800_000_100_000,
    operatorNote: "Budget doesn't line up with scope — ask to resubmit smaller.",
    allocationId: undefined,
    createdAt: 1_800_000_000_000,
    updatedAt: 1_800_000_100_000,
  } satisfies Doc<"grantProposals">;

  it("toMyProposalEntry has no operatorNote / decidedByUserId / allocationId keys", () => {
    const entry = toMyProposalEntry(row);
    expect("operatorNote" in entry).toBe(false);
    expect("decidedByUserId" in entry).toBe(false);
    expect("allocationId" in entry).toBe(false);
    expect(JSON.stringify(entry)).not.toContain("Budget doesn't line up");
    expect(JSON.stringify(entry)).not.toContain("u-operator");
  });

  it("toMyProposalEntry is exactly the proposer-facing field set", () => {
    expect(toMyProposalEntry(row)).toEqual({
      proposalId: "p1",
      hostOrgId: "fund1",
      projectId: "proj1",
      title: "New mural series",
      summary: "Three murals across town, materials + install.",
      amountCents: 250_000,
      status: "declined",
      createdAt: 1_800_000_000_000,
      decidedAt: 1_800_000_100_000,
    });
  });

  it("toReviewProposalEntry (operator-only) DOES carry operatorNote plus the resolved proposer", () => {
    const entry = toReviewProposalEntry(row, { profileId: "prof1" as Id<"profiles">, name: "Shua" });
    expect(entry.operatorNote).toBe("Budget doesn't line up with scope — ask to resubmit smaller.");
    expect(entry.proposerName).toBe("Shua");
    expect(entry.proposerProfileId).toBe("prof1");
  });

  it("toReviewProposalEntry.operatorNote is null, not undefined, when absent", () => {
    const noNote = { ...row, operatorNote: undefined };
    const entry = toReviewProposalEntry(noNote, { profileId: null, name: "Someone" });
    expect(entry.operatorNote).toBeNull();
  });

  it("both projections fall back projectId/decidedAt to null when absent (never undefined-vs-missing ambiguity)", () => {
    const standalone = { ...row, projectId: undefined, decidedAt: undefined };
    expect(toMyProposalEntry(standalone).projectId).toBeNull();
    expect(toMyProposalEntry(standalone).decidedAt).toBeNull();
    expect(toReviewProposalEntry(standalone, { profileId: null, name: "Someone" }).projectId).toBeNull();
  });
});
