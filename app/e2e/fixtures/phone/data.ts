// Sample answers for the phone preview, by Convex function name. Pictures
// are the campaign photographs in public/campaign. Nothing here is a real
// person or project.

import { sampleShortlist } from "../../../app/lib/shortlist/fixtures";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const now = Date.now();

const me = {
  _id: "me",
  userId: "u-me",
  name: "Rick Moy",
  handle: "rick",
  primaryRole: "maker",
  bio: "Making things in San Diego.",
  interests: ["Film", "Music"],
  imageUrl: "/campaign/shua.jpg",
  isAdmin: false,
  plan: "free",
  attributes: { email: "preview@example.com" },
  location: "San Diego, CA",
};

function person(name: string, image: string, interests: string[], orgName?: string, isLeader = false) {
  return { _id: name.toLowerCase().replace(/\s+/g, "-"), name, imageUrl: image, interests, orgName, location: "San Diego, CA", wondering: null, isLeader };
}

/** The sample Shortlist, with what a few of the people followed last posted:
 *  a still, a reel, a recording with no picture, an event, and nothing. */
function shortlistWithPosts() {
  const data = sampleShortlist();
  const posts: Record<string, { type: "project" | "event"; title: string; ago: number; thumbUrl: string | null; media: "image" | "video" | "audio" | null }> = {
    "Ana Reyes": { type: "project", title: "Harbor Light, a photo series", ago: 2 * HOUR, thumbUrl: "/campaign/gallery.jpg", media: "image" },
    "Theo Okafor": { type: "project", title: "Night Shift (short film)", ago: 3 * DAY, thumbUrl: "/campaign/night.jpg", media: "video" },
    "Kofi Mensah": { type: "project", title: "Field recordings, Vol. 2", ago: 9 * DAY, thumbUrl: null, media: "audio" },
    "Dana Wells": { type: "event", title: "Open studio night", ago: 40 * DAY, thumbUrl: "/campaign/opening.jpg", media: "image" },
    "Sam Ito": { type: "project", title: "Teaching notes", ago: 120 * DAY, thumbUrl: null, media: null },
  };
  data.people = data.people.map((p) => {
    const post = posts[p.name];
    return post
      ? {
          ...p,
          latest: {
            type: post.type,
            id: `${post.type}s:${p.profileId}`,
            title: post.title,
            at: now - post.ago,
            thumbUrl: post.thumbUrl,
            media: post.media,
            share: false,
            when: post.type === "event" ? { datetime: now + 12 * DAY, endTime: null } : null,
          },
        }
      : p;
  });
  return data;
}

const people = [
  // Dee, June and Alexandra lead a community (the sprout badge); Alexandra's
  // long name is there to see it give way to the badge.
  person("Dee Alvarez", "/campaign/dee.jpg", ["Photography", "Film"], "Abiding Practice", true),
  person("Marta Reyes", "/campaign/marta.jpg", ["Painting", "Murals"]),
  person("June Park", "/campaign/june.jpg", ["Music", "Songwriting"], "The Grove", true),
  person("Ade Okafor", "/campaign/ade.jpg", ["Design", "Illustration"]),
  person("Alexandra Montgomery-Villanueva", "/campaign/shua.jpg", ["Film", "Editing"], "Harbor Light Collective of San Diego", true),
  person("Shua Lim", "/campaign/shua.jpg", ["Film", "Editing"]),
];

const community = { _id: "c-garden", name: "The Garden", slug: "the-garden" };

function project(p: Record<string, unknown>) {
  return {
    status: "active",
    kind: "passion",
    media: [],
    interests: [],
    openRoles: [],
    supportCount: 0,
    organization: null,
    community,
    createdAt: now - 3 * DAY,
    creator: { _id: "u-dee", name: "Dee Alvarez", imageUrl: "/campaign/dee.jpg", interests: ["Photography"], location: "San Diego" },
    ...p,
  };
}

const projects = [
  project({
    _id: "p-bloom",
    title: "Bloom.",
    blurb: "A short film about a florist who stops selling and starts giving flowers away. Shooting over three weekends in North Park.",
    resolvedPhotoUrl: "/campaign/opening.jpg",
    goal: 1500,
    raisedCents: 42000,
    raiseByDate: now + 12 * DAY,
    supportCount: 4,
    interests: ["Film"],
    stage: "forming",
    openRoles: [
      { roleId: "r1", title: "Sound mixer", budgetType: "amount", budget: 300, budgetMax: null, status: "open" },
      { roleId: "r2", title: "Gaffer", budgetType: "volunteer", budget: null, budgetMax: null, status: "open" },
    ],
  }),
  project({
    _id: "p-mural",
    title: "Small Acts: Neighbors",
    blurb: "A mural on the side of the laundromat on 30th, painted with whoever shows up on Saturdays.",
    resolvedPhotoUrl: "/campaign/pair.jpg",
    goal: 800,
    raisedCents: 12000,
    raiseByDate: now + 9 * DAY,
    supportCount: 7,
    interests: ["Murals"],
    creator: { _id: "u-marta", name: "Marta Reyes", imageUrl: "/campaign/marta.jpg", interests: ["Murals"], location: "San Diego" },
  }),
  project({
    _id: "p-hymns",
    title: "Hymns for the Commons",
    blurb: "Twelve new hymns, recorded live with a room full of neighbors singing along.",
    resolvedPhotoUrl: "/campaign/church.jpg",
    interests: ["Music"],
    stage: "working",
    creator: { _id: "u-june", name: "June Park", imageUrl: "/campaign/june.jpg", interests: ["Music"], location: "San Diego" },
  }),
  // No picture, and posted as an organization: Today's post sets the title on
  // the abstract cover, and the maker's square is the logo's initial.
  project({
    _id: "p-gardenwalk",
    title: "Saturday Garden Walk: a neighborhood listening tour",
    blurb: "Four stops, one hour each, with a field recorder and whoever wants to come along.",
    goal: 1200,
    raisedCents: 0,
    supportCount: 2,
    interests: ["Music"],
    stage: "planning",
    organization: { name: "Abiding Practice", slug: "abiding-practice" },
  }),
  project({
    _id: "p-jazz",
    kind: "paid",
    title: "Friday jazz at The Grove",
    blurb: "A trio for the patio, every Friday through December.",
    resolvedPhotoUrl: "/campaign/band.jpg",
    budgetType: "amount",
    budget: 300,
    interests: ["Music"],
    remote: false,
    location: "The Grove, San Diego",
    gig: { status: "open", venueName: "The Grove", cadence: "Every Friday", timeRange: "8–10pm", schedule: "Every Friday · 8–10pm", nextDateLabel: "Fri, Oct 16", openCount: 3 },
    organization: { name: "The Grove", slug: "the-grove" },
  }),
  project({
    _id: "p-logo",
    kind: "paid",
    title: "Logo for a bakery",
    blurb: "A wordmark and a sign for a new bakery on Adams Avenue.",
    budgetType: "range",
    budget: 400,
    budgetMax: 800,
    interests: ["Design"],
    remote: true,
    creator: { _id: "u-ade", name: "Ade Okafor", imageUrl: "/campaign/ade.jpg", interests: ["Design"], location: "San Diego" },
  }),
];

function event(e: Record<string, unknown>) {
  return {
    status: "published",
    tags: [],
    requiresApproval: false,
    accessType: "free",
    attendeeCount: 0,
    hosts: [{ name: "Dee Alvarez", profileId: "dee-alvarez" }],
    community,
    hasVideo: false,
    ticketTiers: null,
    externalTicketPriceCents: null,
    ...e,
  };
}

const upcoming = [
  event({
    _id: "e-openmic",
    title: "Open Mic Night",
    datetime: now + 8 * DAY,
    endTime: now + 8 * DAY + 3 * HOUR,
    location: "The Grove, North Park",
    coverImageUrl: "/campaign/night.jpg",
    description: "Five minutes each. Sign up at the door, or bring something you've never played out.",
    tags: ["Music", "Open mic"],
    attendeeCount: 12,
  }),
  event({
    _id: "e-crit",
    title: "Portfolio crit: photographers",
    datetime: now + 11 * DAY,
    location: "Abiding Practice, Hillcrest",
    coverImageUrl: "/campaign/gallery.jpg",
    description: "Bring ten prints. Two hours of honest looking.",
    tags: ["Photography"],
    requiresApproval: true,
    attendeeCount: 6,
    hosts: [{ name: "Abiding Practice", orgName: "Abiding Practice", orgSlug: "abiding-practice" }],
  }),
  event({
    _id: "e-screening",
    title: "Bloom. first cut screening",
    datetime: now + 20 * DAY,
    location: "Digital Gym Cinema",
    coverImageUrl: "/campaign/viewing.jpg",
    description: "The first cut, then notes over coffee next door.",
    tags: ["Film"],
    accessType: "paid",
    priceCents: 1500,
    attendeeCount: 31,
  }),
  event({
    _id: "e-busk",
    title: "Busking walk",
    datetime: now + 27 * DAY,
    location: "Balboa Park",
    coverImageUrl: "/campaign/busker.jpg",
    description: "Four spots, an hour each, then lunch.",
    tags: ["Music"],
  }),
];

const past = [
  event({
    _id: "e-cafe",
    title: "Songwriters' circle",
    datetime: now - 9 * DAY,
    location: "Lestat's, Normal Heights",
    coverImageUrl: "/campaign/cafe.jpg",
    tags: ["Music"],
    attendeeCount: 9,
    hasVideo: true,
  }),
  event({
    _id: "e-opening",
    title: "Opening: Small Acts",
    datetime: now - 30 * DAY,
    location: "The Grove",
    coverImageUrl: "/campaign/opening.jpg",
    tags: ["Murals"],
    attendeeCount: 40,
  }),
];

const conversations = [
  { _id: "cv-1", participant: { name: "Marta Reyes", imageUrl: "/campaign/marta.jpg" }, lastMessageAt: now - 2 * HOUR, lastMessagePreview: "Saturday works. I'll bring the rollers.", unreadCount: 1 },
  { _id: "cv-2", participant: { name: "June Park", imageUrl: "/campaign/june.jpg" }, lastMessageAt: now - 2 * DAY, lastMessagePreview: "Sent you the rough mix.", unreadCount: 0 },
];

const notifications = [
  { _id: "n-1", type: "project_cheer", title: "Ade cheered you on", message: "Bloom. · \"Can't wait to see this.\"", linkUrl: "/projects/p-bloom", createdAt: now - 5 * HOUR, relatedUserProfile: { name: "Ade Okafor", imageUrl: "/campaign/ade.jpg" } },
  { _id: "n-2", type: "event_application", title: "Dee wants to come to Portfolio crit", message: "Approve or decline on the event.", linkUrl: "/events/e-crit", createdAt: now - DAY, readAt: now - HOUR, relatedUserProfile: { name: "Dee Alvarez", imageUrl: "/campaign/dee.jpg" } },
  { _id: "n-3", type: "reminder", title: "Open Mic Night is in 8 days", message: "The Grove, North Park", linkUrl: "/events/e-openmic", createdAt: now - 3 * DAY, readAt: now - 2 * DAY },
];

const updates = [
  {
    _id: "up-1",
    title: "Nov 6 showcase: apply by Oct 20",
    body: "Ten creatives, one night at The Grove. Bring something you made this year.",
    imageUrl: null,
    actionLabel: "Apply",
    actionUrl: "/showcase",
  },
];

/** A second of quiet as a WAV, so a voice note's player has something to
 *  load without a file in public/. */
function quietWav(): string {
  const rate = 8000;
  const bytes = new Uint8Array(44 + rate).fill(128);
  const view = new DataView(bytes.buffer);
  const text = (at: number, word: string) => [...word].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)));
  text(0, "RIFF");
  view.setUint32(4, 36 + rate, true);
  text(8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, rate, true);
  view.setUint32(28, rate, true);
  view.setUint16(32, 1, true);
  view.setUint16(34, 8, true);
  text(36, "data");
  view.setUint32(40, rate, true);
  return `data:audio/wav;base64,${btoa(String.fromCharCode(...bytes))}`;
}

/** Two shared pieces as their project pages show them (/projects/p-cafe is
 *  yours, to see the editing; /projects/p-harbor is Dee's, with a
 *  description, a voice note and twelve updates, to see "Show more"). */
const pieceProjects = [
  project({
    _id: "p-cafe",
    userId: "u-me",
    origin: "portfolio",
    title: "Cafe opening",
    resolvedPhotoUrl: "/campaign/cafe.jpg",
    stage: "completed",
    creator: { _id: "me", name: me.name, imageUrl: me.imageUrl, interests: me.interests, location: me.location },
    media: [{ _id: "a-cafe", profileId: "me", type: "image", resolvedMediaUrl: "/campaign/cafe.jpg", mediaStorageId: "s-cafe", order: 0, createdAt: now - 40 * DAY }],
  }),
  project({
    _id: "p-harbor",
    userId: "u-dee",
    origin: "portfolio",
    title: "Harbor Light, a photo series",
    resolvedPhotoUrl: "/campaign/gallery.jpg",
    stage: "completed",
    media: [
      {
        _id: "a-harbor",
        profileId: "dee-alvarez",
        type: "image",
        resolvedMediaUrl: "/campaign/gallery.jpg",
        mediaStorageId: "s-harbor",
        description: "Shot over six mornings on the Shelter Island pier, before the boats went out.",
        audioNoteUrl: quietWav(),
        order: 0,
        createdAt: now - 10 * DAY,
      },
    ],
  }),
];

const harborUpdates = Array.from({ length: 12 }, (_, i) => ({
  _id: `su-${i + 1}`,
  body: i === 0 ? "Prints are back from the lab. Hanging them Saturday." : `Morning ${12 - i} on the pier.`,
  createdAt: now - i * DAY - HOUR,
  authorUserId: "u-dee",
  author: { name: "Dee Alvarez", imageUrl: "/campaign/dee.jpg", profileId: "dee-alvarez" },
}));

/** The shared piece a project page asks about, or undefined. */
const pieceProject = (args: unknown) =>
  pieceProjects.find((p) => (p as { _id?: string })._id === (args as { projectId?: string } | undefined)?.projectId) as
    | (Record<string, unknown> & { userId: string; creator: { _id: string; name: string; imageUrl: string } })
    | undefined;

const updatesFor = (args: unknown) =>
  (args as { projectId?: string } | undefined)?.projectId === "p-harbor" ? harborUpdates : [];

/** Your own page, with an address, at /profile/me: what the share kit
 *  (components/ProfileShareKit.tsx) opens from. */
export const myPage = {
  ...me,
  handle: "rick",
  hideFromSearch: false,
  attributes: {},
  links: [],
  artifacts: [{ _id: "a-cafe", type: "image", mediaUrl: "/campaign/cafe.jpg", order: 0, createdAt: now - 40 * DAY }],
  organizations: [],
  wondering: null,
};

/** Someone else's page, at /profile/dee: what a scan of Dee's code opens
 *  (/profile/dee?ref=f2f, components/ScanCard.tsx). */
export const theirPage = {
  ...people[0],
  _id: "dee",
  userId: "u-dee",
  handle: "dee",
  bio: "Photographs of people at work.",
  hideFromSearch: false,
  attributes: {},
  links: [],
  artifacts: [],
  organizations: [],
};

/** Finished projects on your page (garden/projectTeam:listAffiliations). */
const myProjects = [
  ["p-bloom", "Bloom.", "/campaign/opening.jpg"],
  ["p-mural", "Small Acts: Neighbors", "/campaign/pair.jpg"],
  ["p-hymns", "Hymns for the Commons", "/campaign/church.jpg"],
].map(([projectId, title, imageUrl]) => ({
  projectId,
  title,
  imageUrl,
  blurb: null,
  role: "Lead",
  stage: "completed",
  kind: "passion",
  completed: true,
  openRoles: [],
  gig: null,
  raising: false,
}));

/** A brand-new account, as Google hands it over: a name and nothing else.
 *  `?fresh` in the address (/onboarding?fresh) is this person, so the
 *  onboarding screens can be walked as a new member sees them. */
const fresh = { _id: "me", userId: "u-me", name: "Rick Moy", interests: [], isAdmin: false, plan: "free", attributes: {} };
const isFresh = () => new URLSearchParams(window.location.search).has("fresh");

export const answers: Record<string, unknown | ((args: unknown) => unknown)> = {
  "garden/projectTeam:listAffiliations": myProjects,
  "invites:getInviteStats": null,
  "profiles:getMyProfile": () => (isFresh() ? fresh : me),
  // Onboarding's address check: everything is free but "dee".
  "handles:checkHandle": (args: unknown) => {
    const handle = String((args as { handle?: string } | undefined)?.handle ?? "");
    return handle === "dee" ? { ok: false, handle, reason: "Taken." } : { ok: true, handle };
  },
  "profiles:getProfile": myPage,
  // People › Organizations: one you follow people in, one you don't.
  "organizations:list": [
    { _id: "org-harbor", name: "Harbor Light Collective", slug: "harbor-light", category: "Collective", tagline: null, location: null, logoUrl: null, peopleCount: 4, followingCount: 2, faces: [] },
    { _id: "org-tide", name: "Tidewater Center for the Arts", slug: "tidewater", category: "Nonprofit", tagline: null, location: "Fallbrook", logoUrl: "/campaign/church.jpg", peopleCount: 2, followingCount: 0, faces: [] },
  ],
  // Settings → Profile's Work & Portfolio: the same work your page shows.
  "artifacts:getMyArtifacts": [
    ...myPage.artifacts.map((a) => ({ ...a, title: "Cafe opening" })),
    { _id: "a-film", type: "link", title: "Short film", mediaUrl: "https://example.com/film", ogImageUrl: "/campaign/pair.jpg", order: 1, createdAt: now - 20 * DAY },
  ],
  "profiles:directory": (args: unknown) => {
    const q = String((args as { query?: string } | undefined)?.query ?? "").toLowerCase();
    const found = q ? people.filter((p) => p.name.toLowerCase().includes(q)) : people;
    return { people: found, total: found.length, visitor: false };
  },
  "messaging:getUnreadCount": 1,
  "notifications:getUnreadCount": 1,
  "notifications:getNotifications": notifications,
  "notifications:listCelebrations": [],
  "messaging:getConversations": conversations,
  "shortlist:getMine": shortlistWithPosts(),
  "garden/defaultCommunity:getSignupCommunity": { inviteOnly: false, viewer: { isMember: true } },
  "garden/communities:listMyCommunities": [{ ...community, role: "member", status: "active", isHome: true }],
  "garden/communities:listCommunities": [{ ...community, memberCount: 40 }],
  "garden/projects:listProjects": projects,
  "garden/projects:getProject": (args: unknown) => {
    const id = (args as { projectId?: string } | undefined)?.projectId;
    return [...projects, ...pieceProjects].find((p) => (p as { _id?: string })._id === id) ?? null;
  },
  "garden/stories:listProjectUpdates": updatesFor,
  // Paged by usePaginatedQuery in convexReact.ts.
  "garden/stories:listProjectUpdatesPage": updatesFor,
  // A shared piece's page has just its maker; elsewhere, the two-person team
  // the cards count.
  "garden/projectTeam:getTeam": (args: unknown) => {
    const piece = pieceProject(args);
    if (!piece) return { accepted: [{ userId: "u-marta" }, { userId: "u-june" }] };
    const { creator, userId } = piece;
    return { lead: { profileId: creator._id, userId, name: creator.name, imageUrl: creator.imageUrl }, accepted: [], credits: [], acceptingPeople: false };
  },
  "garden/projectTeam:listRoles": (args: unknown) => (pieceProject(args) ? [] : [{ status: "open" }, { status: "open" }]),
  "garden/support:listSupportForProject": [],
  "garden/patronTiers:listTiers": [],
  "garden/giving:getMyGiving": { open: [{ amountCents: 500 }] },
  "events:list": (args: unknown) => ((args as { past?: boolean } | undefined)?.past ? past : upcoming),
  "events:search": [],
  "favorites:getMyFavorites": {
    // The people the sample Shortlist follows, so Following has them too.
    profiles: shortlistWithPosts().people.map((p) => ({ profile: { _id: p.profileId, name: p.name, imageUrl: p.imageUrl, interests: p.interests, isLeader: p.name === "Theo Okafor" } })),
    events: [{ event: upcoming[0] }, { event: upcoming[2] }, { event: past[0] }],
  },
  "favorites:isFavorited": false,
  "favorites:getFavoriteCount": 0,
  "updates:listMine": updates,
  "updates:listPastMine": [],
  "invites:getMyInviteLink": { slug: "rick" },
};

/** What a mutation answers, by name, where a screen reads the answer; the
 *  rest resolve to nothing. Nothing is saved anywhere. */
export const replies: Record<string, unknown | ((args: unknown) => unknown)> = {
  "profiles:upsertProfile": "me",
  "garden/projects:createPassionProject": { projectId: "p-new" },
  // Onboarding's mic: what the pick would come back with for any transcript.
  "onboardingAssist:pickFromSpeech": (args: unknown) => ({
    interests: ["Photography", "Filmmaking"],
    line: String((args as { transcript?: string } | undefined)?.transcript ?? "").slice(0, 140),
  }),
};
