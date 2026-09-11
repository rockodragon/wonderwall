import { Link } from "react-router";
import type { Route } from "./+types/for.$audience";
import { CampaignBand } from "../components/CampaignBand";
import type { CampaignImageKey } from "../lib/campaign";
import { SiteHeader } from "../components/SiteHeader";

// Public audience pages — one per constituent door in
// docs/marketing/constituent-playbook.md. Deliberately OUTSIDE the _app.tsx
// layout (which sends logged-out visitors to /login, routes/_app.tsx:42):
// these exist to be handed to someone who has never heard of us.
//
// Copy rules the playbook fixes and this file must keep:
//   - "Get your work funded" describes the platform and is fine. Promising a
//     named person their project WILL be funded is not.
//   - A backer covers the platform fee at checkout, so the creative keeps
//     100%. Never claim a payout speed — no cadence is set.
//   - The platform is open to any creative; The Garden is the Christian
//     creative community inside it. Creative-facing copy says so plainly.
//
// Six doors, six different verbs: find, start, pick, sponsor, give, hire.
// If three buttons all say "support a creative" the page has stopped
// distinguishing between audiences.
//
// Buttons name what the PERSON wants, never what our system calls it.
// Nobody outside this codebase knows what a "seat" is, and no patron came
// here to read a ledger. Write the label from the desire — support a
// creative, hire someone, earn from your community — then find a route for
// it. Never the other way round.
//
// CTA destinations must be public routes. Anything inside the _app layout
// (/projects, /faq, /jobs/new, /search, /offerings) redirects a logged-out
// visitor to /login. Public today: /opportunities, /join, /fund/:slug,
// /tables, /garden/events, /story/:slug. "Show me the work" now has a real
// destination — /opportunities — so buttons about SEEING go there and
// buttons about JOINING go to /join.

type Audience = {
  slug: string;
  eyebrow: string;
  headline: string;
  subhead: string;
  points: { title: string; body: string }[];
  cost: string;
  ctaLabel: string;
  ctaTo: string;
  ctaLabel2: string;
  ctaTo2: string;
  /** The "create together." band. Photography and quotes are sample copy —
      see lib/campaign.ts. */
  bandImages: [CampaignImageKey, CampaignImageKey];
  metaTitle: string;
  metaDescription: string;
};

const AUDIENCES: Audience[] = [
  {
    slug: "creatives",
    eyebrow: "For creatives",
    headline: "Find your people. Get paid.",
    subhead:
      "Work with other creatives, find paid work, and get backed by people who believe in you. Joining is free.",
    points: [
      {
        title: "You keep all of it",
        body: "When someone gives you $100, you get $100. They cover our fee when they check out. Nothing comes out of your side.",
      },
      {
        title: "There's money set aside for your work",
        body: "Churches and neighbors put money into a fund. You apply. A nonprofit decides who gets it, and every grant is posted publicly, so you can see who got what.",
      },
      {
        title: "Real work, from people nearby",
        body: "Churches, businesses and nonprofits post paid work here. Each post says who is asking and what it pays.",
      },
      {
        title: "You won't be doing this alone",
        body: "The Garden is the Christian creative community on the platform. Share your work, get feedback, meet people making things near you.",
      },
    ],
    cost:
      "Joining is free and stays free. A seat is $10 a month when you're ready to be funded. It lets you start projects, apply for work, and propose to the grant fund. Half of your $10 goes to fund another creative.",
    ctaLabel: "Find collaborators",
    ctaTo: "/join",
    ctaLabel2: "Find paid work",
    ctaTo2: "/opportunities",
    bandImages: ["shua", "june"],
    metaTitle: "Find your people, get paid — creatives.exchange",
    metaDescription:
      "Find paid work, get backed by people who believe in you, and apply for grants. Joining is free. When someone gives you $100, you get $100.",
  },
  {
    slug: "hosts",
    eyebrow: "For hosts and community leaders",
    headline: "Earn from the community you already lead.",
    subhead:
      "Bring your people. Teach what you know. Keep 90% of what you sell. Hosting costs nothing.",
    points: [
      {
        title: "You keep 90 cents of every dollar",
        body: "Classes, cohorts, memberships, prints, downloads. One rate for all of it.",
      },
      {
        title: "Hosting is free",
        body: "You're paid for what you sell. You're never charged for the people you bring.",
      },
      {
        title: "Your people can win grants",
        body: "Creatives in your community can apply to the grant fund. The money goes to them directly.",
      },
      {
        title: "One place instead of five",
        body: "Rosters, sessions, sign-ups, events and payments in one place.",
      },
    ],
    cost:
      "Free to host. We take 10% of what you sell. For $50 a month you can also run funding programs for your own community — contests, funded cohorts, and grant pools.",
    ctaLabel: "Start earning from your community",
    ctaTo: "/join",
    ctaLabel2: "See what you'd keep",
    ctaTo2: "/tables",
    bandImages: ["marta", "gallery"],
    metaTitle: "Earn from the community you lead — creatives.exchange",
    metaDescription:
      "Bring your community here. Hosting is free, you keep 90% of what you sell, and the creatives in your community can apply for grants.",
  },
  {
    slug: "patrons",
    eyebrow: "For patrons and backers",
    headline: "Back someone you believe in.",
    subhead:
      "A person, a team, or a project. Pick one, and watch it get made.",
    points: [
      {
        title: "You know who you're backing",
        body: "A name, a face, a body of work, and usually a town near yours. Not a campaign page.",
      },
      {
        title: "You watch it get made",
        body: "Updates as the work comes together. The finished piece when it's done. Your name on it.",
      },
      {
        title: "Back more than one way",
        body: "Money, a room for an afternoon, gear, an introduction. All of it counts, and all of it is credited.",
      },
      {
        title: "You'll meet them",
        body: "Shows, openings, workshops. The people you back are the people in the room.",
      },
    ],
    cost: "A patron account is free. You decide what to give, and when.",
    ctaLabel: "Pick someone to back",
    ctaTo: "/opportunities",
    ctaLabel2: "Create a free patron account",
    ctaTo2: "/join",
    bandImages: ["band", "viewing"],
    metaTitle: "For patrons — creatives.exchange",
    metaDescription:
      "Back a creative, a team, or a project. Watch it get made, get credited on the work, and meet the people you back.",
  },
  {
    slug: "churches",
    eyebrow: "For churches and organizations",
    headline: "Support the creatives in your church.",
    subhead:
      "$10 a month opens the door for one of them. You can see exactly what it did.",
    points: [
      {
        title: "They get everything, not a discount",
        body: "The creative you sponsor can start projects, take paid work, and propose to the grant fund — same as anyone who pays for it themselves.",
      },
      {
        title: "It's not really about Sunday",
        body: "The people you sponsor keep making after the service ends — festivals, bars, wherever people are. You helped make that possible.",
      },
      {
        title: "One card, one code",
        body: "Buy ten seats at once and hand out a single code.",
      },
      {
        title: "Where it goes",
        body: "Half of every seat funds the grant program. The other half keeps this running. Every grant that goes out is public.",
      },
    ],
    cost:
      "$10 per seat per month, in any number you want. Paying for a year at once is one charge instead of twelve.",
    ctaLabel: "Sponsor your creative team",
    ctaTo: "/join",
    ctaLabel2: "See what it pays for",
    ctaTo2: "/fund/abiding-practice",
    bandImages: ["church", "busker"],
    metaTitle: "Support the creatives in your church — creatives.exchange",
    metaDescription:
      "Cover seats for the creatives in your church. $10 a month per seat, one code for your whole group, and a clear record of where it went.",
  },
  {
    slug: "donors",
    eyebrow: "For donors and institutions",
    headline: "Support creatives, and see exactly where it lands.",
    subhead:
      "The grant fund is run by Abiding Practice, a 501(c)(3). Your gift is tax-deductible and every grant is posted publicly.",
    points: [
      {
        title: "90 cents of every dollar becomes a grant",
        body: "When you cover the processing fee at checkout, ninety cents of each dollar goes out to a creative. The rest runs the fund and the platform.",
      },
      {
        title: "A real receipt from a real nonprofit",
        body: "Abiding Practice, a 501(c)(3), receives your gift and sends the receipt.",
      },
      {
        title: "You can check the work",
        body: "Date, amount, creative, project. Anyone can read the list without an account.",
      },
      {
        title: "What it buys",
        body: "$250 covers materials for a project. $500 a month for six months covers rent while a creative finishes a body of work.",
      },
    ],
    cost:
      "Give once or monthly, in any amount. Larger commitments are worth a conversation — those are the gifts a creative can plan around.",
    ctaLabel: "Give to the grant fund",
    ctaTo: "/fund/abiding-practice",
    ctaLabel2: "Come to the November 6 event",
    ctaTo2: "/garden/events",
    bandImages: ["dee", "cafe"],
    metaTitle: "Support creatives, see where it lands — creatives.exchange",
    metaDescription:
      "Give to a grant fund run by Abiding Practice, a 501(c)(3). Tax-deductible, ninety cents of every dollar granted, and every grant posted publicly.",
  },
  {
    slug: "partners",
    eyebrow: "For venues and businesses",
    headline: "Hire a creative, or open your doors.",
    subhead: "Post the job. Creatives with portfolios apply.",
    points: [
      {
        title: "Applicants you can see",
        body: "Creatives here apply to your post directly. You see their portfolio before you reply.",
      },
      {
        title: "Your name goes on it",
        body: "Sponsors and venue partners are credited on the projects and events they made possible.",
      },
      {
        title: "Space counts as much as money",
        body: "A room, a stage, a studio for an afternoon. Offer space the same way you would offer money.",
      },
    ],
    cost:
      "Posting work is free. Business sponsorships start at $100 a month, and unlike a donation you write it off as marketing.",
    ctaLabel: "Hire a creative",
    ctaTo: "/join",
    ctaLabel2: "Offer your space",
    ctaTo2: "/join",
    bandImages: ["night", "opening"],
    metaTitle: "For venues and businesses — creatives.exchange",
    metaDescription:
      "Hire creatives who want the work, or offer your space. Posting is free, and your name goes on what gets made.",
  },
];

const BY_SLUG = new Map(AUDIENCES.map((a) => [a.slug, a]));

export function meta({ params }: Route.MetaArgs) {
  const a = BY_SLUG.get(params.audience ?? "");
  const title = a ? a.metaTitle : "creatives.exchange";
  const description = a
    ? a.metaDescription
    : "Where creative work gets funded.";
  const image = "https://creatives.exchange/og-image.png";
  return [
    { title },
    { name: "description", content: description },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    { property: "og:type", content: "website" },
    { property: "og:image", content: image },
    { property: "og:image:width", content: "1200" },
    { property: "og:image:height", content: "630" },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: description },
    { name: "twitter:image", content: image },
  ];
}

export default function ForAudience({ params }: Route.ComponentProps) {
  const audience = BY_SLUG.get(params.audience ?? "");

  if (!audience) {
    return (
      <div className="min-h-screen bg-[var(--garden-ink)] flex items-center justify-center px-6">
        <div className="text-center">
          <p className="text-[var(--garden-body)] mb-6">
            We don't have a page for that yet.
          </p>
          <Link
            to="/"
            className="px-6 py-3 bg-[var(--garden-citron)] text-[var(--garden-ink)] rounded-xl font-semibold inline-block"
          >
            Go home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--garden-ink)]">
      <SiteHeader />

      <main className="px-6 pt-8 pb-24 max-w-[980px] mx-auto">
        <p className="text-[var(--garden-citron)] text-sm font-semibold tracking-wide uppercase mb-4">
          {audience.eyebrow}
        </p>
        <h1
          className="text-4xl md:text-6xl font-bold text-[var(--garden-paper)] leading-tight mb-5 max-w-3xl"
          style={{ fontFamily: "var(--garden-font-display)" }}
        >
          {audience.headline}
        </h1>
        <p className="text-xl text-[var(--garden-body)] max-w-2xl mb-12">
          {audience.subhead}
        </p>

        <CampaignBand images={audience.bandImages} />

        <div className="grid gap-4 sm:grid-cols-2 mb-12">
          {audience.points.map((p) => (
            <div
              key={p.title}
              className="p-6 bg-[var(--garden-ink-raised)]/80 rounded-2xl border border-[var(--garden-hairline-raised)]"
            >
              <h2 className="text-[var(--garden-paper)] font-semibold text-lg mb-2">
                {p.title}
              </h2>
              <p className="text-[var(--garden-body)] leading-relaxed">
                {p.body}
              </p>
            </div>
          ))}
        </div>

        <div className="p-6 rounded-2xl border border-[var(--garden-hairline)] mb-12 max-w-3xl">
          <h2 className="text-[var(--garden-dim)] text-xs font-semibold tracking-wide uppercase mb-3">
            What it costs
          </h2>
          <p className="text-[var(--garden-body)] leading-relaxed">
            {audience.cost}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-4 mb-16">
          <Link
            to={audience.ctaTo}
            className="px-6 py-3 bg-[var(--garden-citron)] text-[var(--garden-ink)] rounded-xl font-semibold hover:opacity-90 transition-all"
          >
            {audience.ctaLabel}
          </Link>
          <Link
            to={audience.ctaTo2}
            className="px-6 py-3 rounded-xl font-medium border border-[var(--garden-hairline)] text-[var(--garden-body)] hover:text-[var(--garden-paper)] hover:border-[var(--garden-citron)] transition-colors"
          >
            {audience.ctaLabel2}
          </Link>
        </div>

        <div className="pt-10 border-t border-[var(--garden-hairline)]">
          <h2 className="text-[var(--garden-dim)] text-xs font-semibold tracking-wide uppercase mb-4">
            Also here for
          </h2>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            {AUDIENCES.filter((a) => a.slug !== audience.slug).map((a) => (
              <Link
                key={a.slug}
                to={`/for/${a.slug}`}
                className="text-[var(--garden-body)] hover:text-[var(--garden-citron)] transition-colors"
              >
                {a.eyebrow.replace(/^For /, "")}
              </Link>
            ))}
          </div>
          <p className="mt-8 text-[var(--garden-dim)] text-sm">
            <Link to="/legal/credits" className="hover:text-[var(--garden-body)]">
              Photography credits
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
