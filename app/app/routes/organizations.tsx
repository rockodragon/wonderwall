import { useEffect, useState } from "react";
import { Link } from "react-router";
import { usePostHog } from "@posthog/react";
import type { Route } from "./+types/organizations";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Hire Kingdom Creatives | Wonderwall" },
    {
      name: "description",
      content:
        "Connect with talented Kingdom-minded creatives. Post jobs, build your team, and find values-aligned talent for your church, ministry, or organization.",
    },
    { property: "og:title", content: "Hire Kingdom Creatives | Wonderwall" },
    {
      property: "og:description",
      content:
        "Connect with talented Kingdom-minded creatives for your church, ministry, or organization.",
    },
    { property: "og:type", content: "website" },
  ];
}

const TIERS = [
  {
    name: "Sower",
    price: 500,
    period: "year",
    description: "Perfect for small churches and ministries starting out",
    features: [
      "Organization profile page",
      "Post up to 3 jobs per year",
      "Logo in organization directory",
      "Browse creative portfolios",
      "Direct messaging with creatives",
    ],
    highlighted: false,
  },
  {
    name: "Builder",
    price: 1500,
    period: "year",
    description: "For growing organizations with ongoing creative needs",
    features: [
      "Everything in Sower, plus:",
      "Unlimited job postings",
      "Featured organization badge",
      "Priority support",
      "Talent matching assistance",
      "Quarterly newsletter feature",
    ],
    highlighted: true,
  },
  {
    name: "Steward",
    price: 3000,
    period: "year",
    description: "For established ministries building creative teams",
    features: [
      "Everything in Builder, plus:",
      "Homepage feature rotation",
      "Sponsored content posts",
      "Early access to new features",
      "Dedicated account manager",
      "Custom job application forms",
    ],
    highlighted: false,
  },
  {
    name: "Kingdom Builder",
    price: 5000,
    period: "year",
    description: "Strategic partnership for large organizations",
    features: [
      "Everything in Steward, plus:",
      "Naming rights for events/features",
      "Advisory board participation",
      "Custom integrations",
      "Branded talent pipeline",
      "Co-branded marketing opportunities",
    ],
    highlighted: false,
    custom: true,
  },
];

const FAQS = [
  {
    question: "What types of organizations can join?",
    answer:
      "Wonderwall welcomes churches of all sizes, parachurch ministries, Christian non-profits, faith-based media companies, mission organizations, and any organization seeking values-aligned creative talent.",
  },
  {
    question: "What creative roles can we hire for?",
    answer:
      "Our community includes designers, filmmakers, photographers, musicians, writers, developers, marketers, worship leaders, and many more creative disciplines. Whether you need a full-time creative director or a freelancer for a single project, you'll find talented Kingdom creatives here.",
  },
  {
    question: "How is Wonderwall different from other job boards?",
    answer:
      "Unlike traditional job boards, Wonderwall is a community first. Creatives here showcase their portfolios, share their journey, and connect based on shared values. When you post a job, you see complete portfolios—not just resumes. You're hiring people whose work and values you can evaluate before reaching out.",
  },
  {
    question: "Can we try before we commit?",
    answer:
      "Absolutely. Register your interest below and we'll set up a call to discuss your needs, give you a tour of the platform, and help you determine which tier makes sense for your organization.",
  },
  {
    question: "What if we have custom needs?",
    answer:
      "Our Kingdom Builder tier is designed for organizations with unique requirements. We're happy to discuss custom integrations, API access, and tailored solutions. Let's talk.",
  },
];

export default function Organizations() {
  const posthog = usePostHog();
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [showPricing, setShowPricing] = useState(false);

  // Check feature flag for org sales details
  useEffect(() => {
    if (posthog) {
      const enabled = posthog.isFeatureEnabled("ffOrgSales");
      setShowPricing(!!enabled);
    }
  }, [posthog]);

  return (
    <div className="min-h-screen bg-gray-950">
      {/* Header */}
      <header className="absolute top-0 left-0 right-0 z-50 px-6 py-6 flex items-center justify-between max-w-7xl mx-auto">
        <Link
          to="/"
          className="text-2xl font-bold bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent"
        >
          Wonderwall
        </Link>
        <Link
          to="/login"
          className="px-4 py-2 text-white/80 hover:text-white font-medium transition-colors"
        >
          Sign in
        </Link>
      </header>

      {/* Hero Section */}
      <section className="relative pt-32 pb-20 px-6">
        <div className="max-w-4xl mx-auto text-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-full text-sm font-medium mb-6">
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
              />
            </svg>
            For Any Organization
          </div>

          <h1 className="text-4xl md:text-6xl font-bold text-white leading-tight mb-6">
            Hire{" "}
            <span className="bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
              Kingdom-Minded Creatives
            </span>
          </h1>

          <p className="text-xl text-gray-400 max-w-2xl mx-auto mb-4">
            Churches, nonprofits, ministries, agencies, and mission
            organizations—connect with talented designers, filmmakers,
            musicians, writers, and more.
          </p>

          <p className="text-lg text-gray-500 max-w-xl mx-auto mb-8">
            No more searching secular platforms for values-aligned talent. Find
            creatives whose work and faith speak for themselves.
          </p>

          {/* Inline Registration Form */}
          <div className="max-w-md mx-auto">
            <UpSightOrgEmbed accentColor="#60a5fa" />
          </div>
        </div>
      </section>

      {/* Value Props */}
      <section className="px-6 py-16 bg-gray-900/50">
        <div className="max-w-6xl mx-auto">
          <div className="grid md:grid-cols-3 gap-8">
            <ValueProp
              icon={
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              }
              title="See Their Work First"
              description="Browse complete portfolios, not just resumes. Evaluate creative talent by their actual work before you reach out."
            />
            <ValueProp
              icon={
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                />
              }
              title="Values-Aligned Talent"
              description="Every creative on Wonderwall is part of a Kingdom-minded community. Hire with confidence knowing you share the same foundation."
            />
            <ValueProp
              icon={
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                />
              }
              title="Direct Connection"
              description="Message creatives directly through the platform. Build relationships with talent for ongoing projects and referrals."
            />
          </div>
        </div>
      </section>

      {/* Partnership Tiers */}
      <section className="px-6 py-20">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
              Organization Partnership Tiers
            </h2>
            <p className="text-gray-400 text-lg max-w-2xl mx-auto">
              Choose the level that fits your hiring needs. All tiers include a
              dedicated organization profile and access to our creative
              community.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {TIERS.map((tier) => (
              <TierCard key={tier.name} tier={tier} showPricing={showPricing} />
            ))}
          </div>
        </div>
      </section>

      {/* Social Proof / Stats */}
      <section className="px-6 py-16 bg-gray-900/50">
        <div className="max-w-4xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            <Stat number="32+" label="Creative Disciplines" />
            <Stat number="100%" label="Values-Aligned" />
            <Stat number="Free" label="For Creatives" />
            <Stat number="Direct" label="Connection" />
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="px-6 py-20">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-white mb-4">
              Frequently Asked Questions
            </h2>
          </div>

          <div className="space-y-4">
            {FAQS.map((faq, idx) => (
              <div
                key={idx}
                className="border border-gray-800 rounded-xl overflow-hidden"
              >
                <button
                  onClick={() => setOpenFaq(openFaq === idx ? null : idx)}
                  className="w-full px-6 py-4 flex items-center justify-between text-left bg-gray-900/50 hover:bg-gray-900 transition-colors"
                >
                  <span className="font-medium text-white">{faq.question}</span>
                  <svg
                    className={`w-5 h-5 text-gray-400 transition-transform ${openFaq === idx ? "rotate-180" : ""}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                </button>
                {openFaq === idx && (
                  <div className="px-6 py-4 bg-gray-900/30 border-t border-gray-800">
                    <p className="text-gray-400 leading-relaxed">
                      {faq.answer}
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Registration Form */}
      <section id="register" className="px-6 py-20 bg-gray-900/50">
        <div className="max-w-xl mx-auto text-center">
          <h2 className="text-3xl font-bold text-white mb-4">
            Register Your Interest
          </h2>
          <p className="text-gray-400 mb-8">
            We're onboarding organizations in phases. Register below and we'll
            reach out to discuss your needs and get you set up.
          </p>
          <UpSightOrgEmbed accentColor="#60a5fa" />
        </div>
      </section>

      {/* Final CTA */}
      <section className="px-6 py-20">
        <div className="max-w-4xl mx-auto text-center">
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-blue-600 via-purple-600 to-pink-600 p-12">
            <div className="absolute inset-0 bg-black/20" />
            <div className="relative">
              <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
                Ready to Find Your Next Creative?
              </h2>
              <p className="text-white/90 text-lg mb-8 max-w-xl mx-auto">
                Join the growing community of churches and ministries
                discovering Kingdom-minded creative talent.
              </p>
              <div className="max-w-md mx-auto">
                <UpSightOrgEmbed accentColor="#ffffff" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="px-6 py-8 border-t border-gray-800">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-gray-500 text-sm">
            Wonderwall — A community for Kingdom-minded creatives
          </p>
          <div className="flex items-center gap-6">
            <Link
              to="/"
              className="text-gray-500 hover:text-white text-sm transition-colors"
            >
              Home
            </Link>
            <Link
              to="/login"
              className="text-gray-500 hover:text-white text-sm transition-colors"
            >
              Sign In
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

function UpSightOrgEmbed({
  accentColor = "#60a5fa",
}: {
  accentColor?: string;
}) {
  const encodedAccent = encodeURIComponent(accentColor);
  return (
    <div
      className="relative overflow-hidden rounded-xl"
      style={{ background: "#030712" }}
    >
      <iframe
        src={`https://getupsight.com/embed/5ky-bxs?layout=inline-email&theme=dark&accent=${encodedAccent}&radius=12&branding=false&buttonText=Register&placeholder=you%40organization.com&success=Thanks%21+We%27ll+be+in+touch.`}
        width="100%"
        height="160"
        frameBorder="0"
        scrolling="no"
        allowTransparency={true}
        style={{
          border: "none",
          overflow: "hidden",
          display: "block",
        }}
        allow="camera; microphone"
        title="Organization Registration"
      />
    </div>
  );
}

function ValueProp({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="text-center">
      <div className="w-14 h-14 bg-blue-500/10 rounded-xl flex items-center justify-center mx-auto mb-4">
        <svg
          className="w-7 h-7 text-blue-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          {icon}
        </svg>
      </div>
      <h3 className="text-xl font-bold text-white mb-2">{title}</h3>
      <p className="text-gray-400">{description}</p>
    </div>
  );
}

function TierCard({
  tier,
  showPricing,
}: {
  tier: (typeof TIERS)[0];
  showPricing: boolean;
}) {
  return (
    <div
      className={`relative rounded-2xl p-6 transition-all ${
        tier.highlighted
          ? "bg-gradient-to-br from-blue-600/20 to-purple-600/20 border-2 border-blue-500"
          : "bg-gray-900 border border-gray-800 hover:border-gray-700"
      }`}
    >
      {tier.highlighted && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-blue-600 text-white text-xs font-medium rounded-full">
          Most Popular
        </div>
      )}

      <div className="mb-4">
        <h3 className="text-xl font-bold text-white">{tier.name}</h3>
        <p className="text-sm text-gray-400 mt-1">{tier.description}</p>
      </div>

      <div className="mb-6">
        {showPricing ? (
          <>
            <span className="text-4xl font-bold text-white">
              ${tier.price.toLocaleString()}
            </span>
            <span className="text-gray-400">/{tier.period}</span>
            {tier.custom && (
              <span className="block text-sm text-gray-500 mt-1">
                Starting at
              </span>
            )}
          </>
        ) : (
          <span className="text-2xl font-bold text-white">
            Contact for pricing
          </span>
        )}
      </div>

      <ul className="space-y-3 mb-6">
        {tier.features.map((feature, idx) => (
          <li key={idx} className="flex items-start gap-2 text-sm">
            <svg
              className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5"
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
            <span className="text-gray-300">{feature}</span>
          </li>
        ))}
      </ul>

      <a
        href="#register"
        className={`block w-full py-3 rounded-xl font-medium text-center transition-all ${
          tier.highlighted
            ? "bg-blue-600 text-white hover:bg-blue-700"
            : "bg-gray-800 text-white hover:bg-gray-700"
        }`}
      >
        Get Started
      </a>
    </div>
  );
}

function Stat({ number, label }: { number: string; label: string }) {
  return (
    <div>
      <div className="text-3xl md:text-4xl font-bold text-white mb-1">
        {number}
      </div>
      <div className="text-gray-400 text-sm">{label}</div>
    </div>
  );
}
