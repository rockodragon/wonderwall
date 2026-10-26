// Pure-logic tests for projectTeam.ts: the stage twin, the §2 row-reuse
// rules, the §3 limit counter, the §6 stage-change rule, HTML escaping for
// the claim email, and the client projections that must never leak
// `email` / `claimToken`. No Convex, no network — same shape as
// communities.test.ts. At the end, the two reads the public project page
// makes (getTeam, listRoles), run on the in-memory ctx in test-support.

import { describe, expect, it } from "vitest";
import type { Doc, Id } from "../_generated/dataModel";
import { makeCtx, run, type Row } from "../../test-support/convexContext";
import {
  isAcceptingPeople,
  isProjectFinished,
  isRoleListed,
  CLAIM_TTL_MS,
  DAY_MS,
  DECLINED_RETRY_MS,
  STAGES,
  buildClaimEmail,
  buildInviteEmail,
  optionalRole,
  buildJoinRequestEmail,
  buildRequestDecidedEmail,
  canLeadReinvite,
  getTeam,
  listRoles,
  countInWindow,
  isStage,
  nameMatches,
  nextStatusForRequest,
  searchPeopleForInvite,
  resolveStage,
  shouldNotifyStageChange,
  stageLabel,
  toCreditEntry,
  toInvitedEntry,
  toPersonEntry,
} from "./projectTeam";

const NOW = 1_800_000_000_000;

describe("stage twin — matches app/app/lib/stage.ts", () => {
  it("has the eight stages in creative-process order", () => {
    expect(STAGES).toEqual([
      "planning",
      "raising",
      "forming",
      "working",
      "releasing",
      "paused",
      "completed",
      "cancelled",
    ]);
  });
  it("isStage accepts only the tuple", () => {
    for (const s of STAGES) expect(isStage(s)).toBe(true);
    expect(isStage("archived")).toBe(false);
    expect(isStage("")).toBe(false);
    expect(isStage(undefined)).toBe(false);
    expect(isStage(3)).toBe(false);
  });
  it("forming reads Forming team regardless of kind", () => {
    expect(stageLabel("forming")).toBe("Forming team");
    expect(stageLabel("working")).toBe("Working");
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
  it("heading is plain text (sendNotificationEmail's template escapes it); body is HTML-escaped", () => {
    // heading is interpolated into the email template's escapeHtml() call
    // downstream — passing pre-escaped text here would double-escape it.
    expect(email.heading).toBe("Rick <script> credited you on Night & Day");
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

describe("buildInviteEmail", () => {
  const input = {
    leadName: `Rick <script>`,
    projectTitle: `Night & Day`,
    role: `"DP"`,
    message: `come <join> us`,
    linkUrl: "/projects/abc",
  };
  const email = buildInviteEmail(input);

  it("subject and heading are plain text (unescaped)", () => {
    expect(email.subject).toBe(`Rick <script> invited you to Night & Day as "DP"`);
    expect(email.heading).toBe("Rick <script> invited you to Night & Day");
  });
  it("escapes lead name, title, role, and message in the body", () => {
    expect(email.body).not.toContain("<script>");
    expect(email.body).not.toContain("<join>");
    expect(email.body).toContain("&quot;DP&quot;");
    expect(email.body).toContain("come &lt;join&gt; us");
  });
  it("CTA is 'Answer the invite'", () => {
    expect(email.ctaText).toBe("Answer the invite");
    expect(email.ctaUrl).toBe("/projects/abc");
  });
  it("omits the note block when there is no message", () => {
    expect(buildInviteEmail({ ...input, message: undefined }).body).not.toContain('"');
  });
});

describe("buildJoinRequestEmail", () => {
  const input = {
    requesterName: `Sam <script>`,
    projectTitle: `Night & Day`,
    role: `"Grip"`,
    message: `I'd love to help <3`,
    linkUrl: "/projects/xyz",
  };
  const email = buildJoinRequestEmail(input);

  it("subject and heading are plain text (unescaped)", () => {
    expect(email.subject).toBe("Sam <script> asked to join Night & Day");
    expect(email.heading).toBe("Sam <script> wants to join Night & Day");
  });
  it("escapes requester name, title, role, and message in the body", () => {
    expect(email.body).not.toContain("<script>");
    expect(email.body).toContain("&quot;Grip&quot;");
  });
  it("CTA is 'Review the request'", () => {
    expect(email.ctaText).toBe("Review the request");
    expect(email.ctaUrl).toBe("/projects/xyz");
  });
});

describe("buildRequestDecidedEmail", () => {
  const input = {
    projectTitle: `Night & Day`,
    role: `"DP"`,
    linkUrl: "/projects/abc",
  };

  it("accepted: subject/heading say you're on the project", () => {
    const email = buildRequestDecidedEmail({ ...input, accepted: true });
    expect(email.subject).toBe("You're on Night & Day");
    expect(email.heading).toBe("You're on Night & Day");
    expect(email.body).toContain("&quot;DP&quot;");
  });
  it("declined: subject/heading say there wasn't room, with an optional note", () => {
    const email = buildRequestDecidedEmail({ ...input, accepted: false, note: `not right now <3` });
    expect(email.subject).toBe("Night & Day didn't have room");
    expect(email.body).not.toContain("<3");
    expect(email.body).toContain("not right now &lt;3");
  });
  it("CTA is 'See the project'", () => {
    expect(buildRequestDecidedEmail({ ...input, accepted: true }).ctaText).toBe("See the project");
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

describe("isAcceptingPeople", () => {
  it("takes people while the work is live", () => {
    for (const stage of ["planning", "raising", "forming", "working", "releasing"]) {
      expect(isAcceptingPeople({ kind: "passion", status: "active", stage })).toBe(true);
    }
  });

  it("still takes people while paused — on hold is not over", () => {
    expect(isAcceptingPeople({ kind: "paid", status: "active", stage: "paused" })).toBe(true);
  });

  it("stops once the project is finished, by stage or by status", () => {
    expect(isAcceptingPeople({ kind: "passion", status: "active", stage: "completed" })).toBe(false);
    expect(isAcceptingPeople({ kind: "passion", status: "active", stage: "cancelled" })).toBe(false);
    expect(isAcceptingPeople({ kind: "paid", status: "completed" })).toBe(false);
    expect(isAcceptingPeople({ kind: "paid", status: "archived", stage: "forming" })).toBe(false);
  });

  it("reads a legacy row with no stage the way resolveStage does", () => {
    // no stage + in_progress resolves to "working": still live
    expect(isAcceptingPeople({ kind: "paid", status: "in_progress" })).toBe(true);
    expect(isAcceptingPeople({ kind: "passion", status: "active" })).toBe(true);
  });
});

describe("isProjectFinished — the work is over", () => {
  it("archived, completed by status or stage, or cancelled", () => {
    expect(isProjectFinished({ kind: "paid", status: "archived", stage: "forming" })).toBe(true);
    expect(isProjectFinished({ kind: "paid", status: "completed" })).toBe(true);
    expect(isProjectFinished({ kind: "passion", status: "active", stage: "completed" })).toBe(true);
    expect(isProjectFinished({ kind: "passion", status: "active", stage: "cancelled" })).toBe(true);
  });

  it("live, paused or hidden work isn't", () => {
    for (const stage of ["planning", "raising", "forming", "working", "releasing", "paused"]) {
      expect(isProjectFinished({ kind: "passion", status: "active", stage })).toBe(false);
    }
    expect(isProjectFinished({ kind: "paid", status: "in_progress" })).toBe(false);
    // A hide stops it taking people, but the work isn't over.
    expect(isProjectFinished({ kind: "passion", status: "hidden" })).toBe(false);
    expect(isAcceptingPeople({ kind: "passion", status: "hidden" })).toBe(false);
  });
});

describe("isRoleListed — listRoles' rule", () => {
  const active = { kind: "paid", status: "active" };
  const archived = { kind: "paid", status: "archived" };

  it("an open role on a project taking people", () => {
    expect(isRoleListed({ status: "open" }, active)).toBe(true);
  });

  it("never a closed role", () => {
    expect(isRoleListed({ status: "closed" }, active)).toBe(false);
  });

  it("an open role drops once the project stops taking people", () => {
    expect(isRoleListed({ status: "open" }, archived)).toBe(false);
    expect(isRoleListed({ status: "open" }, { kind: "passion", status: "active", stage: "cancelled" })).toBe(false);
    expect(isRoleListed({ status: "open" }, { kind: "passion", status: "hidden" })).toBe(false);
  });

  it("a filled role stays listed, as filled", () => {
    expect(isRoleListed({ status: "filled" }, archived)).toBe(true);
  });

  it("with the project gone, only a filled role is left", () => {
    expect(isRoleListed({ status: "open" }, null)).toBe(false);
    expect(isRoleListed({ status: "closed" }, null)).toBe(false);
    expect(isRoleListed({ status: "filled" }, null)).toBe(true);
  });
});

describe("a person added without a role", () => {
  it("optionalRole keeps a blank role blank and trims the rest", () => {
    expect(optionalRole(undefined)).toBe("");
    expect(optionalRole("   ")).toBe("");
    expect(optionalRole("  Editor ")).toBe("Editor");
    expect(() => optionalRole("x".repeat(500))).toThrow();
  });

  it("the invite email leaves out the role", () => {
    const email = buildInviteEmail({ leadName: "Rick", projectTitle: "Small Acts", role: "", linkUrl: "/projects/abc" });
    expect(email.subject).toBe("Rick invited you to Small Acts");
    expect(email.body).toBe("Rick invited you to <strong>Small Acts</strong>.");
  });

  it("the credit email leaves out the role", () => {
    const email = buildClaimEmail({ leadName: "Rick", projectTitle: "Small Acts", role: "" }, "tok");
    expect(email.previewText).toBe("You're listed on Small Acts.");
    expect(email.body).toContain("Rick listed you on <strong>Small Acts</strong>");
    expect(email.body).not.toContain(" as ");
  });
});

// ——————————————————————————————————————————————————————————————
// The public project page's reads: getTeam and listRoles
// ——————————————————————————————————————————————————————————————

describe("getTeam and listRoles, now that the project page is public", () => {
  const LEAD = "users:lead";
  const MEMBER = "users:member"; // accepted on every project
  const ASKER = "users:asker"; // asked to join the plain one
  const ADMIN = "users:admin";
  const INSIDER = "users:insider"; // active member of the hidden community
  const HID = "hostOrgs:hid";

  function project(_id: string, extra: Record<string, unknown> = {}): Row {
    return { _id, userId: LEAD, kind: "passion", origin: "posted", title: _id, status: "active", createdAt: 1, updatedAt: 1, ...extra };
  }
  function world(): Record<string, Row[]> {
    const ids = ["projects:plain", "projects:hidden", "projects:test"];
    return {
      profiles: [
        { _id: "profiles:lead", userId: LEAD, name: "Lena", interests: [] },
        { _id: "profiles:member", userId: MEMBER, name: "Mo", interests: [] },
        { _id: "profiles:asker", userId: ASKER, name: "Ash", interests: [] },
        { _id: "profiles:admin", userId: ADMIN, name: "Ada", interests: [], isAdmin: true },
        { _id: "profiles:insider", userId: INSIDER, name: "Ines", interests: [] },
      ],
      hostOrgs: [
        { _id: HID, name: "_TeamTest", slug: "teamtest", kind: "community", status: "active", visibility: "public", joinPolicy: "open", ownerUserId: LEAD, createdAt: 1 },
      ],
      communityMembers: [{ _id: "communityMembers:1", hostOrgId: HID, userId: INSIDER, role: "member", status: "active", joinedAt: 0 }],
      projects: [project("projects:plain"), project("projects:hidden", { status: "hidden" }), project("projects:test", { hostOrgId: HID })],
      projectMembers: [
        ...ids.map((projectId, i) => ({
          _id: `projectMembers:m${i}`, projectId, userId: MEMBER, name: "Mo", role: "Sound", status: "accepted",
          message: "Happy to mix the opening night", createdAt: 1, updatedAt: 1,
        })),
        {
          _id: "projectMembers:credit", projectId: "projects:plain", name: "Cass", role: "Camera", status: "invited",
          email: "cass@example.com", claimToken: "secret-token", createdAt: 1, updatedAt: 1,
        },
        { _id: "projectMembers:ask", projectId: "projects:plain", userId: ASKER, name: "Ash", role: "Lights", status: "pending", createdAt: 1, updatedAt: 1 },
      ],
      // A filled role on a project that's gone would still read as listed.
      projectRoles: [...ids, "projects:gone"].map((projectId, i) => ({
        _id: `projectRoles:r${i}`, projectId, title: "Editor", status: projectId === "projects:gone" ? "filled" : "open",
        createdAt: 1, updatedAt: 1,
      })),
    };
  }
  const as = (viewer: string | null) => makeCtx(world(), viewer);

  it("shows a signed-out visitor who is on it, and nothing about the visitor", async () => {
    const team = await run(getTeam, as(null), { projectId: "projects:plain" });
    expect(Object.keys(team).sort()).toEqual(["accepted", "acceptingPeople", "credits", "lead"]);
    expect(team.lead).toMatchObject({ name: "Lena", profileId: "profiles:lead" });
    expect(team.accepted.map((m: any) => m.name)).toEqual(["Mo"]);
    expect(team.credits).toEqual([{ memberId: "projectMembers:credit", name: "Cass", role: "Camera" }]);
    expect(team.acceptingPeople).toBe(true);
    // No request waiting on the lead, and nothing a credit was sent with.
    const json = JSON.stringify(team);
    expect(json).not.toContain("Ash");
    expect(json).not.toContain("cass@example.com");
    expect(json).not.toContain("secret-token");
  });

  it("still tells a signed-in member about their own request, and whether they may apply", async () => {
    const team = await run(getTeam, as(ASKER), { projectId: "projects:plain" });
    expect(team.mine).toMatchObject({ status: "pending", role: "Lights" });
    expect(team.apply).toEqual({ allowed: true, reason: null, upgradePath: null });
    expect(team.pending).toBeUndefined();
  });

  it("gives the lead the requests waiting on them", async () => {
    const team = await run(getTeam, as(LEAD), { projectId: "projects:plain" });
    expect(team.pending.map((m: any) => m.name)).toEqual(["Ash"]);
  });

  it.each([
    ["someone signed out", null],
    ["a member who isn't its lead", MEMBER],
  ])("is null on an admin-hidden project for %s, as getProject's not-found", async (_label, viewer) => {
    expect(await run(getTeam, as(viewer), { projectId: "projects:hidden" })).toBeNull();
    expect(await run(listRoles, as(viewer), { projectId: "projects:hidden" })).toEqual([]);
  });

  it.each([
    ["its lead", LEAD],
    ["an admin", ADMIN],
  ])("still shows an admin-hidden project to %s", async (_label, viewer) => {
    expect(await run(getTeam, as(viewer), { projectId: "projects:hidden" })).not.toBeNull();
  });

  it.each([
    ["someone signed out", null],
    ["a member who isn't in the community", MEMBER],
  ])("is null in a hidden community for %s", async (_label, viewer) => {
    expect(await run(getTeam, as(viewer), { projectId: "projects:test" })).toBeNull();
    expect(await run(listRoles, as(viewer), { projectId: "projects:test" })).toEqual([]);
  });

  it.each([
    ["its lead", LEAD],
    ["an admin", ADMIN],
    ["a member of the community", INSIDER],
  ])("still shows a hidden community's project to %s", async (_label, viewer) => {
    expect(await run(getTeam, as(viewer), { projectId: "projects:test" })).not.toBeNull();
    expect((await run(listRoles, as(viewer), { projectId: "projects:test" })).map((r: any) => r.title)).toEqual(["Editor"]);
  });

  it.each([
    ["someone signed out", null],
    ["a member who isn't its lead", ASKER],
    ["a member on the team", MEMBER],
  ])("keeps an accepted member's note (their request, or the lead's invite) from %s", async (_label, viewer) => {
    const team = await run(getTeam, as(viewer), { projectId: "projects:plain" });
    expect(team.accepted.map((m: any) => [m.name, m.message])).toEqual([["Mo", null]]);
    expect(JSON.stringify(team)).not.toContain("opening night");
  });

  it("gives the lead the note", async () => {
    const team = await run(getTeam, as(LEAD), { projectId: "projects:plain" });
    expect(team.accepted.map((m: any) => m.message)).toEqual(["Happy to mix the opening night"]);
  });

  it("lists no roles for a project that isn't there", async () => {
    expect(await run(listRoles, as(LEAD), { projectId: "projects:gone" })).toEqual([]);
  });

  it("lists an ordinary project's roles to a signed-out visitor", async () => {
    const roles = await run(listRoles, as(null), { projectId: "projects:plain" });
    expect(roles.map((r: any) => [r.title, r.status])).toEqual([["Editor", "open"]]);
  });
});

// The people picker for on-platform invites. Someone who signed in but never
// named themselves (convex/names.ts) is not offered, even for a query their
// placeholder name happens to match.
describe("searchPeopleForInvite — unnamed accounts", () => {
  const ME = "users:me";
  const world = () => ({
    profiles: [
      { _id: "profiles:me", userId: ME, name: "Me Myself" },
      { _id: "profiles:newman", userId: "users:newman", name: "Newman Okoro" },
      { _id: "profiles:ghost", userId: "users:ghost", name: "New User" },
      { _id: "profiles:padded", userId: "users:padded", name: "  new user " },
      { _id: "profiles:blank", userId: "users:blank", name: "   " },
      { _id: "profiles:dana", userId: "users:dana", name: "Dana Reyes" },
    ],
  });
  const find = async (q: string) => await run(searchPeopleForInvite, makeCtx(world(), ME), { q });

  it("never offers an unnamed profile, even when the query matches its placeholder name", async () => {
    // "new" and "user" both match "New User"; only the named "Newman" is offered for "new".
    expect((await find("new")).map((r: any) => r.name)).toEqual(["Newman Okoro"]);
    expect(await find("user")).toEqual([]);
  });

  it("still offers named people, with the narrow projection", async () => {
    expect(await find("dana")).toEqual([
      { profileId: "profiles:dana", userId: "users:dana", name: "Dana Reyes", imageUrl: null },
    ]);
  });

  it("offers nobody for a query that matches no named profile", async () => {
    expect(await find("zzz")).toEqual([]);
  });
});
