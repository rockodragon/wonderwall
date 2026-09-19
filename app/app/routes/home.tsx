import { useConvexAuth, useMutation } from "convex/react";
import { Link, useNavigate } from "react-router";
import { useEffect, useState } from "react";
import type { Route } from "./+types/home";
import { api } from "../../convex/_generated/api";
import { SiteHeader } from "../components/SiteHeader";
import { WaitlistFollowUpDark } from "../components/WaitlistFollowUpDark";
import { CAMPAIGN_IMAGES, CAMPAIGN_QUOTES } from "../lib/campaign";
import { Reveal } from "../hooks/useReveal";
import { CLAIMS } from "../constants/claims";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "creatives.exchange — Create better together, building flourishing communities" },
    {
      name: "description",
      content:
        "Creatives, patrons, hosts and partners in one place. Make good work, find your people, and love your neighbors through your craft.",
    },
    {
      property: "og:title",
      content: "creatives.exchange — Create better together, building flourishing communities",
    },
    {
      property: "og:description",
      content:
        "Creatives, patrons, hosts and partners in one place. Make good work, find your people, and love your neighbors through your craft.",
    },
    { property: "og:type", content: "website" },
    {
      property: "og:image",
      content: "https://creatives.exchange/og-image.png",
    },
    { property: "og:image:width", content: "1200" },
    { property: "og:image:height", content: "630" },
    {
      name: "twitter:image",
      content: "https://creatives.exchange/og-image.png",
    },
    { name: "twitter:card", content: "summary_large_image" },
    {
      name: "twitter:title",
      content: "creatives.exchange — Create better together, building flourishing communities",
    },
    {
      name: "twitter:description",
      content:
        "Creatives, patrons, hosts and partners in one place. Make good work, find your people, and love your neighbors through your craft.",
    },
  ];
}

export default function Home() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");
  const [message, setMessage] = useState("");
  const [submittedEmail, setSubmittedEmail] = useState("");
  const [waitlistPosition, setWaitlistPosition] = useState<number | null>(null);
  const addToWaitlist = useMutation(api.waitlist.addToWaitlist);

  // /?invite=slug used to open an invite preview here; the invite code is
  // collected on /signup now, so an old link of that shape lands there.
  useEffect(() => {
    const inviteParam = new URLSearchParams(window.location.search).get("invite");
    if (inviteParam) {
      navigate(`/signup/${encodeURIComponent(inviteParam)}`, { replace: true });
    }
  }, [navigate]);

  async function handleWaitlistSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !email.includes("@")) {
      setStatus("error");
      setMessage("Please enter a valid email");
      return;
    }

    setStatus("loading");
    try {
      const result = await addToWaitlist({ email });
      setStatus("success");
      setMessage(result.message);
      setWaitlistPosition(result.position ?? null);
      setSubmittedEmail(email);
      setEmail("");
    } catch (err) {
      setStatus("error");
      setMessage("Something went wrong. Please try again.");
    }
  }

  const displayFont = "'Bricolage Grotesque', sans-serif";
  const monoFont = "'JetBrains Mono', monospace";

  return (
    <div className="min-h-screen bg-[var(--garden-ink)] overflow-hidden">
      <link rel="stylesheet" href="/tokens.css" />
      <link rel="stylesheet" href="/about/fonts/fonts.css" />
      <SiteHeader overlay />

      {/* Hero — editorial left-aligned, 7fr/5fr grid */}
      <main className="relative pt-28 md:pt-32 pb-16 md:pb-24 px-6 md:px-14 max-w-[1280px] mx-auto">
        <div className="grid md:grid-cols-12 gap-10 md:gap-16 items-end">
          {/* Left column — headline + subtext. min-w-0 on both columns:
              a grid item's default min-width is its content, and the
              input + button row below pushed the column past a phone's
              width, cutting off the button and this text with it. */}
          <div className="md:col-span-7 min-w-0">
            <h1
              className="text-5xl sm:text-7xl md:text-8xl lg:text-[104px] text-[var(--garden-paper)] leading-[0.95] mb-6 md:mb-8"
              style={{
                fontFamily: displayFont,
                fontWeight: 500,
                letterSpacing: "-0.035em",
                textWrap: "balance",
              }}
            >
              Create better{" "}
              <span className="text-[var(--garden-citron)]">together.</span>
            </h1>
            <p className="text-lg md:text-[22px] leading-relaxed md:leading-[1.5] text-[var(--garden-body)] max-w-[560px]" style={{ textWrap: "pretty" }}>
              Creatives, patrons, hosts and partners in one place, building
              flourishing communities.
            </p>
          </div>

          {/* Right column — waitlist + how the money works */}
          <div className="md:col-span-5 min-w-0 flex flex-col gap-7 pb-1.5">
            <div
              className="flex items-center gap-2 text-[var(--garden-dim)] text-xs tracking-[0.1em] uppercase"
              style={{ fontFamily: monoFont }}
            >
              <svg
                className="w-3.5 h-3.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                />
              </svg>
              Closed beta · invite only
            </div>

            {/* Waitlist form */}
            {status === "success" ? (
              <div>
                <div className="flex items-center gap-2 text-green-400">
                  <svg
                    className="w-5 h-5 shrink-0"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                  <span className="font-semibold">You're on the list</span>
                </div>
                <p className="mt-1 text-sm text-[var(--garden-dim)]">
                  {message}
                </p>
                <WaitlistFollowUpDark
                  email={submittedEmail}
                  initialPosition={waitlistPosition}
                />
              </div>
            ) : (
              <form
                onSubmit={handleWaitlistSubmit}
                className="flex flex-col gap-2.5"
              >
                <div className="flex flex-col sm:flex-row gap-2.5">
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="your@email.com"
                    className="w-full min-w-0 sm:flex-1 px-[18px] py-[15px] text-base border border-[var(--garden-hairline-raised)] rounded-[10px] bg-[var(--garden-ink-raised)] text-[var(--garden-paper)] placeholder-[var(--garden-muted)] outline-none focus:border-[var(--garden-citron)] transition-colors"
                    style={{ fontFamily: "inherit" }}
                    disabled={status === "loading"}
                  />
                  <button
                    type="submit"
                    disabled={status === "loading"}
                    className="w-full sm:w-auto px-[18px] py-[15px] text-base bg-[var(--garden-citron)] text-[var(--garden-ink)] rounded-[10px] font-semibold hover:opacity-90 transition-all cursor-pointer whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {status === "loading" ? "Joining..." : "Join the waitlist"}
                  </button>
                </div>
                {status === "error" && (
                  <p className="text-sm text-red-400">{message}</p>
                )}
              </form>
            )}

            {/* Gradient divider */}
            <div
              className="h-px"
              style={{
                background:
                  "linear-gradient(90deg, transparent, var(--garden-hairline-raised) 20%, var(--garden-hairline-raised) 80%, transparent)",
              }}
            />

            {/* How the money works — the one line a creative wants before
                scrolling. The invite-code form that sat here moved to
                /signup, the one place that needs it. */}
            <ul className="flex flex-col gap-3 text-[15px] leading-[1.5] text-[var(--garden-body)]">
              <li className="flex gap-3">
                <span className="text-[var(--garden-citron)] shrink-0" aria-hidden="true">—</span>
                <span>Free to join. {CLAIMS.backingShort}</span>
              </li>
            </ul>

            <p className="text-sm text-[var(--garden-dim)]">
              Have an invite?{" "}
              <Link
                to="/signup"
                className="text-[var(--garden-paper)] font-medium hover:text-[var(--garden-citron)] transition-colors"
              >
                Create your account →
              </Link>
            </p>
          </div>
        </div>
      </main>

      {/* Passage — 2-column: headline left, body right */}
      <section className="py-16 md:py-[88px] bg-[var(--garden-ink-raised)]">
        <Reveal className="max-w-[1280px] mx-auto px-6 md:px-14 grid md:grid-cols-12 gap-8 md:gap-16">
          <div className="md:col-span-5">
            <p className="text-[var(--garden-citron)] text-base md:text-lg font-semibold tracking-wide uppercase mb-5">
              The Garden
            </p>
            <h2
              className="text-3xl md:text-[44px] text-[var(--garden-paper)] leading-[1.1]"
              style={{
                fontFamily: displayFont,
                fontWeight: 500,
                letterSpacing: "-0.02em",
                textWrap: "balance",
              }}
            >
              A flourishing artistic economy.
            </h2>
          </div>
          <div className="md:col-span-7 flex flex-col gap-5 text-xl leading-[1.6] text-[var(--garden-body)] md:pt-2 max-w-[600px]">
            <p>
              Creatives find each other and make the work together. Patrons
              back it. Partners open their doors. Hosts run the tables where
              it all starts. Nothing here gets made alone.
            </p>
            <p className="text-[var(--garden-dim)]">
              The Garden is the founding Christian creative community on the
              platform, with one mission: love our neighbors through our
              craft.
            </p>
            <div className="flex items-center gap-6 self-start">
              <Link
                to="/communities/the-garden"
                className="text-base font-semibold text-[var(--garden-citron)] hover:opacity-80 transition-opacity"
              >
                Step into The Garden →
              </Link>
              <Link
                to="/for/churches"
                className="text-base font-semibold text-[var(--garden-dim)] hover:text-[var(--garden-paper)] transition-colors"
              >
                For churches →
              </Link>
            </div>
          </div>
        </Reveal>
      </section>

      {/* Who it's for — the four account types as alternating image/text
          persona rows, then the Grant Program box */}
      <section className="py-16 md:py-24 px-6 md:px-14 max-w-[1280px] mx-auto">
        <h2
          className="text-4xl md:text-[56px] text-[var(--garden-paper)] leading-none mb-14 md:mb-[72px]"
          style={{
            fontFamily: displayFont,
            fontWeight: 500,
            letterSpacing: "-0.03em",
          }}
        >
          Who it's for
        </h2>

        <div className="flex flex-col gap-16 md:gap-[88px]">
          {/* Creatives — image left (5fr / 7fr) */}
          <div className="grid md:grid-cols-12 gap-8 md:gap-16 items-center">
            <Reveal className="md:col-span-5">
              <img
                src={CAMPAIGN_IMAGES.ade.src}
                alt={CAMPAIGN_IMAGES.ade.alt}
                loading="lazy"
                className="w-full aspect-[4/5] object-cover rounded-[10px] bg-[var(--garden-ink-raised)]"
              />
            </Reveal>
            <Reveal delay={150} className="md:col-span-7 max-w-[560px]">
              <p className="text-[var(--garden-citron)] text-base md:text-lg font-semibold tracking-wide uppercase mb-5">
                For creatives
              </p>
              <h3
                className="text-2xl md:text-[40px] text-[var(--garden-paper)] leading-[1.1] mb-5"
                style={{
                  fontFamily: displayFont,
                  fontWeight: 500,
                  letterSpacing: "-0.025em",
                  textWrap: "balance",
                }}
              >
                Show your work. Find your people. Get paid.
              </h3>
              <p className="text-base md:text-lg leading-[1.6] text-[var(--garden-body)] mb-8" style={{ textWrap: "pretty" }}>
                Get found by what you make and where you are. Post paid or
                passion projects, find collaborators, and set crowdfunding
                targets with real deadlines. Join a community. Find a coach.{" "}
                {CLAIMS.backingShort}
              </p>
              <div className="flex items-center gap-3">
                <Link
                  to="/join?community=the-garden"
                  className="px-[22px] py-[13px] bg-[var(--garden-citron)] text-[var(--garden-ink)] rounded-[10px] font-semibold text-base hover:opacity-90 transition-all"
                >
                  Join as a creative
                </Link>
                <Link
                  to="/for/creatives"
                  className="px-2 py-[13px] font-medium text-base text-[var(--garden-body)] hover:text-[var(--garden-paper)] transition-colors"
                >
                  Learn more →
                </Link>
              </div>
            </Reveal>
          </div>

          {/* Patrons — image right (7fr / 5fr) */}
          <div className="grid md:grid-cols-12 gap-8 md:gap-16 items-center">
            <Reveal delay={150} className="md:col-span-7 max-w-[560px] md:justify-self-end order-2 md:order-none">
              <p className="text-[var(--garden-citron)] text-base md:text-lg font-semibold tracking-wide uppercase mb-5">
                For patrons
              </p>
              <h3
                className="text-2xl md:text-[40px] text-[var(--garden-paper)] leading-[1.1] mb-5"
                style={{
                  fontFamily: displayFont,
                  fontWeight: 500,
                  letterSpacing: "-0.025em",
                  textWrap: "balance",
                }}
              >
                Back someone or something you believe in.
              </h3>
              <p className="text-base md:text-lg leading-[1.6] text-[var(--garden-body)] mb-8" style={{ textWrap: "pretty" }}>
                Sponsor a project you believe in. Gift memberships to the
                creatives around you. Offer a venue, gear, an introduction —
                every kind of backing is credited, and your name goes on the
                finished work.
              </p>
              <div className="flex items-center gap-3">
                <Link
                  to="/opportunities"
                  className="px-[22px] py-[13px] bg-[var(--garden-citron)] text-[var(--garden-ink)] rounded-[10px] font-semibold text-base hover:opacity-90 transition-all"
                >
                  Explore people & projects
                </Link>
                <Link
                  to="/for/patrons"
                  className="px-2 py-[13px] font-medium text-base text-[var(--garden-body)] hover:text-[var(--garden-paper)] transition-colors"
                >
                  Learn more →
                </Link>
              </div>
            </Reveal>
            <Reveal className="md:col-span-5 order-1 md:order-none">
              <img
                src={CAMPAIGN_IMAGES.gallery.src}
                alt={CAMPAIGN_IMAGES.gallery.alt}
                loading="lazy"
                className="w-full aspect-[4/5] object-cover rounded-[10px] bg-[var(--garden-ink-raised)]"
              />
            </Reveal>
          </div>

          {/* Community Partners — image left (5fr / 7fr) */}
          <div className="grid md:grid-cols-12 gap-8 md:gap-16 items-center">
            <Reveal className="md:col-span-5">
              <img
                src={CAMPAIGN_IMAGES.opening.src}
                alt={CAMPAIGN_IMAGES.opening.alt}
                loading="lazy"
                className="w-full aspect-[4/5] object-cover rounded-[10px] bg-[var(--garden-ink-raised)]"
              />
            </Reveal>
            <Reveal delay={150} className="md:col-span-7 max-w-[560px]">
              <p className="text-[var(--garden-citron)] text-base md:text-lg font-semibold tracking-wide uppercase mb-5">
                For community partners
              </p>
              <h3
                className="text-2xl md:text-[40px] text-[var(--garden-paper)] leading-[1.1] mb-5"
                style={{
                  fontFamily: displayFont,
                  fontWeight: 500,
                  letterSpacing: "-0.025em",
                  textWrap: "balance",
                }}
              >
                Invest in creatives. They fill the room.
              </h3>
              <p className="text-base md:text-lg leading-[1.6] text-[var(--garden-body)] mb-8" style={{ textWrap: "pretty" }}>
                Venues, businesses, nonprofits, churches — post paid work,
                cover memberships, or share your space. Creatives bring
                people in.
              </p>
              <div className="flex items-center gap-3">
                <Link
                  to="/for/partners"
                  className="px-[22px] py-[13px] bg-[var(--garden-citron)] text-[var(--garden-ink)] rounded-[10px] font-semibold text-base hover:opacity-90 transition-all"
                >
                  Partner with us
                </Link>
              </div>
            </Reveal>
          </div>

          {/* Hosts — image right (7fr / 5fr) */}
          <div className="grid md:grid-cols-12 gap-8 md:gap-16 items-center">
            <Reveal delay={150} className="md:col-span-7 max-w-[560px] md:justify-self-end order-2 md:order-none">
              <p className="text-[var(--garden-citron)] text-base md:text-lg font-semibold tracking-wide uppercase mb-5">
                For hosts
              </p>
              <h3
                className="text-2xl md:text-[40px] text-[var(--garden-paper)] leading-[1.1] mb-5"
                style={{
                  fontFamily: displayFont,
                  fontWeight: 500,
                  letterSpacing: "-0.025em",
                  textWrap: "balance",
                }}
              >
                Bring your community. Earn from what you teach.
              </h3>
              <p className="text-base md:text-lg leading-[1.6] text-[var(--garden-body)] mb-8" style={{ textWrap: "pretty" }}>
                Run a paid or free community — a cohort, a class, a creative
                table. Offer spiritual or creative coaching. You keep 90% of
                what you sell, hosting is free, and your people can apply to
                a grant fund.
              </p>
              <div className="flex items-center gap-3">
                <Link
                  to="/for/hosts"
                  className="px-[22px] py-[13px] bg-[var(--garden-citron)] text-[var(--garden-ink)] rounded-[10px] font-semibold text-base hover:opacity-90 transition-all"
                >
                  Start hosting
                </Link>
                <Link
                  to="/join?community=the-garden"
                  className="px-2 py-[13px] font-medium text-base text-[var(--garden-body)] hover:text-[var(--garden-paper)] transition-colors"
                >
                  Join now →
                </Link>
              </div>
            </Reveal>
            <Reveal className="md:col-span-5 order-1 md:order-none">
              <img
                src={CAMPAIGN_IMAGES.june.src}
                alt={CAMPAIGN_IMAGES.june.alt}
                loading="lazy"
                className="w-full aspect-[4/5] object-cover rounded-[10px] bg-[var(--garden-ink-raised)]"
              />
            </Reveal>
          </div>
        </div>

        <div
          className="mt-14 md:mt-[72px] rounded-[10px] p-8 md:p-10 flex flex-col md:flex-row md:items-center gap-6 md:gap-10"
          style={{ border: "1px solid var(--garden-hairline)" }}
        >
          <div className="flex-1">
            <h3
              className="text-xl md:text-2xl text-[var(--garden-paper)] mb-3"
              style={{
                fontFamily: displayFont,
                fontWeight: 500,
                letterSpacing: "-0.02em",
              }}
            >
              Grant funds
            </h3>
            <p className="text-base leading-[1.6] text-[var(--garden-body)]" style={{ textWrap: "pretty" }}>
              {CLAIMS.pool} Communities can run funds of their own.
            </p>
          </div>
          <Link
            to="/grant-program"
            className="shrink-0 px-[22px] py-[13px] bg-[var(--garden-citron)] text-[var(--garden-ink)] rounded-[10px] font-semibold text-base hover:opacity-90 transition-all text-center"
          >
            See how grants work
          </Link>
        </div>
      </section>

      {/* Campaign atmosphere — 4-column image/quote grid */}
      <section className="px-6 md:px-14 pb-16 md:pb-24 max-w-[1280px] mx-auto">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {(["busker", "ade", "band", "gallery"] as const).map((key, i) => (
            <Reveal key={key} delay={i * 120}>
              <figure className="m-0">
                <img
                  src={CAMPAIGN_IMAGES[key].src}
                  alt={CAMPAIGN_IMAGES[key].alt}
                  loading="lazy"
                  className="w-full aspect-[4/5] object-cover rounded-[10px] bg-[var(--garden-ink-raised)] mb-[18px]"
                />
                <figcaption>
                  <p
                    className="text-[var(--garden-paper)] text-lg md:text-xl leading-[1.3] mb-2"
                    style={{
                      fontFamily: displayFont,
                      fontWeight: 500,
                      letterSpacing: "-0.01em",
                    }}
                  >
                    "{CAMPAIGN_QUOTES[key].said}"
                  </p>
                  <p
                    className="text-[var(--garden-dim)] text-[13px]"
                    style={{ fontFamily: monoFont }}
                  >
                    {CAMPAIGN_QUOTES[key].who}
                  </p>
                </figcaption>
              </figure>
            </Reveal>
          ))}
        </div>

        <div className="mt-10 md:mt-14 text-center">
          <Link
            to="/opportunities"
            className="inline-block px-[22px] py-[13px] rounded-[10px] text-base font-semibold transition-all"
            style={{
              border: "1px solid var(--garden-citron)",
              color: "var(--garden-citron)",
            }}
          >
            Browse open projects →
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="px-6 md:px-14 py-7 border-t border-[var(--garden-hairline)]">
        <div className="max-w-[1280px] mx-auto flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-[var(--garden-dim)]">
          <p>
            creatives.exchange — creatives and the people who back them, in
            one place
          </p>
          <div className="flex items-center gap-6">
            <a
              href="/about/"
              className="text-[var(--garden-dim)] hover:text-[var(--garden-paper)] transition-colors"
            >
              About
            </a>
            <Link
              to="/legal/credits"
              className="text-[var(--garden-dim)] hover:text-[var(--garden-paper)] transition-colors"
            >
              Credits
            </Link>
            <Link
              to="/legal/terms"
              className="text-[var(--garden-dim)] hover:text-[var(--garden-paper)] transition-colors"
            >
              Terms
            </Link>
            <Link
              to="/legal/privacy"
              className="text-[var(--garden-dim)] hover:text-[var(--garden-paper)] transition-colors"
            >
              Privacy
            </Link>
            <Link
              to="/login"
              className="text-[var(--garden-dim)] hover:text-[var(--garden-paper)] transition-colors"
            >
              Sign In
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
