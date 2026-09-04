import { Link } from "react-router";
import type { Route } from "./+types/for.$audience";

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

type Audience = {
  slug: string;
  eyebrow: string;
  headline: string;
  subhead: string;
  points: { title: string; body: string }[];
  cost: string;
  ctaLabel: string;
  ctaTo: string;
  metaTitle: string;
  metaDescription: string;
};

const AUDIENCES: Audience[] = [
  {
    slug: "creatives",
    eyebrow: "For creatives",
    headline: "Get your work funded.",
    subhead:
      "Paid work, backing, and a real grant fund — for creatives who are tired of exposure. Free to join.",
    points: [
      {
        title: "You keep 100%",
        body: "When someone backs your project, our fee is paid by them at checkout. It is not taken out of your money. No other platform does this.",
      },
      {
        title: "A grant fund that's actually funded",
        body: "Money from churches and donors, administered by Abiding Practice — a 501(c)(3) — and every grant is published where anyone can read it.",
      },
      {
        title: "Paid work worth applying to",
        body: "Posted by churches, businesses and nonprofits who want to hire creatives. Not scraped from a job board.",
      },
      {
        title: "People who get it",
        body: "The Garden is the Christian creative community inside creatives.exchange. It's where this started.",
      },
    ],
    cost:
      "Free to join and stay free. A seat is $10/month when you want to be funded — start projects, apply to paid work, propose to the grant fund. Half of it funds another creative's project.",
    ctaLabel: "Join free",
    ctaTo: "/join",
    metaTitle: "Get your work funded — creatives.exchange",
    metaDescription:
      "Paid work, backing and a real grant fund for creatives. Free to join. When someone backs your project you keep 100% — the backer covers the platform fee, not you.",
  },
  {
    slug: "hosts",
    eyebrow: "For hosts and community leaders",
    headline: "Get paid to gather the people you already gather.",
    subhead:
      "Run your community here, sell what you teach, and keep 90% of it. Hosting is free.",
    points: [
      {
        title: "Keep 90% of what you sell",
        body: "Classes, cohorts, premium content — you keep 90 cents of every dollar. One rule, no tiers, no negotiation.",
      },
      {
        title: "Hosting costs nothing",
        body: "Bring your community, run your sessions, keep your roster. You are paid for what you sell, never charged for who you bring.",
      },
      {
        title: "Your people can win grants",
        body: "Creatives in your community can propose to the grant fund. That money goes to them, and it is a reason for them to show up.",
      },
      {
        title: "The tools are already here",
        body: "Sessions, rosters, RSVPs, events, payments, and a public record of what got funded.",
      },
    ],
    cost:
      "Free to host. 10% of what you sell. The $50/month Leader tier adds funding programs you run for your own community — contests, funded cohorts, and grant pools.",
    ctaLabel: "Talk to us about hosting",
    ctaTo: "/faq",
    metaTitle: "For hosts — creatives.exchange",
    metaDescription:
      "Run your creative community here. Hosting is free, you keep 90% of what you sell, and your people can win grants from the fund.",
  },
  {
    slug: "patrons",
    eyebrow: "For patrons and backers",
    headline: "Back a specific person, not an algorithm.",
    subhead:
      "Choose a creative, fund their project, and see what it became. 100% of your gift reaches them.",
    points: [
      {
        title: "100% reaches the creative",
        body: "You cover the platform fee at checkout so the full amount goes to them. Nothing is skimmed off their side.",
      },
      {
        title: "You're credited on the work",
        body: "Your name appears on the project you backed. Not a like, not a follow — a credit on something that got made.",
      },
      {
        title: "You see what happened",
        body: "Story updates from the creative as the work progresses, and a finished piece at the end of it.",
      },
    ],
    cost:
      "Holding a patron account is free. You choose what to give and when. This is backing, not a donation — it is not tax-deductible, and the creative pays income tax on it.",
    ctaLabel: "Browse projects",
    ctaTo: "/projects",
    metaTitle: "For patrons — creatives.exchange",
    metaDescription:
      "Back a specific creative's project. 100% of your gift reaches them because you cover the platform fee, and you're credited on the finished work.",
  },
  {
    slug: "churches",
    eyebrow: "For churches and sponsoring organizations",
    headline: "Cover a seat for the creatives in your congregation.",
    subhead:
      "$10 a month opens the door for one creative. You can see exactly what it did.",
    points: [
      {
        title: "A covered seat is a full seat",
        body: "The creative you sponsor gets everything a paying member gets. The only difference is who paid.",
      },
      {
        title: "You see the names and the results",
        body: "Seats issued, seats redeemed, and which creatives they went to. Your credit appears on the work they publish.",
      },
      {
        title: "One subscription, one code",
        body: "Buy ten seats on one card, hand out one code. No spreadsheets, no chasing individual signups.",
      },
      {
        title: "Your creatives find real work",
        body: "Paid opportunities, backing from people who believe in them, and a grant fund they can apply to.",
      },
    ],
    cost:
      "$10 per seat per month, bought in whatever quantity you want. Buying a year at once is one charge instead of twelve.",
    ctaLabel: "Talk to us about seats",
    ctaTo: "/faq",
    metaTitle: "For churches — creatives.exchange",
    metaDescription:
      "Cover seats for the creatives in your congregation. $10 a month per seat, one code for your whole group, and a clear record of what it did.",
  },
  {
    slug: "donors",
    eyebrow: "For donors and institutions",
    headline: "Fund creative work, and see every dollar land.",
    subhead:
      "The Grant Fund is administered by Abiding Practice, a 501(c)(3). Your gift is tax-deductible and every grant is published.",
    points: [
      {
        title: "90% goes out as grants",
        body: "When you cover the processing fee at checkout, 90 cents of every dollar becomes a grant. The rest covers administration and the platform that runs it.",
      },
      {
        title: "Tax-deductible, properly",
        body: "Abiding Practice is the recipient of record and issues your receipt. Not a workaround — a real 501(c)(3) doing real grant administration.",
      },
      {
        title: "A public record",
        body: "Date, amount, creative, project. Readable by anyone, without an account. You can check what your money did and so can everyone else.",
      },
    ],
    cost:
      "Give what you want, once or monthly. Larger commitments are a conversation — those are the gifts that make the fund something a creative can plan around.",
    ctaLabel: "See the fund",
    ctaTo: "/fund/abiding-practice",
    metaTitle: "For donors — creatives.exchange",
    metaDescription:
      "Give to the Grant Fund, administered by Abiding Practice, a 501(c)(3). Tax-deductible, 90% granted, and every grant published in public.",
  },
  {
    slug: "partners",
    eyebrow: "For venues and businesses",
    headline: "Offer the space, or post the budget.",
    subhead:
      "Find creatives who are ready to work, and put your name on what gets made.",
    points: [
      {
        title: "Post work and get real applicants",
        body: "Creatives here have portfolios, and they applied because they want the job — not because a job board matched a keyword.",
      },
      {
        title: "Your name goes on the finished work",
        body: "Sponsors and venue partners are credited on the projects and events they made possible.",
      },
      {
        title: "Space counts",
        body: "A room, a stage, a studio for an afternoon. Venue partnerships are the same currency as money here.",
      },
    ],
    cost:
      "Posting work is free. Business sponsorships start at $100/month, and unlike a donation they are a marketing expense you write off as one.",
    ctaLabel: "Post a job",
    ctaTo: "/jobs/new",
    metaTitle: "For venues and businesses — creatives.exchange",
    metaDescription:
      "Hire creatives who are ready to work, or offer your space. Posting is free, and your name goes on what gets made.",
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
      <header className="px-6 py-6 max-w-5xl mx-auto">
        <Link
          to="/"
          className="text-[var(--garden-body)] hover:text-[var(--garden-paper)] text-sm font-medium transition-colors"
        >
          ← creatives.exchange
        </Link>
      </header>

      <main className="px-6 pb-24 max-w-5xl mx-auto">
        <p className="text-[var(--garden-citron)] text-sm font-semibold tracking-wide uppercase mb-4">
          {audience.eyebrow}
        </p>
        <h1 className="text-4xl md:text-6xl font-bold text-[var(--garden-paper)] leading-tight mb-5 max-w-3xl">
          {audience.headline}
        </h1>
        <p className="text-xl text-[var(--garden-body)] max-w-2xl mb-12">
          {audience.subhead}
        </p>

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
            to="/events"
            className="px-6 py-3 text-[var(--garden-body)] hover:text-[var(--garden-paper)] font-medium transition-colors"
          >
            See what's coming up
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
        </div>
      </main>
    </div>
  );
}
