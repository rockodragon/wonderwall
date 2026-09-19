import { Link, Navigate } from "react-router";
import type { Route } from "./+types/for.$audience";
import { CampaignBand } from "../components/CampaignBand";
import type { CampaignImageKey } from "../lib/campaign";
import { SiteHeader } from "../components/SiteHeader";
import { Reveal } from "../hooks/useReveal";
import { CLAIMS } from "../constants/claims";

// Public audience pages — one per constituent door in
// docs/marketing/constituent-playbook.md. Deliberately OUTSIDE the _app.tsx
// layout (which sends logged-out visitors to /login, routes/_app.tsx:42):
// these exist to be handed to someone who has never heard of us.
//
// Copy rules this file must keep:
//   - Every sentence about money comes from constants/claims.ts (twin of
//     docs/marketing/claims.md). Don't write a new one here. The "never say"
//     list lives in that doc; claims.test.ts enforces the dropped phrases.
//   - "Get your work funded" describes the platform and is fine. Promising a
//     named person their project WILL be funded is not.
//   - A backing pays the creative 90%: the platform's 10% comes out of the
//     backing (5% on the part of any single gift above $1,000). Decided
//     2026-09-18. Never claim a payout speed — no cadence is set.
//   - Payouts are made by hand until the payout rail ships (bead
//     wonderwall-7avu): CLAIMS.payout says so. Don't imply automatic or
//     instant transfers.
//   - Grant money: dues shares (50%) fill the PLATFORM project pool
//     (/fund/creatives-exchange); operators decide proposals to it. Abiding
//     Practice's 501(c)(3) fund is a separate, off-platform lane. Never say a
//     nonprofit decides the pool, and never point dues at /fund/abiding-practice.
//     No grant cycle exists — never imply a deadline or a round.
//   - The platform is open to any creative; The Garden is the Christian
//     creative community inside it. Creative-facing copy says so plainly.
//
// Four doors, four different verbs: find, back, bring, open.
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
  ctaLabel2?: string;
  ctaTo2?: string;
  ctaLabel3?: string;
  ctaTo3?: string;
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
      "Work with other creatives, grow in your craft, find paid work, and get backed by people who believe in you. Joining is free.",
    points: [
      {
        title: "You keep 90%",
        body: `${CLAIMS.backing} ${CLAIMS.largeGift} ${CLAIMS.payout}`,
      },
      {
        title: "There's money set aside for your work",
        body: CLAIMS.pool,
      },
      {
        title: "Real work, from people nearby",
        body: "Partners — churches, businesses, nonprofits — post paid work here. Each post says who is asking and what it pays.",
      },
      {
        title: "Keep growing",
        body: "Find your path through classes, coaching, and workshops. Join a cohort, work with a creative or spiritual coach, or sit in on a critique night.",
      },
      {
        title: "You won't be doing this alone",
        body: "The Garden is the Christian creative community on the platform. Share your work, get feedback, meet people making things near you.",
      },
    ],
    cost:
      `${CLAIMS.join} ${CLAIMS.membership} Half of your $10 goes to fund another creative.`,
    ctaLabel: "Find collaborators",
    ctaTo: "/join",
    ctaLabel2: "Find paid work",
    ctaTo2: "/opportunities",
    ctaLabel3: "Find a class or coach",
    ctaTo3: "/offerings",
    bandImages: ["shua", "june"],
    metaTitle: "Find your people, get paid — creatives.exchange",
    metaDescription:
      `Find paid work, get backed by people who believe in you, and apply for grants. ${CLAIMS.join} ${CLAIMS.backingShort}`,
  },
  {
    slug: "hosts",
    eyebrow: "For hosts and community leaders",
    headline: "Earn from the community you already lead.",
    subhead:
      "Bring your people. Teach what you know. Keep 90% of what you sell. Hosting costs nothing.",
    points: [
      {
        title: "Ditch the five tools you're stitching together",
        body: "Rosters, sign-ups, sessions, events, payments — one place, not a spreadsheet plus a forms tool plus a payment link plus a group chat.",
      },
      {
        title: "You keep 90 cents of every dollar",
        body: "Classes, cohorts, memberships, prints, downloads. One rate for all of it. For now we keep track of what you've earned and pay it out to you ourselves.",
      },
      {
        title: "Hosting is free",
        body: "You're paid for what you sell. You're never charged for the people you bring.",
      },
      {
        title: "Grants keep your community engaged",
        body: "Half of every member's dues goes into a shared fund. Creatives in your community can apply and get funded directly — real support that gives them a reason to stay active here.",
      },
    ],
    cost:
      "Free to host. We take 10% of what you sell. For $50 a month you can also run funding programs for your own community — contests, funded cohorts, and grant pools.",
    // Hosting itself is free and lives at /communities/apply — /join is a
    // paid $50/mo upgrade for a host who ALSO wants funding programs (see
    // join.tsx's header comment), not how someone becomes a host at all.
    ctaLabel: "Start earning from your community",
    ctaTo: "/communities/apply",
    bandImages: ["marta", "gallery"],
    metaTitle: "Earn from the community you lead — creatives.exchange",
    metaDescription:
      "Bring your community here. Hosting is free, you keep 90% of what you sell, and the creatives in your community can apply for grants.",
  },
  {
    slug: "patrons",
    eyebrow: "For patrons",
    headline: "Back someone you believe in.",
    subhead:
      "Sponsor a project. Gift memberships. Offer a venue or other resources. Pick someone and watch it get made.",
    points: [
      {
        title: "You know who you're backing",
        body: "A name, a face, a body of work, and usually a town near yours. Not a campaign page.",
      },
      {
        title: "You watch it get made",
        body: "Updates as the work comes together. The finished piece when it's done. Your name on it, if you want it there.",
      },
      {
        title: "Back more than one way",
        body: "Money, a room for an afternoon, gear, an introduction. All of it counts, and all of it is credited.",
      },
      {
        title: "Give to a grant fund",
        body: `Every community can run one. ${CLAIMS.grantFund}`,
      },
    ],
    cost: "A patron account is free. You decide what to give, and when. Larger commitments to a grant fund are worth a conversation — those are the gifts a creative can plan around.",
    ctaLabel: "Pick someone to back",
    ctaTo: "/opportunities",
    ctaLabel2: "Give to a grant fund",
    ctaTo2: "/fund/abiding-practice",
    bandImages: ["band", "viewing"],
    metaTitle: "For patrons — creatives.exchange",
    metaDescription:
      "Back a creative, a team, or a project. Watch it get made, get credited on the work, and give to a grant fund.",
  },
  {
    slug: "churches",
    eyebrow: "For churches",
    headline: "Support the creatives in your church.",
    subhead:
      CLAIMS.coverage,
    points: [
      {
        title: "They get everything, not a discount",
        body: "The creative you sponsor can start projects, take paid work, and propose to a grant fund — same as anyone who pays for it themselves.",
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
        body: "Half of every seat funds the grant program. The other half keeps this running.",
      },
    ],
    cost:
      "$10 per seat per month, in any number you want. Paying for a year at once is one charge instead of twelve.",
    ctaLabel: "Sponsor your creative team",
    ctaTo: "/coverage",
    // Dues shares land on the PLATFORM pool row (stripeHandlers.ts
    // handleInvoicePaid -> "creatives-exchange"), not on Abiding Practice's
    // off-platform fund — so "see what it pays for" must point at that ledger.
    ctaLabel2: "See the project pool",
    ctaTo2: "/fund/creatives-exchange",
    bandImages: ["church", "busker"],
    metaTitle: "For churches — creatives.exchange",
    metaDescription:
      "Cover seats for the creatives in your church. $10 a month per seat, and one code for your whole group.",
  },
  {
    slug: "partners",
    eyebrow: "For community partners",
    headline: "Invest in creatives. They fill the room.",
    subhead:
      "Venues, businesses, organizations — sponsor a creative, post paid work, or offer your space.",
    points: [
      {
        title: "Post paid work",
        body: "Creatives apply directly. You see their portfolio before you reply.",
      },
      {
        title: "Space counts as much as money",
        body: "A room, a stage, a studio for an afternoon. Offer space the same way you would offer money.",
      },
      {
        title: "Your name goes on it",
        body: "Partners are credited on the projects and events they made possible. When it's done, everyone knows who opened the door.",
      },
      {
        title: "Sponsor creatives",
        body: "Cover a seat for someone in your organization. $10 a month opens the door for one of them.",
      },
    ],
    cost:
      "Posting work is free. Sponsoring seats is $10 each per month. Business sponsorships start at $100 a month.",
    ctaLabel: "Post paid work",
    ctaTo: "/join",
    ctaLabel2: "Offer your space",
    ctaTo2: "/join",
    bandImages: ["night", "opening"],
    metaTitle: "For community partners — creatives.exchange",
    metaDescription:
      "Venues and businesses — post paid work, offer your space, or sponsor creatives. Your name goes on what gets made.",
  },
];

const BY_SLUG = new Map(AUDIENCES.map((a) => [a.slug, a]));

const SLUG_REDIRECTS: Record<string, string> = {
  donors: "patrons",
};

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
  const redirect = SLUG_REDIRECTS[params.audience ?? ""];
  if (redirect) {
    return <Navigate to={`/for/${redirect}`} replace />;
  }

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
        <p className="text-xl text-[var(--garden-body)] max-w-2xl mb-8">
          {audience.subhead}
        </p>

        {/* Primary CTAs — up top, before the scroll */}
        <div className="flex flex-col sm:flex-row flex-wrap gap-3 mb-16">
          <Link
            to={audience.ctaTo}
            className="px-8 py-4 bg-[var(--garden-citron)] text-[var(--garden-ink)] rounded-xl text-lg font-semibold hover:opacity-90 transition-all text-center"
          >
            {audience.ctaLabel}
          </Link>
          {audience.ctaLabel2 && audience.ctaTo2 && (
            <Link
              to={audience.ctaTo2}
              className="px-8 py-4 rounded-xl text-lg font-medium border border-[var(--garden-hairline)] text-[var(--garden-body)] hover:text-[var(--garden-paper)] hover:border-[var(--garden-citron)] transition-colors text-center"
            >
              {audience.ctaLabel2}
            </Link>
          )}
          {audience.ctaLabel3 && audience.ctaTo3 && (
            <Link
              to={audience.ctaTo3}
              className="px-8 py-4 rounded-xl text-lg font-medium border border-[var(--garden-hairline)] text-[var(--garden-body)] hover:text-[var(--garden-paper)] hover:border-[var(--garden-citron)] transition-colors text-center"
            >
              {audience.ctaLabel3}
            </Link>
          )}
        </div>

        <Reveal>
          <CampaignBand images={audience.bandImages} />
        </Reveal>

        <div className="grid gap-4 sm:grid-cols-2 mb-12">
          {audience.points.map((p, i) => (
            <Reveal key={p.title} delay={i * 80}>
              <div className="p-6 bg-[var(--garden-ink-raised)]/80 rounded-2xl border border-[var(--garden-hairline-raised)] h-full">
                <h2 className="text-[var(--garden-paper)] font-semibold text-lg mb-2">
                  {p.title}
                </h2>
                <p className="text-[var(--garden-body)] leading-relaxed">
                  {p.body}
                </p>
              </div>
            </Reveal>
          ))}
        </div>

        <Reveal>
          <div className="p-6 rounded-2xl border border-[var(--garden-hairline)] mb-12 max-w-3xl">
            <h2 className="text-[var(--garden-dim)] text-xs font-semibold tracking-wide uppercase mb-3">
              What it costs
            </h2>
            <p className="text-[var(--garden-body)] leading-relaxed">
              {audience.cost}
            </p>
          </div>
        </Reveal>

        {/* Bottom CTAs — the closing ask */}
        <div className="flex flex-col sm:flex-row flex-wrap gap-3 mb-16">
          <Link
            to={audience.ctaTo}
            className="px-8 py-4 bg-[var(--garden-citron)] text-[var(--garden-ink)] rounded-xl text-lg font-semibold hover:opacity-90 transition-all text-center"
          >
            {audience.ctaLabel}
          </Link>
          {audience.ctaLabel2 && audience.ctaTo2 && (
            <Link
              to={audience.ctaTo2}
              className="px-8 py-4 rounded-xl text-lg font-medium border border-[var(--garden-hairline)] text-[var(--garden-body)] hover:text-[var(--garden-paper)] hover:border-[var(--garden-citron)] transition-colors text-center"
            >
              {audience.ctaLabel2}
            </Link>
          )}
          {audience.ctaLabel3 && audience.ctaTo3 && (
            <Link
              to={audience.ctaTo3}
              className="px-8 py-4 rounded-xl text-lg font-medium border border-[var(--garden-hairline)] text-[var(--garden-body)] hover:text-[var(--garden-paper)] hover:border-[var(--garden-citron)] transition-colors text-center"
            >
              {audience.ctaLabel3}
            </Link>
          )}
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
