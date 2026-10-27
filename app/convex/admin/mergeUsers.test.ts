// mergeUsers (operator CLI, and the duplicates page behind its admin check).
// Real handler, in-memory ctx. What the duplicates page needed from it
// (2026-10-26): every field that points at an account is moved, followers
// and organizations included, and the kept profile is filled even when the
// other copy has nothing else.

import { describe, expect, it } from "vitest";
import schema from "../schema";
import { makeCtx, run, type Row } from "../../test-support/convexContext";
import { checkIndexes, indexFields } from "../../test-support/indexChecks";
import { schemaFieldsPointingAt } from "../../test-support/schemaFields";
import { mergeUsers, PROFILE_ID_FIELDS, profileFill, signInFate, USER_ID_FIELDS, type RefField } from "./mergeUsers";

describe("the lists name every field that points at an account", () => {
  it("v.id(\"users\")", () => {
    // profiles.userId is the profile itself (mergeProfiles); eventCoHosts
    // mirrors events.coHostIds and is re-synced from it.
    // emailDeliveries.blockedUserId is left on purpose (mergeUsers.ts).
    const handledElsewhere = ["profiles.userId", "eventCoHosts.userId", "emailDeliveries.blockedUserId"];
    const listed = USER_ID_FIELDS.map((f) => `${f.table}.${f.field}`);
    expect([...new Set([...listed, ...handledElsewhere])].sort()).toEqual(schemaFieldsPointingAt("users"));
    // Each once: a repeat would be counted and moved twice.
    expect(new Set(listed).size).toBe(listed.length);
  });

  it("v.id(\"profiles\"), and the follows that hold a profile id as text", () => {
    const listed = PROFILE_ID_FIELDS.map((f) => `${f.table}.${f.field}`);
    expect(listed.filter((k) => k !== "favorites.targetId").sort()).toEqual(schemaFieldsPointingAt("profiles"));
    expect(listed).toContain("favorites.targetId");
  });
});

// A merge reads only the rows that point at an account where the field has
// an index, so it stays inside Convex's limit on what one mutation may read.
// These tables have a field with none, so each is read whole, once per
// merge, and all its fields from that copy. A new one lands here on
// purpose, or gets an index.
const READ_WHOLE = [
  "announcements",
  "apGiftSubscriptions",
  "conversationParticipants",
  "conversations",
  "crawlerRuns",
  "creativePayouts",
  "duplicateDismissals",
  "engagementAttention",
  "engagementLoops",
  "events",
  "externalTicketExceptions",
  "gardenTables",
  "gigResponses",
  "gigSeries",
  "grantProposals",
  "jobInterests",
  "offeringReports",
  "offerings",
  "organizations",
  "reports",
  "showcaseApplications",
  "storyUpdates",
  "tableAttendance",
  "tableCheckoutHolds",
  "tableMembershipHistory",
  "updates",
  "waitlist",
];

type Indexes = { " indexes"(): { indexDescriptor: string; fields: string[] }[] };
const indexesOf = (table: string) =>
  (schema.tables as unknown as Record<string, Indexes>)[table][" indexes"]();

describe("how a merge reads each field", () => {
  const all: RefField[] = [...USER_ID_FIELDS, ...PROFILE_ID_FIELDS];

  it("an index it names starts with the field, after any fixed ones", () => {
    for (const ref of all.filter((r) => r.index)) {
      const fields = indexFields(ref.table, ref.index!);
      expect(fields.slice(0, Object.keys(ref.where ?? {}).length + 1), `${ref.table}.${ref.index}`).toEqual([
        ...Object.keys(ref.where ?? {}),
        ref.field,
      ]);
    }
  });

  it("a table is read whole only when a field of it has no index, and then wholly", () => {
    const whole = [...new Set(all.filter((r) => !r.index).map((r) => r.table))].sort();
    expect(whole).toEqual(READ_WHOLE);
    for (const table of whole) {
      const fields = all.filter((r) => r.table === table);
      // Read whole anyway: an index on another field would save nothing.
      expect(fields.filter((r) => r.index).map((r) => r.field), table).toEqual([]);
      const needsWhole = fields.filter((r) => !indexesOf(table).some((i) => i.fields[0] === r.field));
      expect(needsWhole.length, `${table} could be read by index`).toBeGreaterThan(0);
    }
  });
});

const SRC = "users:src";
const TGT = "users:tgt";
const FAN = "users:fan";
const FAN2 = "users:fan2";
const P_SRC = "profiles:src";
const P_TGT = "profiles:tgt";

function world(extra: Record<string, Row[]> = {}) {
  return makeCtx(
    {
      users: [{ _id: SRC, email: "sarah@old.example" }, { _id: TGT, email: "sarah@example.com" }, { _id: FAN }, { _id: FAN2 }],
      profiles: [
        { _id: P_SRC, userId: SRC, name: "Sarah Shreves", bio: "Painter.", interests: ["Art"], handle: "sarahpaints", createdAt: 1, updatedAt: 1 },
        { _id: P_TGT, userId: TGT, name: "New User", interests: [], imageStorageId: "_storage:face", handle: "sarah", createdAt: 2, updatedAt: 2 },
        { _id: "profiles:fan", userId: FAN, name: "Fan", interests: [], createdAt: 3, updatedAt: 3 },
        { _id: "profiles:fan2", userId: FAN2, name: "Fan Two", interests: [], createdAt: 3, updatedAt: 3 },
      ],
      favorites: [
        { _id: "favorites:1", userId: FAN, targetType: "profile", targetId: P_SRC },
        { _id: "favorites:2", userId: FAN, targetType: "profile", targetId: P_TGT },
        { _id: "favorites:3", userId: FAN2, targetType: "profile", targetId: P_SRC },
        // The two copies following each other: following yourself, after.
        { _id: "favorites:4", userId: SRC, targetType: "profile", targetId: P_TGT },
      ],
      organizations: [
        { _id: "organizations:grove", name: "The Grove", slug: "the-grove", createdByUserId: SRC },
        { _id: "organizations:ap", name: "Abiding Practice", slug: "abiding-practice", createdByUserId: FAN },
      ],
      orgPositions: [
        { _id: "orgPositions:src-grove", organizationId: "organizations:grove", userId: SRC, profileId: P_SRC, isAdmin: true, order: 0, createdAt: 1 },
        { _id: "orgPositions:src-ap", organizationId: "organizations:ap", userId: SRC, profileId: P_SRC, isAdmin: false, order: 1, createdAt: 1 },
        { _id: "orgPositions:tgt-ap", organizationId: "organizations:ap", userId: TGT, profileId: P_TGT, isAdmin: false, order: 0, createdAt: 2 },
      ],
      events: [
        {
          _id: "events:1",
          organizerId: FAN,
          displayHosts: [{ kind: "user", userId: SRC }, { kind: "org", organizationId: "organizations:ap" }, { kind: "user", userId: TGT }],
        },
      ],
      uploadClaims: [{ _id: "uploadClaims:1", storageId: "_storage:old", userId: SRC, claimedAt: 1 }],
      handleForwards: [],
      authAccounts: [
        { _id: "authAccounts:src-google", userId: SRC, provider: "google", providerAccountId: "1234" },
        { _id: "authAccounts:src-pw", userId: SRC, provider: "password", providerAccountId: "sarah@old.example" },
        { _id: "authAccounts:tgt-pw", userId: TGT, provider: "password", providerAccountId: "sarah@example.com" },
      ],
      authSessions: [{ _id: "authSessions:src", userId: SRC }],
      ...extra,
    },
    null,
  );
}

// The in-memory ctx creates an empty table the first time one is read.
const rows = (store: Record<string, Row[]>) =>
  JSON.stringify(Object.fromEntries(Object.entries(store).filter(([, r]) => r.length > 0)));

const merge = (ctx: any, dryRun = false) =>
  run(mergeUsers, ctx, { targetUserId: TGT, sourceUserIds: [SRC], dryRun, moveContent: true });

describe("mergeUsers with moveContent", () => {
  it("the dry run counts the new references and changes nothing", async () => {
    const ctx = world();
    const before = rows(ctx.store);
    const { results } = await merge(ctx, true);
    expect(results[0]).toMatchObject({
      dryRun: true,
      blockers: {
        "favorites.targetId": 2,
        "orgPositions.userId": 2,
        "orgPositions.profileId": 2,
        "organizations.createdByUserId": 1,
        "events.displayHosts": 1,
        "uploadClaims.userId": 1,
      },
    });
    expect(rows(ctx.store)).toBe(before);
  });

  it("moves the other copy's followers, once each, and drops following yourself", async () => {
    const ctx = world();
    await merge(ctx);
    expect(ctx.store.favorites.map((f: Row) => [f.userId, f.targetId]).sort()).toEqual([
      [FAN, P_TGT],
      [FAN2, P_TGT],
    ]);
  });

  it("moves its organizations, one place each, after the kept account's own", async () => {
    const ctx = world();
    await merge(ctx);
    expect(ctx.store.orgPositions.map((p: Row) => [p._id, p.userId, p.profileId, p.order])).toEqual([
      ["orgPositions:src-grove", TGT, P_TGT, 1],
      ["orgPositions:tgt-ap", TGT, P_TGT, 0],
    ]);
    expect(ctx.store.organizations[0].createdByUserId).toBe(TGT);
    const kept = ctx.store.profiles.find((p: Row) => p._id === P_TGT);
    expect(kept.orgName).toBe("Abiding Practice");
  });

  it("listed at one organization from both copies: the kept place stays an admin if either was", async () => {
    const ctx = world();
    const srcAp = ctx.store.orgPositions.find((p: Row) => p._id === "orgPositions:src-ap");
    Object.assign(srcAp, { isAdmin: true, title: "Founder", startYear: 2015 });
    await merge(ctx);
    expect(ctx.store.orgPositions.find((p: Row) => p._id === "orgPositions:tgt-ap")).toMatchObject({
      isAdmin: true,
      title: "Founder",
      startYear: 2015,
    });
    expect(ctx.store.orgPositions.some((p: Row) => p._id === "orgPositions:src-ap")).toBe(false);
  });

  it("swaps the other copy for the kept one in an event's hosts, listed once", async () => {
    const ctx = world();
    await merge(ctx);
    expect(ctx.store.events[0].displayHosts).toEqual([
      { kind: "user", userId: TGT },
      { kind: "org", organizationId: "organizations:ap" },
    ]);
  });

  it("fills the kept profile's empty fields, a placeholder name included, and keeps its own", async () => {
    const ctx = world();
    const { results } = await merge(ctx);
    const kept = ctx.store.profiles.find((p: Row) => p._id === P_TGT);
    expect(kept).toMatchObject({ name: "Sarah Shreves", bio: "Painter.", interests: ["Art"], imageStorageId: "_storage:face", handle: "sarah" });
    expect(results[0].contentMoved.profileFieldsFilled.sort()).toEqual(["bio", "interests", "name"]);
    expect(ctx.store.profiles.some((p: Row) => p._id === P_SRC)).toBe(false);
  });

  it("the other copy's @address forwards to the kept profile", async () => {
    const ctx = world();
    await merge(ctx);
    expect(ctx.store.handleForwards).toEqual([
      expect.objectContaining({ handle: "sarahpaints", profileId: P_TGT }),
    ]);
  });

  it("moves its sign-ins, its password too: the kept account signs in with either address", async () => {
    const ctx = world();
    await merge(ctx);
    expect(ctx.store.authAccounts.map((a: Row) => [a._id, a.userId])).toEqual([
      ["authAccounts:src-google", TGT],
      ["authAccounts:src-pw", TGT],
      ["authAccounts:tgt-pw", TGT],
    ]);
    expect(ctx.store.authSessions).toEqual([]);
    expect(ctx.store.uploadClaims[0].userId).toBe(TGT);
    expect(ctx.store.users.map((u: Row) => u._id)).toEqual([TGT, FAN, FAN2]);
  });

  it("reads by index where it can, and a whole table at most once", async () => {
    const ctx = world({
      conversations: [{ _id: "conversations:1", participants: [SRC, FAN], lastMessageAt: 1, createdAt: 1 }],
      notifications: [{ _id: "notifications:1", userId: FAN, relatedUserId: SRC, type: "x", title: "", message: "", createdAt: 1 }],
    });
    const { scans } = checkIndexes(ctx);
    await merge(ctx);
    expect(new Set(scans).size).toBe(scans.length);
    expect(scans.filter((t) => !READ_WHOLE.includes(t))).toEqual([]);
    expect(ctx.store.notifications[0].relatedUserId).toBe(TGT);
    expect(ctx.store.conversations[0].participants).toEqual([TGT, FAN]);
  });

  it("deletes a conversation between the two copies, with its messages and notices", async () => {
    const ctx = world({
      conversations: [{ _id: "conversations:self", participants: [SRC, TGT], lastMessageAt: 5, createdAt: 1 }],
      messages: [{ _id: "messages:1", conversationId: "conversations:self", senderId: SRC, content: "hi me", createdAt: 5 }],
      notifications: [
        { _id: "notifications:1", userId: TGT, relatedUserId: SRC, type: "message", title: "", message: "", linkUrl: "/messages/conversations:self", createdAt: 5 },
      ],
    });
    const { results } = await merge(ctx, true);
    expect(results[0].wouldMove.conversations).toEqual({ withEachOther: 1, combined: 0 });
    await merge(ctx);
    expect(ctx.store.conversations).toEqual([]);
    expect(ctx.store.messages).toEqual([]);
    expect(ctx.store.notifications).toEqual([]);
  });

  it("combines two conversations with the same person into the kept account's, every message kept", async () => {
    const ctx = world({
      conversations: [
        { _id: "conversations:old", participants: [SRC, FAN], lastMessageAt: 9, createdAt: 1 },
        { _id: "conversations:kept", participants: [FAN, TGT], lastMessageAt: 7, createdAt: 4 },
      ],
      messages: [
        { _id: "messages:1", conversationId: "conversations:old", senderId: FAN, content: "a", createdAt: 9 },
        { _id: "messages:2", conversationId: "conversations:kept", senderId: TGT, content: "b", createdAt: 7 },
      ],
      notifications: [
        { _id: "notifications:1", userId: SRC, relatedUserId: FAN, type: "message", title: "", message: "", linkUrl: "/messages/conversations:old", createdAt: 9 },
      ],
    });
    const { results } = await merge(ctx);
    expect(results[0].contentMoved.conversations).toEqual({ withEachOther: 0, combined: 1 });
    expect(ctx.store.conversations).toEqual([
      expect.objectContaining({ _id: "conversations:kept", participants: [FAN, TGT], lastMessageAt: 9, createdAt: 1 }),
    ]);
    expect(ctx.store.messages.map((m: Row) => m.conversationId)).toEqual(["conversations:kept", "conversations:kept"]);
    expect(ctx.store.notifications[0]).toMatchObject({ userId: TGT, linkUrl: "/messages/conversations:kept" });
  });

  it("moves what the nurture work keeps about an account: conversation summaries, emails sent, attention decisions", async () => {
    const summary = (_id: string, conversationId: string, userId: string, otherUserId: string): Row => ({
      _id,
      conversationId,
      userId,
      otherUserId,
      lastMessageAt: 1,
      historyComplete: true,
    });
    const ctx = world({
      conversations: [
        { _id: "conversations:self", participants: [SRC, TGT], lastMessageAt: 1, createdAt: 1 },
        { _id: "conversations:old", participants: [SRC, FAN], lastMessageAt: 1, createdAt: 1 },
        { _id: "conversations:kept", participants: [FAN, TGT], lastMessageAt: 1, createdAt: 1 },
        { _id: "conversations:fan2", participants: [SRC, FAN2], lastMessageAt: 1, createdAt: 1 },
      ],
      conversationParticipants: [
        summary("conversationParticipants:self-src", "conversations:self", SRC, TGT),
        summary("conversationParticipants:self-tgt", "conversations:self", TGT, SRC),
        summary("conversationParticipants:old-src", "conversations:old", SRC, FAN),
        summary("conversationParticipants:old-fan", "conversations:old", FAN, SRC),
        summary("conversationParticipants:kept-fan", "conversations:kept", FAN, TGT),
        summary("conversationParticipants:kept-tgt", "conversations:kept", TGT, FAN),
        summary("conversationParticipants:fan2-src", "conversations:fan2", SRC, FAN2),
        summary("conversationParticipants:fan2-fan2", "conversations:fan2", FAN2, SRC),
      ],
      emailDeliveries: [
        { _id: "emailDeliveries:to-src", recipientUserId: SRC, to: "sarah@old.example", status: "sent" },
        // Sent to Fan about a message from the other copy: the sender it
        // names is left as it was (mergeUsers.ts).
        { _id: "emailDeliveries:from-src", recipientUserId: FAN, blockedUserId: SRC, to: "fan@example.com", status: "sent" },
      ],
      engagementAttention: [
        { _id: "engagementAttention:about-src", candidateKey: "a", userId: SRC, ownerId: FAN, updatedBy: SRC },
        { _id: "engagementAttention:owned-by-src", candidateKey: "b", userId: FAN2, ownerId: SRC, updatedBy: FAN },
      ],
    });
    const before = rows(ctx.store);
    const { scans } = checkIndexes(ctx);
    const dry = await merge(ctx, true);
    expect(rows(ctx.store)).toBe(before);
    // Counted after the summaries of the two conversations that go.
    expect(dry.results[0].wouldMove.moved).toMatchObject({
      "conversationParticipants.userId": 1,
      "conversationParticipants.otherUserId": 1,
      "emailDeliveries.recipientUserId": 1,
      "engagementAttention.userId": 1,
      "engagementAttention.ownerId": 1,
      "engagementAttention.updatedBy": 1,
    });

    // Each merge reads a whole table at most once, only one of READ_WHOLE.
    const wholeReads = (reads: string[]) => [new Set(reads).size === reads.length, reads.filter((t) => !READ_WHOLE.includes(t))];
    expect(wholeReads(scans)).toEqual([true, []]);
    scans.length = 0;
    await merge(ctx);
    expect(wholeReads(scans)).toEqual([true, []]);
    // The talk with the other copy is gone and so are its summaries; the
    // one combined into the kept account's must be recomputed; the other
    // follows the kept account on both sides.
    expect(
      ctx.store.conversationParticipants
        .map((s: Row) => [s._id, s.userId, s.otherUserId, s.historyComplete])
        .sort(),
    ).toEqual([
      ["conversationParticipants:fan2-fan2", FAN2, TGT, true],
      ["conversationParticipants:fan2-src", TGT, FAN2, true],
      ["conversationParticipants:kept-fan", FAN, TGT, false],
      ["conversationParticipants:kept-tgt", TGT, FAN, false],
    ]);
    expect(ctx.store.emailDeliveries.map((d: Row) => [d._id, d.recipientUserId, d.blockedUserId])).toEqual([
      ["emailDeliveries:to-src", TGT, undefined],
      ["emailDeliveries:from-src", FAN, SRC],
    ]);
    expect(ctx.store.engagementAttention.map((a: Row) => [a._id, a.userId, a.ownerId, a.updatedBy])).toEqual([
      ["engagementAttention:about-src", TGT, FAN, TGT],
      ["engagementAttention:owned-by-src", FAN2, TGT, FAN],
    ]);
  });

  it("a dry run of several copies reports exactly what the merge then moves, drops and combines", async () => {
    const SRC2 = "users:src2";
    const P_SRC2 = "profiles:src2";
    const three = () =>
      world({
        users: [{ _id: SRC }, { _id: SRC2 }, { _id: TGT }, { _id: FAN }, { _id: FAN2 }],
        profiles: [
          { _id: P_SRC, userId: SRC, name: "Sarah Shreves", interests: [], createdAt: 1, updatedAt: 1 },
          { _id: P_SRC2, userId: SRC2, name: "Sarah Shreves", interests: [], createdAt: 1, updatedAt: 1 },
          { _id: P_TGT, userId: TGT, name: "Sarah Shreves", interests: [], createdAt: 2, updatedAt: 2 },
          { _id: "profiles:fan", userId: FAN, name: "Fan", interests: [], createdAt: 3, updatedAt: 3 },
        ],
        // Both copies talk to Fan; the kept one doesn't yet. The copies
        // also talk to each other.
        conversations: [
          { _id: "conversations:a", participants: [SRC, FAN], lastMessageAt: 1, createdAt: 1 },
          { _id: "conversations:b", participants: [SRC2, FAN], lastMessageAt: 2, createdAt: 2 },
          { _id: "conversations:ab", participants: [SRC, SRC2], lastMessageAt: 3, createdAt: 3 },
        ],
        messages: [
          { _id: "messages:a", conversationId: "conversations:a", senderId: SRC, content: "a", createdAt: 1 },
          { _id: "messages:b", conversationId: "conversations:b", senderId: SRC2, content: "b", createdAt: 2 },
          { _id: "messages:ab", conversationId: "conversations:ab", senderId: SRC2, content: "ab", createdAt: 3 },
        ],
        // Fan follows both copies: one follow of the kept one, after.
        favorites: [
          { _id: "favorites:1", userId: FAN, targetType: "profile", targetId: P_SRC },
          { _id: "favorites:2", userId: FAN, targetType: "profile", targetId: P_SRC2 },
        ],
      });
    const args = (dryRun: boolean) => ({ targetUserId: TGT, sourceUserIds: [SRC, SRC2], dryRun, moveContent: true });
    const ctx = three();
    const before = rows(ctx.store);
    const dry = (await run(mergeUsers, ctx, args(true))).results;
    expect(rows(ctx.store)).toBe(before);
    const real = (await run(mergeUsers, ctx, args(false))).results;
    for (let i = 0; i < 2; i++) {
      const { moved, droppedDuplicates, conversations } = real[i].contentMoved;
      expect(dry[i].wouldMove).toEqual({ moved, droppedDuplicates, conversations });
    }
    // The first copy's talk with Fan moves, and its talk with the other copy
    // goes (a talk with yourself); the second's with Fan is combined into it.
    expect(real[0].contentMoved.conversations).toEqual({ withEachOther: 1, combined: 0 });
    expect(real[1].contentMoved.conversations).toEqual({ withEachOther: 0, combined: 1 });
    expect(ctx.store.conversations).toEqual([expect.objectContaining({ _id: "conversations:a", participants: [TGT, FAN] })]);
    expect(ctx.store.messages.map((m: Row) => m._id)).toEqual(["messages:a", "messages:b"]);
    expect(real[1].contentMoved.droppedDuplicates).toEqual({ "favorites.targetId": 1 });
  });

  it("drops the other copy's password for the kept account's own address", async () => {
    const ctx = world({
      users: [{ _id: SRC, email: "victim@example.com" }, { _id: TGT, email: "Victim@example.com", emailVerificationTime: 1 }, { _id: FAN }, { _id: FAN2 }],
      authAccounts: [
        { _id: "authAccounts:planted", userId: SRC, provider: "password", providerAccountId: "victim@example.com" },
        { _id: "authAccounts:tgt-google", userId: TGT, provider: "google", providerAccountId: "g-victim" },
      ],
    });
    await merge(ctx);
    expect(ctx.store.authAccounts.map((a: Row) => a._id)).toEqual(["authAccounts:tgt-google"]);
  });

  it("reads each person's notices once per merge, however many conversations it tidies", async () => {
    const ctx = world({
      conversations: [
        { _id: "conversations:self", participants: [SRC, TGT], lastMessageAt: 1, createdAt: 1 },
        { _id: "conversations:fan-old", participants: [SRC, FAN], lastMessageAt: 2, createdAt: 1 },
        { _id: "conversations:fan", participants: [FAN, TGT], lastMessageAt: 3, createdAt: 2 },
        { _id: "conversations:fan2-old", participants: [SRC, FAN2], lastMessageAt: 2, createdAt: 1 },
        { _id: "conversations:fan2", participants: [FAN2, TGT], lastMessageAt: 3, createdAt: 2 },
      ],
      notifications: [
        { _id: "notifications:1", userId: FAN, type: "message", title: "", message: "", linkUrl: "/messages/conversations:fan-old", createdAt: 1 },
        { _id: "notifications:2", userId: TGT, type: "message", title: "", message: "", linkUrl: "/messages/conversations:self", createdAt: 1 },
      ],
    });
    // Every notices-by-person read, by whose.
    const asked: string[] = [];
    const query = ctx.db.query.bind(ctx.db);
    ctx.db.query = (table: string) => {
      const q = query(table);
      if (table !== "notifications") return q;
      const withIndex = q.withIndex.bind(q);
      q.withIndex = (name: string, build: (r: any) => any) => {
        if (name === "by_userId") build({ eq: (_f: string, v: string) => (asked.push(v), {}) });
        return withIndex(name, build);
      };
      return q;
    };
    await merge(ctx);
    expect(asked.sort()).toEqual([FAN, FAN2, SRC, TGT].sort());
    expect(ctx.store.notifications).toEqual([expect.objectContaining({ _id: "notifications:1", linkUrl: "/messages/conversations:fan" })]);
  });

  it("takes the other copy's phone number only when the kept account has none", async () => {
    const phone = (target: Record<string, unknown>) => {
      const ctx = world({
        users: [{ _id: SRC }, { _id: TGT, ...target }, { _id: FAN }, { _id: FAN2 }],
        authAccounts: [{ _id: "authAccounts:src-phone", userId: SRC, provider: "phone", providerAccountId: "+16195550199" }],
      });
      return merge(ctx).then(() => ctx.store.users.find((u: Row) => u._id === TGT));
    };
    expect(await phone({})).toMatchObject({ phone: "+16195550199", phoneVerificationTime: expect.any(Number) });
    expect(await phone({ phone: "+16195550100", phoneVerificationTime: 3 })).toMatchObject({
      phone: "+16195550100",
      phoneVerificationTime: 3,
    });
  });

  it("fills the profile even when the other copy has nothing else", async () => {
    const ctx = makeCtx(
      {
        users: [{ _id: SRC }, { _id: TGT }],
        profiles: [
          { _id: P_SRC, userId: SRC, name: "Rick Moy", bio: "Founder.", imageUrl: "https://x/face.jpg", interests: [], createdAt: 1, updatedAt: 1 },
          { _id: P_TGT, userId: TGT, name: "Rick Moy", interests: [], createdAt: 2, updatedAt: 2 },
        ],
      },
      null,
    );
    await merge(ctx);
    expect(ctx.store.profiles).toEqual([expect.objectContaining({ _id: P_TGT, bio: "Founder.", imageUrl: "https://x/face.jpg" })]);
  });
});

describe("profileFill / signInFate", () => {
  it("the target's own values win; empty ones are filled", () => {
    expect(profileFill({ name: "A", bio: "x", interests: ["Art"], location: "SD" }, { name: "B", bio: "", interests: [] })).toEqual({
      bio: "x",
      interests: ["Art"],
      location: "SD",
    });
  });
  it("fields that go together are filled together, and only into an empty group", () => {
    // The kept copy's pasted photo stays: the other's upload would show over it.
    expect(profileFill({ imageStorageId: "_storage:a" }, { imageUrl: "https://x/me.jpg" })).toEqual({});
    expect(profileFill({ imageStorageId: "_storage:a", imageUrl: "https://x/old.jpg" }, {})).toEqual({
      imageStorageId: "_storage:a",
      imageUrl: "https://x/old.jpg",
    });
    // A location's text and map data stay one place.
    expect(profileFill({ location: "SD", coordinates: { lat: 1, lng: 2 } }, { coordinates: { lat: 3, lng: 4 } })).toEqual({});
    // A payout account and its status come as one.
    expect(
      profileFill(
        { stripeConnectAccountId: "acct_old", stripeConnectPayoutsEnabled: true },
        { stripeConnectAccountId: "acct_new" },
      ),
    ).toEqual({});
  });
  it("a placeholder name never replaces a real one", () => {
    expect(profileFill({ name: "New User" }, { name: "" })).toEqual({});
    expect(profileFill({ name: "Rick Moy" }, { name: "new user" })).toEqual({ name: "Rick Moy" });
  });
  it("every sign-in moves, a second password included; a repeat is dropped", () => {
    const target = [
      { provider: "password", providerAccountId: "sarah@example.com" },
      { provider: "google", providerAccountId: "g-1" },
    ];
    const fate = (provider: string, providerAccountId: string) =>
      signInFate({ provider, providerAccountId }, target, "sarah@example.com");
    expect(fate("password", "sarah@old.example")).toBe("moved");
    expect(fate("google", "g-2")).toBe("moved");
    expect(fate("phone", "+16195550100")).toBe("moved");
    expect(fate("password", "sarah@example.com")).toBe("repeat");
  });
  it("a password for the kept account's own address is dropped: nobody proved it", () => {
    // Someone signed up with a password on the kept owner's address, which a
    // password sign-up never checks; kept, it would open the kept account.
    expect(signInFate({ provider: "password", providerAccountId: " Victim@Example.com" }, [], "victim@example.com")).toBe(
      "kept_address",
    );
    // An emailed code proves the address each time: it moves.
    expect(signInFate({ provider: "email-otp", providerAccountId: "victim@example.com" }, [], "victim@example.com")).toBe(
      "moved",
    );
    expect(signInFate({ provider: "password", providerAccountId: "other@example.com" }, [], null)).toBe("moved");
  });
  it("a password for an address the kept account signs in to by emailed code is dropped too", () => {
    // The kept account's email on file is another address (the last one it
    // used), but it still holds the emailed-code sign-in for this one.
    const target = [{ provider: "email-otp", providerAccountId: "victim@example.com" }];
    expect(signInFate({ provider: "password", providerAccountId: "Victim@example.com" }, target, "victim@work.example")).toBe(
      "kept_address",
    );
    expect(signInFate({ provider: "password", providerAccountId: "other@example.com" }, target, "victim@work.example")).toBe(
      "moved",
    );
  });
});
