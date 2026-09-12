// Pure-logic tests for projectTeam.ts: the stage twin, the §2 row-reuse
// rules, the §3 limit counter, the §6 stage-change rule, HTML escaping for
// the claim email, and the client projections that must never leak
// `email` / `claimToken`. No Convex, no network — same shape as
// communities.test.ts.

import { describe, expect, it } from "vitest";
import type { Doc, Id } from "../_generated/dataModel";
import {
  CLAIM_TTL_MS,
  DAY_MS,
  DECLINED_RETRY_MS,
  STAGES,
  buildClaimEmail,
  canLeadReinvite,
  countInWindow,
  escapeHtml,
  isStage,
  nameMatches,
  nextStatusForRequest,
  resolveStage,
  shouldNotifyStageChange,
  stageLabel,
  toCreditEntry,
  toInvitedEntry,
  toPersonEntry,
} from "./projectTeam";

const NOW = 1_800_000_000_000;

describe("stage twin — matches app/app/lib/stage.ts", () => {
  it("has the six stages in creative-process order", () => {
    expect(STAGES).toEqual(["planning", "raising", "forming", "working", "releasing", "completed"]);
  });
  it("isStage accepts only the tuple", () => {
    for (const s of STAGES) expect(isStage(s)).toBe(true);
    expect(isStage("archived")).toBe(false);
    expect(isStage("")).toBe(false);
    expect(isStage(undefined)).toBe(false);
    expect(isStage(3)).toBe(false);
  });
  it("forming reads Hiring on paid, Forming team on passion", () => {
    expect(stageLabel("forming", "paid")).toBe("Hiring");
    expect(stageLabel("forming", "passion")).toBe("Forming team");
    expect(stageLabel("working", "paid")).toBe("Working");
  });
  it("resolveStage: stage wins, else derives from legacy status / kind", () => {
    expect(resolveStage({ stage: "releasing", status: "in_progress", kind: "paid" })).toBe("releasing");
    expect(resolveStage({ status: "in_progress", kind: "passion" })).toBe("working");
    expect(resolveStage({ status: "completed", kind: "paid" })).toBe("completed");
    expect(resolveStage({ status: "active", kind: "paid" })).toBe("forming");
    expect(resolveStage({ status: "active", kind: "passion" })).toBe("planning");
    expect(resolveStage({ stage: "bogus", status: "active", kind: "passion" })).toBe("planning");
  });
});

describe("nextStatusForRequest — the requestToJoin column of the §2 table", () => {
  it("no row → ok", () => {
    expect(nextStatusForRequest(undefined, undefined, NOW)).toBe("ok");
  });
  it("withdrawn / left → ok", () => {
    expect(nextStatusForRequest("withdrawn", NOW - 1000, NOW)).toBe("ok");
    expect(nextStatusForRequest("left", NOW - 1000, NOW)).toBe("ok");
  });
  it("declined → refused inside 30 days, ok after", () => {
    expect(nextStatusForRequest("declined", NOW - DECLINED_RETRY_MS + 1, NOW)).toBe("refused");
    expect(nextStatusForRequest("declined", NOW - DECLINED_RETRY_MS, NOW)).toBe("ok");
    expect(nextStatusForRequest("declined", NOW - 31 * DAY_MS, NOW)).toBe("ok");
  });
  it("declined with no respondedAt is treated as eligible", () => {
    expect(nextStatusForRequest("declined", undefined, NOW)).toBe("ok");
  });
  it("removed → refused", () => {
    expect(nextStatusForRequest("removed", NOW - 400 * DAY_MS, NOW)).toBe("refused");
  });
  it("pending / invited / accepted → no-op", () => {
    expect(nextStatusForRequest("pending", undefined, NOW)).toBe("no-op");
    expect(nextStatusForRequest("invited", undefined, NOW)).toBe("no-op");
    expect(nextStatusForRequest("accepted", NOW, NOW)).toBe("no-op");
  });
  it("an unknown status fails closed", () => {
    expect(nextStatusForRequest("weird", undefined, NOW)).toBe("refused");
  });
});

describe("canLeadReinvite — the lead column of the §2 table", () => {
  it("allowed for no row, declined, withdrawn, left, removed", () => {
    for (const s of [undefined, "declined", "withdrawn", "left", "removed"]) {
      expect(canLeadReinvite(s)).toBe(true);
    }
  });
  it("no-op for pending, invited, accepted", () => {
    for (const s of ["pending", "invited", "accepted"]) expect(canLeadReinvite(s)).toBe(false);
  });
});

describe("countInWindow — the §3 limits count createdAt in the last 24h", () => {
  it("counts only rows inside the window", () => {
    const rows = [
      { createdAt: NOW - 1000 },
      { createdAt: NOW - DAY_MS + 1 },
      { createdAt: NOW - DAY_MS }, // exactly on the boundary: outside
      { createdAt: NOW - 2 * DAY_MS },
    ];
    expect(countInWindow(rows, NOW)).toBe(2);
  });
  it("empty → 0; custom window honored", () => {
    expect(countInWindow([], NOW)).toBe(0);
    expect(countInWindow([{ createdAt: NOW - 5000 }], NOW, 1000)).toBe(0);
  });
  it("claim TTL is 30 days", () => {
    expect(CLAIM_TTL_MS).toBe(30 * DAY_MS);
  });
});

describe("shouldNotifyStageChange — §6: real change, at most once per 24h", () => {
  it("false when the stage did not change", () => {
    expect(shouldNotifyStageChange("working", "working", undefined, NOW)).toBe(false);
  });
  it("true on first change (no stageChangedAt)", () => {
    expect(shouldNotifyStageChange(undefined, "working", undefined, NOW)).toBe(true);
  });
  it("false when the last change was under 24h ago", () => {
    expect(shouldNotifyStageChange("planning", "working", NOW - DAY_MS + 1, NOW)).toBe(false);
  });
  it("true when the last change was 24h+ ago", () => {
    expect(shouldNotifyStageChange("planning", "working", NOW - DAY_MS, NOW)).toBe(true);
  });
});

describe("escapeHtml", () => {
  it("escapes the five HTML metacharacters", () => {
    expect(escapeHtml(`<b>"Tom" & 'Jerry'</b>`)).toBe(
      "&lt;b&gt;&quot;Tom&quot; &amp; &#39;Jerry&#39;&lt;/b&gt;",
    );
  });
  it("leaves plain text alone", () => {
    expect(escapeHtml("Director of Photography")).toBe("Director of Photography");
  });
  it("escapes & first so entities aren't double-encoded", () => {
    expect(escapeHtml("&lt;")).toBe("&amp;lt;");
  });
});

describe("buildClaimEmail", () => {
  const input = {
    leadName: `Rick <script>`,
    projectTitle: `Night & Day`,
    role: `"DP"`,
    message: `come <join> us`,
  };
  const email = buildClaimEmail(input, "tok-123");
  it("subject is 'Name credited you on Title' (plain text, unescaped)", () => {
    expect(email.subject).toBe("Rick <script> credited you on Night & Day");
  });
  it("heading and body are HTML-escaped", () => {
    expect(email.heading).toBe("Rick &lt;script&gt; credited you on Night &amp; Day");
    expect(email.body).not.toContain("<script>");
    expect(email.body).not.toContain("<join>");
    expect(email.body).toContain("&quot;DP&quot;");
    expect(email.body).toContain("come &lt;join&gt; us");
  });
  it("CTA is the /claim/:token path (SITE_URL prefixed by emails.ts)", () => {
    expect(email.ctaUrl).toBe("/claim/tok-123");
    expect(email.ctaText).toBe("Claim your credit");
  });
  it("omits the note block when there is no message", () => {
    expect(buildClaimEmail({ ...input, message: undefined }, "t").body).not.toContain('"');
  });
});

describe("client projections never leak email or claimToken", () => {
  const row = {
    _id: "m1" as Id<"projectMembers">,
    _creationTime: NOW,
    projectId: "p1" as Id<"projects">,
    userId: undefined,
    name: "Sam Editor",
    email: "sam@example.com",
    role: "Editor",
    status: "invited",
    invitedByUserId: "u-lead" as Id<"users">,
    message: "hi",
    claimToken: "secret-token",
    claimExpiresAt: NOW + CLAIM_TTL_MS,
    createdAt: NOW,
  } satisfies Doc<"projectMembers">;
  const resolved = { profileId: null, imageUrl: null };

  for (const [label, entry] of [
    ["toPersonEntry", toPersonEntry(row, resolved)],
    ["toCreditEntry", toCreditEntry(row)],
    ["toInvitedEntry", toInvitedEntry(row, resolved)],
  ] as const) {
    it(`${label} has no email / claimToken / claimExpiresAt keys`, () => {
      expect("email" in entry).toBe(false);
      expect("claimToken" in entry).toBe(false);
      expect("claimExpiresAt" in entry).toBe(false);
      expect(JSON.stringify(entry)).not.toContain("secret-token");
      expect(JSON.stringify(entry)).not.toContain("sam@example.com");
    });
  }

  it("toCreditEntry is exactly memberId/name/role", () => {
    expect(toCreditEntry(row)).toEqual({ memberId: "m1", name: "Sam Editor", role: "Editor" });
  });
  it("toInvitedEntry flags off-platform + emailed without exposing the address", () => {
    expect(toInvitedEntry(row, resolved)).toMatchObject({ offPlatform: true, emailed: true });
    const onPlatform = { ...row, userId: "u2" as Id<"users">, email: undefined, claimToken: undefined };
    expect(toInvitedEntry(onPlatform, resolved)).toMatchObject({ offPlatform: false, emailed: false });
  });
  it("toPersonEntry prefers the resolved profile name and carries profile ids", () => {
    const e = toPersonEntry(
      { ...row, userId: "u2" as Id<"users"> },
      { profileId: "pr2" as Id<"profiles">, name: "Sam (profile)", imageUrl: "https://img" },
    );
    expect(e).toEqual({
      memberId: "m1",
      profileId: "pr2",
      userId: "u2",
      name: "Sam (profile)",
      imageUrl: "https://img",
      role: "Editor",
      status: "invited",
      message: "hi",
    });
  });
});

describe("nameMatches", () => {
  it("is a case-insensitive substring match against a lowercased query", () => {
    expect(nameMatches("Rick Moy", "moy")).toBe(true);
    expect(nameMatches("Rick Moy", "ick m")).toBe(true);
    expect(nameMatches("Rick Moy", "sam")).toBe(false);
  });
});
