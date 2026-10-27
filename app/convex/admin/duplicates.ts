// /admin/duplicates (routes/admin.duplicates.tsx): people and organizations
// that look like the same one entered twice (duplicateRules.ts), side by
// side with what each copy holds, and the merges that combine them. Every
// function here is for admins only (requireAdminCtx).
//
// People merge through mergeUsers (runMergeUsers) with moveContent: its dry
// run first, then the real merge, never a copy of its rules. Organizations
// merge through mergeOrganizations (runMergeOrganizations) the same way.
// Both answer in plain words, for the page to show as they are.

import { v } from "convex/values";
import { mutation, query, type MutationCtx, type QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { contactOf, displayNameOf, getProfileByUserId, isAdminProfile, requireAdminCtx } from "../helpers";
import { fail } from "../errors";
import { HANDLE_FORWARD_DAYS } from "../handleRules";
import { hasRealName } from "../names";
import { orgLogoUrl, profileImageUrl } from "../images";
import { isCurrent } from "../organizationRules";
import { positionsOfOrg } from "../organizations";
import { maskPhone } from "../phone";
import {
  countPhrase,
  groupEdges,
  listPhrase,
  orgEdges,
  pairKeysOf,
  personEdges,
  REASON_LABEL,
} from "../duplicateRules";
import { profileFill, runMergeUsers, signInFate } from "./mergeUsers";
import { runMergeOrganizations, type OrgMergeReport } from "./mergeOrganizations";

type Ctx = QueryCtx | MutationCtx;

const BIO_PREVIEW = 280;

/** A name as the page writes it: trimmed, one space between words. */
const tidyName = (name: string) => name.trim().replace(/\s+/g, " ");

/** How a sign-in reads on the page. */
const SIGN_IN_WORDS: Record<string, string> = {
  password: "Password",
  google: "Google",
  "email-otp": "Emailed code",
  phone: "Text-message code",
};

async function signInsOf(ctx: Ctx, userId: Id<"users">): Promise<Doc<"authAccounts">[]> {
  return await ctx.db
    .query("authAccounts")
    .withIndex("userIdAndProvider", (q) => q.eq("userId", userId))
    .collect();
}

// ——— What each copy holds ———

async function personCard(ctx: Ctx, userId: Id<"users">, viewerId: Id<"users">) {
  const [user, profile] = await Promise.all([ctx.db.get(userId), getProfileByUserId(ctx, userId)]);

  const [projects, tickets, rsvps, memberships, billing, coHosted, hosted, sent, following, sessions, accounts] =
    await Promise.all([
      ctx.db.query("projects").withIndex("by_userId", (q) => q.eq("userId", userId)).collect(),
      ctx.db.query("ticketPurchases").withIndex("by_userId", (q) => q.eq("userId", userId)).collect(),
      ctx.db.query("eventRsvps").withIndex("by_userId", (q) => q.eq("userId", userId)).collect(),
      ctx.db.query("memberships").withIndex("by_userId", (q) => q.eq("userId", userId)).collect(),
      ctx.db.query("billingCustomers").withIndex("by_userId", (q) => q.eq("userId", userId)).collect(),
      ctx.db.query("eventCoHosts").withIndex("by_userId", (q) => q.eq("userId", userId)).collect(),
      ctx.db.query("events").withIndex("by_organizerId", (q) => q.eq("organizerId", userId)).collect(),
      ctx.db.query("messages").withIndex("by_senderId", (q) => q.eq("senderId", userId)).collect(),
      ctx.db
        .query("favorites")
        .withIndex("by_userId_type", (q) => q.eq("userId", userId).eq("targetType", "profile"))
        .collect(),
      ctx.db.query("authSessions").withIndex("userId", (q) => q.eq("userId", userId)).collect(),
      signInsOf(ctx, userId),
    ]);
  const [pieces, followers, positions] = profile
    ? await Promise.all([
        ctx.db.query("artifacts").withIndex("by_profileId", (q) => q.eq("profileId", profile._id)).collect(),
        ctx.db
          .query("favorites")
          .withIndex("by_target", (q) => q.eq("targetType", "profile").eq("targetId", profile._id))
          .collect(),
        ctx.db.query("orgPositions").withIndex("by_profileId", (q) => q.eq("profileId", profile._id)).collect(),
      ])
    : [[], [], []];
  const organizations: string[] = [];
  for (const p of positions) {
    const org = await ctx.db.get(p.organizationId);
    if (org) organizations.push(isCurrent(p) ? org.name : `${org.name} (former)`);
  }

  const lastSignIn = Math.max(0, ...sessions.map((s) => s._creationTime));
  const lastMessage = Math.max(0, ...sent.map((m) => m.createdAt));
  const name = profile?.name ?? user?.name ?? "";
  return {
    userId,
    profileId: profile?._id ?? null,
    name: tidyName(name) || "(no name)",
    unfinished: !hasRealName(name),
    handle: profile?.handle ?? null,
    imageUrl: await profileImageUrl(ctx, profile),
    bio: profile?.bio ? profile.bio.slice(0, BIO_PREVIEW) : null,
    bioCut: (profile?.bio?.length ?? 0) > BIO_PREVIEW,
    interests: profile?.interests ?? [],
    location: profile?.location ?? null,
    ...contactOf(user),
    createdAt: profile?.createdAt ?? user?._creationTime ?? 0,
    lastActiveAt: Math.max(profile?.updatedAt ?? 0, lastSignIn, lastMessage) || null,
    isAdmin: isAdminProfile(profile),
    isYou: userId === viewerId,
    signIns: [...new Set(accounts.map((a) => SIGN_IN_WORDS[a.provider] ?? a.provider))],
    organizations,
    hasBilling: billing.length > 0,
    counts: {
      projects: projects.length,
      pieces: pieces.length,
      eventsHosted: hosted.length + coHosted.length,
      followers: followers.length,
      following: following.length,
      organizations: positions.length,
      messages: sent.length,
      tickets: tickets.length,
      rsvps: rsvps.length,
      memberships: memberships.length,
    },
  };
}

async function orgCard(ctx: Ctx, org: Doc<"organizations">, eventsShowing: number) {
  const members = [];
  for (const p of await positionsOfOrg(ctx, org._id)) {
    const profile = await ctx.db.get(p.profileId);
    members.push({
      name: profile && hasRealName(profile.name) ? tidyName(profile.name) : "Unfinished signup",
      isAdmin: p.isAdmin,
      current: isCurrent(p),
      title: p.title ?? null,
    });
  }
  const projects = await ctx.db
    .query("projects")
    .withIndex("by_organizationId", (q) => q.eq("organizationId", org._id))
    .collect();
  return {
    organizationId: org._id,
    name: org.name,
    slug: org.slug,
    category: org.category ?? null,
    tagline: org.tagline ?? null,
    about: org.mission ? org.mission.slice(0, BIO_PREVIEW) : null,
    location: org.location ?? null,
    websiteUrl: org.websiteUrl ?? null,
    logoUrl: await orgLogoUrl(ctx, org),
    createdAt: org.createdAt,
    createdByName: await displayNameOf(ctx, org.createdByUserId, "Someone no longer here"),
    members,
    counts: { projects: projects.length, events: eventsShowing },
  };
}

/** Every group of possible duplicates, people and organizations, with what
 * each copy holds. Pairs an admin dismissed are left out. */
export const findDuplicates = query({
  args: {},
  handler: async (ctx) => {
    const viewerId = await requireAdminCtx(ctx);
    const [profiles, users, orgs, dismissals] = await Promise.all([
      ctx.db.query("profiles").collect(),
      ctx.db.query("users").collect(),
      ctx.db.query("organizations").collect(),
      ctx.db.query("duplicateDismissals").collect(),
    ]);
    const dismissed = (kind: Doc<"duplicateDismissals">["kind"]) =>
      new Set(dismissals.filter((d) => d.kind === kind).map((d) => d.pairKey));
    const userById = new Map(users.map((u) => [String(u._id), u]));

    // Every account: by its profile's name, email and phone, and one with no
    // profile yet by its email and phone alone.
    const profiled = new Set(profiles.map((p) => String(p.userId)));
    const accounts = [
      ...profiles.map((p) => ({ id: String(p.userId), name: p.name, ...contactOf(userById.get(String(p.userId)) ?? null) })),
      ...users.filter((u) => !profiled.has(String(u._id))).map((u) => ({ id: String(u._id), name: "", ...contactOf(u) })),
    ];
    const personGroups = groupEdges(personEdges(accounts), dismissed("person"));
    const orgGroups = groupEdges(
      orgEdges(orgs.map((o) => ({ id: String(o._id), name: o.name }))),
      dismissed("organization"),
    );

    const people = [];
    for (const g of personGroups) {
      const members = [];
      for (const id of g.ids) members.push(await personCard(ctx, id as Id<"users">, viewerId));
      members.sort((a, b) => a.createdAt - b.createdAt);
      people.push({ key: g.ids.join("+"), reasons: g.reasons.map((r) => REASON_LABEL[r]), members });
    }

    // How many events show each organization as a host, read once.
    const eventsShowing = new Map<string, number>();
    if (orgGroups.length > 0) {
      for (const e of await ctx.db.query("events").collect()) {
        for (const h of e.displayHosts ?? []) {
          if (h.kind === "org") eventsShowing.set(String(h.organizationId), (eventsShowing.get(String(h.organizationId)) ?? 0) + 1);
        }
      }
    }
    const orgById = new Map(orgs.map((o) => [String(o._id), o]));
    const organizations = [];
    for (const g of orgGroups) {
      const members = [];
      for (const id of g.ids) members.push(await orgCard(ctx, orgById.get(id)!, eventsShowing.get(id) ?? 0));
      members.sort((a, b) => a.createdAt - b.createdAt);
      organizations.push({ key: g.ids.join("+"), reasons: g.reasons.map((r) => REASON_LABEL[r]), members });
    }

    return { people, organizations, checked: { people: accounts.length, organizations: orgs.length } };
  },
});

// ——— People: the plan in plain words ———

/** What moves, by what the page calls it, most telling first. Anything not
 * here is counted together as smaller records. */
const CONTENT_WORDS: [key: string, one: string, many: string][] = [
  ["projects.userId", "project", "projects"],
  ["artifacts.profileId", "piece of work", "pieces of work"],
  ["events.organizerId", "event they host", "events they host"],
  ["events.coHostIds", "event they co-host", "events they co-host"],
  ["events.displayHosts", "event that shows them as a host", "events that show them as a host"],
  ["favorites.targetId", "follower", "followers"],
  ["orgPositions.userId", "organization", "organizations"],
  ["conversations.participants", "conversation", "conversations"],
  ["messages.senderId", "message they sent", "messages they sent"],
  ["offerings.userId", "class", "classes"],
  ["gardenTables.hostUserId", "Table they host", "Tables they host"],
  ["ticketPurchases.userId", "ticket", "tickets"],
  ["eventRsvps.userId", "RSVP", "RSVPs"],
  ["memberships.userId", "membership", "memberships"],
  ["favorites.userId", "follow or save", "follows and saves"],
  ["links.profileId", "profile link", "profile links"],
  ["projectMembers.userId", "place on a project team", "places on project teams"],
];

/** Not counted: the same rows as a key above from their profile side, and
 * bookkeeping nobody would call theirs (who added an organization's page,
 * who uploaded a file). */
const NOT_COUNTED = new Set([
  "orgPositions.profileId",
  "jobs.profileId",
  "jobInterests.profileId",
  "gigResponses.profileId",
  "organizations.createdByUserId",
  "uploadClaims.userId",
]);

function movesLine(counts: Record<string, number>, keepLabel: string, done: boolean): string {
  const phrases: string[] = [];
  const named = new Set<string>();
  for (const [key, one, many] of CONTENT_WORDS) {
    named.add(key);
    if (counts[key]) phrases.push(countPhrase(counts[key], one, many));
  }
  let other = 0;
  for (const [key, n] of Object.entries(counts)) if (!named.has(key) && !NOT_COUNTED.has(key)) other += n;
  if (other > 0) {
    phrases.push(
      countPhrase(other, "smaller record (a like, a view, a notice)", "smaller records (likes, views, notices and the like)"),
    );
  }
  if (phrases.length === 0) return done ? "The other copy had nothing to move." : "The other copy has nothing to move.";
  return `${done ? "Moved" : "Moves"} ${listPhrase(phrases)} to ${keepLabel}.`;
}

/** Profile fields by what the page calls them; bookkeeping says nothing. */
const PROFILE_FIELD_WORDS: Record<string, string> = {
  name: "name",
  bio: "bio",
  imageUrl: "photo",
  imageStorageId: "photo",
  interests: "interests",
  location: "location",
  locationType: "location",
  address: "location",
  coordinates: "location",
  placeId: "location",
  handle: "@address",
  inviteSlug: "invite link",
  isAdmin: "admin access",
  orgName: "organization",
  orgUrl: "organization",
  primaryRole: "role",
  patronRole: "patron role",
  partnerRole: "partner role",
  supportInterests: "giving interests",
  partnerOfferings: "partner offerings",
  payoutHandles: "payment handles (Venmo and the like)",
  stripeConnectAccountId: "Stripe payout account",
  plan: "plan",
  hideFromSearch: "search-engine setting",
  adminCode: "admin approval code",
  unlimitedInvites: "unlimited invites",
};
const QUIET_FIELDS = new Set([
  "inviteUsageCount",
  "lastLikeNotifiedAt",
  "stripeConnectPayoutsEnabled",
  "stripeConnectDetailsSubmitted",
  "stripeConnectUpdatedAt",
]);

/** The fields' words, once each, in PROFILE_FIELD_WORDS' order. */
function fieldWords(keys: readonly string[]): string[] {
  const order = Object.keys(PROFILE_FIELD_WORDS);
  const rank = (key: string) => (order.includes(key) ? order.indexOf(key) : order.length);
  const words: string[] = [];
  for (const key of [...keys].sort((a, b) => rank(a) - rank(b))) {
    if (QUIET_FIELDS.has(key)) continue;
    const word = PROFILE_FIELD_WORDS[key] ?? key;
    if (!words.includes(word)) words.push(word);
  }
  return words;
}

function fillsLine(keys: readonly string[], keepName: string, wholeProfile: boolean, done: boolean): string {
  if (wholeProfile) {
    return `${keepName}'s account had no profile, so it ${done ? "took" : "takes"} the other copy's whole profile.`;
  }
  const words = fieldWords(keys);
  if (words.length === 0) {
    return `Nothing to fill in: ${keepName}'s copy already has everything the other one has. Its own bio, photo and the rest stay as they are.`;
  }
  return `${done ? "Filled" : "Fills"} ${keepName}'s empty ${listPhrase(words)} from the other copy. Everything ${keepName}'s copy already had stays as it is.`;
}

function describeSignIn(account: Doc<"authAccounts">, user: Doc<"users"> | null): string {
  const id = account.providerAccountId;
  if (account.provider === "google") return user?.email ? `Google (${user.email})` : "Google";
  if (account.provider === "phone") return `text-message code (${maskPhone(id)})`;
  if (account.provider === "email-otp") return `emailed code (${id})`;
  if (account.provider === "password") return `password (${id})`;
  return account.provider;
}

/** A refusal from mergeUsers, as a reason a person can act on. */
function blockedReason(blockers: Record<string, number>): string {
  if (Object.keys(blockers).some((k) => k.startsWith("billingCustomers"))) {
    return "Both copies have their own billing account with Stripe, so they can't be combined here. One of the two has to be closed in Stripe first; ask for help with that.";
  }
  return `These copies can't be combined here (${Object.keys(blockers).join(", ")}). Ask for help.`;
}

export type MergePlan = {
  keep: { name: string; contact: string | null };
  /** What moves, what gets filled, what's deleted. */
  lines: string[];
  /** What happens to each copy's sign-in. */
  signIn: string[];
  /** Things to know before confirming. */
  warnings: string[];
};

async function planPeopleMerge(
  ctx: MutationCtx,
  viewerId: Id<"users">,
  keepUserId: Id<"users">,
  mergeUserIds: Id<"users">[],
  dryRun: boolean,
): Promise<MergePlan> {
  const others = [...new Set(mergeUserIds)].filter((id) => id !== keepUserId);
  if (others.length === 0) fail("same_account", "Pick a different copy to merge in.");
  const keepUser = await ctx.db.get(keepUserId);
  if (!keepUser) fail("not_found", "The copy you picked to keep is gone already. Reload the page.");
  const otherUsers = await Promise.all(others.map((id) => ctx.db.get(id)));
  if (otherUsers.some((u) => !u)) fail("not_found", "The other copy is gone already. Reload the page.");

  // The profile as it will be: mergeUsers fills it from each copy in turn.
  const keepProfile = await getProfileByUserId(ctx, keepUserId);
  const otherProfiles = await Promise.all(others.map((id) => getProfileByUserId(ctx, id)));
  let after: Record<string, unknown> | null = keepProfile ? { ...keepProfile } : null;
  let wholeProfile = false;
  const filled: string[] = [];
  // The other copies' @addresses that forward to the kept one (mergeUsers
  // mergeProfiles): each one the kept profile doesn't take as its own.
  const forwarded: string[] = [];
  for (const p of otherProfiles) {
    if (!p) continue;
    if (!after) {
      after = { ...p };
      wholeProfile = true;
      continue;
    }
    if (p.handle && after.handle && p.handle !== after.handle) forwarded.push(p.handle);
    const patch = profileFill(p, after);
    filled.push(...Object.keys(patch));
    Object.assign(after, patch);
  }
  const afterName = typeof after?.name === "string" ? after.name : "";
  const keepName = hasRealName(afterName) ? tidyName(afterName) : "The kept copy";
  const contact = keepUser.email || (keepUser.phone ? maskPhone(keepUser.phone) : null);
  const keepLabel = contact ? `${keepName} (${contact})` : keepName;

  if (others.includes(viewerId) && !isAdminProfile(after as Doc<"profiles"> | null)) {
    fail(
      "would_lose_admin",
      "That would take away your admin access: the copy you'd keep isn't an admin. Keep your own copy instead, or make the other one an admin first.",
    );
  }

  // Sign-ins, read before the merge moves them (mergeUsers signInFate).
  const keepSignIns = await signInsOf(ctx, keepUserId);
  const held = [...keepSignIns];
  const moving: string[] = [];
  const dropping: string[] = [];
  // Convex Auth writes a sign-in's email or phone onto the account each time
  // it's used (auth.ts), so a moved one with another address changes what's
  // on file.
  const onFile: string[] = [];
  for (let i = 0; i < others.length; i++) {
    for (const a of await signInsOf(ctx, others[i])) {
      const label = describeSignIn(a, otherUsers[i]);
      if (signInFate(a, held) === "dropped") {
        dropping.push(label);
        continue;
      }
      moving.push(label);
      held.push(a);
      const email = a.provider === "google" ? otherUsers[i]?.email : a.provider === "email-otp" ? a.providerAccountId : null;
      if (email && email.toLowerCase() !== keepUser.email?.toLowerCase()) {
        onFile.push(`If they sign in with ${label}, the email on file for ${keepName} changes to ${email}.`);
      }
      if (a.provider === "phone" && keepUser.phone && a.providerAccountId !== keepUser.phone) {
        onFile.push(`If they sign in with ${label}, the phone number on file for ${keepName} changes to that one.`);
      }
    }
  }

  const report = await runMergeUsers(ctx, { targetUserId: keepUserId, sourceUserIds: others, dryRun, moveContent: true });
  const counts: Record<string, number> = {};
  const add = (from: Record<string, number> | undefined) => {
    for (const [k, n] of Object.entries(from ?? {})) counts[k] = (counts[k] ?? 0) + n;
  };
  let filledNow: string[] | null = null;
  const talks = { withEachOther: 0, combined: 0 };
  for (const r of report.results) {
    if ("blocked" in r) fail("cannot_merge", blockedReason(r.blockers));
    if ("dryRun" in r) {
      add(r.blockers);
      // The dry run counts every conversation; the ones that go or are
      // combined don't move as their own.
      const c = r.conversations ?? { withEachOther: 0, combined: 0 };
      counts["conversations.participants"] = (counts["conversations.participants"] ?? 0) - c.withEachOther - c.combined;
    }
    if ("merged" in r) {
      add(r.contentMoved?.moved);
      filledNow = [...(filledNow ?? []), ...(r.contentMoved?.profileFieldsFilled ?? [])];
    }
    const c = "dryRun" in r ? r.conversations : "merged" in r ? r.contentMoved?.conversations : undefined;
    talks.withEachOther += c?.withEachOther ?? 0;
    talks.combined += c?.combined ?? 0;
  }

  const done = !dryRun;
  const n = others.length;
  const lines = [
    movesLine(counts, keepLabel, done),
    fillsLine(filledNow?.filter((k) => !k.startsWith("(")) ?? filled, keepName, wholeProfile, done),
  ];
  if (talks.combined > 0) {
    lines.push(
      `${done ? "Combined" : "Combines"} ${countPhrase(talks.combined, "conversation", "conversations")} the other copy had with people ${keepName} also talks to: each person ends up with one conversation with ${keepName}, all messages kept.`,
    );
  }
  if (talks.withEachOther > 0) {
    lines.push(
      `${done ? "Deleted" : "Deletes"} the ${talks.withEachOther === 1 ? "conversation" : "conversations"} between the two copies, with ${talks.withEachOther === 1 ? "its" : "their"} messages: it would be ${keepName} talking to ${keepName}.`,
    );
  }
  if (forwarded.length > 0) {
    const addresses = listPhrase(forwarded.map((h) => `@${h}`));
    lines.push(
      forwarded.length === 1
        ? `The other copy's address, ${addresses}, opens ${keepName}'s profile for the next ${HANDLE_FORWARD_DAYS} days; after that anyone can take it.`
        : `The other copies' addresses, ${addresses}, open ${keepName}'s profile for the next ${HANDLE_FORWARD_DAYS} days; after that anyone can take them.`,
    );
  }
  lines.push(
    n === 1
      ? `${done ? "Deleted" : "Deletes"} the other account.`
      : `${done ? "Deleted" : "Deletes"} the other ${n} accounts.`,
  );

  const signIn: string[] = [];
  signIn.push(
    keepSignIns.length > 0
      ? `${keepName}'s own sign-in stays as it is: ${listPhrase(keepSignIns.map((a) => describeSignIn(a, keepUser)))}.`
      : `${keepName}'s account has no way to sign in of its own.`,
  );
  if (moving.length === 1) {
    signIn.push(`The other copy's sign-in, ${moving[0]}, moves over: it keeps working, and opens ${keepName}'s account from now on.`);
  } else if (moving.length > 1) {
    signIn.push(`The other copy's sign-ins, ${listPhrase(moving)}, move over: they keep working, and open ${keepName}'s account from now on.`);
  }
  for (const d of dropping) {
    signIn.push(`The other copy's ${d} is one ${keepName}'s account already has, so it isn't added twice.`);
  }
  signIn.push(...onFile);
  if (moving.length === 0 && dropping.length === 0) signIn.push("The other copy had no way to sign in.");
  signIn.push("Anyone signed in as the other copy right now is signed out.");

  const warnings: string[] = [];
  if (others.includes(viewerId)) {
    warnings.push(
      `You're signed in as the copy that goes away. You'll be signed out; sign in again the same way and you'll be in ${keepName}'s account.`,
    );
  }
  if (keepProfile?.stripeConnectAccountId && otherProfiles.some((p) => p?.stripeConnectAccountId)) {
    warnings.push(`Both copies set up getting paid through Stripe. ${keepName}'s payout account stays; the other copy's isn't used any more.`);
  }
  warnings.push("This can't be undone.");

  return { keep: { name: keepName, contact }, lines, signIn, warnings };
}

const peopleArgs = { keepUserId: v.id("users"), mergeUserIds: v.array(v.id("users")) };

/** What merging these copies into `keepUserId` would do, in plain words.
 * mergeUsers' dry run: nothing changes. */
export const previewPeopleMerge = mutation({
  args: peopleArgs,
  handler: async (ctx, { keepUserId, mergeUserIds }): Promise<MergePlan> => {
    const viewerId = await requireAdminCtx(ctx);
    return await planPeopleMerge(ctx, viewerId, keepUserId, mergeUserIds, true);
  },
});

/** Merges the copies into `keepUserId` (mergeUsers with moveContent) and
 * says what it did. All or nothing: a refusal for any copy undoes it all. */
export const mergePeople = mutation({
  args: peopleArgs,
  handler: async (ctx, { keepUserId, mergeUserIds }): Promise<MergePlan> => {
    const viewerId = await requireAdminCtx(ctx);
    return await planPeopleMerge(ctx, viewerId, keepUserId, mergeUserIds, false);
  },
});

// ——— Organizations ———

function orgPlan(r: OrgMergeReport): MergePlan {
  const done = !r.dryRun;
  const keep = `${r.target.name} (/orgs/${r.target.slug})`;
  const moves: string[] = [];
  if (r.peopleMoved.length) {
    const people = countPhrase(r.peopleMoved.length, "person", "people");
    moves.push(r.peopleMoved.length <= 6 ? `${people} (${listPhrase(r.peopleMoved)})` : people);
  }
  if (r.projectsMoved) moves.push(countPhrase(r.projectsMoved, "project", "projects"));
  if (r.eventsMoved) {
    moves.push(countPhrase(r.eventsMoved, "event that shows it as a host", "events that show it as a host"));
  }
  const lines = [
    moves.length
      ? `${done ? "Moved" : "Moves"} ${listPhrase(moves)} to ${keep}.`
      : `The other copy has no people, projects or events to move.`,
  ];
  if (r.peopleCombined.length) {
    const both = r.peopleCombined.length === 1;
    lines.push(
      `${listPhrase(r.peopleCombined)} ${both ? "is" : "are"} listed at both: ${both ? "they keep" : "each keeps"} one place, with the fuller title and years, and an admin at either stays an admin.`,
    );
  }
  lines.push(
    r.filled.length
      ? `${done ? "Filled" : "Fills"} ${r.target.name}'s empty ${listPhrase(r.filled)} from the other copy. What it already has stays.`
      : `Nothing to fill in: ${r.target.name} already has everything the other copy has.`,
  );
  lines.push(
    `${done ? "Deleted" : "Deletes"} the other copy, ${r.source.name}. Its old address, /orgs/${r.slugForwarded}, keeps working and opens ${r.target.name}, and anyone who adds “${r.source.name}” by name gets ${r.target.name}.`,
  );
  const warnings: string[] = [];
  if (r.sourceLogoUnused) warnings.push(`Both have a logo. ${r.target.name}'s stays; the other copy's isn't used.`);
  if (r.hostOrgConflict) warnings.push(`Both are linked to a community here. ${r.target.name}'s link stays.`);
  warnings.push("This can't be undone.");
  return { keep: { name: r.target.name, contact: `/orgs/${r.target.slug}` }, lines, signIn: [], warnings };
}

const orgArgs = { keepId: v.id("organizations"), mergeIds: v.array(v.id("organizations")) };

async function planOrgMerge(
  ctx: MutationCtx,
  keepId: Id<"organizations">,
  mergeIds: Id<"organizations">[],
  dryRun: boolean,
): Promise<MergePlan> {
  const others = [...new Set(mergeIds)].filter((id) => id !== keepId);
  if (others.length === 0) fail("same_organization", "Pick a different organization to merge in.");
  const plans: MergePlan[] = [];
  for (const sourceId of others) {
    plans.push(orgPlan(await runMergeOrganizations(ctx, { targetId: keepId, sourceId, dryRun })));
  }
  if (plans.length === 1) return plans[0];
  // Several copies: each one's lines in turn, the warnings once.
  return {
    keep: plans[0].keep,
    lines: plans.flatMap((p) => p.lines),
    signIn: [],
    warnings: [...new Set(plans.flatMap((p) => p.warnings))],
  };
}

/** What merging these organizations into `keepId` would do, in plain
 * words. A dry run: nothing changes. With several to merge in, each is
 * planned against the kept one as it is now. */
export const previewOrgMerge = mutation({
  args: orgArgs,
  handler: async (ctx, { keepId, mergeIds }): Promise<MergePlan> => {
    await requireAdminCtx(ctx);
    return await planOrgMerge(ctx, keepId, mergeIds, true);
  },
});

/** Merges the organizations into `keepId` and says what it did. */
export const mergeOrgs = mutation({
  args: orgArgs,
  handler: async (ctx, { keepId, mergeIds }): Promise<MergePlan> => {
    await requireAdminCtx(ctx);
    return await planOrgMerge(ctx, keepId, mergeIds, false);
  },
});

// ——— Not duplicates ———

/** "Not duplicates": every pair in the group is remembered, so the group
 * isn't suggested again (a new look-alike joining it still is). */
export const dismissDuplicates = mutation({
  args: { kind: v.union(v.literal("person"), v.literal("organization")), ids: v.array(v.string()) },
  handler: async (ctx, { kind, ids }) => {
    const adminId = await requireAdminCtx(ctx);
    const table = kind === "person" ? "users" : "organizations";
    const unique = [...new Set(ids)];
    if (unique.length < 2) fail("invalid_input", "There's nothing to dismiss: pick a group of two or more.");
    if (unique.some((id) => !ctx.db.normalizeId(table, id))) {
      fail("not_found", "One of these is gone already. Reload the page.");
    }
    let added = 0;
    for (const pairKey of pairKeysOf(unique)) {
      const existing = await ctx.db
        .query("duplicateDismissals")
        .withIndex("by_kind_pairKey", (q) => q.eq("kind", kind).eq("pairKey", pairKey))
        .first();
      if (existing) continue;
      await ctx.db.insert("duplicateDismissals", { kind, pairKey, dismissedByUserId: adminId, dismissedAt: Date.now() });
      added++;
    }
    return { dismissed: added };
  },
});
