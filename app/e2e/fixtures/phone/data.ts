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
  primaryRole: "maker",
  bio: "Making things in San Diego.",
  interests: ["Film", "Music"],
  imageUrl: "/campaign/shua.jpg",
  isAdmin: false,
  plan: "free",
  attributes: { email: "preview@example.com" },
  location: "San Diego, CA",
};

function person(name: string, image: string, interests: string[], orgName?: string) {
  return { _id: name.toLowerCase().replace(/\s+/g, "-"), name, imageUrl: image, interests, orgName, location: "San Diego, CA", wondering: null };
}

const people = [
  person("Dee Alvarez", "/campaign/dee.jpg", ["Photography", "Film"], "Abiding Practice"),
  person("Marta Reyes", "/campaign/marta.jpg", ["Painting", "Murals"]),
  person("June Park", "/campaign/june.jpg", ["Music", "Songwriting"], "The Grove"),
  person("Ade Okafor", "/campaign/ade.jpg", ["Design", "Illustration"]),
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

export const answers: Record<string, unknown | ((args: unknown) => unknown)> = {
  "profiles:getMyProfile": me,
  "profiles:search": (args: unknown) => {
    const q = String((args as { query?: string } | undefined)?.query ?? "").toLowerCase();
    return q ? people.filter((p) => p.name.toLowerCase().includes(q)) : people;
  },
  "messaging:getUnreadCount": 1,
  "notifications:getUnreadCount": 1,
  "notifications:getNotifications": notifications,
  "notifications:listCelebrations": [],
  "messaging:getConversations": conversations,
  "shortlist:getMine": sampleShortlist(),
  "garden/defaultCommunity:getSignupCommunity": { inviteOnly: false, viewer: { isMember: true } },
  "garden/communities:listMyCommunities": [{ ...community, role: "member", status: "active", isHome: true }],
  "garden/communities:listCommunities": [{ ...community, memberCount: 40 }],
  "garden/projects:listProjects": projects,
  "garden/projectTeam:getTeam": { accepted: [{ userId: "u-marta" }, { userId: "u-june" }] },
  "garden/projectTeam:listRoles": [{ status: "open" }, { status: "open" }],
  "garden/support:listSupportForProject": [],
  "garden/patronTiers:listTiers": [],
  "garden/giving:getMyGiving": { open: [{ amountCents: 500 }] },
  "events:list": (args: unknown) => ((args as { past?: boolean } | undefined)?.past ? past : upcoming),
  "events:search": [],
  "favorites:getMyFavorites": { profiles: [], events: [{ event: upcoming[0] }, { event: upcoming[2] }] },
  "favorites:isFavorited": false,
  "favorites:getFavoriteCount": 0,
  "updates:listMine": updates,
  "updates:listPastMine": [],
  "invites:getMyInviteLink": { slug: "rick" },
};
