// Ten sample paid postings, so /opportunities has something on it before the
// first real post lands. Run against the deployment you mean:
//
//   npx convex run garden/seedPaidPostings:seed
//   npx convex run garden/seedPaidPostings:seed --prod
//
// Idempotent — a title that already exists is skipped. Every poster is a
// real users/profiles row (listProjects needs a name to show), created with
// an @seed.creatives.exchange email so `remove` can find and delete exactly
// these and nothing else:
//
//   npx convex run garden/seedPaidPostings:remove --prod
//
// These are SAMPLES. Invented organisations, invented people, uncommon names
// on purpose so nobody mistakes one for a neighbour. Real posts replace
// them; run `remove` once there are enough.

import { internalMutation } from "../_generated/server";
import { resolveAvailableSlug, slugifyTitle } from "./stories";

const SEED_EMAIL_DOMAIN = "seed.creatives.exchange";

type Sample = {
  poster: string; // profile name: who is asking, and for whom
  email: string;
  title: string;
  blurb: string;
  budgetType: "amount" | "range" | "proposals";
  budget?: number;
  budgetMax?: number;
  location: string;
  remote: boolean;
  interests?: string[];
};

const SAMPLES: Sample[] = [
  {
    poster: "Ozren Vidmar, Tidewater Chapel",
    email: "ozren",
    title: "Album cover and single art for a worship EP",
    blurb:
      "Five songs, recorded live in our sanctuary in March. We need a cover, four single images and a square version for streaming. We have photos from the night, or you can start from nothing. Files by May 1.",
    budgetType: "amount",
    budget: 600,
    location: "Oceanside, CA",
    remote: true,
    interests: ["Design"],
  },
  {
    poster: "Wren Ashcombe, Kettle & Vine Market",
    email: "wren",
    title: "Photograph our Saturday market, four weeks",
    blurb:
      "Saturday mornings, 8 to 11, four weeks in a row. Vendors, produce, people. We want thirty edited photos a week for our website and Instagram. You keep the rights to use them in your portfolio.",
    budgetType: "amount",
    budget: 1200,
    location: "Encinitas, CA",
    remote: false,
    interests: ["Photography"],
  },
  {
    poster: "Delphine Okonkwo-Reyes, Loom House",
    email: "delphine",
    title: "Short documentary on a sewing cooperative",
    blurb:
      "Twelve women, most of them refugees, run a sewing business out of a church basement in City Heights. We want an eight to twelve minute film for our annual dinner in November and for grant applications after that. Interviews, work, the space. Two or three shoot days.",
    budgetType: "range",
    budget: 3500,
    budgetMax: 5000,
    location: "City Heights, San Diego, CA",
    remote: false,
    interests: ["Filmmaking", "Videography"],
  },
  {
    poster: "Bastian Holloway, Brackish Coffee",
    email: "bastian",
    title: "Mural on our side wall, about 30 feet",
    blurb:
      "Stucco wall facing the parking lot, 30 feet by 12. We are open to your idea. It should feel like the neighborhood, not like an ad. Paint and lift are on us. Ideally done before summer.",
    budgetType: "amount",
    budget: 4000,
    location: "Ocean Beach, San Diego, CA",
    remote: false,
    interests: ["Art", "Illustration"],
  },
  {
    poster: "Ilse Marrow, Marrow & Crumb Bakery",
    email: "ilse",
    title: "New logo and packaging for a 40-year-old bakery",
    blurb:
      "My parents opened this bakery in 1985. The logo is from then. We need a new mark, a box, a bag and a sticker sheet, and it has to still look like us. We will send you bread.",
    budgetType: "amount",
    budget: 2500,
    location: "La Mesa, CA",
    remote: true,
    interests: ["Design"],
  },
  {
    poster: "Fr. Anselm Kwiatkowski, St. Ansgar's Lutheran",
    email: "anselm",
    title: "Compose and record a three-minute piece for Advent",
    blurb:
      "An original instrumental for the four Sundays of Advent. Strings or piano, or something we have not thought of. We need a recording we can play and a lead sheet our musicians can read. Due November 15.",
    budgetType: "amount",
    budget: 800,
    location: "Point Loma, San Diego, CA",
    remote: true,
    interests: ["Music"],
  },
  {
    poster: "Tova Ferncastle, Ferncastle Press",
    email: "tova",
    title: "Illustrate a children's picture book, 24 spreads",
    blurb:
      "A story about a girl who keeps a lighthouse. Manuscript is finished. We want full-color spreads, cover and endpapers. You would be credited as illustrator on the cover and paid a flat fee. Print run is 2,000.",
    budgetType: "range",
    budget: 5000,
    budgetMax: 7000,
    location: "Carlsbad, CA",
    remote: true,
    interests: ["Illustration"],
  },
  {
    poster: "Priya Raghunathan and Tomasz Wilk",
    email: "priya-tomasz",
    title: "Wedding video, October 18",
    blurb:
      "Ceremony at 3 in Balboa Park, reception in a backyard in Normal Heights until about 10. We want a five to seven minute film and the full ceremony. Two of us, sixty guests, no drone.",
    budgetType: "amount",
    budget: 2200,
    location: "San Diego, CA",
    remote: false,
    interests: ["Filmmaking", "Videography"],
  },
  {
    poster: "Dr. Marisol Quintanilla, Stillwater Counseling",
    email: "marisol",
    title: "Six-page website for a counseling practice",
    blurb:
      "Three therapists, one office. We need a site people can read on their phone at 2 a.m.: who we are, what we help with, what it costs, how to book. Calm, plain, no stock photos of people laughing at salad.",
    budgetType: "amount",
    budget: 3000,
    location: "Escondido, CA",
    remote: true,
    interests: ["Design", "Technology"],
  },
  {
    poster: "Rutger Abernathy, Harbor Lights Foundation",
    email: "rutger",
    title: "Live painting at our fundraiser gala, March 21",
    blurb:
      "Two hundred guests, a ballroom downtown, three hours. We would like an artist to paint the evening as it happens and auction the finished piece at the end of the night. Tell us what you would need and what you would charge.",
    budgetType: "proposals",
    location: "Downtown San Diego, CA",
    remote: false,
    interests: ["Art"],
  },
];

export const seed = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    let created = 0;
    let skipped = 0;

    for (const s of SAMPLES) {
      const existing = await ctx.db
        .query("projects")
        .filter((q) => q.eq(q.field("title"), s.title))
        .first();
      if (existing) {
        skipped++;
        continue;
      }

      const email = `${s.email}@${SEED_EMAIL_DOMAIN}`;
      let userId = (
        await ctx.db
          .query("users")
          .filter((q) => q.eq(q.field("email"), email))
          .first()
      )?._id;
      if (!userId) {
        userId = await ctx.db.insert("users", { name: s.poster, email });
        await ctx.db.insert("profiles", {
          userId,
          name: s.poster,
          interests: [],
          location: s.location,
          locationType: "city",
          createdAt: now,
          updatedAt: now,
        });
      }

      const storySlug = await resolveAvailableSlug(slugifyTitle(s.title), async (candidate) => {
        const hit = await ctx.db
          .query("projects")
          .withIndex("by_storySlug", (q) => q.eq("storySlug", candidate))
          .unique();
        return hit !== null;
      });

      await ctx.db.insert("projects", {
        userId,
        kind: "paid",
        origin: "posted",
        title: s.title,
        blurb: s.blurb,
        budgetType: s.budgetType,
        budget: s.budget,
        budgetMax: s.budgetMax,
        status: "active",
        storySlug,
        interests: s.interests,
        location: s.location,
        locationType: "city",
        remote: s.remote,
        // Spread creation times over the past two weeks so the list does not
        // read as ten posts from the same minute.
        createdAt: now - created * 32 * 60 * 60 * 1000,
        updatedAt: now,
      });
      created++;
    }
    return { ok: true, created, skipped };
  },
});

/** Delete every seeded posting and the seed poster accounts, nothing else. */
export const remove = internalMutation({
  args: {},
  handler: async (ctx) => {
    let projects = 0;
    let people = 0;
    const users = await ctx.db.query("users").collect();
    for (const u of users) {
      if (!u.email?.endsWith(`@${SEED_EMAIL_DOMAIN}`)) continue;
      const rows = await ctx.db
        .query("projects")
        .filter((q) => q.eq(q.field("userId"), u._id))
        .collect();
      for (const r of rows) {
        await ctx.db.delete(r._id);
        projects++;
      }
      const profile = await ctx.db
        .query("profiles")
        .withIndex("by_userId", (q) => q.eq("userId", u._id))
        .unique();
      if (profile) await ctx.db.delete(profile._id);
      await ctx.db.delete(u._id);
      people++;
    }
    return { ok: true, projects, people };
  },
});
